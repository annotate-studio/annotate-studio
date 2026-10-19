'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PartyPopper } from 'lucide-react';
import { reviewFlashcard, type Flashcard, type ReviewQuality } from '@/lib/tauri-commands';
import { isDue, useFlashcards } from '@/store/flashcards';
import { toast } from '@/store/toast';
import { isEditableTarget } from '@/lib/utils';
import ReviewCard, { RATINGS } from './ReviewCard';

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
      <ReviewCard card={current} flipped={flipped} saving={saving} scheduled={scheduled} onFlip={() => setFlipped((v) => !v)} onRate={(quality) => void rate(quality)} />
    </div>
  );
}
