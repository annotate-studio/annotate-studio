'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PartyPopper, RotateCcw } from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import { reviewFlashcard, type Flashcard, type ReviewQuality } from '@/lib/tauri-commands';
import { isDue, useFlashcards } from '@/store/flashcards';
import { toast } from '@/store/toast';
import { cn, isEditableTarget } from '@/lib/utils';
import { formatInterval, nextIntervalDays } from './schedule';

const RATINGS: { quality: ReviewQuality; label: string; key: string; tone: string }[] = [
  { quality: 'Again', label: 'Again', key: '1', tone: 'rate-again' },
  { quality: 'Hard', label: 'Hard', key: '2', tone: 'rate-hard' },
  { quality: 'Good', label: 'Good', key: '3', tone: 'rate-good' },
  { quality: 'Easy', label: 'Easy', key: '4', tone: 'rate-easy' },
];

interface ReviewSessionProps {
  cardIds: string[];
  title: string;
  practice?: boolean;
  onExit: () => void;
}

export default function ReviewSession({ cardIds, title, practice = false, onExit }: ReviewSessionProps) {
  const cards = useFlashcards((state) => state.cards);
  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const [queue, setQueue] = useState<string[]>(cardIds);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [lapses, setLapses] = useState(0);
  const [saving, setSaving] = useState(false);
  const total = cardIds.length;

  const current: Flashcard | undefined = queue.length > 0 ? byId.get(queue[0]) : undefined;
  const scheduled = !current || !practice || isDue(current, Date.now());

  useEffect(() => {
    if (queue.length > 0 && !current) setQueue((q) => q.slice(1));
  }, [queue, current]);

  const rate = useCallback(
    async (quality: ReviewQuality) => {
      if (!current || !flipped || saving) return;
      setSaving(true);
      try {
        if (scheduled) {
          const updated = await reviewFlashcard(current.id, quality);
          useFlashcards.getState().upsertCard(updated);
        }
        setQueue((q) => (quality === 'Again' ? [...q.slice(1), q[0]] : q.slice(1)));
        setReviewed((n) => n + 1);
        if (quality === 'Again') setLapses((n) => n + 1);
        setFlipped(false);
      } catch (error) {
        toast.error('Could not save the review', error);
      } finally {
        setSaving(false);
      }
    },
    [current, flipped, saving, scheduled],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!flipped) setFlipped(true);
        else void rate('Good');
        return;
      }
      const rating = RATINGS.find((r) => r.key === event.key);
      if (rating && flipped) {
        event.preventDefault();
        void rate(rating.quality);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, rate]);

  if (!current) {
    return (
      <div className="review-done">
        <PartyPopper size={40} strokeWidth={1.5} />
        <h2>Session complete</h2>
        <p>
          You reviewed {reviewed} card{reviewed === 1 ? '' : 's'}
          {lapses > 0 ? ` · ${lapses} to revisit soon` : ''}.
        </p>
        <button type="button" className="btn btn-primary" onClick={onExit}>
          <ArrowLeft size={15} /> Back to cards
        </button>
      </div>
    );
  }

  const done = total - queue.length;

  return (
    <div className="review">
      <div className="review-top">
        <button type="button" className="btn btn-ghost" onClick={onExit}>
          <ArrowLeft size={15} /> {title}
        </button>
        <div className="review-progress">
          <div className="progress-bar">
            <div style={{ width: `${total ? (Math.max(0, done) / total) * 100 : 0}%` }} />
          </div>
          <span>
            {queue.length} left
          </span>
        </div>
      </div>
      <div
        className={cn('flip-card', flipped && 'flipped')}
        role="button"
        tabIndex={0}
        onClick={() => setFlipped((v) => !v)}
        aria-label={flipped ? 'Show question' : 'Show answer'}
      >
        <div className="flip-card-inner">
          <div className="flip-card-face flip-card-front">
            <span className="flip-card-label">Question</span>
            <div className="flip-card-content content-selectable">
              <MarkdownRenderer content={current.front} />
            </div>
            <span className="flip-card-hint">Click or press Space to reveal</span>
          </div>
          <div className="flip-card-face flip-card-back">
            <span className="flip-card-label">Answer</span>
            <div className="flip-card-content content-selectable">
              <MarkdownRenderer content={current.back} />
            </div>
          </div>
        </div>
      </div>
      <div className={cn('rating-row', !flipped && 'rating-row-hidden')}>
        {RATINGS.map((rating) => (
          <button
            key={rating.quality}
            type="button"
            className={cn('rating-btn', rating.tone)}
            onClick={() => void rate(rating.quality)}
            disabled={!flipped || saving}
          >
            <span>{rating.label}</span>
            <small>
              {scheduled ? formatInterval(nextIntervalDays(current, rating.quality)) : 'practice'} · {rating.key}
            </small>
          </button>
        ))}
      </div>
      {!scheduled && <div className="review-meta">Practice only: this card is not due, so its schedule stays the same.</div>}
      {current.last_quality && (
        <div className="review-meta">
          <RotateCcw size={12} /> Last time: {current.last_quality}
        </div>
      )}
    </div>
  );
}
