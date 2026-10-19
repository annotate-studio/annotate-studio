'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Columns2, Eye, FileText, Image as ImageIcon, Loader2, PenLine, Plus, Save, ScanText, Square, Trash2, Upload } from 'lucide-react';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import ModelPicker from '@/components/ui/ModelPicker';
import { canSeeImages, ensureProviders, modelFor, providerById } from '@/lib/agent/models';
import { isPdf, ocrPages, pdfPages } from '@/lib/agent/documents';
import type { ProviderInfo, StudyFile } from '@/lib/tauri-commands';
import { createNewNote, pickAndImport } from '@/lib/workspace-actions';
import { useLibrary } from '@/store/library';
import { useProviders } from '@/store/providers';
import { toast } from '@/store/toast';
import { cn } from '@/lib/utils';

type Mode = 'edit' | 'split' | 'preview';

interface ProgressState {
  done: number;
  total: number;
}

function visionModelOf(modelId: string): ProviderInfo | undefined {
  return providerById(modelId) || modelFor('vision');
}

export default function OcrTab() {
  const files = useLibrary((state) => state.files);
  const loading = useLibrary((state) => state.loading);
  const refresh = useLibrary((state) => state.refresh);
  const providers = useProviders((state) => state.providers);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [mode, setModeState] = useState<Mode>('split');
  const [modelId, setModelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const cancelRef = useRef(false);

  const candidates = useMemo(() => files.filter((file) => file.file_type === 'Pdf' || file.file_type === 'Image'), [files]);
  const chosen = useMemo(() => selected.map((path) => candidates.find((file) => file.path === path)).filter((file): file is StudyFile => Boolean(file)), [selected, candidates]);
  const vision = useMemo(() => visionModelOf(modelId), [modelId, providers]);
  const visionReady = Boolean(vision && canSeeImages(vision));

  useEffect(() => {
    void refresh();
    void useProviders.getState().refresh();
  }, [refresh]);

  const toggle = (path: string) =>
    setSelected((current) => (current.includes(path) ? current.filter((value) => value !== path) : [...current, path]));

  const stop = () => {
    cancelRef.current = true;
  };

  const addFiles = async () => {
    await pickAndImport('any');
    await refresh();
  };

  const ocrResource = async (file: StudyFile, provider: ProviderInfo): Promise<string> => {
    setProgress(null);
    if (isPdf(file.path)) {
      const info = await pdfPages(file);
      let ocr = new Map<number, string>();
      if (info.emptyPages.length > 0) {
        ocr = await ocrPages(file, info.emptyPages, {
          provider,
          isCancelled: () => cancelRef.current,
          onProgress: (done, total) => setProgress({ done, total }),
        });
      }
      const pages = info.pages
        .map((page) => {
          const value = page.text.trim() || ocr.get(page.page)?.trim() || '';
          return value ? `## Page ${page.page}\n\n${value}` : '';
        })
        .filter(Boolean);
      return `# ${file.name}\n\n${pages.join('\n\n')}`;
    }
    const map = await ocrPages(file, [1], {
      provider,
      isCancelled: () => cancelRef.current,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    return `# ${file.name}\n\n${(map.get(1) ?? '').trim()}`;
  };

  const run = async () => {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    cancelRef.current = false;
    setPhase('Preparing…');
    setProgress(null);
    try {
      await ensureProviders();
      const provider = visionModelOf(modelId);
      if (!provider || !canSeeImages(provider)) {
        toast.error('No vision model found', 'Pick a model that can read images with the model picker, or add one in Settings → AI providers.');
        return;
      }
      const sections: string[] = [];
      for (const file of chosen) {
        if (cancelRef.current) break;
        setPhase(`Reading ${file.name}…`);
        sections.push(await ocrResource(file, provider));
      }
      if (sections.length > 0) {
        const combined = sections.join('\n\n---\n\n');
        setText((current) => (current.trim() ? `${current.trimEnd()}\n\n${combined}` : combined));
        toast.success('OCR finished', `${sections.length} resource${sections.length === 1 ? '' : 's'} converted to text.`);
      }
    } catch (error) {
      toast.error('OCR failed', error);
    } finally {
      setBusy(false);
      setPhase('');
      setProgress(null);
    }
  };

  const saveNote = async () => {
    if (!text.trim()) {
      toast.warning('Nothing to save', 'Run OCR or write some markdown first.');
      return;
    }
    const title = `OCR ${new Date().toISOString().slice(0, 10)}`;
    const file = await createNewNote({ title, content: text.trim() });
    if (file) toast.success('Saved to your notes', file.name);
  };

  return (
    <div className="split-page">
      <aside className="side-panel">
        <div className="side-panel-header">
          <span>Sources</span>
          <button type="button" className="icon-btn" onClick={() => void addFiles()} title="Import PDFs or images">
            <Plus size={15} />
          </button>
        </div>
        <div className="side-panel-list">
          {candidates.map((file) => {
            const active = selected.includes(file.path);
            return (
              <div key={file.path} className={cn('side-item', active && 'side-item-active')}>
                <button type="button" className="side-item-main" onClick={() => toggle(file.path)}>
                  {file.file_type === 'Pdf' ? <FileText size={15} /> : <ImageIcon size={15} />}
                  <span className="side-item-label" dir="auto">
                    {file.name}
                  </span>
                </button>
                <div className="side-item-trailing">
                  <button
                    type="button"
                    className={cn('icon-btn', 'icon-btn-sm', active && 'icon-btn-primary')}
                    onClick={() => toggle(file.path)}
                    title={active ? 'Remove from selection' : 'Add to selection'}
                  >
                    {active ? <Check size={14} /> : <Plus size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
          {candidates.length === 0 && (
            <button type="button" className="side-empty" onClick={() => void addFiles()}>
              <Upload size={14} /> Import scans or images
            </button>
          )}
          {loading && candidates.length === 0 && <div className="list-empty">Loading files…</div>}
        </div>
        {selected.length > 0 && (
          <div className="side-panel-footer">
            <span>{chosen.length} selected</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>
              <Trash2 size={13} /> Clear
            </button>
          </div>
        )}
      </aside>

      <section className="page ocr-page">
        <header className="page-header">
          <div>
            <h1>OCR</h1>
            <p>Turn scanned PDFs and images into editable markdown with a vision model.</p>
          </div>
          <div className="page-actions">
            <ModelPicker value={modelId || undefined} onChange={setModelId} />
            {busy ? (
              <button type="button" className="btn btn-ghost" onClick={stop}>
                <Square size={15} /> Stop
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={busy || chosen.length === 0}>
              {busy ? <Loader2 size={15} className="spin" /> : <ScanText size={15} />}
              {busy ? 'Reading…' : chosen.length > 0 ? `OCR ${chosen.length} resource${chosen.length === 1 ? '' : 's'}` : 'Run OCR'}
            </button>
          </div>
        </header>

        {busy && (
          <div className="progress-panel">
            <div className="progress-label">
              <Loader2 size={14} className="spin" />
              {progress && progress.total > 1 ? `${phase} · page ${progress.done} of ${progress.total}` : phase}
            </div>
            {progress && progress.total > 1 && (
              <div className="progress-bar">
                <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            )}
          </div>
        )}
        {!busy && !visionReady && (
          <div className="callout">
            <span>Pick a model that can read images — OCR needs a vision-capable model.</span>
          </div>
        )}

        <div className="ocr-editor">
          <div className="note-toolbar">
            <div className="segmented">
              <button type="button" className={cn(mode === 'edit' && 'active')} onClick={() => setModeState('edit')} title="Edit">
                <PenLine size={13} />
              </button>
              <button type="button" className={cn(mode === 'split' && 'active')} onClick={() => setModeState('split')} title="Split view">
                <Columns2 size={13} />
              </button>
              <button type="button" className={cn(mode === 'preview' && 'active')} onClick={() => setModeState('preview')} title="Preview">
                <Eye size={13} />
              </button>
            </div>
            <div className="note-toolbar-spacer" />
            <span className="note-meta">Markdown · images and PDFs in, text out</span>
            <button type="button" className="tool-btn" onClick={() => void saveNote()} disabled={busy || !text.trim()} title="Save the text as a note">
              <Save size={14} />
              <span>Note</span>
            </button>
            <button type="button" className="tool-btn" onClick={() => setText('')} disabled={busy || !text} title="Clear the editor">
              <Trash2 size={14} />
            </button>
          </div>
          <div className={cn('note-body', mode === 'split' && 'note-body-split')}>
            <div className={cn('note-pane note-editor-pane', mode !== 'preview' ? '' : 'note-pane-hidden')}>
              <MarkdownEditor value={text} onChange={setText} placeholder="Recognized text appears here. You can edit it before saving." />
            </div>
            {mode !== 'edit' && (
              <div className="note-pane note-preview-pane content-selectable">
                {text.trim() ? (
                  <MarkdownRenderer content={text} />
                ) : (
                  <div className="note-empty">Nothing to preview yet.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
