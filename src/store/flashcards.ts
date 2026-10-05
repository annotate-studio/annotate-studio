import { create } from 'zustand';
import {
  deleteFlashcardsByCollection,
  getFlashcards,
  loadCollections,
  saveCollections,
  type CollectionEntry,
  type Flashcard,
} from '@/lib/tauri-commands';
import { createSaver } from '@/lib/persist';
import { uid } from '@/lib/utils';

export interface FlashcardCollection {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  reviewPeriodDays: number;
}

export const UNSORTED_ID = '__unsorted__';

interface FlashcardStore {
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  cards: Flashcard[];
  collections: FlashcardCollection[];
  activeCollectionId: string | null;
  hydrate: () => Promise<void>;
  refreshCards: () => Promise<void>;
  setActiveCollection: (id: string | null) => void;
  addCollection: (name: string, description?: string) => FlashcardCollection;
  renameCollection: (id: string, name: string) => void;
  setReviewPeriod: (id: string, days: number) => void;
  deleteCollection: (id: string) => Promise<void>;
  clearCollection: (id: string) => Promise<void>;
  addCards: (cards: Flashcard[]) => void;
  upsertCard: (card: Flashcard) => void;
  removeCard: (id: string) => void;
}

function fromEntry(entry: CollectionEntry): FlashcardCollection {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description ?? '',
    createdAt: entry.created_at ?? new Date().toISOString(),
    reviewPeriodDays: Number.isFinite(entry.review_period_days) && entry.review_period_days > 0 ? entry.review_period_days : 1,
  };
}

function toEntry(collection: FlashcardCollection): CollectionEntry {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    created_at: collection.createdAt,
    review_period_days: collection.reviewPeriodDays,
  };
}

export function isDue(card: Flashcard, now = Date.now()): boolean {
  const due = Date.parse(card.next_review);
  return !Number.isFinite(due) || due <= now;
}

export function isNewCard(card: Flashcard): boolean {
  return !card.last_reviewed && card.repetitions === 0;
}

export function cardsInCollection(cards: Flashcard[], collectionId: string | null): Flashcard[] {
  if (collectionId === null) return cards;
  if (collectionId === UNSORTED_ID) return cards.filter((card) => !card.collectionId);
  return cards.filter((card) => card.collectionId === collectionId);
}

export function statsFor(cards: Flashcard[], now = Date.now()) {
  let due = 0;
  let fresh = 0;
  let young = 0;
  let mature = 0;
  for (const card of cards) {
    if (isDue(card, now)) due += 1;
    if (isNewCard(card)) fresh += 1;
    else if (card.interval_days >= 21) mature += 1;
    else young += 1;
  }
  return { total: cards.length, due, new: fresh, young, mature };
}

const saver = createSaver<FlashcardCollection[]>((collections) => saveCollections(collections.map(toEntry)), 300);

export const useFlashcards = create<FlashcardStore>((set, get) => ({
  hydrated: false,
  loading: false,
  error: null,
  cards: [],
  collections: [],
  activeCollectionId: null,
  hydrate: async () => {
    if (get().hydrated) return;
    set({ loading: true });
    try {
      const [cards, collections] = await Promise.all([getFlashcards(), loadCollections()]);
      set({ cards, collections: collections.map(fromEntry), hydrated: true, loading: false, error: null });
    } catch (error) {
      set({ hydrated: true, loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
  refreshCards: async () => {
    try {
      const cards = await getFlashcards();
      set({ cards, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  setActiveCollection: (id) => set({ activeCollectionId: id }),
  addCollection: (name, description = '') => {
    const collection: FlashcardCollection = {
      id: uid(),
      name: name.trim() || 'Untitled collection',
      description,
      createdAt: new Date().toISOString(),
      reviewPeriodDays: 1,
    };
    set((state) => ({ collections: [...state.collections, collection], activeCollectionId: collection.id }));
    return collection;
  },
  renameCollection: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => ({ collections: state.collections.map((c) => (c.id === id ? { ...c, name: trimmed } : c)) }));
  },
  setReviewPeriod: (id, days) =>
    set((state) => ({
      collections: state.collections.map((c) => (c.id === id ? { ...c, reviewPeriodDays: Math.max(1 / 24, days) } : c)),
    })),
  deleteCollection: async (id) => {
    await deleteFlashcardsByCollection(id);
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
      cards: state.cards.filter((card) => card.collectionId !== id),
      activeCollectionId: state.activeCollectionId === id ? null : state.activeCollectionId,
    }));
  },
  clearCollection: async (id) => {
    await deleteFlashcardsByCollection(id);
    set((state) => ({ cards: state.cards.filter((card) => card.collectionId !== id) }));
  },
  addCards: (cards) =>
    set((state) => {
      const ids = new Set(cards.map((card) => card.id));
      return { cards: [...state.cards.filter((card) => !ids.has(card.id)), ...cards] };
    }),
  upsertCard: (card) =>
    set((state) => {
      const exists = state.cards.some((c) => c.id === card.id);
      return { cards: exists ? state.cards.map((c) => (c.id === card.id ? card : c)) : [...state.cards, card] };
    }),
  removeCard: (id) => set((state) => ({ cards: state.cards.filter((card) => card.id !== id) })),
}));

useFlashcards.subscribe((state, previous) => {
  if (!state.hydrated || !previous.hydrated || state.collections === previous.collections) return;
  saver.schedule(state.collections);
});
