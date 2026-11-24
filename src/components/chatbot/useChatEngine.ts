'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  aiChat,
  aiTurn,
  cancelGeneration,
  errorMessage,
  generateFlashcards,
  onGenerationProgress,
  type StudyFile,
  type TurnMessage,
} from '@/lib/tauri-commands';
import { attachmentBlock, EXPLAINER_PROMPT, extractJson, splitLesson, SUMMARY_PROMPT, wantsFlashcards } from '@/lib/ai';
import { buildPromptSystemMessage, getPreset, type PromptId } from '@/lib/promptPresets';
import { parseVisualization, visualizationToText } from '@/lib/visualizations';
import { hasReadableText } from '@/lib/pdf-engine';
import { readDocumentText } from '@/lib/workspace-actions';
import { baseName, stripExtension, uid } from '@/lib/utils';
import { normalizeForSearch } from '@/lib/bidi';
import { AGENT_PROMPT, CHAT_PROMPT, CRITIC_PROMPT, DEEP_THINKING_PROMPT, PRESETS } from '@/lib/agent/prompts';
import { ensureProviders, inputBudget, modelFor, canSeeImages } from '@/lib/agent/models';
import { historyMessages, MEMORY_PROMPT, planHistory, text as textMessage } from '@/lib/agent/context';
import { runAgent, type AgentStep } from '@/lib/agent/runner';
import { revertUndo, toolsFor, type ToolContext } from '@/lib/agent/tools';
import { makeBooklet } from '@/lib/agent/booklet';
import { hasUndo, rememberUndo, takeUndo, workspaceManifest } from '@/lib/agent/workspace';
import { useApp } from '@/store/app';
import { useChatSessions, type ChatReplay, type ChatStep } from '@/store/sessions';
import { UNSORTED_ID, useFlashcards } from '@/store/flashcards';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';
import { confirmDialog } from '@/store/dialogs';
import { toast } from '@/store/toast';

export interface Attachment {
  path: string;
  name: string;
  enabled: boolean;
}

export interface LessonState {
  topic: string;
  steps: string[];
  index: number;
  thread: { role: 'user' | 'assistant'; content: string }[];
  asking: boolean;
}

export interface SendOptions {
  deep?: boolean;
  preset?: string;
}

interface CachedText {
  text: string;
  truncated: boolean;
}

interface InflightRequest {
  id: number;
  sessionId: string;
  requestId: string;
  messageId?: string;
}

interface StoppedRequest {
  sessionId: string;
  messageId: string;
}

export function findMentionedFiles(text: string, files: StudyFile[]): StudyFile[] {
  const found = new Map<string, StudyFile>();
  const lower = normalizeForSearch(text);
  for (const file of files) {
    const names = [file.name, stripExtension(file.name)].map((n) => `@${normalizeForSearch(n)}`);
    if (names.some((token) => lower.includes(token))) found.set(file.path, file);
  }
  return Array.from(found.values());
}

const SLASH = /^\/(\w+)\s*([\s\S]*)$/;

function stepActions(steps: ChatStep[] | undefined): string | undefined {
  if (!steps || steps.length === 0) return undefined;
  return steps
    .filter((step) => step.status === 'done')
    .map((step) => `${step.label}${step.paths?.length ? ` (${step.paths.join(', ')})` : ''}`)
    .slice(-12)
    .join('; ');
}

export function useChatEngine() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [lesson, setLesson] = useState<LessonState | null>(null);
  const requestRef = useRef(0);
  const inflight = useRef<InflightRequest | null>(null);
  const stopped = useRef(new Map<number, StoppedRequest>());
  const generationRef = useRef<string | null>(null);
  const cache = useRef(new Map<string, CachedText>());
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onGenerationProgress((progress) => {
      if (progress.request_id !== generationRef.current || progress.total <= 1) return;
      setStatus(`Generating flashcards… part ${progress.current} of ${progress.total}`);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const model = () => modelFor('fast')?.id || useSettings.getState().selectedModel || undefined;

  const markStopped = (request: InflightRequest) => {
    if (request.messageId) {
      const session = useChatSessions.getState().sessions.find((s) => s.id === request.sessionId);
      const message = session?.messages.find((m) => m.id === request.messageId);
      if (message) {
        useChatSessions.getState().updateMessage(request.sessionId, request.messageId, {
          streaming: false,
          status: undefined,
          stopped: true,
          content: message.content.trim() ? `${message.content}\n\n*(Stopped.)*` : 'Stopped before an answer arrived.',
          error: !message.content.trim(),
          steps: message.steps?.map((step) => (step.status === 'running' ? { ...step, status: 'error' as const, summary: 'Stopped' } : step)),
        });
        stopped.current.set(request.id, { sessionId: request.sessionId, messageId: request.messageId });
        return;
      }
    }
    const messageId = useChatSessions.getState().appendMessage(request.sessionId, {
      role: 'assistant',
      content: 'Stopped before an answer arrived.',
      error: true,
      stopped: true,
    });
    stopped.current.set(request.id, { sessionId: request.sessionId, messageId });
  };

  const stopGeneration = () => {
    const generation = generationRef.current;
    generationRef.current = null;
    if (generation) void cancelGeneration(generation).catch(() => undefined);
  };

  const supersede = () => {
    if (!inflight.current) return;
    const current = inflight.current;
    markStopped(current);
    void cancelGeneration(current.requestId).catch(() => undefined);
    inflight.current = null;
    requestRef.current += 1;
    stopGeneration();
  };

  const begin = (label: string, sessionId: string) => {
    supersede();
    const id = ++requestRef.current;
    inflight.current = { id, sessionId, requestId: uid() };
    setBusy(true);
    setStatus(label);
    return id;
  };

  const finish = (id: number) => {
    stopped.current.delete(id);
    if (id !== requestRef.current) return;
    inflight.current = null;
    setBusy(false);
    setStatus(null);
  };

  const readCached = async (path: string, maxChars: number): Promise<CachedText> => {
    const library = useLibrary.getState().files.find((file) => file.path === path);
    const key = `${path}@${library?.modified_at ?? ''}@${maxChars}`;
    const hit = cache.current.get(key);
    if (hit) return hit;
    const document = await readDocumentText(path, maxChars);
    const value = { text: document.text, truncated: document.truncated };
    cache.current.set(key, value);
    return value;
  };

  const buildContext = async (list: Attachment[], maxChars = 16_000): Promise<string> => {
    const blocks: string[] = [];
    for (const attachment of list) {
      try {
        const { text, truncated } = await readCached(attachment.path, maxChars);
        if (!text.trim()) {
          blocks.push(attachmentBlock(attachment.name, '(No extractable text. It may be a scanned document or an image.)'));
          continue;
        }
        blocks.push(attachmentBlock(attachment.name, text, truncated ? 'truncated' : undefined));
      } catch (error) {
        blocks.push(attachmentBlock(attachment.name, `(Could not read this file: ${errorMessage(error)})`));
      }
    }
    return blocks.length ? `Study materials:\n${blocks.join('\n\n')}` : '';
  };

  const addAttachments = useCallback((files: StudyFile[]) => {
    if (files.length === 0) return attachmentsRef.current;
    const next = [...attachmentsRef.current];
    for (const file of files) {
      const existing = next.find((a) => a.path === file.path);
      if (existing) existing.enabled = true;
      else next.push({ path: file.path, name: file.name, enabled: true });
    }
    attachmentsRef.current = next;
    setAttachments(next);
    return next;
  }, []);

  const toggleAttachment = useCallback((path: string) => {
    setAttachments((current) => current.map((a) => (a.path === path ? { ...a, enabled: !a.enabled } : a)));
  }, []);

  const removeAttachment = useCallback((path: string) => {
    setAttachments((current) => current.filter((a) => a.path !== path));
  }, []);

  const cancel = useCallback(() => {
    useApp.getState().clearChatQueue();
    const current = inflight.current;
    if (current) {
      markStopped(current);
      void cancelGeneration(current.requestId).catch(() => undefined);
    }
    inflight.current = null;
    requestRef.current += 1;
    setBusy(false);
    setStatus(null);
    stopGeneration();
  }, []);

  const streamInto = (sessionId: string, messageId: string, id: number) => {
    let text = '';
    let reasoning = '';
    let steps: ChatStep[] = [];
    let statusText: string | undefined;
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (id !== requestRef.current) return;
      useChatSessions.getState().updateMessage(sessionId, messageId, { content: text, reasoning: reasoning || undefined, steps: steps.length ? steps : undefined, status: statusText });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(flush);
    };
    return {
      text: (delta: string) => {
        text += delta;
        schedule();
      },
      reasoning: (delta: string) => {
        reasoning += delta;
        schedule();
      },
      step: (step: AgentStep) => {
        const entry: ChatStep = {
          id: step.id,
          tool: step.tool,
          label: step.label,
          status: step.status,
          summary: step.summary,
          paths: step.paths,
          undoable: Boolean(step.undo),
          diff: step.diff,
        };
        if (step.undo) rememberUndo(step.id, step.undo);
        const index = steps.findIndex((existing) => existing.id === step.id);
        steps = index >= 0 ? steps.map((existing, i) => (i === index ? entry : existing)) : [...steps, entry];
        schedule();
      },
      status: (value: string | null) => {
        statusText = value ?? undefined;
        if (value) setStatus(value);
        schedule();
      },
      snapshot: () => ({ text, reasoning, steps }),
      cancelFrame: () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      },
    };
  };

  const runAgentTurn = useCallback(
    async (input: string, options: SendOptions, active: Attachment[]) => {
      const sessions = useChatSessions.getState();
      const sessionId = sessions.ensureSession();
      const previous = sessions.sessions.find((s) => s.id === sessionId)?.messages ?? [];
      const preset = options.preset ? PRESETS[options.preset] : undefined;
      const deep = Boolean(options.deep || preset?.reasoning);
      sessions.appendMessage(sessionId, {
        role: 'user',
        content: input,
        attachments: active.map((a) => a.name),
        replay: { kind: 'agent', text: input, deep: options.deep || undefined, preset: options.preset },
      });
      const id = begin(deep ? 'Thinking deeply…' : 'Thinking…', sessionId);
      const request = inflight.current!;
      await ensureProviders();
      const settings = useSettings.getState();
      const fast = modelFor('fast');
      const routine = modelFor('assistant');
      const reasoner = modelFor('reasoning');
      const vision = modelFor('vision');
      const provider = deep ? reasoner ?? routine ?? fast : routine ?? fast;
      const messageId = useChatSessions.getState().appendMessage(sessionId, {
        role: 'assistant',
        content: '',
        streaming: true,
        model: provider?.model,
        mode: deep ? 'deep' : settings.agent.enabled ? 'agent' : 'chat',
      });
      request.messageId = messageId;
      const sink = streamInto(sessionId, messageId, id);
      try {
        if (!provider) throw new Error('No AI provider is configured. Add one in Settings → AI providers.');
        const agentMode = settings.agent.enabled;
        const budget = inputBudget(provider);
        const memory = useChatSessions.getState().sessions.find((entry) => entry.id === sessionId)?.memory;
        const entries = previous.map((m) => ({ id: m.id, role: m.role, content: m.content, error: m.error, actions: stepActions(m.steps) }));
        let plan = planHistory(entries, memory, Math.floor(budget * 0.35));
        if (plan.fold.length > 0) {
          sink.status('Condensing the earlier conversation…');
          const transcript = plan.fold
            .map((entry) => `${entry.role === 'user' ? 'Learner' : 'Assistant'}: ${entry.content}${entry.actions ? ` [Actions: ${entry.actions}]` : ''}`)
            .join('\n\n');
          try {
            const condensed = await aiTurn({
              model: (routine ?? provider).id,
              requestId: request.requestId,
              maxTokens: 1500,
              temperature: 0.2,
              messages: [
                textMessage('system', MEMORY_PROMPT),
                textMessage('user', `${plan.summary ? `Previous summary:\n${plan.summary}\n\n` : ''}Conversation to add:\n${transcript.slice(-120_000)}`),
              ],
            });
            const summary = condensed.content.trim();
            if (summary) {
              useChatSessions.getState().setMemory(sessionId, { summary, lastId: plan.fold[plan.fold.length - 1].id });
              plan = { fold: [], recent: plan.recent, summary };
            }
          } catch (error) {
            if (id !== requestRef.current) throw error;
            plan = { ...plan, fold: [] };
          }
        }
        const history = historyMessages(plan);
        const focus = active.map((a) => a.path);
        let userText = preset ? `${preset.instruction}\n\n${input}` : input;
        let system = agentMode ? AGENT_PROMPT : CHAT_PROMPT;
        if (deep) system += `\n\n${DEEP_THINKING_PROMPT}`;
        if (agentMode) {
          const manifest = await workspaceManifest(focus);
          system += `\n\nToday is ${new Date().toISOString().slice(0, 10)}. Model roles: routine ${routine?.model ?? 'none'}, reasoning ${reasoner?.model ?? 'none'}, vision ${vision?.model ?? 'none'}.\n\nWorkspace files\n${manifest}`;
          if (focus.length) userText += `\n\n[Attached files: ${focus.join(', ')}]`;
        } else if (active.length) {
          const context = await buildContext(active);
          if (context) userText = `${context}\n\n${userText}`;
        }
        if (id !== requestRef.current) return;
        const messages: TurnMessage[] = [textMessage('system', system), ...history, textMessage('user', userText)];
        const context: ToolContext = {
          requestId: request.requestId,
          readPaths: new Set(),
          createdPaths: new Set(),
          allowWrites: settings.agent.allowWrites,
          confirmEdits: settings.agent.confirmEdits,
          visionModel: vision,
          reasoningModel: reasoner,
          reasoningEffort: settings.agent.deepEffort,
          isCancelled: () => id !== requestRef.current,
          onProgress: (text) => sink.status(text),
          confirm: (title, message) => confirmDialog({ title, message, confirmLabel: 'Allow' }),
          makeBooklet: (job) =>
            makeBooklet({
              ...job,
              provider: routine ?? provider,
              visionProvider: vision,
              requestId: request.requestId,
              isCancelled: () => id !== requestRef.current,
              onProgress: (text) => sink.status(text),
            }),
        };
        const tools = agentMode
          ? toolsFor({ allowWrites: settings.agent.allowWrites, vision: canSeeImages(vision), reasoner: Boolean(reasoner && reasoner.id !== provider.id), booklet: true })
          : [];
        const result = await runAgent({
          provider,
          messages,
          tools,
          context,
          maxSteps: settings.agent.maxSteps,
          reasoning: deep ? settings.agent.deepEffort : undefined,
          temperature: deep ? undefined : 0.4,
          callbacks: {
            onText: sink.text,
            onReasoning: sink.reasoning,
            onStep: sink.step,
            onStatus: sink.status,
          },
        });
        if (id !== requestRef.current) return;
        sink.cancelFrame();
        const snapshot = sink.snapshot();
        const content = snapshot.text.trim() || result.content;
        useChatSessions.getState().updateMessage(sessionId, messageId, {
          content: content || '(No answer.)',
          reasoning: snapshot.reasoning || result.reasoning || undefined,
          steps: snapshot.steps.length ? snapshot.steps : undefined,
          streaming: false,
          status: undefined,
        });
      } catch (error) {
        if (id !== requestRef.current) return;
        sink.cancelFrame();
        const snapshot = sink.snapshot();
        useChatSessions.getState().updateMessage(sessionId, messageId, {
          content: snapshot.text.trim() ? `${snapshot.text}\n\n${errorMessage(error)}` : errorMessage(error),
          reasoning: snapshot.reasoning || undefined,
          steps: snapshot.steps.length ? snapshot.steps.map((step) => (step.status === 'running' ? { ...step, status: 'error' as const } : step)) : undefined,
          error: true,
          streaming: false,
          status: undefined,
        });
      } finally {
        finish(id);
      }
    },
    [],
  );

  const makeFlashcards = useCallback(
    async (options: { instructions?: string; text?: string; path?: string; title?: string; announce?: string }) => {
      supersede();
      const sessions = useChatSessions.getState();
      const sessionId = sessions.ensureSession();
      sessions.appendMessage(sessionId, {
        role: 'user',
        content: options.announce ?? options.instructions ?? `Make flashcards from ${options.title ?? 'this'}`,
        replay: { kind: 'flashcards', ...options },
      });
      const id = begin('Generating flashcards…', sessionId);
      try {
        const flashcards = useFlashcards.getState();
        if (!flashcards.hydrated) await flashcards.hydrate();
        const { collections, activeCollectionId } = useFlashcards.getState();
        const lower = (options.instructions ?? '').toLowerCase();
        const named = collections.find((c) => lower.includes(c.name.toLowerCase()));
        const fallback = activeCollectionId && activeCollectionId !== UNSORTED_ID ? collections.find((c) => c.id === activeCollectionId) : undefined;
        const collection = named ?? fallback;

        let material = options.text ?? '';
        let source = options.title;
        if (options.path) {
          setStatus(`Reading ${baseName(options.path)}…`);
          const document = await readCached(options.path, 150_000);
          material = document.text;
          source = baseName(options.path);
          if (!hasReadableText(material)) {
            throw new Error(`${source} has no extractable text. Use “OCR” in the library or ask the agent to transcribe it first.`);
          }
        }
        const active = attachmentsRef.current.filter((a) => a.enabled);
        if (!material && active.length > 0) {
          material = await buildContext(active, 60_000);
          source = active.map((a) => a.name).join(', ');
        }
        if (!material) {
          const recent = useChatSessions.getState().sessions.find((s) => s.id === sessionId)?.messages.slice(-7, -1) ?? [];
          material = recent.map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`).join('\n\n');
        }
        if (id !== requestRef.current) return;
        setStatus('Generating flashcards…');
        const requestId = uid();
        generationRef.current = requestId;
        const cards = await generateFlashcards(material, source, {
          collectionId: collection?.id ?? null,
          model: model(),
          instructions: options.instructions,
          requestId,
        }).finally(() => {
          if (generationRef.current === requestId) generationRef.current = null;
        });
        useFlashcards.getState().addCards(cards);
        const collectionName = collection?.name ?? 'Unsorted';
        const summary = `Created **${cards.length}** flashcard${cards.length === 1 ? '' : 's'} in **${collectionName}**.`;
        const stoppedEarly = stopped.current.get(id);
        if (stoppedEarly) {
          useChatSessions.getState().updateMessage(stoppedEarly.sessionId, stoppedEarly.messageId, {
            content: `Stopped early. ${summary}`,
            flashcards: { count: cards.length, collectionName },
            error: false,
            stopped: false,
          });
          return;
        }
        if (id !== requestRef.current) return;
        useChatSessions.getState().appendMessage(sessionId, {
          role: 'assistant',
          content: summary,
          flashcards: { count: cards.length, collectionName },
        });
      } catch (error) {
        if (id !== requestRef.current) return;
        useChatSessions.getState().appendMessage(sessionId, { role: 'assistant', content: errorMessage(error), error: true });
      } finally {
        finish(id);
      }
    },
    [],
  );

  const send = useCallback(
    async (text: string, options: SendOptions = {}) => {
      let trimmed = text.trim();
      if (!trimmed) return;
      const mentioned = findMentionedFiles(trimmed, useLibrary.getState().files);
      const all = addAttachments(mentioned);
      const active = all.filter((a) => a.enabled);
      const slash = SLASH.exec(trimmed);
      let preset = options.preset;
      if (slash) {
        const command = slash[1].toLowerCase();
        const rest = slash[2].trim();
        if (command in PRESETS) {
          preset = command;
          trimmed = rest || PRESETS[command].description;
        } else if (command === 'booklet' || command === 'jozve') {
          const title = rest || 'Study booklet';
          const files = active.map((a) => a.path);
          trimmed = files.length
            ? `Make a complete study booklet titled "${title}" from the attached files using make_booklet.`
            : `Make a complete study booklet titled "${title}". Find the relevant files in the workspace first, then use make_booklet.`;
        } else if (command === 'ocr') {
          trimmed = active.length
            ? `Transcribe the attached files with ocr_file${rest ? ` (${rest})` : ''}.`
            : `Transcribe ${rest || 'the scanned files I mean'} with ocr_file.`;
        } else if (command === 'flashcards') {
          await makeFlashcards({ instructions: rest || 'Make flashcards from the attached material' });
          return;
        } else if (command === 'deep') {
          trimmed = rest || trimmed;
          options = { ...options, deep: true };
        }
      }
      if (!preset && wantsFlashcards(trimmed) && !useSettings.getState().agent.enabled) {
        await makeFlashcards({ instructions: trimmed });
        return;
      }
      await runAgentTurn(trimmed, { ...options, preset }, active);
    },
    [addAttachments, makeFlashcards, runAgentTurn],
  );

  const challenge = useCallback(async (messageId: string) => {
    const sessions = useChatSessions.getState();
    const session = sessions.sessions.find((s) => s.messages.some((m) => m.id === messageId));
    if (!session) return;
    const index = session.messages.findIndex((m) => m.id === messageId);
    const answer = session.messages[index];
    const question = [...session.messages.slice(0, index)].reverse().find((m) => m.role === 'user');
    if (!answer) return;
    sessions.appendMessage(session.id, { role: 'user', content: 'Challenge this answer' });
    const id = begin('Looking for weaknesses…', session.id);
    const request = inflight.current!;
    await ensureProviders();
    const provider = modelFor('reasoning') ?? modelFor('assistant');
    const replyId = useChatSessions.getState().appendMessage(session.id, { role: 'assistant', content: '', streaming: true, model: provider?.model, mode: 'critique' });
    request.messageId = replyId;
    const sink = streamInto(session.id, replyId, id);
    try {
      if (!provider) throw new Error('No AI provider is configured.');
      const response = await aiTurn(
        {
          model: provider.id,
          requestId: request.requestId,
          reasoning: useSettings.getState().agent.deepEffort,
          maxTokens: 12_000,
          messages: [
            textMessage('system', CRITIC_PROMPT),
            textMessage('user', `${question ? `Question:\n${question.content}\n\n` : ''}Answer to challenge:\n${answer.content}`),
          ],
        },
        (event) => {
          if (event.type === 'text') sink.text(event.delta);
          else if (event.type === 'reasoning') sink.reasoning(event.delta);
        },
      );
      if (id !== requestRef.current) return;
      sink.cancelFrame();
      const snapshot = sink.snapshot();
      useChatSessions.getState().updateMessage(session.id, replyId, {
        content: snapshot.text.trim() || response.content,
        reasoning: snapshot.reasoning || response.reasoning || undefined,
        streaming: false,
        status: undefined,
      });
    } catch (error) {
      if (id !== requestRef.current) return;
      sink.cancelFrame();
      useChatSessions.getState().updateMessage(session.id, replyId, { content: errorMessage(error), error: true, streaming: false, status: undefined });
    } finally {
      finish(id);
    }
  }, []);

  const undoStep = useCallback(async (messageId: string, stepId: string) => {
    const undo = takeUndo(stepId);
    if (!undo) {
      toast.warning('This change can no longer be undone');
      return;
    }
    try {
      await revertUndo(undo);
      const sessions = useChatSessions.getState();
      const session = sessions.sessions.find((s) => s.messages.some((m) => m.id === messageId));
      const message = session?.messages.find((m) => m.id === messageId);
      if (session && message) {
        sessions.updateMessage(session.id, messageId, {
          steps: message.steps?.map((step) => (step.id === stepId ? { ...step, undone: true, undoable: false } : step)),
        });
      }
      toast.success('Change undone', baseName(undo.path));
    } catch (error) {
      toast.error('Could not undo', error);
    }
  }, []);

  const summarize = useCallback(async (title: string, path?: string, text?: string) => {
    supersede();
    const sessions = useChatSessions.getState();
    const sessionId = sessions.ensureSession();
    sessions.appendMessage(sessionId, { role: 'user', content: `Summarize ${title}`, replay: { kind: 'summarize', title, path, text } });
    const id = begin(`Reading ${title}…`, sessionId);
    try {
      let content = text ?? '';
      let truncated = false;
      if (path) {
        const document = await readCached(path, 60_000);
        content = document.text;
        truncated = document.truncated;
      }
      if (!hasReadableText(content)) {
        throw new Error(`I could not find readable text in ${title}. Ask the agent to transcribe it with OCR first.`);
      }
      if (id !== requestRef.current) return;
      setStatus('Summarizing…');
      const response = await aiChat(
        [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: attachmentBlock(title, content, truncated ? 'only the beginning of a long document' : undefined) },
        ],
        { model: model(), temperature: 0.3 },
      );
      if (id !== requestRef.current) return;
      useChatSessions.getState().appendMessage(sessionId, { role: 'assistant', content: response.content });
    } catch (error) {
      if (id !== requestRef.current) return;
      useChatSessions.getState().appendMessage(sessionId, { role: 'assistant', content: errorMessage(error), error: true });
    } finally {
      finish(id);
    }
  }, []);

  const explain = useCallback(async (topic: string, options: { context?: string; path?: string } = {}) => {
    const trimmed = topic.trim();
    if (!trimmed) return;
    supersede();
    const sessions = useChatSessions.getState();
    const sessionId = sessions.ensureSession();
    sessions.appendMessage(sessionId, {
      role: 'user',
      content: `Explain step by step: ${trimmed}`,
      replay: { kind: 'explain', topic: trimmed, context: options.context, path: options.path },
    });
    const id = begin('Preparing a step-by-step lesson…', sessionId);
    try {
      let material = '';
      if (options.path) {
        const document = await readCached(options.path, 20_000);
        if (!hasReadableText(document.text)) {
          throw new Error(`${baseName(options.path)} has no extractable text. Ask the agent to transcribe it with OCR first.`);
        }
        material = attachmentBlock(baseName(options.path), document.text, document.truncated ? 'truncated' : undefined);
      } else if (options.context) {
        material = attachmentBlock('Selected passage', options.context);
      } else {
        const active = attachmentsRef.current.filter((a) => a.enabled);
        material = await buildContext(active);
      }
      if (id !== requestRef.current) return;
      const response = await aiChat(
        [
          { role: 'system', content: EXPLAINER_PROMPT },
          { role: 'user', content: material ? `${material}\n\nTopic to explain: ${trimmed}` : `Topic to explain: ${trimmed}` },
        ],
        { model: model(), temperature: 0.5 },
      );
      if (id !== requestRef.current) return;
      const steps = splitLesson(response.content);
      useChatSessions.getState().appendMessage(sessionId, {
        role: 'assistant',
        content: `Lesson ready: **${trimmed}** — ${steps.length} part${steps.length === 1 ? '' : 's'}.`,
        explainer: { topic: trimmed, steps },
      });
      setLesson({ topic: trimmed, steps, index: 0, thread: [], asking: false });
    } catch (error) {
      if (id !== requestRef.current) return;
      useChatSessions.getState().appendMessage(sessionId, { role: 'assistant', content: errorMessage(error), error: true });
    } finally {
      finish(id);
    }
  }, []);

  const recentConversation = (sessionId: string): string => {
    const messages = useChatSessions.getState().sessions.find((s) => s.id === sessionId)?.messages ?? [];
    const recent = messages.slice(Math.max(0, messages.length - 8), -1).filter((message) => !message.error);
    return recent.map((message) => `${message.role === 'user' ? 'Student' : 'Assistant'}: ${message.content}`).join('\n\n');
  };

  const runPrompt = useCallback(
    async (presetId: PromptId, options: { text?: string; context?: string; path?: string } = {}) => {
      const preset = getPreset(presetId);
      if (!preset) return;
      const typed = (options.text ?? '').trim();
      supersede();
      const sessions = useChatSessions.getState();
      const sessionId = sessions.ensureSession();
      const active = options.path || options.context ? [] : attachmentsRef.current.filter((a) => a.enabled);
      sessions.appendMessage(sessionId, {
        role: 'user',
        content: typed ? `${preset.label}: ${typed}` : preset.label,
        ...(active.length ? { attachments: active.map((a) => a.name) } : {}),
        replay: { kind: 'prompt', preset: presetId, text: options.text, context: options.context, path: options.path },
      });
      const id = begin(`Running ${preset.label}…`, sessionId);
      try {
        let material = '';
        let extra = '';
        if (options.path) {
          setStatus(`Reading ${baseName(options.path)}…`);
          const document = await readCached(options.path, 60_000);
          if (!hasReadableText(document.text)) {
            throw new Error(`${baseName(options.path)} has no extractable text. Scanned PDFs and images cannot be processed yet.`);
          }
          material = attachmentBlock(baseName(options.path), document.text, document.truncated ? 'truncated' : undefined);
          extra = typed;
        } else if (options.context) {
          material = attachmentBlock('Selected passage', options.context);
          extra = typed;
        } else if (active.length) {
          material = await buildContext(active, 60_000);
          extra = typed;
        } else if (typed.length >= 400) {
          material = attachmentBlock('Provided text', typed);
        } else if (typed) {
          material = recentConversation(sessionId);
          extra = typed;
        } else {
          material = recentConversation(sessionId);
        }
        const userContent = material && extra ? `${material}\n\nAdditional focus: ${extra}` : material || extra;
        if (!userContent.trim()) {
          throw new Error('There is nothing to work with yet — attach a document, paste some text, or ask a question first.');
        }
        if (id !== requestRef.current) return;
        setStatus(`Running ${preset.label}…`);
        const response = await aiChat(
          [
            { role: 'system', content: buildPromptSystemMessage(preset) },
            { role: 'user', content: userContent },
          ],
          { model: model(), temperature: preset.temperature, maxTokens: 6000 },
        );
        if (id !== requestRef.current) return;
        const visualization = parseVisualization(extractJson(response.content));
        if (visualization) {
          useChatSessions.getState().appendMessage(sessionId, {
            role: 'assistant',
            content: visualizationToText(visualization),
            visualization,
          });
        } else {
          const raw = response.content.trim();
          const fenced = raw.startsWith('{') || raw.startsWith('[') ? `\`\`\`json\n${raw}\n\`\`\`` : raw;
          useChatSessions.getState().appendMessage(sessionId, {
            role: 'assistant',
            content: `I could not turn that into a **${preset.label}** view, so here is the raw answer:\n\n${fenced}`,
          });
        }
      } catch (error) {
        if (id !== requestRef.current) return;
        useChatSessions.getState().appendMessage(sessionId, { role: 'assistant', content: errorMessage(error), error: true });
      } finally {
        finish(id);
      }
    },
    [],
  );

  const retry = useCallback(
    async (messageId: string) => {
      const sessions = useChatSessions.getState();
      const session = sessions.sessions.find((s) => s.messages.some((m) => m.id === messageId));
      if (!session) return;
      const index = session.messages.findIndex((m) => m.id === messageId);
      const lastUser = [...session.messages.slice(0, index)].reverse().find((m) => m.role === 'user');
      if (!lastUser) return;
      useChatSessions.setState((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === session.id ? { ...s, messages: s.messages.filter((m) => m.id !== messageId && m.id !== lastUser.id) } : s,
        ),
      }));
      const replay: ChatReplay | undefined = lastUser.replay;
      if (!replay) await send(lastUser.content);
      else if (replay.kind === 'agent') await runAgentTurn(replay.text, { deep: replay.deep, preset: replay.preset }, attachmentsRef.current.filter((a) => a.enabled));
      else if (replay.kind === 'summarize') await summarize(replay.title, replay.path, replay.text);
      else if (replay.kind === 'explain') await explain(replay.topic, { context: replay.context, path: replay.path });
      else if (replay.kind === 'prompt') await runPrompt(replay.preset, { text: replay.text, context: replay.context, path: replay.path });
      else await makeFlashcards(replay);
    },
    [send, summarize, explain, runPrompt, makeFlashcards, runAgentTurn],
  );

  const openLesson = useCallback((topic: string, steps: string[]) => {
    setLesson({ topic, steps, index: 0, thread: [], asking: false });
  }, []);

  const askLesson = useCallback(
    async (question: string) => {
      const current = lesson;
      if (!current || !question.trim()) return;
      const thread = [...current.thread, { role: 'user' as const, content: question.trim() }];
      setLesson({ ...current, thread, asking: true });
      try {
        const response = await aiChat(
          [
            {
              role: 'system',
              content: `${CHAT_PROMPT}\n\nThe learner is studying a lesson about "${current.topic}". The current part is:\n\n${current.steps[current.index]}\n\nAnswer follow-up questions briefly and relate them to this part.`,
            },
            ...thread,
          ],
          { model: model() },
        );
        setLesson((latest) => (latest && latest.topic === current.topic ? { ...latest, thread: [...thread, { role: 'assistant', content: response.content }], asking: false } : latest));
      } catch (error) {
        setLesson((latest) =>
          latest && latest.topic === current.topic
            ? { ...latest, thread: [...thread, { role: 'assistant', content: `⚠️ ${errorMessage(error)}` }], asking: false }
            : latest,
        );
      }
    },
    [lesson],
  );

  const revertPrompt = useCallback(async (messageId: string): Promise<string | null> => {
    const sessions = useChatSessions.getState();
    const session = sessions.sessions.find((s) => s.messages.some((m) => m.id === messageId));
    if (!session) return null;
    const target = session.messages.find((m) => m.id === messageId && m.role === 'user');
    if (!target) return null;

    if (inflight.current) cancel();

    const removed = sessions.truncateFrom(session.id, messageId);
    const stepIdsToUndo: string[] = [];
    for (const msg of removed) {
      if (msg.role !== 'assistant' || !msg.steps) continue;
      for (const step of msg.steps) {
        if (!step.undone && hasUndo(step.id)) stepIdsToUndo.push(step.id);
      }
    }
    let revertedFiles = 0;
    for (const stepId of stepIdsToUndo.reverse()) {
      const undo = takeUndo(stepId);
      if (!undo) continue;
      try {
        await revertUndo(undo);
        revertedFiles += 1;
      } catch {
        // continue reverting remaining files
      }
    }
    if (revertedFiles > 0) {
      toast.info('Prompt reverted', `Also reverted ${revertedFiles} file change${revertedFiles === 1 ? '' : 's'}.`);
    }
    return target.content;
  }, [cancel]);

  const isBusy = useCallback(() => inflight.current !== null, []);

  return {
    busy,
    isBusy,
    status,
    attachments,
    lesson,
    setLesson,
    send,
    retry,
    revertPrompt,
    cancel,
    summarize,
    explain,
    challenge,
    undoStep,
    canUndo: hasUndo,
    runPrompt,
    openLesson,
    askLesson,
    makeFlashcards,
    addAttachments,
    toggleAttachment,
    removeAttachment,
  };
}

export type ChatEngine = ReturnType<typeof useChatEngine>;
