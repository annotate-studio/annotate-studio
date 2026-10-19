'use client';

import React from 'react';
import { RotateCcw } from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import type { Flashcard, ReviewQuality } from '@/lib/tauri-commands';
import { cn } from '@/lib/utils';
import { formatInterval, nextIntervalDays } from './schedule';

export const RATINGS: { quality: ReviewQuality; label: string; key: string; tone: string }[] = [
  { quality: 'Again', label: 'Again', key: '1', tone: 'rate-again' },
  { quality: 'Hard', label: 'Hard', key: '2', tone: 'rate-hard' },
  { quality: 'Good', label: 'Good', key: '3', tone: 'rate-good' },
  { quality: 'Easy', label: 'Easy', key: '4', tone: 'rate-easy' },
];

interface ReviewCardProps {
  card: Flashcard;
  flipped: boolean;
  saving: boolean;
  scheduled: boolean;
  onFlip: () => void;
  onRate: (quality: ReviewQuality) => void;
}

/**
 * The shared flashcard face plus the rating feedback row. Progress bars and
 * navigation arrows live in the surrounding session component.
 */
export default function ReviewCard({ card, flipped, saving, scheduled, onFlip, onRate }: ReviewCardProps) {
  return (
    <>
      <div
        className={cn('flip-card', flipped && 'flipped')}
        role="button"
        tabIndex={0}
        onClick={onFlip}
        aria-label={flipped ? 'Show question' : 'Show answer'}
      >
        <div className="flip-card-inner">
          <div className="flip-card-face flip-card-front">
            <span className="flip-card-label">Question</span>
            <div className="flip-card-content content-selectable">
              <MarkdownRenderer content={card.front} />
            </div>
            <span className="flip-card-hint">Click or press Space to reveal</span>
          </div>
          <div className="flip-card-face flip-card-back">
            <span className="flip-card-label">Answer</span>
            <div className="flip-card-content content-selectable">
              <MarkdownRenderer content={card.back} />
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
            onClick={() => onRate(rating.quality)}
            disabled={!flipped || saving}
          >
            <span>{rating.label}</span>
            <small>
              {scheduled ? formatInterval(nextIntervalDays(card, rating.quality)) : 'practice'} · {rating.key}
            </small>
          </button>
        ))}
      </div>
      {!scheduled && <div className="review-meta">Practice only: this card is not due, so its schedule stays the same.</div>}
      {card.last_quality && (
        <div className="review-meta">
          <RotateCcw size={12} /> Last time: {card.last_quality}
        </div>
      )}
    </>
  );
}
