import { create } from 'zustand';
import type { Flashcard, RepetitionStats, StudyFile } from './tauri-commands';

let _loadingCanvas = false;
let _canvasLoadPromise: Promise<void> | null = null;

export interface FlashcardCollection {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  reviewPeriodDays: number;
}

export type ViewMode = 'canvas' | 'flashcards' | 'exams' | 'settings' | 'pomodoro' | 'motivation';
export type ThemeMode = 'white' | 'black' | 'sepia' | 'gray' | 'forest' | 'ocean' | 'lavender' | 'rose';

export interface AppSettings {
  theme: ThemeMode;
  primaryColor: string;
  appScale: number;
  backgroundImage: string;
  pomodoroSound: string;
}
export type ResourceType = 'pdf' | 'note' | 'sticky' | 'image';

export interface CanvasView {
  x: number;
  y: number;
  zoom: number;
}

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  filePath?: string;
  content?: string;
  state: 'maximized' | 'minimized';
  position: { x: number; y: number };
  size?: { width: number; height: number };
  zIndex: number;
  isFullscreen?: boolean;
  isTiled?: boolean;
  previousBounds?: { x: number; y: number; width: number; height: number };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  explainerData?: { topic: string; steps: string[]; conv: { role: string; content: string }[] };
  flashcardData?: { inserted: number; collectionName: string };
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
}

export interface ExplainerState {
  steps: string[];
  currentStep: number;
  visible: boolean;
  title: string;
  topic: string;
  conversation: { role: string; content: string }[];
  generating: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  resources: Resource[];
  canvasView: CanvasView;
}

interface AppState {
  // Navigation
  currentView: ViewMode;
  setView: (view: ViewMode) => void;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  setActiveWorkspace: (id: string) => void;
  createWorkspace: (name: string) => void;
  removeWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;

  // Theme & Settings
  theme: ThemeMode;
  primaryColor: string;
  appScale: number;
  backgroundImage: string;
  pomodoroSound: string;
  setTheme: (theme: ThemeMode) => void;
  setPrimaryColor: (color: string) => void;
  setAppScale: (scale: number) => void;
  setBackgroundImage: (url: string) => void;
  setPomodoroSound: (sound: string) => void;
  saveSettingsToDisk: () => void;
  loadSettingsFromDisk: () => Promise<void>;

  // Sidebar
  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleSidebar: () => void;

  // Canvas Resources
  resources: Resource[];
  addResource: (resource: Resource) => void;
  removeResource: (id: string) => void;
  toggleResourceState: (id: string) => void;
  updateResourcePosition: (id: string, position: { x: number; y: number }) => void;
  bringToFront: (id: string) => void;
  updateResourceSize: (id: string, size: { width: number; height: number }) => void;
  updateResourceContent: (id: string, content: string) => void;
  arrangeResources: (layout: 'splitH' | 'splitV') => void;
  toggleFullscreen: (id: string) => void;
  minimizeAllResources: () => void;
  selectedResourceId: string | null;
  setSelectedResource: (id: string | null) => void;
  summarizeTarget: { content: string; title: string } | null;
  setSummarizeTarget: (t: { content: string; title: string } | null) => void;
  canvasView: CanvasView;
  setCanvasView: (view: CanvasView) => void;
  canvasLoaded: boolean;
  setCanvasLoaded: (loaded: boolean) => void;
  saveCanvasToDisk: () => void;
  loadCanvasFromDisk: () => Promise<void>;
  canvasLocked: boolean;
  setCanvasLocked: (locked: boolean) => void;

  // Undo / Redo
  undoStack: Resource[][];
  redoStack: Resource[][];
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;

  // Chatbot
  chatbotOpen: boolean;
  setChatbotOpen: (open: boolean) => void;
  toggleChatbot: () => void;
  chatInputDraft: string;
  setChatInputDraft: (text: string) => void;
  chatbotHeight: number;
  setChatbotHeight: (height: number) => void;
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;
  chatLoading: boolean;
  setChatLoading: (loading: boolean) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  aiDetached: boolean;
  setAiDetached: (detached: boolean) => void;
  aiWindowPosition: { x: number; y: number };
  aiWindowSize: { width: number; height: number };
  setAiWindowPosition: (pos: { x: number; y: number }) => void;
  setAiWindowSize: (size: { width: number; height: number }) => void;
  chatSessions: ChatSession[];
  activeSessionId: string | null;
  createChatSession: () => void;
  switchChatSession: (id: string) => void;
  deleteChatSession: (id: string) => void;
  loadChatSessionsFromDisk: () => Promise<void>;

  // Explainer
  explainer: ExplainerState;
  setExplainer: (state: Partial<ExplainerState>) => void;
  showExplainer: (steps: string[], title: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  hideExplainer: () => void;
  addExplainerMessage: (role: string, content: string) => void;

  // Pomodoro
  pomodoroState: 'idle' | 'pomodoro' | 'shortBreak' | 'longBreak';
  pomodoroSecondsLeft: number;
  pomodoroSessionCount: number;
  pomodoroDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  setPomodoroState: (s: 'idle' | 'pomodoro' | 'shortBreak' | 'longBreak') => void;
  setPomodoroSecondsLeft: (s: number) => void;
  setPomodoroSessionCount: (c: number) => void;
  setPomodoroDuration: (s: number) => void;
  setShortBreakDuration: (s: number) => void;
  setLongBreakDuration: (s: number) => void;

  // Motivation
  motivationQuote: string;
  setMotivationQuote: (q: string) => void;
  motivationChatMaximized: boolean;
  setMotivationChatMaximized: (maximized: boolean) => void;
  motivationSessions: ChatSession[];
  motivationActiveSessionId: string | null;
  motivationMessages: ChatMessage[];
  createMotivationSession: () => void;
  switchMotivationSession: (id: string) => void;
  deleteMotivationSession: (id: string) => void;
  addMotivationMessage: (msg: ChatMessage) => void;
  clearMotivationMessages: () => void;
  loadMotivationSessions: () => Promise<void>;

  // Documents
  documents: StudyFile[];
  setDocuments: (docs: StudyFile[]) => void;
  notesList: StudyFile[];
  setNotesList: (notes: StudyFile[]) => void;

  // Flashcards
  flashcards: Flashcard[];
  setFlashcards: (cards: Flashcard[]) => void;
  flashcardStats: RepetitionStats | null;
  setFlashcardStats: (stats: RepetitionStats) => void;
  flashcardCollections: FlashcardCollection[];
  addCollection: (name: string, description?: string) => void;
  renameCollection: (id: string, name: string) => void;
  removeCollection: (id: string) => void;
  setCollectionReviewPeriod: (id: string, days: number) => void;
  activeCollectionId: string | null;
  setActiveCollection: (id: string | null) => void;
  loadCollectionsFromDisk: () => Promise<void>;

  // Exams
  exams: Exam[];
  addExam: (exam: Exam) => void;
  updateExam: (id: string, updates: Partial<Exam>) => void;
  deleteExam: (id: string) => void;
}

// Lazy import for persistence — avoids circular deps
let _saveCollections: any = null;
async function persistCollections(collections: FlashcardCollection[]) {
  if (!_saveCollections) {
    try { _saveCollections = (await import('./tauri-commands')).saveCollections; } catch { return; }
  }
  _saveCollections(collections.map((c) => ({
    id: c.id, name: c.name, description: c.description, created_at: c.createdAt,
    review_period_days: c.reviewPeriodDays,
  }))).catch(() => {});
}

function saveCollectionsSnapshot(get: () => AppState) {
  const cols = get().flashcardCollections;
  persistCollections(cols);
}

let _saveChatSessions: ((sessions: Record<string, unknown>[]) => Promise<void>) | null = null;

async function persistChatSessions(sessions: Record<string, unknown>[]) {
  if (!_saveChatSessions) {
    try { _saveChatSessions = (await import('./tauri-commands')).saveChatSessions; } catch { return; }
  }
  _saveChatSessions(sessions).catch(() => {});
}

function saveChatSessionsSnapshot(get: () => AppState) {
  const sessions = get().chatSessions;
  persistChatSessions(sessions as unknown as Record<string, unknown>[]);
}

function persistMotivationSessions(get: () => AppState) {
  const sessions = get().motivationSessions;
  import('./tauri-commands').then((m) => {
    m.saveMotivationSessions(sessions as unknown as Record<string, unknown>[]).catch(() => {});
  });
}

export const useStore = create<AppState>((set, get) => ({
  // Navigation
  currentView: 'canvas',
  setView: (view) => set({ currentView: view }),

  // Theme & Settings
  theme: 'white',
  primaryColor: '#2563EB',
  appScale: 100,
  backgroundImage: '',
  pomodoroSound: 'beep',
  setTheme: (theme) => {
    const attr = theme === 'white' ? 'white' : theme;
    document.documentElement.setAttribute('data-theme', attr);
    set({ theme });
  },
  setPrimaryColor: (color) => {
    const root = document.documentElement;
    root.style.setProperty('--primary', color);
    root.style.setProperty('--primary-hover', color + 'dd');
    root.style.setProperty('--primary-light', color + '22');
    root.style.setProperty('--primary-glow', color + '33');
    root.style.setProperty('--primary-text', '#FFFFFF');
    set({ primaryColor: color });
  },
  setAppScale: (scale) => {
    document.documentElement.style.fontSize = `${(scale / 100) * 16}px`;
    set({ appScale: scale });
  },
  setBackgroundImage: (url) => {
    document.documentElement.style.setProperty('--bg-image', url ? `url(${url})` : 'none');
    set({ backgroundImage: url });
  },
  setPomodoroSound: (sound) => set({ pomodoroSound: sound }),
  saveSettingsToDisk: () => {
    const s = get();
    import('@/lib/tauri-commands').then(async ({ saveCanvasState, loadCanvasState }) => {
      let resources: Resource[] = [];
      let view = { x: 0, y: 0, zoom: 1 };
      try {
        const existing = await loadCanvasState();
        if (existing && existing !== 'null') {
          const parsed = JSON.parse(existing);
          if (parsed.resources) resources = parsed.resources;
          if (parsed.view) view = parsed.view;
        }
      } catch {}
      saveCanvasState(JSON.stringify({
        resources,
        view,
        settings: {
          theme: s.theme,
          primaryColor: s.primaryColor,
          appScale: s.appScale,
          backgroundImage: s.backgroundImage,
          pomodoroSound: s.pomodoroSound,
        },
      })).catch(() => {});
    });
  },
  loadSettingsFromDisk: async () => {
    try {
      const { loadCanvasState } = await import('@/lib/tauri-commands');
      const json = await loadCanvasState();
      if (json && json !== 'null') {
        const data = JSON.parse(json);
        const settings = data.settings;
        if (settings) {
          if (settings.theme) {
            document.documentElement.setAttribute('data-theme', settings.theme === 'white' ? 'white' : settings.theme);
            set({ theme: settings.theme });
          }
          if (settings.primaryColor) {
            const root = document.documentElement;
            root.style.setProperty('--primary', settings.primaryColor);
            root.style.setProperty('--primary-hover', settings.primaryColor + 'dd');
            root.style.setProperty('--primary-light', settings.primaryColor + '22');
            root.style.setProperty('--primary-glow', settings.primaryColor + '33');
            root.style.setProperty('--primary-text', '#FFFFFF');
            set({ primaryColor: settings.primaryColor });
          }
          if (settings.appScale) {
            document.documentElement.style.fontSize = `${(settings.appScale / 100) * 16}px`;
            set({ appScale: settings.appScale });
          }
          if (settings.backgroundImage) {
            document.documentElement.style.setProperty('--bg-image', `url(${settings.backgroundImage})`);
            set({ backgroundImage: settings.backgroundImage });
          }
          if (settings.pomodoroSound) set({ pomodoroSound: settings.pomodoroSound });
        }
      }
    } catch {}
  },

  // Sidebar
  sidebarExpanded: false,
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),

  // Canvas
  resources: [],
  canvasView: { x: 0, y: 0, zoom: 1 },
  canvasLoaded: false,
  workspaces: [{ id: 'default', name: 'Default Workspace', resources: [], canvasView: { x: 0, y: 0, zoom: 1 } }],
  activeWorkspaceId: 'default',
  setActiveWorkspace: (id) => {
    const s = get();
    const updated = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: s.resources, canvasView: s.canvasView } : w);
    const target = updated.find((w) => w.id === id);
    set({
      workspaces: updated,
      activeWorkspaceId: id,
      resources: target ? [...target.resources] : [],
      canvasView: target ? { ...target.canvasView } : { x: 0, y: 0, zoom: 1 },
    });
    get().saveCanvasToDisk();
  },
  createWorkspace: (name) => {
    const s = get();
    const updated = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: s.resources, canvasView: s.canvasView } : w);
    const newWs: Workspace = { id: crypto.randomUUID(), name, resources: [], canvasView: { x: 0, y: 0, zoom: 1 } };
    set({ workspaces: [...updated, newWs], activeWorkspaceId: newWs.id, resources: [], canvasView: { x: 0, y: 0, zoom: 1 } });
    get().saveCanvasToDisk();
  },
  removeWorkspace: (id) => {
    set((s) => {
      if (s.workspaces.length <= 1) return s;
      const filtered = s.workspaces.filter((w) => w.id !== id);
      const nextActive = s.activeWorkspaceId === id ? filtered[0].id : s.activeWorkspaceId;
      const target = filtered.find((w) => w.id === nextActive);
      return { workspaces: filtered, activeWorkspaceId: nextActive, resources: target?.resources || [], canvasView: target?.canvasView || { x: 0, y: 0, zoom: 1 } };
    });
    get().saveCanvasToDisk();
  },
  renameWorkspace: (id, name) => {
    set((s) => ({ workspaces: s.workspaces.map((w) => w.id === id ? { ...w, name } : w) }));
    get().saveCanvasToDisk();
  },
  setCanvasView: (view) => set({ canvasView: view }),
  setCanvasLoaded: (loaded) => set({ canvasLoaded: loaded }),
  saveCanvasToDisk: () => {
    const s = get();
    const currentWorkspaces = s.workspaces.map((w) =>
      w.id === s.activeWorkspaceId ? { ...w, resources: s.resources, canvasView: s.canvasView } : w
    );
    import('@/lib/tauri-commands').then(async ({ saveCanvasState, loadCanvasState }) => {
      let settings = {};
      try {
        const existing = await loadCanvasState();
        if (existing && existing !== 'null') {
          const parsed = JSON.parse(existing);
          if (parsed.settings) settings = parsed.settings;
        }
      } catch {}
      saveCanvasState(JSON.stringify({
        workspaces: currentWorkspaces,
        activeWorkspaceId: s.activeWorkspaceId,
        settings,
      })).catch(() => {});
    });
  },
  loadCanvasFromDisk: async () => {
    if (get().canvasLoaded) { console.log('[loadCanvas] skipped (already loaded)'); return; }
    if (_canvasLoadPromise) { console.log('[loadCanvas] returning existing promise'); return _canvasLoadPromise; }
    if (_loadingCanvas) { console.log('[loadCanvas] skipped (loading in progress)'); return; }
    _loadingCanvas = true;
    console.log('[loadCanvas] start');
    _canvasLoadPromise = (async () => {
      const update: any = { canvasLoaded: true };
      try {
        const { loadCanvasState } = await import('@/lib/tauri-commands');
        const json = await loadCanvasState();
        console.log('[loadCanvas] json length:', json?.length);
        if (json && json !== 'null') {
          const data = JSON.parse(json);
          if (data.workspaces && Array.isArray(data.workspaces) && data.workspaces.length > 0) {
            const activeId = data.activeWorkspaceId || data.workspaces[0].id;
            const activeWs = data.workspaces.find((w: Workspace) => w.id === activeId) || data.workspaces[0];
            update.workspaces = data.workspaces;
            update.activeWorkspaceId = activeWs.id;
            update.resources = activeWs.resources || [];
            update.canvasView = activeWs.canvasView || { x: 0, y: 0, zoom: 1 };
          } else if (data.resources) {
            const seen = new Set<string>();
            const res = data.resources.filter((r: Resource) => { if (!r.id || seen.has(r.id)) return false; seen.add(r.id); return true; });
            const v = data.view || { x: 0, y: 0, zoom: 1 };
            update.workspaces = [{ id: 'default', name: 'Default Workspace', resources: res, canvasView: v }];
            update.activeWorkspaceId = 'default';
            update.resources = res;
            update.canvasView = v;
          }
        }
      } catch (e) { console.error('[loadCanvas] error:', e); }
      set(update);
      console.log('[loadCanvas] set done, workspaces:', update.workspaces?.length);
      _loadingCanvas = false;
    })();
    return _canvasLoadPromise;
  },
  addResource: (resource) =>
    set((s) => {
      if (s.resources.some((r) => r.id === resource.id)) return s;
      const updated = [...s.resources, resource];
      const updatedWs = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: updated } : w);
      setTimeout(() => get().saveCanvasToDisk(), 50);
      return { resources: updated, workspaces: updatedWs };
    }),
  removeResource: (id) =>
    set((s) => {
      const updated = s.resources.filter((r) => r.id !== id);
      const updatedWs = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: updated } : w);
      setTimeout(() => get().saveCanvasToDisk(), 50);
      return { resources: updated, workspaces: updatedWs };
    }),
  toggleResourceState: (id) =>
    set((s) => {
      const updated = s.resources.map((r) =>
        r.id === id ? { ...r, state: (r.state === 'maximized' ? 'minimized' : 'maximized') as 'maximized' | 'minimized' } : r
      );
      const updatedWs = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: updated } : w);
      return { resources: updated, workspaces: updatedWs };
    }),
  updateResourcePosition: (id, position) =>
    set((s) => {
      const updated = s.resources.map((r) =>
        r.id === id ? { ...r, position, isTiled: false } : r
      );
      const updatedWs = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: updated } : w);
      setTimeout(() => get().saveCanvasToDisk(), 50);
      return { resources: updated, workspaces: updatedWs };
    }),
  bringToFront: (id) =>
    set((s) => {
      const updated = s.resources.map((r) => ({
        ...r,
        zIndex: r.id === id ? Date.now() : r.zIndex,
      }));
      const updatedWs = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: updated } : w);
      return { resources: updated, workspaces: updatedWs };
    }),
  updateResourceSize: (id, size) =>
    set((s) => {
      const updated = s.resources.map((r) => (r.id === id ? { ...r, size, isTiled: false } : r));
      const updatedWs = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: updated } : w);
      setTimeout(() => get().saveCanvasToDisk(), 50);
      return { resources: updated, workspaces: updatedWs };
    }),
  arrangeResources: (layout) =>
    set((s) => {
      const all = s.resources.filter((r) => r.state === 'maximized');
      if (all.length === 0) return {};
      const headerH = 44;
      const areaW = window.innerWidth - 64;
      const areaH = window.innerHeight - headerH;
      const arranged = [...all];
      const n = arranged.length;
      if (layout === 'splitH') {
        const w = Math.floor(areaW / n);
        arranged.forEach((r, i) => {
          r.position = { x: i * w, y: headerH };
          r.size = { width: w, height: areaH };
          r.isTiled = true;
        });
      } else if (layout === 'splitV') {
        const h = Math.floor(areaH / n);
        arranged.forEach((r, i) => {
          r.position = { x: 0, y: headerH + i * h };
          r.size = { width: areaW, height: h };
          r.isTiled = true;
        });
      }
      return { resources: s.resources.map((r) => arranged.find((a) => a.id === r.id) || r) };
    }),
  updateResourceContent: (id, content) =>
    set((s) => {
      const updated = s.resources.map((r) => (r.id === id ? { ...r, content } : r));
      const updatedWs = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: updated } : w);
      setTimeout(() => get().saveCanvasToDisk(), 100);
      return { resources: updated, workspaces: updatedWs };
    }),
  toggleFullscreen: (id) =>
    set((s) => {
      const r = s.resources.find((r) => r.id === id);
      if (!r) return {};
      let updated: Resource[];
      if (r.isFullscreen) {
        const prev = r.previousBounds || { x: 60, y: 60, width: 600, height: 500 };
        updated = s.resources.map((res) =>
          res.id === id
            ? { ...res, isFullscreen: false, isTiled: false, previousBounds: undefined, position: { x: prev.x, y: prev.y }, size: { width: prev.width, height: prev.height } }
            : res
        );
      } else {
        const headerH = 44;
        updated = s.resources.map((res) =>
          res.id === id
            ? { ...res, isFullscreen: true, previousBounds: { x: res.position.x, y: res.position.y, width: res.size?.width || 600, height: res.size?.height || 500 }, position: { x: 0, y: headerH }, size: { width: window.innerWidth - 64, height: window.innerHeight - headerH } }
            : res
        );
      }
      const updatedWs = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: updated } : w);
      return { resources: updated, workspaces: updatedWs };
    }),
  minimizeAllResources: () =>
    set((s) => ({
      resources: s.resources.map((r) => ({ ...r, state: 'minimized' })),
    })),
  selectedResourceId: null,
  setSelectedResource: (id) => set({ selectedResourceId: id }),
  summarizeTarget: null,
  setSummarizeTarget: (t) => set({ summarizeTarget: t }),
  canvasLocked: false,
  setCanvasLocked: (locked) => set({ canvasLocked: locked }),

  // Undo / Redo
  undoStack: [],
  redoStack: [],
  pushUndo: () => set((s) => ({ undoStack: [...s.undoStack.slice(-50), s.resources.map((r) => ({ ...r }))], redoStack: [] })),
  undo: () => set((s) => {
    console.log('[Undo] stack size:', s.undoStack.length);
    if (s.undoStack.length === 0) return {};
    const prev = s.undoStack[s.undoStack.length - 1];
    const newUndo = s.undoStack.slice(0, -1);
    const updatedWs = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: prev.map((r) => ({ ...r })) } : w);
    console.log('[Undo] applying state:', prev);
    return { ...s, undoStack: newUndo, redoStack: [...s.redoStack, s.resources.map((r) => ({ ...r }))], resources: prev.map((r) => ({ ...r })), workspaces: updatedWs };
  }),
  redo: () => set((s) => {
    console.log('[Redo] stack size:', s.redoStack.length);
    if (s.redoStack.length === 0) return {};
    const next = s.redoStack[s.redoStack.length - 1];
    const newRedo = s.redoStack.slice(0, -1);
    const updatedWs = s.workspaces.map((w) => w.id === s.activeWorkspaceId ? { ...w, resources: next.map((r) => ({ ...r })) } : w);
    console.log('[Redo] applying state:', next);
    return { ...s, redoStack: newRedo, undoStack: [...s.undoStack, s.resources.map((r) => ({ ...r }))], resources: next.map((r) => ({ ...r })), workspaces: updatedWs };
  }),

  // Chatbot
  chatbotOpen: false,
  chatInputDraft: '',
  setChatInputDraft: (text) => set({ chatInputDraft: text }),
  setChatbotOpen: (open) => set({ chatbotOpen: open }),
  toggleChatbot: () => set((s) => ({ chatbotOpen: !s.chatbotOpen })),
  chatbotHeight: 35,
  setChatbotHeight: (height) => set({ chatbotHeight: height }),
  chatMessages: [],
  addChatMessage: (msg) => {
    set((s) => {
      const updatedSessions = s.activeSessionId
        ? s.chatSessions.map((ses) =>
            ses.id === s.activeSessionId
              ? { ...ses, messages: [...ses.messages, msg] }
              : ses
          )
        : s.chatSessions;
      return { chatMessages: [...s.chatMessages, msg], chatSessions: updatedSessions };
    });
    saveChatSessionsSnapshot(get);
  },
  clearChat: () => set({ chatMessages: [] }),
  chatLoading: false,
  setChatLoading: (loading) => set({ chatLoading: loading }),
  selectedModel: '',
  setSelectedModel: (model) => set({ selectedModel: model }),
  chatSessions: [],
  activeSessionId: null,
  createChatSession: () => {
    set((s) => {
      const newSession: ChatSession = {
        id: crypto.randomUUID(),
        name: `Chat ${s.chatSessions.length + 1}`,
        messages: [],
        createdAt: Date.now(),
      };
      // Save current messages to active session
      let updatedSessions = s.chatSessions;
      if (s.activeSessionId) {
        updatedSessions = updatedSessions.map((ses) =>
          ses.id === s.activeSessionId ? { ...ses, messages: s.chatMessages } : ses
        );
      }
      return {
        chatSessions: [...updatedSessions, newSession],
        activeSessionId: newSession.id,
        chatMessages: [],
      };
    });
    saveChatSessionsSnapshot(get);
  },
  switchChatSession: (id) => {
    set((s) => {
      // Save current messages to the currently active session
      let updatedSessions = s.chatSessions;
      if (s.activeSessionId) {
        updatedSessions = updatedSessions.map((ses) =>
          ses.id === s.activeSessionId ? { ...ses, messages: s.chatMessages } : ses
        );
      }
      // Load target session messages
      const target = updatedSessions.find((ses) => ses.id === id);
      return {
        chatSessions: updatedSessions,
        activeSessionId: id,
        chatMessages: target?.messages || [],
      };
    });
    saveChatSessionsSnapshot(get);
  },
  deleteChatSession: (id) => {
    set((s) => {
      const updatedSessions = s.chatSessions.filter((ses) => ses.id !== id);
      const isActive = s.activeSessionId === id;
      if (isActive) {
        const next = updatedSessions.length > 0 ? updatedSessions[0] : null;
        return {
          chatSessions: updatedSessions,
          activeSessionId: next?.id || null,
          chatMessages: next?.messages || [],
        };
      }
      return { chatSessions: updatedSessions };
    });
    saveChatSessionsSnapshot(get);
  },
  aiDetached: false,
  setAiDetached: (detached) => set({ aiDetached: detached }),
  aiWindowPosition: { x: 80, y: 80 },
  aiWindowSize: { width: 400, height: 500 },
  setAiWindowPosition: (pos) => set({ aiWindowPosition: pos }),
  setAiWindowSize: (size) => set({ aiWindowSize: size }),

  // Explainer
  explainer: { steps: [], currentStep: 0, visible: false, title: '', topic: '', conversation: [], generating: false },
  setExplainer: (partial) =>
    set((s) => ({ explainer: { ...s.explainer, ...partial } })),
  showExplainer: (steps, title) =>
    set({ explainer: { steps, currentStep: 0, visible: true, title, topic: title, conversation: [], generating: false } }),
  nextStep: () =>
    set((s) => ({
      explainer: {
        ...s.explainer,
        currentStep: Math.min(s.explainer.currentStep + 1, s.explainer.steps.length - 1),
      },
    })),
  prevStep: () =>
    set((s) => ({
      explainer: {
        ...s.explainer,
        currentStep: Math.max(s.explainer.currentStep - 1, 0),
      },
    })),
  hideExplainer: () =>
    set({ explainer: { steps: [], currentStep: 0, visible: false, title: '', topic: '', conversation: [], generating: false } }),
  addExplainerMessage: (role, content) =>
    set((s) => ({
      explainer: {
        ...s.explainer,
        conversation: [...s.explainer.conversation, { role, content }],
      },
    })),

  // Pomodoro
  pomodoroState: 'idle',
  pomodoroSecondsLeft: 25 * 60,
  pomodoroSessionCount: 0,
  pomodoroDuration: 25 * 60,
  shortBreakDuration: 5 * 60,
  longBreakDuration: 15 * 60,
  setPomodoroState: (s) => set({ pomodoroState: s }),
  setPomodoroSecondsLeft: (s) => set({ pomodoroSecondsLeft: s }),
  setPomodoroSessionCount: (c) => set({ pomodoroSessionCount: c }),
  setPomodoroDuration: (s) => set({ pomodoroDuration: s }),
  setShortBreakDuration: (s) => set({ shortBreakDuration: s }),
  setLongBreakDuration: (s) => set({ longBreakDuration: s }),

  // Motivation
  motivationQuote: 'The secret of getting ahead is getting started. — Mark Twain',
  setMotivationQuote: (q) => set({ motivationQuote: q }),
  motivationChatMaximized: false,
  setMotivationChatMaximized: (maximized) => set({ motivationChatMaximized: maximized }),
  motivationSessions: [],
  motivationActiveSessionId: null,
  motivationMessages: [],
  createMotivationSession: () => {
    set((s) => {
      const newSession: ChatSession = {
        id: crypto.randomUUID(),
        name: `Session ${s.motivationSessions.length + 1}`,
        messages: [],
        createdAt: Date.now(),
      };
      let updatedSessions = s.motivationSessions;
      if (s.motivationActiveSessionId) {
        updatedSessions = updatedSessions.map((ses) =>
          ses.id === s.motivationActiveSessionId ? { ...ses, messages: s.motivationMessages } : ses
        );
      }
      return {
        motivationSessions: [...updatedSessions, newSession],
        motivationActiveSessionId: newSession.id,
        motivationMessages: [],
      };
    });
    persistMotivationSessions(get);
  },
  switchMotivationSession: (id) => {
    set((s) => {
      let updatedSessions = s.motivationSessions;
      if (s.motivationActiveSessionId) {
        updatedSessions = updatedSessions.map((ses) =>
          ses.id === s.motivationActiveSessionId ? { ...ses, messages: s.motivationMessages } : ses
        );
      }
      const target = updatedSessions.find((ses) => ses.id === id);
      return {
        motivationSessions: updatedSessions,
        motivationActiveSessionId: id,
        motivationMessages: target?.messages || [],
      };
    });
    persistMotivationSessions(get);
  },
  deleteMotivationSession: (id) => {
    set((s) => {
      const updatedSessions = s.motivationSessions.filter((ses) => ses.id !== id);
      const isActive = s.motivationActiveSessionId === id;
      if (isActive) {
        const next = updatedSessions.length > 0 ? updatedSessions[0] : null;
        return {
          motivationSessions: updatedSessions,
          motivationActiveSessionId: next?.id || null,
          motivationMessages: next?.messages || [],
        };
      }
      return { motivationSessions: updatedSessions };
    });
    persistMotivationSessions(get);
  },
  addMotivationMessage: (msg) => {
    set((s) => {
      const updatedSessions = s.motivationActiveSessionId
        ? s.motivationSessions.map((ses) =>
            ses.id === s.motivationActiveSessionId
              ? { ...ses, messages: [...ses.messages, msg] }
              : ses
          )
        : s.motivationSessions;
      return { motivationMessages: [...s.motivationMessages, msg], motivationSessions: updatedSessions };
    });
    persistMotivationSessions(get);
  },
  clearMotivationMessages: () => set({ motivationMessages: [] }),
  loadMotivationSessions: async () => {
    try {
      const { loadMotivationSessions: loadFromBackend } = await import('./tauri-commands');
      let entries = await loadFromBackend();
      // One-time migration from localStorage
      if (entries.length === 0) {
        try {
          const raw = localStorage.getItem('motivation-sessions');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.length > 0) { entries = parsed; localStorage.removeItem('motivation-sessions'); }
          }
        } catch {}
      }
      if (entries.length > 0) {
        const sessions = entries as unknown as ChatSession[];
        set({
          motivationSessions: sessions,
          motivationActiveSessionId: sessions[0].id,
          motivationMessages: sessions[0].messages || [],
        });
        return;
      }
    } catch {}
    // No sessions exist — create a default one
    const defaultSession: ChatSession = {
      id: crypto.randomUUID(),
      name: 'Session 1',
      messages: [],
      createdAt: Date.now(),
    };
    set({
      motivationSessions: [defaultSession],
      motivationActiveSessionId: defaultSession.id,
      motivationMessages: [],
    });
    persistMotivationSessions(get);
  },

  // Documents
  documents: [],
  setDocuments: (docs) => set({ documents: docs }),
  notesList: [],
  setNotesList: (notes) => set({ notesList: notes }),

  // Flashcards
  flashcards: [],
  setFlashcards: (cards) => set({ flashcards: cards }),
  flashcardStats: null,
  setFlashcardStats: (stats) => set({ flashcardStats: stats }),
  flashcardCollections: [],
  addCollection: (name, description) => {
    set((s) => ({
      flashcardCollections: [
        ...s.flashcardCollections,
        { id: crypto.randomUUID(), name, description: description || '', createdAt: new Date().toISOString(), reviewPeriodDays: 1 },
      ],
    }));
    saveCollectionsSnapshot(get);
  },
  setCollectionReviewPeriod: (id, days) => {
    set((s) => ({
      flashcardCollections: s.flashcardCollections.map((c) =>
        c.id === id ? { ...c, reviewPeriodDays: days } : c
      ),
    }));
    saveCollectionsSnapshot(get);
  },
  renameCollection: (id, name) => {
    set((s) => ({
      flashcardCollections: s.flashcardCollections.map((c) =>
        c.id === id ? { ...c, name } : c
      ),
    }));
    saveCollectionsSnapshot(get);
  },
  removeCollection: (id) => {
    set((s) => ({
      flashcardCollections: s.flashcardCollections.filter((c) => c.id !== id),
      activeCollectionId: s.activeCollectionId === id ? null : s.activeCollectionId,
    }));
    saveCollectionsSnapshot(get);
  },
  activeCollectionId: null,
  setActiveCollection: (id) => set({ activeCollectionId: id }),
  loadCollectionsFromDisk: async () => {
    try {
      const { loadCollections, saveCollections } = await import('./tauri-commands');
      let entries = await loadCollections();
      const before = entries.length;
      entries = entries.filter((e: any) => (e.name || '').trim().toLowerCase() !== 'general');
      if (entries.length !== before) {
        saveCollections(entries.map((e: any) => ({
          id: e.id, name: e.name, description: e.description, created_at: e.created_at,
          review_period_days: e.review_period_days ?? 1,
        }))).catch(() => {});
      }
      if (entries.length === 0) return;
      const mapped: FlashcardCollection[] = entries.map((e: any) => ({
        id: e.id, name: e.name, description: e.description, createdAt: e.created_at,
        reviewPeriodDays: e.review_period_days ?? 1,
      }));
      set({ flashcardCollections: mapped });
    } catch {}
  },
  loadChatSessionsFromDisk: async () => {
    try {
      const { loadChatSessions } = await import('./tauri-commands');
      const entries = await loadChatSessions() as any[];
      if (entries.length === 0) return;
      const first = entries[0];
      set({
        chatSessions: entries as any,
        activeSessionId: first.id,
        chatMessages: first.messages || [],
      });
    } catch {}
  },

  // Exams
  exams: [],
  addExam: (exam) =>
    set((s) => ({ exams: [...s.exams, exam] })),
  updateExam: (id, updates) =>
    set((s) => ({
      exams: s.exams.map((e) => e.id === id ? { ...e, ...updates } : e),
    })),
  deleteExam: (id) =>
    set((s) => ({ exams: s.exams.filter((e) => e.id !== id) })),
}));

export interface ExamQuestion {
  id: string;
  type: 'multiple-choice' | 'verbal';
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer?: string;
  timeSpent?: number;
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  description: string;
  questions: ExamQuestion[];
  timeLimit: number;
  showAnswersImmediately: boolean;
  createdAt: string;
  status: 'draft' | 'in-progress' | 'completed';
  score?: number;
  total?: number;
  percentage?: number;
  completedAt?: string;
}
