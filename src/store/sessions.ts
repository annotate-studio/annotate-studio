import { create } from 'zustand';
import {
  loadChatSessions,
  loadMotivationSessions,
  saveChatSessions,
  saveMotivationSessions,
} from '@/lib/tauri-commands';
import { createSaver } from '@/lib/persist';
import { uid } from '@/lib/utils';

export type ChatReplay =
  | { kind: 'summarize'; title: string; path?: string; text?: string }
  | { kind: 'explain'; topic: string; context?: string; path?: string }
  | { kind: 'flashcards'; instructions?: string; text?: string; path?: string; title?: string; announce?: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: string[];
  explainer?: { topic: string; steps: string[] };
  flashcards?: { count: number; collectionName: string };
  replay?: ChatReplay;
  error?: boolean;
  stopped?: boolean;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function migrateReplay(raw: unknown): ChatReplay | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  if (data.kind === 'summarize' && typeof data.title === 'string') {
    return { kind: 'summarize', title: data.title, path: optionalString(data.path), text: optionalString(data.text) };
  }
  if (data.kind === 'explain' && typeof data.topic === 'string') {
    return { kind: 'explain', topic: data.topic, context: optionalString(data.context), path: optionalString(data.path) };
  }
  if (data.kind === 'flashcards') {
    return {
      kind: 'flashcards',
      instructions: optionalString(data.instructions),
      text: optionalString(data.text),
      path: optionalString(data.path),
      title: optionalString(data.title),
      announce: optionalString(data.announce),
    };
  }
  return undefined;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  autoNamed: boolean;
}

export interface SessionStore {
  hydrated: boolean;
  sessions: ChatSession[];
  activeId: string | null;
  hydrate: () => Promise<void>;
  ensureSession: () => string;
  createSession: () => string;
  switchSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  deleteSession: (id: string) => void;
  clearSession: (id: string) => void;
  appendMessage: (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'> & Partial<Pick<ChatMessage, 'id' | 'timestamp'>>) => string;
  updateMessage: (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => void;
}

function migrateMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if ((data.role !== 'user' && data.role !== 'assistant') || typeof data.content !== 'string') return null;
  const message: ChatMessage = {
    id: typeof data.id === 'string' ? data.id : uid(),
    role: data.role,
    content: data.content,
    timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
  };
  const explainer = (data.explainer ?? data.explainerData) as Record<string, unknown> | undefined;
  if (explainer && typeof explainer.topic === 'string' && Array.isArray(explainer.steps)) {
    message.explainer = { topic: explainer.topic, steps: explainer.steps.filter((s): s is string => typeof s === 'string') };
  }
  const cards = (data.flashcards ?? data.flashcardData) as Record<string, unknown> | undefined;
  if (cards && typeof cards.collectionName === 'string') {
    const count = typeof cards.count === 'number' ? cards.count : typeof cards.inserted === 'number' ? cards.inserted : 0;
    message.flashcards = { count, collectionName: cards.collectionName };
  }
  if (Array.isArray(data.attachments)) message.attachments = data.attachments.filter((a): a is string => typeof a === 'string');
  const replay = migrateReplay(data.replay);
  if (replay) message.replay = replay;
  if (data.error === true) message.error = true;
  if (data.stopped === true) message.stopped = true;
  return message;
}

function migrateSession(raw: unknown, index: number, prefix: string): ChatSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const messages = Array.isArray(data.messages)
    ? data.messages.map(migrateMessage).filter((m): m is ChatMessage => m !== null)
    : [];
  const createdAt = typeof data.createdAt === 'number' ? data.createdAt : Date.now();
  return {
    id: typeof data.id === 'string' && data.id ? data.id : uid(),
    name: typeof data.name === 'string' && data.name.trim() ? data.name : `${prefix} ${index + 1}`,
    messages,
    createdAt,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : messages[messages.length - 1]?.timestamp ?? createdAt,
    autoNamed: data.autoNamed === true,
  };
}

function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').replace(/[#*_`>[\]]/g, '').trim();
  if (!clean) return 'New chat';
  return clean.length > 42 ? `${clean.slice(0, 42).trim()}…` : clean;
}

function createSessionStore(
  load: () => Promise<unknown[]>,
  save: (sessions: unknown[]) => Promise<void>,
  prefix: string,
) {
  const saver = createSaver<ChatSession[]>((sessions) => save(sessions), 400);

  const store = create<SessionStore>((set, get) => {
    const makeSession = (): ChatSession => ({
      id: uid(),
      name: `New ${prefix.toLowerCase()}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      autoNamed: true,
    });

    const updateSession = (id: string, updater: (session: ChatSession) => ChatSession) =>
      set((state) => ({ sessions: state.sessions.map((s) => (s.id === id ? updater(s) : s)) }));

    return {
      hydrated: false,
      sessions: [],
      activeId: null,
      hydrate: async () => {
        if (get().hydrated) return;
        let sessions: ChatSession[] = [];
        try {
          sessions = (await load())
            .map((raw, index) => migrateSession(raw, index, prefix))
            .filter((s): s is ChatSession => s !== null);
        } catch {
          sessions = [];
        }
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        set({ sessions, activeId: sessions[0]?.id ?? null, hydrated: true });
      },
      ensureSession: () => {
        const { activeId, sessions } = get();
        if (activeId && sessions.some((s) => s.id === activeId)) return activeId;
        return get().createSession();
      },
      createSession: () => {
        const current = get().sessions.find((s) => s.id === get().activeId);
        if (current && current.messages.length === 0) return current.id;
        const session = makeSession();
        set((state) => ({ sessions: [session, ...state.sessions], activeId: session.id }));
        return session.id;
      },
      switchSession: (id) => {
        if (get().sessions.some((s) => s.id === id)) set({ activeId: id });
      },
      renameSession: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        updateSession(id, (s) => ({ ...s, name: trimmed, autoNamed: false }));
      },
      deleteSession: (id) => {
        set((state) => {
          const sessions = state.sessions.filter((s) => s.id !== id);
          const activeId = state.activeId === id ? sessions[0]?.id ?? null : state.activeId;
          return { sessions, activeId };
        });
      },
      clearSession: (id) => updateSession(id, (s) => ({ ...s, messages: [], updatedAt: Date.now() })),
      appendMessage: (sessionId, input) => {
        const message: ChatMessage = { ...input, id: input.id ?? uid(), timestamp: input.timestamp ?? Date.now() };
        updateSession(sessionId, (s) => {
          const firstUser = s.autoNamed && message.role === 'user' && !s.messages.some((m) => m.role === 'user');
          return {
            ...s,
            name: firstUser ? titleFrom(message.content) : s.name,
            autoNamed: firstUser ? true : s.autoNamed,
            messages: [...s.messages, message],
            updatedAt: message.timestamp,
          };
        });
        return message.id;
      },
      updateMessage: (sessionId, messageId, patch) =>
        updateSession(sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
        })),
    };
  });

  store.subscribe((state, previous) => {
    if (!state.hydrated || !previous.hydrated || state.sessions === previous.sessions) return;
    saver.schedule(state.sessions.filter((s) => s.messages.length > 0 || s.id === state.activeId));
  });

  return store;
}

export const useChatSessions = createSessionStore(loadChatSessions, saveChatSessions, 'Chat');
export const useMotivationSessions = createSessionStore(loadMotivationSessions, saveMotivationSessions, 'Session');
