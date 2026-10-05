'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Clock,
  Eraser,
  Inbox,
  Layers,
  Library,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import { openContextMenu, type MenuEntry } from '@/components/ui/ContextMenu';
import { deleteFlashcard, type Flashcard } from '@/lib/tauri-commands';
import {
  cardsInCollection,
  isDue,
  isNewCard,
  statsFor,
  UNSORTED_ID,
  useFlashcards,
} from '@/store/flashcards';
import { confirmDialog, promptDialog } from '@/store/dialogs';
import { toast } from '@/store/toast';
import { cn } from '@/lib/utils';
import CardEditorDialog from './CardEditorDialog';
import GenerateDialog from './GenerateDialog';
import ReviewSession from './ReviewSession';
import { formatDue } from './schedule';

function CollectionItem({
  label,
  icon,
  count,
  due,
  active,
  onClick,
  onMenu,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  due: number;
  active: boolean;
  onClick: () => void;
  onMenu?: (event: React.MouseEvent) => void;
}) {
  return (
    <div className={cn('side-item', active && 'side-item-active', onMenu && 'side-item-menuable')}>
      <button type="button" className="side-item-main" onClick={onClick} onContextMenu={onMenu}>
        {icon}
        <span className="side-item-label" dir="auto">
          {label}
        </span>
      </button>
      <div className="side-item-trailing">
        {due > 0 ? <span className="count-badge count-badge-due">{due}</span> : <span className="count-badge">{count}</span>}
        {onMenu && (
          <button type="button" className="icon-btn icon-btn-sm side-item-menu" onClick={onMenu} title="Collection actions">
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function CardRow({ card, onEdit, onDelete }: { card: Flashcard; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const due = isDue(card);
  const fresh = isNewCard(card);
  return (
    <div className={cn('card-row', open && 'card-row-open')}>
      <button type="button" className="card-row-head" onClick={() => setOpen((v) => !v)}>
        <div className="card-row-front content-selectable">
          <MarkdownRenderer content={card.front} />
        </div>
        <div className="card-row-badges">
          {fresh ? (
            <span className="badge tone-green">New</span>
          ) : due ? (
            <span className="badge tone-primary">Due</span>
          ) : (
            <span className="badge tone-slate">{formatDue(card.next_review)}</span>
          )}
          <ChevronDown size={15} className="card-row-chevron" />
        </div>
      </button>
      {open && (
        <div className="card-row-body">
          <div className="card-row-back content-selectable">
            <MarkdownRenderer content={card.back} />
          </div>
          <div className="card-row-footer">
            <span>Interval {card.interval_days}d</span>
            <span>Ease {card.ease_factor.toFixed(2)}</span>
            <span>Reviews {card.repetitions}</span>
            {card.source_file && <span>From {card.source_file}</span>}
            <div className="card-row-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
                <Pencil size={13} /> Edit
              </button>
              <button type="button" className="btn btn-ghost btn-sm btn-danger-text" onClick={onDelete}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlashcardsTab() {
  const hydrated = useFlashcards((state) => state.hydrated);
  const cards = useFlashcards((state) => state.cards);
  const collections = useFlashcards((state) => state.collections);
  const activeId = useFlashcards((state) => state.activeCollectionId);
  const setActive = useFlashcards((state) => state.setActiveCollection);
  const [review, setReview] = useState<{ ids: string[]; title: string; practice: boolean } | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; card: Flashcard | null }>({ open: false, card: null });
  const [generateOpen, setGenerateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'due' | 'new'>('all');
  const [tick, setTick] = useState(0);
  const now = useMemo(() => Date.now(), [cards, tick]);

  useEffect(() => {
    void useFlashcards.getState().hydrate();
    void useFlashcards.getState().refreshCards();
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const scoped = useMemo(() => cardsInCollection(cards, activeId), [cards, activeId]);
  const stats = useMemo(() => statsFor(scoped, now), [scoped, now]);
  const unsortedCount = useMemo(() => cards.filter((card) => !card.collectionId).length, [cards]);
  const title =
    activeId === null ? 'All cards' : activeId === UNSORTED_ID ? 'Unsorted' : collections.find((c) => c.id === activeId)?.name ?? 'Cards';

  const listed = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scoped
      .filter((card) => (filter === 'due' ? isDue(card, now) : filter === 'new' ? isNewCard(card) : true))
      .filter((card) => !needle || card.front.toLowerCase().includes(needle) || card.back.toLowerCase().includes(needle))
      .sort((a, b) => Date.parse(a.next_review) - Date.parse(b.next_review));
  }, [scoped, filter, query, now]);

  const startReview = (all = false) => {
    const pool = all ? scoped : scoped.filter((card) => isDue(card, Date.now()));
    if (pool.length === 0) return;
    const ids = [...pool].sort((a, b) => Date.parse(a.next_review) - Date.parse(b.next_review)).map((card) => card.id);
    setReview({ ids, title, practice: all });
  };

  const createCollection = async () => {
    const name = await promptDialog({ title: 'New collection', placeholder: 'e.g. Biology — Cells', confirmLabel: 'Create' });
    if (name) useFlashcards.getState().addCollection(name);
  };

  const collectionMenu = (id: string, name: string) => (event: React.MouseEvent) => {
    const items: MenuEntry[] = [
      {
        label: 'Rename…',
        icon: <Pencil size={13} />,
        onSelect: async () => {
          const next = await promptDialog({ title: 'Rename collection', initialValue: name, confirmLabel: 'Rename' });
          if (next) useFlashcards.getState().renameCollection(id, next);
        },
      },
      {
        label: 'Clear…',
        icon: <Eraser size={13} />,
        danger: true,
        onSelect: async () => {
          const count = cards.filter((card) => card.collectionId === id).length;
          const ok = await confirmDialog({
            title: `Clear “${name}”?`,
            message:
              count > 0
                ? `Deletes all ${count} card${count === 1 ? '' : 's'} in this collection. The collection itself stays.`
                : 'This collection is empty.',
            confirmLabel: 'Clear',
            danger: true,
          });
          if (!ok) return;
          try {
            await useFlashcards.getState().clearCollection(id);
            toast.success('Collection cleared');
          } catch (error) {
            toast.error('Clear failed', error);
          }
        },
      },
      'separator',
      {
        label: 'Delete collection…',
        icon: <Trash2 size={13} />,
        danger: true,
        onSelect: async () => {
          const count = cards.filter((card) => card.collectionId === id).length;
          const ok = await confirmDialog({
            title: `Delete “${name}”?`,
            message: count > 0 ? `This also deletes its ${count} card${count === 1 ? '' : 's'}.` : 'This collection is empty.',
            confirmLabel: 'Delete',
            danger: true,
          });
          if (!ok) return;
          try {
            await useFlashcards.getState().deleteCollection(id);
          } catch (error) {
            toast.error('Delete failed', error);
          }
        },
      },
    ];
    openContextMenu(event, items);
  };

  const removeCard = async (card: Flashcard) => {
    const ok = await confirmDialog({ title: 'Delete this card?', message: card.front.slice(0, 160), confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await deleteFlashcard(card.id);
      useFlashcards.getState().removeCard(card.id);
    } catch (error) {
      toast.error('Delete failed', error);
    }
  };

  if (review) {
    return (
      <div className="page page-narrow">
        <ReviewSession cardIds={review.ids} title={review.title} practice={review.practice} onExit={() => setReview(null)} />
      </div>
    );
  }

  const nextDue = scoped.filter((card) => !isDue(card, now)).sort((a, b) => Date.parse(a.next_review) - Date.parse(b.next_review))[0];

  return (
    <div className="split-page">
      <aside className="side-panel">
        <div className="side-panel-header">
          <span>Collections</span>
          <button type="button" className="icon-btn" onClick={() => void createCollection()} title="New collection">
            <Plus size={15} />
          </button>
        </div>
        <div className="side-panel-list">
          <CollectionItem
            label="All cards"
            icon={<Library size={15} />}
            count={cards.length}
            due={cards.filter((card) => isDue(card, now)).length}
            active={activeId === null}
            onClick={() => setActive(null)}
          />
          {unsortedCount > 0 && (
            <CollectionItem
              label="Unsorted"
              icon={<Inbox size={15} />}
              count={unsortedCount}
              due={cards.filter((card) => !card.collectionId && isDue(card, now)).length}
              active={activeId === UNSORTED_ID}
              onClick={() => setActive(UNSORTED_ID)}
            />
          )}
          {collections.map((collection) => {
            const inCollection = cards.filter((card) => card.collectionId === collection.id);
            return (
              <CollectionItem
                key={collection.id}
                label={collection.name}
                icon={<Layers size={15} />}
                count={inCollection.length}
                due={inCollection.filter((card) => isDue(card, now)).length}
                active={activeId === collection.id}
                onClick={() => setActive(collection.id)}
                onMenu={collectionMenu(collection.id, collection.name)}
              />
            );
          })}
          {collections.length === 0 && hydrated && (
            <button type="button" className="side-empty" onClick={() => void createCollection()}>
              <Plus size={14} /> Create your first collection
            </button>
          )}
        </div>
      </aside>

      <section className={cn('page', scoped.length === 0 && 'page-center')}>
        <header className="page-header">
          <div>
            <h1 dir="auto">{title}</h1>
            <p>
              {stats.total} card{stats.total === 1 ? '' : 's'} · {stats.due} due
              {stats.due === 0 && nextDue ? ` · next ${formatDue(nextDue.next_review)}` : ''}
            </p>
          </div>
          <div className="page-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditor({ open: true, card: null })}>
              <Plus size={15} /> Add card
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setGenerateOpen(true)}>
              <Sparkles size={15} /> Generate
            </button>
            <button type="button" className="btn btn-primary" onClick={() => startReview(false)} disabled={stats.due === 0}>
              <Play size={15} /> Review {stats.due > 0 ? stats.due : ''}
            </button>
          </div>
        </header>

        <div className="stat-row">
          <div className="stat">
            <Clock size={16} />
            <strong>{stats.due}</strong>
            <span>Due</span>
          </div>
          <div className="stat stat-green">
            <Sparkles size={16} />
            <strong>{stats.new}</strong>
            <span>New</span>
          </div>
          <div className="stat stat-amber">
            <Layers size={16} />
            <strong>{stats.young}</strong>
            <span>Learning</span>
          </div>
          <div className="stat stat-violet">
            <Library size={16} />
            <strong>{stats.mature}</strong>
            <span>Mature</span>
          </div>
        </div>

        {scoped.length === 0 ? (
          <div className="empty-state">
            <Layers size={40} strokeWidth={1.4} />
            <h2>No cards here yet</h2>
            <p>Add cards by hand, generate them from your notes and PDFs, or ask the assistant on the canvas.</p>
            <div className="empty-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditor({ open: true, card: null })}>
                <Plus size={15} /> Add a card
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setGenerateOpen(true)}>
                <Sparkles size={15} /> Generate with AI
              </button>
            </div>
          </div>
        ) : (
          <>
            {stats.due === 0 && (
              <div className="callout">
                <span>You are all caught up here.</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startReview(true)}>
                  Practice all {scoped.length} anyway
                </button>
              </div>
            )}
            <div className="list-controls">
              <div className="search-field">
                <Search size={15} />
                <input className="input" value={query} placeholder="Search cards…" dir="auto" onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="segmented">
                <button type="button" className={cn(filter === 'all' && 'active')} onClick={() => setFilter('all')}>
                  All
                </button>
                <button type="button" className={cn(filter === 'due' && 'active')} onClick={() => setFilter('due')}>
                  Due
                </button>
                <button type="button" className={cn(filter === 'new' && 'active')} onClick={() => setFilter('new')}>
                  New
                </button>
              </div>
            </div>
            <div className="card-list">
              {listed.map((card) => (
                <CardRow key={card.id} card={card} onEdit={() => setEditor({ open: true, card })} onDelete={() => void removeCard(card)} />
              ))}
              {listed.length === 0 && <div className="list-empty">No cards match.</div>}
            </div>
          </>
        )}
      </section>

      <CardEditorDialog
        open={editor.open}
        card={editor.card}
        defaultCollectionId={activeId}
        onClose={() => setEditor({ open: false, card: null })}
      />
      <GenerateDialog open={generateOpen} defaultCollectionId={activeId} onClose={() => setGenerateOpen(false)} />
    </div>
  );
}
