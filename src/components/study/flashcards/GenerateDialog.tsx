'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Sparkles, Type } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import ModelPicker from '@/components/ui/ModelPicker';
import {
  cancelGeneration,
  generateFlashcards,
  generateFlashcardsFromFile,
  onGenerationProgress,
  type GenerationProgress,
} from '@/lib/tauri-commands';
import { hasReadableText } from '@/lib/pdf-engine';
import { readDocumentText } from '@/lib/workspace-actions';
import { UNSORTED_ID, useFlashcards } from '@/store/flashcards';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';
import { cn, uid } from '@/lib/utils';

interface GenerateDialogProps {
  open: boolean;
  defaultCollectionId: string | null;
  onClose: () => void;
}

export default function GenerateDialog({ open, defaultCollectionId, onClose }: GenerateDialogProps) {
  const collections = useFlashcards((state) => state.collections);
  const files = useLibrary((state) => state.files);
  const [source, setSource] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [path, setPath] = useState('');
  const [instructions, setInstructions] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);

  const documents = useMemo(() => files.filter((file) => file.file_type !== 'Image'), [files]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setProgress(null);
    setCollectionId(defaultCollectionId && defaultCollectionId !== UNSORTED_ID ? defaultCollectionId : '');
    void useLibrary.getState().refresh();
  }, [open, defaultCollectionId]);

  useEffect(() => {
    if (!open) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onGenerationProgress((next) => {
      if (next.request_id === requestRef.current) setProgress(next);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [open]);

  const canGenerate = source === 'text' ? text.trim().length > 0 || instructions.trim().length > 0 : Boolean(path);

  const stop = () => {
    stoppedRef.current = true;
    if (requestRef.current) void cancelGeneration(requestRef.current).catch(() => undefined);
  };

  const generate = async () => {
    if (!canGenerate || busy) return;
    const requestId = uid();
    requestRef.current = requestId;
    stoppedRef.current = false;
    setBusy(true);
    setError(null);
    setProgress(null);
    const options = {
      collectionId: collectionId || null,
      model: useSettings.getState().selectedModel || undefined,
      instructions: instructions.trim() || undefined,
      requestId,
    };
    try {
      let cards;
      if (source === 'file') {
        const file = documents.find((f) => f.path === path);
        if (file?.file_type === 'Pdf') {
          setPhase('Extracting text from the PDF…');
          const document = await readDocumentText(path, 250_000);
          if (!hasReadableText(document.text)) {
            throw new Error('No readable text was found in this PDF. Scanned PDFs are not supported — paste the text instead.');
          }
          if (stoppedRef.current) return;
          setPhase('Generating flashcards…');
          cards = await generateFlashcards(document.text, file.name, options);
        } else {
          setPhase('Generating flashcards…');
          cards = await generateFlashcardsFromFile(path, options);
        }
      } else {
        setPhase('Generating flashcards…');
        cards = await generateFlashcards(text, undefined, options);
      }
      useFlashcards.getState().addCards(cards);
      const created = `${cards.length} flashcard${cards.length === 1 ? '' : 's'}`;
      toast.success(stoppedRef.current ? `Stopped early — created ${created}` : `Created ${created}`);
      setText('');
      setInstructions('');
      onClose();
    } catch (err) {
      if (!stoppedRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      requestRef.current = null;
      setBusy(false);
      setPhase('');
      setProgress(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (busy) stop();
        onClose();
      }}
      title="Generate flashcards with AI"
      width={600}
      footer={
        <>
          <ModelPicker align="start" />
          <div className="dialog-footer-spacer" />
          {busy ? (
            <button type="button" className="btn btn-ghost" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={!canGenerate || busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="segmented segmented-full">
          <button type="button" className={cn(source === 'text' && 'active')} onClick={() => setSource('text')}>
            <Type size={14} /> Paste text
          </button>
          <button type="button" className={cn(source === 'file' && 'active')} onClick={() => setSource('file')}>
            <FileText size={14} /> From a document
          </button>
        </div>
        {source === 'text' ? (
          <label className="field">
            <span className="field-label">Study material</span>
            <textarea
              className="input textarea"
              rows={8}
              value={text}
              dir="auto"
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste notes, a chapter, or a list of words. Or leave empty and describe a topic below."
              disabled={busy}
            />
          </label>
        ) : (
          <label className="field">
            <span className="field-label">Document</span>
            <select className="select" value={path} onChange={(event) => setPath(event.target.value)} disabled={busy}>
              <option value="">Choose a PDF, note or document…</option>
              {documents.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.name}
                </option>
              ))}
            </select>
            <span className="field-hint">Long documents are processed in parts. Scanned PDFs without a text layer are not supported.</span>
          </label>
        )}
        <label className="field">
          <span className="field-label">Instructions (optional)</span>
          <input
            className="input"
            value={instructions}
            dir="auto"
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="e.g. 15 cards on key definitions, answers in Persian"
            disabled={busy}
          />
        </label>
        <label className="field">
          <span className="field-label">Save to collection</span>
          <select className="select" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} disabled={busy}>
            <option value="">Unsorted</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
        {busy && (
          <div className="progress-panel">
            <div className="progress-label">
              <Loader2 size={14} className="spin" />
              {progress && progress.total > 1 ? `Part ${progress.current} of ${progress.total} · ${progress.generated} cards so far` : phase}
            </div>
            {progress && progress.total > 1 && (
              <div className="progress-bar">
                <div style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
            )}
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
      </div>
    </Dialog>
  );
}
