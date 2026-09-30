import type { Flashcard, ReviewQuality } from '@/lib/tauri-commands';

const MAX_INTERVAL = 36_500;

function grow(previous: number, factor: number): number {
  return Math.min(MAX_INTERVAL, Math.max(previous + 1, Math.round(Math.max(1, previous) * factor)));
}

export function nextIntervalDays(card: Flashcard, quality: ReviewQuality): number {
  const previous = Math.max(0, card.interval_days);
  const ease = card.ease_factor || 2.5;
  switch (quality) {
    case 'Again':
      return 0;
    case 'Hard':
      return card.repetitions === 0 ? 1 : grow(previous, 1.2);
    case 'Good':
      return card.repetitions === 0 ? 1 : card.repetitions === 1 ? Math.max(6, previous + 1) : grow(previous, ease);
    case 'Easy':
      return card.repetitions === 0 ? 4 : card.repetitions === 1 ? Math.max(8, previous + 1) : grow(previous, ease * 1.3);
  }
}

export function formatInterval(days: number): string {
  if (days <= 0) return '10m';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function formatDue(iso: string): string {
  const due = Date.parse(iso);
  if (!Number.isFinite(due)) return 'now';
  const diff = due - Date.now();
  if (diff <= 0) return 'now';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return days < 30 ? `in ${days}d` : `in ${Math.round(days / 30)}mo`;
}
