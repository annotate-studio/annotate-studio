'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Coffee, Brain, Settings } from 'lucide-react';
import { useStore } from '@/lib/store';

function playAlarm(sound: string) {
  try {
    const ctx = new AudioContext();
    const play = (startTime: number, freq: number, type: OscillatorType, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.3;
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
      osc.start(startTime);
      osc.stop(startTime + dur);
    };
    switch (sound) {
      case 'bell':
        play(ctx.currentTime, 1200, 'triangle', 0.6);
        play(ctx.currentTime + 0.8, 1200, 'triangle', 0.6);
        break;
      case 'chime':
        play(ctx.currentTime, 660, 'sine', 0.8);
        play(ctx.currentTime + 0.2, 880, 'sine', 0.8);
        play(ctx.currentTime + 0.4, 1100, 'sine', 0.8);
        break;
      case 'digital':
        play(ctx.currentTime, 2000, 'square', 0.15);
        play(ctx.currentTime + 0.35, 2000, 'square', 0.15);
        play(ctx.currentTime + 0.7, 2000, 'square', 0.15);
        break;
      default:
        play(ctx.currentTime, 880, 'sine', 0.25);
        play(ctx.currentTime + 0.4, 880, 'sine', 0.25);
    }
    setTimeout(() => ctx.close(), 1500);
  } catch {
  }
}

export default function PomodoroTab() {
  const {
    pomodoroState, setPomodoroState,
    pomodoroSecondsLeft, setPomodoroSecondsLeft,
    pomodoroSessionCount, setPomodoroSessionCount,
    pomodoroDuration, setPomodoroDuration,
    shortBreakDuration, setShortBreakDuration,
    longBreakDuration, setLongBreakDuration,
    pomodoroSound,
  } = useStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsLeftRef = useRef(pomodoroSecondsLeft);
  secondsLeftRef.current = pomodoroSecondsLeft;
  const [showSettings, setShowSettings] = useState(false);
  const [editPomo, setEditPomo] = useState(String(Math.round(pomodoroDuration / 60)));
  const [editShort, setEditShort] = useState(String(Math.round(shortBreakDuration / 60)));
  const [editLong, setEditLong] = useState(String(Math.round(longBreakDuration / 60)));

  const alarmTriggeredRef = useRef(false);

  useEffect(() => {
    if (pomodoroState === 'idle') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setPomodoroSecondsLeft(pomodoroSecondsLeft - 1);
          setPomodoroSecondsLeft(secondsLeftRef.current - 1);
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pomodoroState, setPomodoroSecondsLeft]);

  useEffect(() => {
    if (pomodoroSecondsLeft <= 0 && pomodoroState !== 'idle') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (!alarmTriggeredRef.current) {
        alarmTriggeredRef.current = true;
        playAlarm(pomodoroSound);
      }
      if (pomodoroState === 'pomodoro') {
        setPomodoroSessionCount(pomodoroSessionCount + 1);
        if ((pomodoroSessionCount + 1) % 4 === 0) {
          setPomodoroState('longBreak');
          setPomodoroSecondsLeft(longBreakDuration);
        } else {
          setPomodoroState('shortBreak');
          setPomodoroSecondsLeft(shortBreakDuration);
        }
      } else {
        setPomodoroState('idle');
        setPomodoroSecondsLeft(pomodoroDuration);
      }
    }
  }, [pomodoroSecondsLeft, pomodoroState, pomodoroSessionCount, setPomodoroState, setPomodoroSecondsLeft, setPomodoroSessionCount, pomodoroDuration, shortBreakDuration, longBreakDuration]);

  useEffect(() => {
    alarmTriggeredRef.current = false;
  }, [pomodoroSecondsLeft]);

  const start = () => {
    setPomodoroState('pomodoro');
    setPomodoroSecondsLeft(pomodoroDuration);
  };

  const pause = () => setPomodoroState('idle');

  const reset = () => {
    setPomodoroState('idle');
    setPomodoroSecondsLeft(pomodoroDuration);
  };

  const skipBreak = () => {
    setPomodoroState('pomodoro');
    setPomodoroSecondsLeft(pomodoroDuration);
  };

  const applySettings = () => {
    const p = Math.max(1, parseInt(editPomo) || 25) * 60;
    const s = Math.max(1, parseInt(editShort) || 5) * 60;
    const l = Math.max(1, parseInt(editLong) || 15) * 60;
    setPomodoroDuration(p);
    setShortBreakDuration(s);
    setLongBreakDuration(l);
    if (pomodoroState === 'idle') {
      setPomodoroSecondsLeft(p);
    }
    setShowSettings(false);
  };

  const minutes = Math.floor(pomodoroSecondsLeft / 60);
  const seconds = pomodoroSecondsLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const currentDuration = pomodoroState === 'pomodoro' ? pomodoroDuration
    : pomodoroState === 'shortBreak' ? shortBreakDuration
    : pomodoroState === 'longBreak' ? longBreakDuration
    : pomodoroDuration;
  const progress = currentDuration > 0 ? 1 - pomodoroSecondsLeft / currentDuration : 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div className="card" style={{ padding: 48, maxWidth: 440, width: '100%', textAlign: 'center' }}>
        {/* Session count */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          Session #{pomodoroSessionCount + 1}
        </div>

        {/* Phase indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {pomodoroState === 'pomodoro' && <Brain size={18} style={{ color: 'var(--primary)' }} />}
          {pomodoroState === 'shortBreak' && <Coffee size={18} style={{ color: 'var(--warning)' }} />}
          {pomodoroState === 'longBreak' && <Coffee size={18} style={{ color: 'var(--success)' }} />}
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {pomodoroState === 'pomodoro' && 'Focus Time'}
            {pomodoroState === 'shortBreak' && 'Short Break'}
            {pomodoroState === 'longBreak' && 'Long Break'}
            {pomodoroState === 'idle' && 'Ready'}
          </span>
        </div>

        {/* Progress ring */}
        <div style={{ position: 'relative', width: 220, height: 220, margin: '0 auto 32px' }}>
          <svg width="220" height="220" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="110" cy="110" r="100" fill="none" stroke="var(--border)" strokeWidth="6" />
            <circle cx="110" cy="110" r="100" fill="none" stroke="var(--primary)" strokeWidth="6"
              strokeDasharray={2 * Math.PI * 100}
              strokeDashoffset={2 * Math.PI * 100 * (1 - progress)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 48, fontWeight: 300, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
              {timeStr}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          {pomodoroState === 'idle' && (
            <button className="btn btn-primary" onClick={start} style={{ padding: '10px 32px' }}>
              <Play size={16} /> Start
            </button>
          )}
          {pomodoroState === 'pomodoro' && (
            <button className="btn btn-ghost" onClick={pause} style={{ padding: '10px 32px' }}>
              <Pause size={16} /> Pause
            </button>
          )}
          {(pomodoroState === 'shortBreak' || pomodoroState === 'longBreak') && (
            <>
              <button className="btn btn-ghost" onClick={skipBreak} style={{ padding: '10px 24px', color: 'var(--primary)' }}>
                <Play size={16} /> Skip Break
              </button>
              <button className="btn btn-ghost" onClick={pause} style={{ padding: '10px 24px' }}>
                <Pause size={16} /> Pause
              </button>
            </>
          )}
          <button className="btn btn-ghost" onClick={reset} title="Reset">
            <RotateCcw size={16} />
          </button>
        </div>

        {pomodoroState === 'idle' && (
          <div style={{ marginTop: 32, padding: '16px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Quick start</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setPomodoroState('pomodoro'); setPomodoroSecondsLeft(pomodoroDuration); }} style={{ fontSize: 12 }}>{Math.round(pomodoroDuration / 60)}m Focus</button>
              <button className="btn btn-ghost" onClick={() => { setPomodoroState('shortBreak'); setPomodoroSecondsLeft(shortBreakDuration); }} style={{ fontSize: 12 }}>{Math.round(shortBreakDuration / 60)}m Break</button>
              <button className="btn btn-ghost" onClick={() => { setPomodoroState('longBreak'); setPomodoroSecondsLeft(longBreakDuration); }} style={{ fontSize: 12 }}>{Math.round(longBreakDuration / 60)}m Long</button>
            </div>
          </div>
        )}

        {/* Settings toggle */}
        <button
          className="btn btn-ghost"
          onClick={() => { setShowSettings(!showSettings); setEditPomo(String(Math.round(pomodoroDuration / 60))); setEditShort(String(Math.round(shortBreakDuration / 60))); setEditLong(String(Math.round(longBreakDuration / 60))); }}
          style={{ marginTop: 16, padding: '8px 16px', fontSize: 12, gap: 6 }}
        >
          <Settings size={13} />
          Custom Times
        </button>

        {showSettings && (
          <div style={{ marginTop: 16, padding: 20, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Focus (min)</label>
                <input
                  type="number" min={1} max={180}
                  value={editPomo}
                  onChange={e => setEditPomo(e.target.value)}
                  className="input"
                  style={{ width: '100%', textAlign: 'center' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Short Break</label>
                <input
                  type="number" min={1} max={60}
                  value={editShort}
                  onChange={e => setEditShort(e.target.value)}
                  className="input"
                  style={{ width: '100%', textAlign: 'center' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Long Break</label>
                <input
                  type="number" min={1} max={120}
                  value={editLong}
                  onChange={e => setEditLong(e.target.value)}
                  className="input"
                  style={{ width: '100%', textAlign: 'center' }}
                />
              </div>
            </div>
            <button className="btn btn-primary" onClick={applySettings} style={{ marginTop: 12, padding: '8px 24px', width: '100%' }}>
              Apply
            </button>
          </div>
        )}

        {pomodoroSessionCount > 0 && pomodoroState === 'idle' && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            Completed {pomodoroSessionCount} session{pomodoroSessionCount > 1 ? 's' : ''} today
          </div>
        )}
      </div>
    </div>
  );
}
