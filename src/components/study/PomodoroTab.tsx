'use client';

import React, { useEffect, useState } from 'react';
import { Bell, Brain, Coffee, Flame, Pause, Play, RotateCcw, SkipForward, Volume2 } from 'lucide-react';
import { phaseSeconds, today, usePomodoro, type PomodoroPhase } from '@/store/pomodoro';
import { POMODORO_SOUNDS, useSettings, type PomodoroSound } from '@/store/settings';
import { getStudyStats, type StudyStats } from '@/lib/tauri-commands';
import { playChime } from '@/lib/sound';
import { cn, formatDuration } from '@/lib/utils';

const PHASES: { id: PomodoroPhase; label: string; icon: React.ReactNode }[] = [
  { id: 'focus', label: 'Focus', icon: <Brain size={15} /> },
  { id: 'shortBreak', label: 'Short break', icon: <Coffee size={15} /> },
  { id: 'longBreak', label: 'Long break', icon: <Coffee size={15} /> },
];

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const next = Number(draft);
    if (draft.trim() && Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
    setDraft(null);
  };

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          else if (event.key === 'Escape') setDraft(null);
        }}
      />
    </label>
  );
}

export default function PomodoroTab() {
  const phase = usePomodoro((state) => state.phase);
  const status = usePomodoro((state) => state.status);
  const remaining = usePomodoro((state) => state.remaining);
  const completedToday = usePomodoro((state) => (state.day === today() ? state.completedToday : 0));
  const focusStreak = usePomodoro((state) => state.focusStreak);
  const settings = useSettings((state) => state.pomodoro);
  const updatePomodoro = useSettings((state) => state.updatePomodoro);
  const notificationsEnabled = useSettings((state) => state.notificationsEnabled);
  const update = useSettings((state) => state.update);
  const [stats, setStats] = useState<StudyStats | null>(null);

  useEffect(() => {
    usePomodoro.getState().syncDuration();
  }, [settings.focusMinutes, settings.shortBreakMinutes, settings.longBreakMinutes]);

  useEffect(() => {
    getStudyStats().then(setStats).catch(() => setStats(null));
  }, [completedToday]);

  const total = phaseSeconds(phase, settings);
  const progress = total > 0 ? 1 - remaining / total : 0;
  const radius = 118;
  const circumference = 2 * Math.PI * radius;
  const store = usePomodoro.getState;

  return (
    <div className="page pomodoro-page">
      <div className="pomodoro-card">
        <div className="segmented segmented-full">
          {PHASES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={cn(phase === entry.id && 'active')}
              onClick={() => {
                if (status === 'running' && phase === entry.id) return;
                usePomodoro.setState({ phase: entry.id, status: 'idle', endsAt: null, remaining: phaseSeconds(entry.id, settings) });
              }}
            >
              {entry.icon} {entry.label}
            </button>
          ))}
        </div>

        <div className={cn('timer-ring', `timer-${phase}`)}>
          <svg viewBox="0 0 260 260" aria-hidden>
            <circle cx="130" cy="130" r={radius} className="timer-track" />
            <circle
              cx="130"
              cy="130"
              r={radius}
              className="timer-progress"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          </svg>
          <div className="timer-center">
            <span className="timer-time">{formatDuration(remaining)}</span>
            <span className="timer-phase">{status === 'paused' ? 'Paused' : PHASES.find((p) => p.id === phase)?.label}</span>
          </div>
        </div>

        <div className="timer-controls">
          <button type="button" className="icon-btn icon-btn-lg" onClick={() => store().reset()} title="Reset">
            <RotateCcw size={18} />
          </button>
          {status === 'running' ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => store().pause()}>
              <Pause size={18} /> Pause
            </button>
          ) : status === 'paused' ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => store().resume()}>
              <Play size={18} /> Resume
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => store().start()}>
              <Play size={18} /> Start
            </button>
          )}
          <button type="button" className="icon-btn icon-btn-lg" onClick={() => store().skip()} title="Skip to the next phase">
            <SkipForward size={18} />
          </button>
        </div>

        <div className="pomodoro-stats">
          <div>
            <Flame size={15} />
            <strong>{completedToday}</strong>
            <span>sessions today</span>
          </div>
          <div>
            <Brain size={15} />
            <strong>{stats ? stats.today_study_minutes : '–'}</strong>
            <span>minutes studied today</span>
          </div>
          <div>
            <Coffee size={15} />
            <strong>
              {settings.longBreakEvery - (focusStreak % settings.longBreakEvery)}
            </strong>
            <span>until a long break</span>
          </div>
        </div>
      </div>

      <div className="pomodoro-settings">
        <h2>Timer settings</h2>
        <div className="form-grid form-grid-3">
          <NumberField label="Focus (min)" value={settings.focusMinutes} min={1} max={180} onChange={(v) => updatePomodoro({ focusMinutes: v })} />
          <NumberField label="Short break (min)" value={settings.shortBreakMinutes} min={1} max={60} onChange={(v) => updatePomodoro({ shortBreakMinutes: v })} />
          <NumberField label="Long break (min)" value={settings.longBreakMinutes} min={1} max={120} onChange={(v) => updatePomodoro({ longBreakMinutes: v })} />
          <NumberField label="Long break every" value={settings.longBreakEvery} min={2} max={12} onChange={(v) => updatePomodoro({ longBreakEvery: v })} />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.autoStartBreaks} onChange={(event) => updatePomodoro({ autoStartBreaks: event.target.checked })} />
          Start breaks automatically
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.autoStartFocus} onChange={(event) => updatePomodoro({ autoStartFocus: event.target.checked })} />
          Start the next focus session automatically
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={notificationsEnabled} onChange={(event) => update({ notificationsEnabled: event.target.checked })} />
          <Bell size={14} /> Desktop notifications
        </label>
        <div className="field">
          <span className="field-label">
            <Volume2 size={13} /> Sound
          </span>
          <div className="chip-row">
            {POMODORO_SOUNDS.map((sound) => (
              <button
                key={sound}
                type="button"
                className={cn('chip', settings.sound === sound && 'chip-active')}
                onClick={() => {
                  updatePomodoro({ sound: sound as PomodoroSound });
                  playChime(sound as PomodoroSound);
                }}
              >
                {sound === 'none' ? 'Silent' : sound[0].toUpperCase() + sound.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
