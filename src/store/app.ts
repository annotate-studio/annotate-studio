import { create } from 'zustand';

export type ViewMode = 'canvas' | 'library' | 'flashcards' | 'exams' | 'pomodoro' | 'motivation' | 'settings';

export type ChatRequest =
  | { kind: 'draft'; text: string }
  | { kind: 'summarize'; title: string; path?: string; text?: string }
  | { kind: 'explain'; topic: string; context?: string; path?: string }
  | { kind: 'flashcards'; title: string; text: string; path?: string };

interface AppStore {
  currentView: ViewMode;
  setView: (view: ViewMode) => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
  chatQueue: ChatRequest[];
  requestChat: (request: ChatRequest) => void;
  consumeChatRequest: () => ChatRequest | null;
  clearChatQueue: () => void;
  dueCards: number;
  setDueCards: (count: number) => void;
}

export const useApp = create<AppStore>((set, get) => ({
  currentView: 'canvas',
  setView: (view) => set({ currentView: view }),
  chatOpen: false,
  setChatOpen: (open) => set({ chatOpen: open }),
  toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),
  chatQueue: [],
  requestChat: (request) => set((state) => ({ chatQueue: [...state.chatQueue, request], chatOpen: true, currentView: 'canvas' })),
  consumeChatRequest: () => {
    const [request, ...rest] = get().chatQueue;
    if (!request) return null;
    set({ chatQueue: rest });
    return request;
  },
  clearChatQueue: () => {
    if (get().chatQueue.length > 0) set({ chatQueue: [] });
  },
  dueCards: 0,
  setDueCards: (count) => set({ dueCards: count }),
}));
