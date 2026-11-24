import type { ContentPart, TurnMessage } from '@/lib/tauri-commands';

export function estimateTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) < 128) ascii += 1;
    else other += 1;
  }
  return Math.ceil(ascii / 4 + other / 2.4);
}

export function partText(parts: ContentPart[]): string {
  return parts
    .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n');
}

export function messageTokens(message: TurnMessage): number {
  let total = 6 + estimateTokens(partText(message.content));
  total += message.content.filter((part) => part.type === 'image').length * 1200;
  for (const call of message.toolCalls ?? []) total += 12 + estimateTokens(JSON.stringify(call.arguments ?? {}));
  return total;
}

export function totalTokens(messages: TurnMessage[]): number {
  return messages.reduce((sum, message) => sum + messageTokens(message), 0);
}

export function text(role: TurnMessage['role'], value: string): TurnMessage {
  return { role, content: [{ type: 'text', text: value }] };
}

const TRUNCATED = '[Shortened to save context. Call the tool again if you need the full content.]';

function shortenToolResult(message: TurnMessage, keepChars: number): TurnMessage {
  const value = partText(message.content);
  const images = message.content.some((part) => part.type === 'image');
  if (value.length <= keepChars && !images) return message;
  const head = value.slice(0, keepChars).trimEnd();
  return {
    ...message,
    content: [{ type: 'text', text: `${head}${value.length > keepChars ? '\n…' : ''}\n${images ? '[Image omitted]\n' : ''}${TRUNCATED}` }],
  };
}

function dropRaw(message: TurnMessage): TurnMessage {
  if (!message.raw) return message;
  const { raw: _raw, rawProvider: _provider, ...rest } = message;
  return rest;
}

export function fitMessages(messages: TurnMessage[], budget: number): { messages: TurnMessage[]; trimmed: boolean } {
  if (totalTokens(messages) <= budget) return { messages, trimmed: false };
  const toolIndexes = messages.map((m, index) => (m.role === 'tool' ? index : -1)).filter((index) => index >= 0);
  const protectedFrom = toolIndexes.length > 2 ? toolIndexes[toolIndexes.length - 2] : Number.POSITIVE_INFINITY;
  let next = messages.map((message, index) => (message.role === 'tool' && index < protectedFrom ? shortenToolResult(message, 450) : message));
  if (totalTokens(next) <= budget) return { messages: next, trimmed: true };
  next = next.map((message) => (message.role === 'tool' ? shortenToolResult(message, 1800) : message));
  if (totalTokens(next) <= budget) return { messages: next, trimmed: true };
  const system = next.filter((m) => m.role === 'system');
  const rest = next.filter((m) => m.role !== 'system');
  const lastUser = rest.map((m) => m.role).lastIndexOf('user');
  const head = rest.slice(0, Math.max(0, lastUser));
  const tail = rest.slice(Math.max(0, lastUser));
  while (head.length > 0 && totalTokens([...system, ...head, ...tail]) > budget) head.shift();
  while (head.length > 0 && head[0].role !== 'user') head.shift();
  const note = text('user', '[Earlier parts of this conversation were removed to fit the context window.]');
  const compacted = [...system, ...(head.length < rest.length - tail.length ? [note] : []), ...head, ...tail].map((m, index, all) =>
    index < all.length - 6 ? dropRaw(m) : m,
  );
  if (totalTokens(compacted) <= budget) return { messages: compacted, trimmed: true };
  const squeezed = compacted.map((message) => {
    if (message.role !== 'tool' && message.role !== 'user') return message;
    const value = partText(message.content);
    const limit = Math.max(2000, Math.floor((budget * 3) / Math.max(1, compacted.length)));
    if (value.length <= limit) return message;
    return { ...message, content: [{ type: 'text' as const, text: `${value.slice(0, limit)}\n…\n${TRUNCATED}` }] };
  });
  return { messages: squeezed, trimmed: true };
}

export interface HistoryEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  actions?: string;
}

export interface HistoryPlan {
  fold: HistoryEntry[];
  recent: HistoryEntry[];
  summary: string | null;
}

function entryTokens(entry: HistoryEntry): number {
  return estimateTokens(entry.content) + (entry.actions ? estimateTokens(entry.actions) : 0) + 6;
}

export function planHistory(entries: HistoryEntry[], memory: { summary: string; lastId: string } | undefined, budget: number): HistoryPlan {
  const usable = entries.filter((entry) => !entry.error && entry.content.trim());
  const coveredUntil = memory ? usable.findIndex((entry) => entry.id === memory.lastId) : -1;
  const summary = memory && coveredUntil >= 0 ? memory.summary : null;
  const open = coveredUntil >= 0 ? usable.slice(coveredUntil + 1) : usable;
  const summaryTokens = summary ? estimateTokens(summary) : 0;
  const total = open.reduce((sum, entry) => sum + entryTokens(entry), 0) + summaryTokens;
  if (total <= budget) return { fold: [], recent: open, summary };
  const keepBudget = Math.floor(budget * 0.6);
  let used = 0;
  let keepFrom = open.length;
  for (let i = open.length - 1; i >= 0; i -= 1) {
    const tokens = entryTokens(open[i]);
    if (used + tokens > keepBudget && keepFrom < open.length) break;
    used += tokens;
    keepFrom = i;
  }
  while (keepFrom < open.length && open[keepFrom].role !== 'user') keepFrom += 1;
  return { fold: open.slice(0, keepFrom), recent: open.slice(keepFrom), summary };
}

export function historyMessages(plan: { recent: HistoryEntry[]; summary: string | null }): TurnMessage[] {
  const out: TurnMessage[] = [];
  if (plan.summary) {
    out.push(text('user', `[Summary of the earlier conversation]\n${plan.summary}`));
    out.push(text('assistant', 'Understood. I will continue from there.'));
  }
  for (const entry of plan.recent) {
    out.push(text(entry.role, entry.actions ? `${entry.content}\n\n[Actions taken: ${entry.actions}]` : entry.content));
  }
  while (out.length > 0 && out[0].role === 'assistant') out.shift();
  return out;
}

export const MEMORY_PROMPT = `You condense the earlier part of a study conversation so that an assistant can continue it without the full transcript.
Keep what matters for the rest of the conversation: the learner's goals, level and preferences; facts, formulas and results that were established; files that were read, created or changed (with their paths); decisions and agreements; open questions and next steps.
Merge it with the previous summary if there is one. Be concise (at most about 350 words), use short bullet points, and write in the language of the conversation.`;
