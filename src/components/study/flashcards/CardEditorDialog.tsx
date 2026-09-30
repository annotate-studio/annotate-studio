'use client';

import React, { useEffect, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { createFlashcard, updateFlashcard, type Flashcard } from '@/lib/tauri-commands';
import { UNSORTED_ID, useFlashcards } from '@/store/flashcards';
import { toast } from '@/store/toast';

interface CardEditorDialogProps {
  open: boolean;
  card: Flashcard | null;
  defaultCollectionId: string | null;
  onClose: () => void;
}

export default function CardEditorDialog({ open, card, defaultCollectionId, onClose }: CardEditorDialogProps) {
  const collections = useFlashcards((state) => state.collections);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [collectionId, setCollectionId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFront(card?.front ?? '');
    setBack(card?.back ?? '');
    const initial = card ? card.collectionId ?? '' : defaultCollectionId && defaultCollectionId !== UNSORTED_ID ? defaultCollectionId : '';
    setCollectionId(initial);
  }, [open, card, defaultCollectionId]);

  const save = async () => {
    if (!front.trim() || !back.trim() || saving) return;
    setSaving(true);
    try {
      const saved = card
        ? await updateFlashcard(card.id, front, back, collectionId || null)
        : await createFlashcard(front, back, collectionId || null);
      useFlashcards.getState().upsertCard(saved);
      if (!card && keepOpen) {
        setFront('');
        setBack('');
        toast.success('Card added');
      } else {
        onClose();
      }
    } catch (error) {
      toast.error('Could not save the card', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={card ? 'Edit card' : 'New card'}
      width={560}
      footer={
        <>
          {!card && (
            <label className="checkbox-row">
              <input type="checkbox" checked={keepOpen} onChange={(event) => setKeepOpen(event.target.checked)} />
              Add another after saving
            </label>
          )}
          <div className="dialog-footer-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!front.trim() || !back.trim() || saving}>
            {saving ? 'Saving…' : card ? 'Save changes' : 'Add card'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Front (question)</span>
          <textarea
            className="input textarea"
            rows={3}
            value={front}
            dir="auto"
            data-autofocus
            onChange={(event) => setFront(event.target.value)}
            placeholder="What is the powerhouse of the cell?"
          />
        </label>
        <label className="field">
          <span className="field-label">Back (answer)</span>
          <textarea
            className="input textarea"
            rows={5}
            value={back}
            dir="auto"
            onChange={(event) => setBack(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void save();
              }
            }}
            placeholder="The mitochondrion. Markdown and $math$ are supported."
          />
        </label>
        <label className="field">
          <span className="field-label">Collection</span>
          <select className="select" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
            <option value="">Unsorted</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Dialog>
  );
}
