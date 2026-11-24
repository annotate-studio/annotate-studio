import { create } from 'zustand';
import { isTauri, loadSettings, saveSettings } from '@/lib/tauri-commands';
import { createSaver } from '@/lib/persist';
import { clamp } from '@/lib/utils';

export const THEME_IDS = ['white', 'black', 'sepia', 'gray', 'forest', 'ocean', 'lavender', 'rose'] as const;
export type ThemeMode = (typeof THEME_IDS)[number];

export const POMODORO_SOUNDS = ['beep', 'bell', 'chime', 'digital', 'none'] as const;
export type PomodoroSound = (typeof POMODORO_SOUNDS)[number];

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  sound: PomodoroSound;
}

export interface ChatLayout {
  dockedHeight: number;
  detached: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TEX_ENGINES = ['auto', 'latexmk', 'xelatex', 'lualatex', 'pdflatex', 'tectonic'] as const;
export type TexEngine = (typeof TEX_ENGINES)[number];

export const REASONING_EFFORTS = ['low', 'medium', 'high'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface AgentSettings {
  enabled: boolean;
  allowWrites: boolean;
  confirmEdits: boolean;
  maxSteps: number;
  deepEffort: ReasoningEffort;
}

export interface ProxySettings {
  enabled: boolean;
  url: string;
  bypassLocal: boolean;
}

export interface PersistedSettings {
  theme: ThemeMode;
  primaryColor: string;
  backgroundImage: string;
  backgroundBlur: number;
  backgroundOpacity: number;
  appScale: number;
  pomodoro: PomodoroSettings;
  selectedModel: string;
  fastModel: string;
  reasoningModel: string;
  visionModel: string;
  proxy: ProxySettings;
  agent: AgentSettings;
  sidebarExpanded: boolean;
  notificationsEnabled: boolean;
  chatLayout: ChatLayout;
  recentFiles: Record<string, number>;
  ctrlWheelZoom: boolean;
  mathScale: number;
  latexMacros: string;
  texEngine: TexEngine;
  noteDirections: Record<string, 'rtl' | 'ltr'>;
}

export const DEFAULT_SETTINGS: PersistedSettings = {
  theme: 'white',
  primaryColor: '#2563EB',
  backgroundImage: '',
  backgroundBlur: 8,
  backgroundOpacity: 82,
  appScale: 100,
  pomodoro: {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    longBreakEvery: 4,
    autoStartBreaks: true,
    autoStartFocus: false,
    sound: 'beep',
  },
  selectedModel: '',
  fastModel: '',
  reasoningModel: '',
  visionModel: '',
  proxy: {
    enabled: false,
    url: '',
    bypassLocal: true,
  },
  agent: { enabled: true, allowWrites: true, confirmEdits: false, maxSteps: 30, deepEffort: 'high' },
  sidebarExpanded: false,
  notificationsEnabled: true,
  chatLayout: { dockedHeight: 320, detached: false, x: 120, y: 90, width: 420, height: 560 },
  recentFiles: {},
  ctrlWheelZoom: true,
  mathScale: 115,
  latexMacros: '',
  texEngine: 'auto',
  noteDirections: {},
};

interface SettingsStore extends PersistedSettings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<PersistedSettings>) => void;
  updatePomodoro: (patch: Partial<PomodoroSettings>) => void;
  updateChatLayout: (patch: Partial<ChatLayout>) => void;
  updateAgent: (patch: Partial<AgentSettings>) => void;
  updateProxy: (patch: Partial<ProxySettings>) => void;
  setNoteDirection: (path: string, direction: 'auto' | 'rtl' | 'ltr') => void;
  moveNoteDirection: (oldPath: string, newPath: string) => void;
  touchRecent: (path: string) => void;
  forgetRecent: (path: string) => void;
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function readableTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.45 ? '#0F172A' : '#FFFFFF';
}

export function applyAppearance(
  settings: Pick<PersistedSettings, 'theme' | 'primaryColor' | 'mathScale' | 'backgroundImage' | 'backgroundBlur' | 'backgroundOpacity'>,
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.style.colorScheme = settings.theme === 'black' ? 'dark' : 'light';
  root.style.setProperty('--primary', settings.primaryColor);
  root.style.setProperty('--primary-text', readableTextColor(settings.primaryColor));
  root.style.setProperty('--math-scale', String(settings.mathScale / 100));
  const hasBg = Boolean(settings.backgroundImage && settings.backgroundImage.trim());
  if (hasBg) {
    root.dataset.hasBg = 'true';
    root.style.setProperty('--app-bg-image', `url("${settings.backgroundImage.replace(/"/g, '\\"')}")`);
    root.style.setProperty('--app-bg-blur', `${settings.backgroundBlur}px`);
    root.style.setProperty('--app-bg-surface-alpha', `${settings.backgroundOpacity}%`);
  } else {
    delete root.dataset.hasBg;
    root.style.removeProperty('--app-bg-image');
    root.style.removeProperty('--app-bg-blur');
    root.style.removeProperty('--app-bg-surface-alpha');
  }
}

let appliedScale = 100;
let webviewScale = 1;

export function webviewZoomFactor(): number {
  return webviewScale;
}

export async function applyScale(scale: number) {
  if (typeof document === 'undefined' || scale === appliedScale) return;
  appliedScale = scale;
  const factor = scale / 100;
  if (isTauri()) {
    try {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      await getCurrentWebview().setZoom(factor);
      webviewScale = factor;
      document.documentElement.style.removeProperty('zoom');
      return;
    } catch {
      webviewScale = 1;
    }
  }
  document.documentElement.style.setProperty('zoom', String(factor));
}

function sanitize(raw: unknown): PersistedSettings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pomodoroRaw = (data.pomodoro && typeof data.pomodoro === 'object' ? data.pomodoro : {}) as Record<string, unknown>;
  const chatRaw = (data.chatLayout && typeof data.chatLayout === 'object' ? data.chatLayout : {}) as Record<string, unknown>;
  const number = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  const defaults = DEFAULT_SETTINGS;
  const legacySound = typeof data.pomodoroSound === 'string' ? data.pomodoroSound : undefined;
  const soundCandidate = (pomodoroRaw.sound as string | undefined) ?? legacySound;
  const agentRaw = (data.agent && typeof data.agent === 'object' ? data.agent : {}) as Record<string, unknown>;
  const directionsRaw = data.noteDirections && typeof data.noteDirections === 'object' ? (data.noteDirections as Record<string, unknown>) : {};
  const noteDirections = Object.fromEntries(
    Object.entries(directionsRaw).filter((entry): entry is [string, 'rtl' | 'ltr'] => entry[1] === 'rtl' || entry[1] === 'ltr'),
  );
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
  const recentRaw = data.recentFiles && typeof data.recentFiles === 'object' ? (data.recentFiles as Record<string, unknown>) : {};
  const recentFiles = Object.fromEntries(
    Object.entries(recentRaw)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200),
  );
  return {
    theme: THEME_IDS.includes(data.theme as ThemeMode) ? (data.theme as ThemeMode) : defaults.theme,
    primaryColor: isHexColor(data.primaryColor) ? data.primaryColor : defaults.primaryColor,
    backgroundImage: text(data.backgroundImage, defaults.backgroundImage),
    backgroundBlur: number(data.backgroundBlur, defaults.backgroundBlur, 0, 32),
    backgroundOpacity: number(data.backgroundOpacity, defaults.backgroundOpacity, 20, 98),
    appScale: number(data.appScale, defaults.appScale, 80, 200),
    pomodoro: {
      focusMinutes: number(pomodoroRaw.focusMinutes, defaults.pomodoro.focusMinutes, 1, 180),
      shortBreakMinutes: number(pomodoroRaw.shortBreakMinutes, defaults.pomodoro.shortBreakMinutes, 1, 60),
      longBreakMinutes: number(pomodoroRaw.longBreakMinutes, defaults.pomodoro.longBreakMinutes, 1, 120),
      longBreakEvery: number(pomodoroRaw.longBreakEvery, defaults.pomodoro.longBreakEvery, 2, 12),
      autoStartBreaks: bool(pomodoroRaw.autoStartBreaks, defaults.pomodoro.autoStartBreaks),
      autoStartFocus: bool(pomodoroRaw.autoStartFocus, defaults.pomodoro.autoStartFocus),
      sound: POMODORO_SOUNDS.includes(soundCandidate as PomodoroSound) ? (soundCandidate as PomodoroSound) : defaults.pomodoro.sound,
    },
    selectedModel: text(data.selectedModel, defaults.selectedModel),
    fastModel: text(data.fastModel, defaults.fastModel),
    reasoningModel: text(data.reasoningModel, defaults.reasoningModel),
    visionModel: text(data.visionModel, defaults.visionModel),
    proxy: {
      enabled: bool((data.proxy as Record<string, unknown> | undefined)?.enabled, defaults.proxy.enabled),
      url: text((data.proxy as Record<string, unknown> | undefined)?.url, defaults.proxy.url),
      bypassLocal: bool((data.proxy as Record<string, unknown> | undefined)?.bypassLocal, defaults.proxy.bypassLocal),
    },
    agent: {
      enabled: bool(agentRaw.enabled, defaults.agent.enabled),
      allowWrites: bool(agentRaw.allowWrites, defaults.agent.allowWrites),
      confirmEdits: bool(agentRaw.confirmEdits, defaults.agent.confirmEdits),
      maxSteps: number(agentRaw.maxSteps, defaults.agent.maxSteps, 4, 120),
      deepEffort: REASONING_EFFORTS.includes(agentRaw.deepEffort as ReasoningEffort) ? (agentRaw.deepEffort as ReasoningEffort) : defaults.agent.deepEffort,
    },
    sidebarExpanded: bool(data.sidebarExpanded, defaults.sidebarExpanded),
    notificationsEnabled: bool(data.notificationsEnabled, defaults.notificationsEnabled),
    chatLayout: {
      dockedHeight: number(chatRaw.dockedHeight, defaults.chatLayout.dockedHeight, 180, 2000),
      detached: bool(chatRaw.detached, defaults.chatLayout.detached),
      x: number(chatRaw.x, defaults.chatLayout.x, -2000, 10000),
      y: number(chatRaw.y, defaults.chatLayout.y, -2000, 10000),
      width: number(chatRaw.width, defaults.chatLayout.width, 320, 2000),
      height: number(chatRaw.height, defaults.chatLayout.height, 320, 2000),
    },
    recentFiles,
    ctrlWheelZoom: bool(data.ctrlWheelZoom, defaults.ctrlWheelZoom),
    mathScale: number(data.mathScale, defaults.mathScale, 80, 220),
    latexMacros: text(data.latexMacros, defaults.latexMacros).slice(0, 20_000),
    texEngine: TEX_ENGINES.includes(data.texEngine as TexEngine) ? (data.texEngine as TexEngine) : defaults.texEngine,
    noteDirections,
  };
}

function snapshot(state: SettingsStore): PersistedSettings {
  return {
    theme: state.theme,
    primaryColor: state.primaryColor,
    backgroundImage: state.backgroundImage,
    backgroundBlur: state.backgroundBlur,
    backgroundOpacity: state.backgroundOpacity,
    appScale: state.appScale,
    pomodoro: state.pomodoro,
    selectedModel: state.selectedModel,
    fastModel: state.fastModel,
    reasoningModel: state.reasoningModel,
    visionModel: state.visionModel,
    proxy: state.proxy,
    agent: state.agent,
    sidebarExpanded: state.sidebarExpanded,
    notificationsEnabled: state.notificationsEnabled,
    chatLayout: state.chatLayout,
    recentFiles: state.recentFiles,
    ctrlWheelZoom: state.ctrlWheelZoom,
    mathScale: state.mathScale,
    latexMacros: state.latexMacros,
    texEngine: state.texEngine,
    noteDirections: state.noteDirections,
  };
}

const saver = createSaver<PersistedSettings>((value) => saveSettings(value), 300);

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    let loaded = DEFAULT_SETTINGS;
    let reachable = false;
    try {
      loaded = sanitize(await loadSettings());
      reachable = true;
    } catch {
      loaded = DEFAULT_SETTINGS;
    }
    set({ ...loaded, hydrated: true });
    applyAppearance(loaded);
    void applyScale(loaded.appScale);
    if (reachable) saver.schedule(loaded);
  },
  update: (patch) => {
    set(patch);
    if (
      patch.theme !== undefined ||
      patch.primaryColor !== undefined ||
      patch.mathScale !== undefined ||
      patch.backgroundImage !== undefined ||
      patch.backgroundBlur !== undefined ||
      patch.backgroundOpacity !== undefined
    ) {
      applyAppearance(get());
    }
    if (patch.appScale !== undefined) void applyScale(get().appScale);
  },
  updatePomodoro: (patch) => set((state) => ({ pomodoro: { ...state.pomodoro, ...patch } })),
  updateChatLayout: (patch) => set((state) => ({ chatLayout: { ...state.chatLayout, ...patch } })),
  updateAgent: (patch) => set((state) => ({ agent: { ...state.agent, ...patch } })),
  updateProxy: (patch) => set((state) => ({ proxy: { ...state.proxy, ...patch } })),
  setNoteDirection: (path, direction) =>
    set((state) => {
      const next = { ...state.noteDirections };
      if (direction === 'auto') delete next[path];
      else next[path] = direction;
      return { noteDirections: next };
    }),
  moveNoteDirection: (oldPath, newPath) =>
    set((state) => {
      const direction = state.noteDirections[oldPath];
      if (!direction) return state;
      const next = { ...state.noteDirections };
      delete next[oldPath];
      next[newPath] = direction;
      return { noteDirections: next };
    }),
  touchRecent: (path) => set((state) => ({ recentFiles: { ...state.recentFiles, [path]: Date.now() } })),
  forgetRecent: (path) =>
    set((state) => {
      if (!(path in state.recentFiles)) return state;
      const next = { ...state.recentFiles };
      delete next[path];
      return { recentFiles: next };
    }),
}));

useSettings.subscribe((state, previous) => {
  if (!state.hydrated || !previous.hydrated) return;
  const current = snapshot(state);
  const before = snapshot(previous);
  const changed = (Object.keys(current) as Array<keyof PersistedSettings>).some((key) => current[key] !== before[key]);
  if (changed) saver.schedule(current);
});
