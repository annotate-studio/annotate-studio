import { create } from 'zustand';
import { useSettings, type PomodoroSettings } from './settings';

export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak';
export type PomodoroStatus = 'idle' | 'running' | 'paused';

export interface PhaseCompletion {
  phase: PomodoroPhase;
  next: PomodoroPhase;
  durationSeconds: number;
  autoStarted: boolean;
}

interface PomodoroStore {
  phase: PomodoroPhase;
  status: PomodoroStatus;
  endsAt: number | null;
  remaining: number;
  focusStreak: number;
  completedToday: number;
  day: string;
  start: (phase?: PomodoroPhase) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => PhaseCompletion | null;
  tick: (now?: number) => PhaseCompletion | null;
  syncDuration: () => void;
  seedCompletedToday: (count: number) => void;
}

export function phaseSeconds(phase: PomodoroPhase, settings: PomodoroSettings): number {
  const minutes =
    phase === 'focus' ? settings.focusMinutes : phase === 'shortBreak' ? settings.shortBreakMinutes : settings.longBreakMinutes;
  return Math.round(minutes * 60);
}

export function today(): string {
  return new Date().toDateString();
}

function settings(): PomodoroSettings {
  return useSettings.getState().pomodoro;
}

export const usePomodoro = create<PomodoroStore>((set, get) => {
  const advance = (completedPhase: PomodoroPhase, fullDuration: boolean): PhaseCompletion => {
    const config = settings();
    const state = get();
    const sameDay = state.day === today();
    let focusStreak = state.focusStreak;
    let completedToday = sameDay ? state.completedToday : 0;
    let next: PomodoroPhase;
    if (completedPhase === 'focus') {
      if (fullDuration) completedToday += 1;
      focusStreak += 1;
      next = focusStreak % config.longBreakEvery === 0 ? 'longBreak' : 'shortBreak';
    } else {
      next = 'focus';
      if (completedPhase === 'longBreak') focusStreak = 0;
    }
    const autoStart = next === 'focus' ? config.autoStartFocus : config.autoStartBreaks;
    const seconds = phaseSeconds(next, config);
    set({
      phase: next,
      status: autoStart ? 'running' : 'idle',
      endsAt: autoStart ? Date.now() + seconds * 1000 : null,
      remaining: seconds,
      focusStreak,
      completedToday,
      day: today(),
    });
    return { phase: completedPhase, next, durationSeconds: phaseSeconds(completedPhase, config), autoStarted: autoStart };
  };

  return {
    phase: 'focus',
    status: 'idle',
    endsAt: null,
    remaining: phaseSeconds('focus', settings()),
    focusStreak: 0,
    completedToday: 0,
    day: today(),
    start: (phase) => {
      const target = phase ?? get().phase;
      const seconds = phaseSeconds(target, settings());
      set({ phase: target, status: 'running', endsAt: Date.now() + seconds * 1000, remaining: seconds });
    },
    pause: () => {
      const { status, endsAt } = get();
      if (status !== 'running' || endsAt === null) return;
      set({ status: 'paused', endsAt: null, remaining: Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) });
    },
    resume: () => {
      const { status, remaining } = get();
      if (status !== 'paused') return;
      set({ status: 'running', endsAt: Date.now() + remaining * 1000 });
    },
    reset: () => {
      const phase = get().phase;
      set({ status: 'idle', endsAt: null, remaining: phaseSeconds(phase, settings()) });
    },
    skip: () => {
      const { phase, status } = get();
      if (status === 'idle' && phase === 'focus') return null;
      return advance(phase, false);
    },
    tick: (now = Date.now()) => {
      const { status, endsAt, remaining, phase } = get();
      if (status !== 'running' || endsAt === null) return null;
      const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
      if (left <= 0) return advance(phase, true);
      if (left !== remaining) set({ remaining: left });
      return null;
    },
    syncDuration: () => {
      const { status, phase } = get();
      if (status === 'idle') set({ remaining: phaseSeconds(phase, settings()) });
    },
    seedCompletedToday: (count) => {
      const day = today();
      const state = get();
      const current = state.day === day ? state.completedToday : 0;
      const next = Math.max(current, Math.floor(count));
      if (next !== state.completedToday || state.day !== day) set({ completedToday: next, day });
    },
  };
});
