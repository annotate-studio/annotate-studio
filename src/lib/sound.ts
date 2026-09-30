import type { PomodoroSound } from '@/store/settings';

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!context || context.state === 'closed') context = new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(ctx: AudioContext, start: number, frequency: number, type: OscillatorType, duration: number, volume = 0.25) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

export function playChime(sound: PomodoroSound) {
  if (sound === 'none') return;
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  switch (sound) {
    case 'bell':
      tone(ctx, now, 1046, 'triangle', 1.2, 0.3);
      tone(ctx, now, 1568, 'sine', 0.9, 0.12);
      tone(ctx, now + 0.9, 1046, 'triangle', 1.2, 0.3);
      break;
    case 'chime':
      tone(ctx, now, 659, 'sine', 0.9);
      tone(ctx, now + 0.22, 880, 'sine', 0.9);
      tone(ctx, now + 0.44, 1175, 'sine', 1.1);
      break;
    case 'digital':
      for (let i = 0; i < 3; i += 1) tone(ctx, now + i * 0.3, 1900, 'square', 0.14, 0.12);
      break;
    default:
      tone(ctx, now, 880, 'sine', 0.3);
      tone(ctx, now + 0.4, 880, 'sine', 0.3);
  }
}
