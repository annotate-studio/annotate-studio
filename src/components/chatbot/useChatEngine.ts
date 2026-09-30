'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  aiChat,
  cancelGeneration,
  errorMessage,
  generateFlashcards,
  onGenerationProgress,
  type ChatMessagePayload,
  type StudyFile,
} from '@/lib/tauri-commands';
import {
  attachmentBlock,
  EXPLAINER_PROMPT,
  splitLesson,
  STUDY_ASSISTANT_PROMPT,
  SUMMARY_PROMPT,
  trimHistory,
  wantsFlashcards,
} from '@/lib/ai';
import { hasReadableText } from '@/lib/pdf-engine';
import { readDocumentText } from '@/lib/workspace-actions';
import { baseName, stripExtension, uid } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useChatSessions, type ChatMessage, type ChatReplay } from '@/store/sessions';
import { UNSORTED_ID, useFlashcards } from '@/store/flashcards';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';

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

interface CachedText {
  text: string;
  truncated: boolean;
}

interface InflightRequest {
  id: number;
  sessionId: string;
}

interface StoppedRequest {
  sessionId: string;
  messageId: string;
}

function toPayload(messages: ChatMessage[]): ChatMessagePayload[] {
  return messages
    .filter((message) => !message.error)
    .map((message) => ({ role: message.role, content: message.content }));
}

export function findMentionedFiles(text: string, files: StudyFile[]): StudyFile[] {
  const found = new Map<string, StudyFile>();
  const lower = text.toLowerCase();
  for (const file of files) {
    const names = [file.name, stripExtension(file.name)].map((n) => `@${n.toLowerCase()}`);
    if (names.some((token) => lower.includes(token))) found.set(file.path, file);
  }
  return Array.from(found.values());
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

  const model = () => useSettings.getState().selectedModel || undefined;

  const markStopped = (request: InflightRequest) => {
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
    markStopped(inflight.current);
    inflight.current = null;
    requestRef.current += 1;
    stopGeneration();
  };

  const begin = (label: string, sessionId: string) => {
    supersede();
    const id = ++requestRef.current;
    inflight.current = { id, sessionId };
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
    if (inflight.current) markStopped(inflight.current);
    inflight.current = null;
    requestRef.current += 1;
    setBusy(false);
    setStatus(null);
    stopGeneration();
  }, []);

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
            throw new Error(`${source} has no extractable text. Scanned PDFs and images are not supported.`);
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
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const mentioned = findMentionedFiles(trimmed, useLibrary.getState().files);
      const all = addAttachments(mentioned);
      if (wantsFlashcards(trimmed)) {
        await makeFlashcards({ instructions: trimmed });
        return;
      }
      supersede();
      const sessions = useChatSessions.getState();
      const sessionId = sessions.ensureSession();
      const previous = sessions.sessions.find((s) => s.id === sessionId)?.messages ?? [];
      const active = all.filter((a) => a.enabled);
      sessions.appendMessage(sessionId, { role: 'user', content: trimmed, attachments: active.map((a) => a.name) });
      const id = begin(active.length ? 'Reading attachments…' : 'Thinking…', sessionId);
      try {
        const context = await buildContext(active);
        if (id !== requestRef.current) return;
        setStatus('Thinking…');
        const response = await aiChat(
          [
            { role: 'system', content: STUDY_ASSISTANT_PROMPT },
            ...trimHistory(toPayload(previous)),
            { role: 'user', content: context ? `${context}\n\n${trimmed}` : trimmed },
          ],
          { model: model() },
        );
        if (id !== requestRef.current) return;
        useChatSessions.getState().appendMessage(sessionId, { role: 'assistant', content: response.content });
      } catch (error) {
        if (id !== requestRef.current) return;
        useChatSessions.getState().appendMessage(sessionId, { role: 'assistant', content: errorMessage(error), error: true });
      } finally {
        finish(id);
      }
    },
    [addAttachments, makeFlashcards],
  );

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
        throw new Error(`I could not find readable text in ${title}. Scanned PDFs and images cannot be summarized yet.`);
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
          throw new Error(`${baseName(options.path)} has no extractable text. Scanned PDFs and images cannot be explained yet.`);
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
      else if (replay.kind === 'summarize') await summarize(replay.title, replay.path, replay.text);
      else if (replay.kind === 'explain') await explain(replay.topic, { context: replay.context, path: replay.path });
      else await makeFlashcards(replay);
    },
    [send, summarize, explain, makeFlashcards],
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
              content: `${STUDY_ASSISTANT_PROMPT}\n\nThe learner is studying a lesson about "${current.topic}". The current part is:\n\n${current.steps[current.index]}\n\nAnswer follow-up questions briefly and relate them to this part.`,
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
    cancel,
    summarize,
    explain,
    openLesson,
    askLesson,
    makeFlashcards,
    addAttachments,
    toggleAttachment,
    removeAttachment,
  };
}

export type ChatEngine = ReturnType<typeof useChatEngine>;
