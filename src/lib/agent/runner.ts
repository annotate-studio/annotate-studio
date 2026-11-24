import { aiTurn, type ContentPart, type ProviderInfo, type ToolCall, type TurnMessage, type TurnResponse } from '@/lib/tauri-commands';
import { extractJsonObjects } from '@/lib/ai';
import { uid } from '@/lib/utils';
import { fitMessages, partText, text } from './context';
import { inputBudget } from './models';
import type { AgentTool, ToolContext, ToolDiff, ToolResult, ToolUndo } from './tools';

export interface AgentStep {
  id: string;
  tool: string;
  label: string;
  status: 'running' | 'done' | 'error';
  summary?: string;
  paths?: string[];
  undo?: ToolUndo;
  diff?: ToolDiff;
  undone?: boolean;
}

export interface AgentCallbacks {
  onText: (delta: string) => void;
  onReasoning: (delta: string) => void;
  onStep: (step: AgentStep) => void;
  onStatus: (status: string | null) => void;
}

export interface AgentRun {
  provider: ProviderInfo;
  messages: TurnMessage[];
  tools: AgentTool[];
  context: ToolContext;
  callbacks: AgentCallbacks;
  reasoning?: 'low' | 'medium' | 'high';
  maxSteps: number;
  temperature?: number;
}

export interface AgentResult {
  content: string;
  reasoning: string;
  steps: AgentStep[];
  usage: { input: number; output: number };
  textProtocol: boolean;
}

const TOOLS_UNSUPPORTED = 'TOOLS_UNSUPPORTED';
const textProtocolMemory = new Set<string>();

function toolProtocolPrompt(tools: AgentTool[]): string {
  const lines = tools.map((tool) => `- ${tool.spec.name}: ${tool.spec.description}\n  arguments: ${JSON.stringify(tool.spec.parameters)}`);
  return `Tools
You can use the tools below. To call a tool, reply with only a fenced block and nothing else:
\`\`\`tool
{"name": "tool_name", "arguments": { ... }}
\`\`\`
You will receive the result in the next message. Call one tool at a time. When you have everything you need, reply normally without a tool block.

${lines.join('\n')}`;
}

function parseTextToolCall(content: string, tools: AgentTool[]): ToolCall | null {
  const fenced = /```(?:tool|json)?\s*\n?([\s\S]*?)```/.exec(content);
  const candidates = extractJsonObjects(fenced ? fenced[1] : content);
  for (const candidate of candidates) {
    const name = typeof candidate.name === 'string' ? candidate.name : typeof candidate.tool === 'string' ? candidate.tool : '';
    if (!name || !tools.some((tool) => tool.spec.name === name)) continue;
    const args = candidate.arguments ?? candidate.args ?? candidate.parameters ?? {};
    return { id: `text_${uid()}`, name, arguments: typeof args === 'object' && args ? args : {} };
  }
  return null;
}

function argumentsOf(call: ToolCall): Record<string, unknown> {
  if (call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)) return call.arguments as Record<string, unknown>;
  if (typeof call.arguments === 'string') {
    try {
      const parsed = JSON.parse(call.arguments);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function missingArguments(tool: AgentTool, args: Record<string, unknown>): string[] {
  const required = (tool.spec.parameters.required as string[] | undefined) ?? [];
  return required.filter((key) => args[key] === undefined || args[key] === null || args[key] === '');
}

async function executeTool(tool: AgentTool | undefined, call: ToolCall, context: ToolContext): Promise<ToolResult> {
  if (!tool) return { text: `Unknown tool "${call.name}".`, summary: 'Unknown tool', error: true };
  const args = argumentsOf(call);
  const missing = missingArguments(tool, args);
  if (missing.length) return { text: `Missing required argument(s): ${missing.join(', ')}.`, summary: 'Missing arguments', error: true };
  try {
    return await tool.run(args, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'The request was stopped.') throw error;
    return { text: `Error: ${message}`, summary: message.length > 90 ? `${message.slice(0, 90)}…` : message, error: true };
  }
}

function resultContent(result: ToolResult): ContentPart[] {
  return [{ type: 'text', text: result.text }, ...(result.images ?? [])];
}

export async function runAgent(run: AgentRun): Promise<AgentResult> {
  const { provider, tools, context, callbacks } = run;
  const steps: AgentStep[] = [];
  const usage = { input: 0, output: 0 };
  let textProtocol = textProtocolMemory.has(provider.id) || provider.capabilities?.tools === false;
  let messages = [...run.messages];
  let finalContent = '';
  let finalReasoning = '';
  let continuations = 0;
  const budget = inputBudget(provider);
  const byName = new Map(tools.map((tool) => [tool.spec.name, tool]));

  const prepare = (list: TurnMessage[]) => {
    if (!textProtocol || tools.length === 0) return list;
    const [first, ...rest] = list;
    const protocol = toolProtocolPrompt(tools);
    if (first?.role === 'system') return [{ ...first, content: [{ type: 'text' as const, text: `${partText(first.content)}\n\n${protocol}` }] }, ...rest];
    return [text('system', protocol), ...list];
  };

  for (let step = 0; step <= run.maxSteps; step += 1) {
    if (context.isCancelled()) throw new Error('The request was stopped.');
    const lastStep = step === run.maxSteps;
    const { messages: fitted, trimmed } = fitMessages(messages, budget);
    if (trimmed) messages = fitted;
    callbacks.onStatus(step === 0 ? 'Thinking…' : 'Working…');
    let response: TurnResponse;
    let streamed = '';
    try {
      response = await aiTurn(
        {
          model: provider.id,
          messages: prepare(lastStep ? [...fitted, text('user', 'You have used the maximum number of steps. Do not call more tools. Give your final answer now, including what remains unfinished.')] : fitted),
          tools: textProtocol || lastStep ? [] : tools.map((tool) => tool.spec),
          reasoning: run.reasoning,
          temperature: run.temperature,
          maxTokens: 16_000,
          contextWindow: provider.capabilities?.contextWindow,
          requestId: context.requestId,
        },
        (event) => {
          if (event.type === 'text') {
            streamed += event.delta;
            if (!textProtocol) callbacks.onText(event.delta);
          } else if (event.type === 'reasoning') {
            callbacks.onReasoning(event.delta);
          } else if (event.type === 'toolCall') {
            callbacks.onStatus(`Preparing ${event.name.replace(/_/g, ' ')}…`);
          }
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith(TOOLS_UNSUPPORTED) && !textProtocol) {
        textProtocol = true;
        textProtocolMemory.add(provider.id);
        step -= 1;
        continue;
      }
      throw error;
    }
    usage.input += response.usage.inputTokens ?? 0;
    usage.output += response.usage.outputTokens ?? 0;
    finalReasoning += response.reasoning ? `${finalReasoning ? '\n\n' : ''}${response.reasoning}` : '';

    let calls = response.toolCalls;
    if (textProtocol && tools.length > 0 && !lastStep) {
      const parsed = parseTextToolCall(response.content, tools);
      calls = parsed ? [parsed] : [];
      if (!parsed) callbacks.onText(streamed || response.content);
    }

    if (calls.length === 0) {
      if (response.stopReason === 'max_tokens' && continuations < 3 && response.content.trim()) {
        continuations += 1;
        finalContent += response.content;
        messages = [...messages, { role: 'assistant', content: [{ type: 'text', text: response.content }] }, text('user', 'Continue exactly where you stopped, without repeating anything.')];
        continue;
      }
      finalContent += response.content;
      callbacks.onStatus(null);
      return { content: finalContent.trim(), reasoning: finalReasoning, steps, usage, textProtocol };
    }

    if (response.content.trim() && !textProtocol) callbacks.onText('\n\n');
    const assistant: TurnMessage = textProtocol
      ? { role: 'assistant', content: [{ type: 'text', text: response.content }] }
      : {
          role: 'assistant',
          content: response.content ? [{ type: 'text', text: response.content }] : [],
          toolCalls: calls,
          raw: response.raw,
          rawProvider: response.rawProvider,
        };
    const results: TurnMessage[] = [];
    for (const call of calls) {
      if (context.isCancelled()) throw new Error('The request was stopped.');
      const tool = byName.get(call.name);
      const args = argumentsOf(call);
      const entry: AgentStep = { id: uid(), tool: call.name, label: tool ? tool.label(args) : call.name, status: 'running' };
      steps.push(entry);
      callbacks.onStep({ ...entry });
      callbacks.onStatus(`${entry.label}…`);
      const result = await executeTool(tool, call, context);
      entry.status = result.error ? 'error' : 'done';
      entry.summary = result.summary;
      entry.paths = result.paths;
      entry.undo = result.undo;
      entry.diff = result.diff;
      callbacks.onStep({ ...entry });
      if (textProtocol) {
        results.push({ role: 'user', content: [{ type: 'text', text: `Result of ${call.name}:\n${result.text}` }, ...(result.images ?? [])] });
      } else {
        results.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: resultContent(result) });
      }
    }
    messages = [...messages, assistant, ...results];
  }
  callbacks.onStatus(null);
  return { content: finalContent.trim() || 'I stopped after reaching the step limit.', reasoning: finalReasoning, steps, usage, textProtocol };
}
