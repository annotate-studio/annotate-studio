'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, NotebookText, ChevronRight, Sparkles, RotateCcw, ListFilter, Clock, BarChart3, Layers, RefreshCw } from 'lucide-react';
import { useStore } from '@/lib/store';
import FlashcardLayout from './FlashcardLayout';
import Dialog from '@/components/ui/Dialog';
import {
  getDueCards, getAllFlashcards, reviewFlashcard, deleteFlashcard, getFlashcardStats,
  generateFlashcard, saveFlashcard, restoreAllFlashcards, getCardsByFilter,
  checkDueFlashcards, sendStudyNotification, requestNotificationPermission,
  type Flashcard, type ReviewQuality,
} from '@/lib/tauri-commands';

const STAT_META = [
  { key: 'due' as const, label: 'Due', color: 'var(--primary)', icon: Clock },
  { key: 'new_cards' as const, label: 'New', color: '#10B981', icon: Sparkles },
  { key: 'young' as const, label: 'Young', color: '#F59E0B', icon: Layers },
  { key: 'mature' as const, label: 'Mature', color: '#8B5CF6', icon: BarChart3 },
];

function FlashcardsTab() {
  const {
    flashcards, setFlashcards, flashcardStats, setFlashcardStats,
    activeCollectionId, flashcardCollections,
  } = useStore();
  const [mode, setMode] = useState<'review' | 'browse'>('browse');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateContent, setGenerateContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [notifiedDue, setNotifiedDue] = useState(false);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const addRef = useRef<HTMLInputElement>(null);

  // Filter dialog state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDue, setFilterDue] = useState(true);
  const [filterNew, setFilterNew] = useState(true);
  const [filterYoung, setFilterYoung] = useState(true);
  const [filterMature, setFilterMature] = useState(true);
  const filtersActive = filterDue || filterNew || filterYoung || filterMature;

  // Request notification permission on mount
  useEffect(() => { requestNotificationPermission(); }, []);

  // Poll for due flashcards every 60s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const due = await checkDueFlashcards();
        if (due > 0 && !notifiedDue) {
          sendStudyNotification(
            'Flashcards Due',
            `You have ${due} flashcard${due > 1 ? 's' : ''} due for review.`
          );
          setNotifiedDue(true);
        } else if (due === 0) {
          setNotifiedDue(false);
        }
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, [notifiedDue]);

  const filteredCards = useMemo(() => {
    if (!activeCollectionId) return flashcards.filter(c => !c.collectionId || c.collectionId === 'default');
    return flashcards.filter(c => c.collectionId === activeCollectionId);
  }, [flashcards, activeCollectionId]);

  const currentCollection = useMemo(() => {
    if (!activeCollectionId) return flashcardCollections.find(c => c.id === 'default');
    return flashcardCollections.find(c => c.id === activeCollectionId);
  }, [activeCollectionId, flashcardCollections]);

  const reviewCards = useMemo(() => {
    if (mode !== 'review') return filteredCards;
    return filteredCards.filter(c => !reviewedIds.has(c.id));
  }, [filteredCards, reviewedIds, mode]);

  const currentCard = reviewCards[currentIndex];

  useEffect(() => { loadCards(); }, [mode, filterDue, filterNew, filterYoung, filterMature]);

  useEffect(() => { useStore.getState().loadCollectionsFromDisk(); }, []);
  useEffect(() => { setReviewedIds(new Set()); }, [mode, activeCollectionId]);

  async function loadCards() {
    setLoading(true);
    try {
      let cards: Flashcard[];
      if (mode === 'review' && filtersActive) {
        cards = await getCardsByFilter(filterDue, filterNew, filterYoung, filterMature).catch(() => []);
      } else if (mode === 'review') {
        cards = await getDueCards().catch(() => []);
      } else {
        cards = await getAllFlashcards().catch(() => []);
      }
      const stats = await getFlashcardStats().catch(() => null);
      setFlashcards(cards);
      if (stats) setFlashcardStats(stats);
    } catch { /* ignore */ }
    setLoading(false);
  }

  const handleRestoreAll = useCallback(async () => {
    const period = currentCollection?.reviewPeriodDays;
    setRestoring(true);
    try { await restoreAllFlashcards(period); } catch {}
    setReviewedIds(new Set());
    await loadCards();
    setRestoring(false);
  }, [currentCollection?.reviewPeriodDays]);

  const handleReview = useCallback(async (quality: ReviewQuality) => {
    const card = reviewCards[currentIndex];
    if (!card) return;
    try {
      await reviewFlashcard(card.id, quality);
      setFlipped(false);
      setReviewedIds(prev => new Set(prev).add(card.id));
      if (currentIndex + 1 >= reviewCards.length) {
        setCurrentIndex(0);
      } else {
        setCurrentIndex(i => i + 1);
      }
    } catch { /* ignore */ }
  }, [reviewCards, currentIndex]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteFlashcard(id);
      setFlashcards(useStore.getState().flashcards.filter((c: Flashcard) => c.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch { /* ignore */ }
  }, [expandedId]);

  const handleAddCard = useCallback(async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    const card: Flashcard = {
      id: crypto.randomUUID(),
      front: newQuestion.trim(),
      back: newAnswer.trim(),
      ease_factor: 2.5,
      interval_days: 1,
      repetitions: 0,
      next_review: new Date().toISOString(),
      created_at: new Date().toISOString(),
      collectionId: activeCollectionId || undefined,
    };
    try { await saveFlashcard(card); } catch { }
    setFlashcards([...useStore.getState().flashcards, card]);
    setNewQuestion('');
    setNewAnswer('');
    setShowAddForm(false);
  }, [newQuestion, newAnswer, activeCollectionId]);

  const handleGenerate = useCallback(async () => {
    if (!generateContent.trim()) return;
    setGenerating(true);
    setGenError('');
    try {
      const cards = await generateFlashcard(generateContent.trim(), undefined, activeCollectionId ?? undefined);
      if (cards.length === 0) { setGenError('AI returned no flashcards. Try different content.'); return; }
      setFlashcards([...useStore.getState().flashcards, ...cards]);
      setGenerateContent('');
      setShowGenerate(false);
    } catch (err) {
      setGenError(String(err));
    }
    setGenerating(false);
  }, [generateContent, activeCollectionId]);

  useEffect(() => {
    if (showAddForm && addRef.current) addRef.current.focus();
  }, [showAddForm]);

  const cardCount = filteredCards.length;

  const mainContent = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: '24px 28px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 12, flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
            {currentCollection?.name || 'General'}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {flashcardStats
              ? `${flashcardStats.due} due · ${flashcardStats.total} total · ${flashcardStats.mature} mature`
              : `${cardCount} flashcards`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className={`btn ${showAddForm ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowAddForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={14} /> Add Card
          </button>
          <button className={`btn ${showGenerate ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowGenerate(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={14} /> AI Generate
          </button>
          <div className="inline-flex rounded-xl border border-(--border) p-1! gap-1">
            <button
              className={`btn px-3 py-2 ${mode === 'review' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setMode('review'); setCurrentIndex(0); setFlipped(false); }}
            >
              Review
            </button>
            <button
              className={`btn px-3 py-2 ${mode === 'browse' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setMode('browse'); setCurrentIndex(0); setFlipped(false); }}
            >
              Browse
            </button>
          </div>
        </div>
      </div>

      {/* Action bar: Restore All + Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexShrink: 0 }}>
        <button className="btn btn-ghost" onClick={handleRestoreAll} disabled={restoring}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          <RotateCcw size={13} /> {restoring ? 'Resetting...' : 'Restore All'}
        </button>
        {mode === 'review' && (
          <button className="btn btn-ghost" onClick={() => setFilterOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <ListFilter size={13} /> Filter {!filtersActive && '(none)'}
          </button>
        )}
      </div>

      {/* Add card form */}
      {showAddForm && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <input
            ref={addRef}
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            placeholder="Question"
            className="input"
            style={{ width: '100%' }}
          />
          <textarea
            value={newAnswer}
            onChange={e => setNewAnswer(e.target.value)}
            placeholder="Answer"
            className="input"
            style={{ width: '100%', minHeight: 60, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary" onClick={handleAddCard}>Save Card</button>
            <button className="btn btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Generate form */}
      {showGenerate && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <input
            value={generateContent}
            onChange={e => { setGenerateContent(e.target.value); setGenError(''); }}
            placeholder="Paste study content to generate a flashcard..."
            className="input"
            style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && !generating && handleGenerate()}
            disabled={generating}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating...' : 'Generate'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setShowGenerate(false); setGenError(''); }}>
              Cancel
            </button>
          </div>
          {genError && (
            <div style={{ fontSize: 12, color: 'var(--danger)', padding: '6px 10px', background: 'var(--danger-light)', borderRadius: 'var(--radius-sm)' }}>
              {genError}
            </div>
          )}
        </div>
      )}

      {/* Enhanced stats cards */}
      {flashcardStats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexShrink: 0 }}>
          {STAT_META.map(s => {
            const value = flashcardStats[s.key];
            const Icon = s.icon;
            return (
              <div key={s.key} style={{
                flex: 1, minWidth: 100,
                background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)', padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-md)',
                  background: `${s.color}18`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={18} style={{ color: s.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                    {value}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={18} className="animate-spin" />
        </div>
      ) : (mode === 'review' ? reviewCards.length : cardCount) === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <NotebookText size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {mode === 'review' ? (reviewedIds.size > 0 ? 'All reviewed! Great job.' : 'No cards match the selected filters!') : 'This collection is empty'}
          </div>
          <div style={{ fontSize: 12 }}>
            {mode === 'review' ? (reviewedIds.size > 0 ? 'Switch to Browse or add more cards.' : 'Adjust your filter or switch to Browse.') : 'Add a card manually or use AI Generate'}
          </div>
        </div>
      ) : mode === 'browse' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredCards.map(card => {
            const isExpanded = expandedId === card.id;
            return (
              <div key={card.id} className="card" style={{
                padding: 0, overflow: 'hidden',
                borderLeft: `3px solid ${isExpanded ? 'var(--primary)' : 'var(--border)'}`,
                transition: 'border-color 0.2s',
              }}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : card.id)}
                  style={{
                    padding: '14px 18px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    userSelect: 'none',
                  }}
                >
                  <span className="content-selectable" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {card.front}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {card.interval_days}d
                    </span>
                    <ChevronRight size={14} style={{
                      color: 'var(--text-muted)',
                      transition: 'transform 0.2s',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    }} />
                  </div>
                </div>

                <div className="flashcard-answer-wrap" style={{
                  maxHeight: isExpanded ? 400 : 0,
                  opacity: isExpanded ? 1 : 0,
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease, opacity 0.25s ease',
                }}>
                  <div style={{
                    padding: '0 18px 14px',
                    borderTop: '1px solid var(--border)',
                    paddingTop: 12,
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>ANSWER</div>
                    <div className="content-selectable" style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      {card.back}
                    </div>
                    <div style={{
                      marginTop: 10, display: 'flex', gap: 12,
                      fontSize: 11, color: 'var(--text-muted)',
                      alignItems: 'center',
                    }}>
                      <span>Ease: {card.ease_factor.toFixed(1)}</span>
                      <span>Reps: {card.repetitions}</span>
                      {card.source_file && <span>From: {card.source_file}</span>}
                      <button
                        onClick={() => handleDelete(card.id)}
                        style={{
                          marginLeft: 'auto', background: 'none', border: 'none',
                          color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
                          padding: '2px 6px', borderRadius: 4,
                        }}
                        title="Delete card"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Review mode */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>{currentIndex + 1} / {reviewCards.length}</span>
          </div>

          <div
            onClick={() => setFlipped(v => !v)}
            className="flip-card"
            style={{ width: '100%', maxWidth: 560, height: 320, cursor: 'pointer' }}
          >
            <div className={`flip-card-inner ${flipped ? 'flipped' : ''}`}>
              <div className="flip-card-front card" style={{ borderColor: 'var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>QUESTION</div>
                <div className="content-selectable" style={{ fontSize: 18, color: 'var(--text-primary)', lineHeight: 1.6, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
                  {currentCard?.front}
                </div>
              </div>
              <div className="flip-card-back card" style={{ borderColor: 'var(--primary)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>ANSWER</div>
                <div className="content-selectable" style={{ fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.6, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
                  {currentCard?.back}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {(['Again', 'Hard', 'Good', 'Easy'] as ReviewQuality[]).map((q, i) => {
              const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6'];
              return (
                <button
                  key={q}
                  onClick={() => { if (flipped) handleReview(q); }}
                  disabled={!flipped}
                  className="btn btn-ghost"
                  style={{
                    padding: '8px 22px', fontSize: 13, fontWeight: 600,
                    border: `1px solid ${colors[i]}44`,
                    background: !flipped ? 'transparent' : `${colors[i]}11`,
                    color: colors[i],
                    opacity: !flipped ? 0.4 : 1,
                    cursor: !flipped ? 'default' : 'pointer',
                    transition: 'all 0.15s',
                    minWidth: 72,
                  }}
                >
                  {q}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Click card to reveal answer · Rate your recall
          </div>
        </div>
      )}

      {/* Filter dialog */}
      <Dialog open={filterOpen} onClose={() => setFilterOpen(false)} title="Review Filter" width={320}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            Select which types of cards to include in review:
          </div>
          {[
            { key: 'due' as const, label: 'Due', checked: filterDue, set: setFilterDue, desc: 'Cards scheduled for review today' },
            { key: 'new' as const, label: 'New', checked: filterNew, set: setFilterNew, desc: 'Cards never reviewed before' },
            { key: 'young' as const, label: 'Young', checked: filterYoung, set: setFilterYoung, desc: 'Cards reviewed &lt; 21 days ago' },
            { key: 'mature' as const, label: 'Mature', checked: filterMature, set: setFilterMature, desc: 'Cards with interval ≥ 21 days' },
          ].map((opt) => (
            <label key={opt.key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              borderRadius: 'var(--radius-md)', cursor: 'pointer',
              background: opt.checked ? 'var(--primary-light)' : 'transparent',
              border: `1px solid ${opt.checked ? 'var(--primary)' : 'var(--border)'}`,
            }}>
              <input type="checkbox" checked={opt.checked}
                onChange={() => opt.set(!opt.checked)}
                style={{ accentColor: 'var(--primary)' }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }} dangerouslySetInnerHTML={{ __html: opt.desc }} />
              </div>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => { setFilterDue(true); setFilterNew(true); setFilterYoung(true); setFilterMature(true); }}
            style={{ fontSize: 12, padding: '6px 14px' }}>
            Reset
          </button>
          <button className="btn btn-primary" onClick={() => setFilterOpen(false)}
            style={{ fontSize: 12, padding: '6px 14px' }}>
            Apply
          </button>
        </div>
      </Dialog>
    </div>
  );

  return (
    <FlashcardLayout>
      {mainContent}
    </FlashcardLayout>
  );
}

export default FlashcardsTab;
