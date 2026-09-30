'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bold,
  Code,
  Columns2,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  PenLine,
  Quote,
  Sigma,
} from 'lucide-react';
import MarkdownEditor, { type MarkdownEditorHandle } from '@/components/markdown/MarkdownEditor';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import { useNotes } from '@/store/notes';
import { useLibrary } from '@/store/library';
import { activeWorkspace, useCanvas } from '@/store/canvas';
import { cn } from '@/lib/utils';

type Mode = 'edit' | 'split' | 'preview';

const modeMemory = new Map<string, Mode>();

function wordCount(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

function NoteWindow({ resourceId, path, title }: { resourceId: string; path: string; title: string }) {
  const buffer = useNotes((state) => state.buffers[path]);
  const load = useNotes((state) => state.load);
  const edit = useNotes((state) => state.edit);
  const save = useNotes((state) => state.save);
  const width = useCanvas((state) => activeWorkspace(state).resources.find((r) => r.id === resourceId)?.width ?? 700);
  const maximized = useCanvas((state) => activeWorkspace(state).resources.find((r) => r.id === resourceId)?.maximized ?? false);
  const [mode, setModeState] = useState<Mode>(() => modeMemory.get(resourceId) ?? (width >= 760 ? 'split' : 'edit'));
  const editorRef = useRef<MarkdownEditorHandle>(null);

  const setMode = (next: Mode) => {
    modeMemory.set(resourceId, next);
    setModeState(next);
  };

  useEffect(() => {
    void load(path);
  }, [load, path]);

  const getFiles = useCallback(() => useLibrary.getState().files, []);
  const onChange = useCallback((value: string) => edit(path, value), [edit, path]);
  const onSave = useCallback(() => void save(path), [save, path]);

  if (!buffer || buffer.status === 'loading') {
    return (
      <div className="cw-state">
        <Loader2 size={18} className="spin" />
        <div>Loading {title}…</div>
      </div>
    );
  }
  if (buffer.status === 'error') {
    return (
      <div className="cw-state cw-state-error">
        <AlertTriangle size={20} />
        <div>{buffer.error ?? 'This note could not be opened.'}</div>
      </div>
    );
  }

  const canSplit = width >= 560 || maximized;
  const view: Mode = mode === 'split' && !canSplit ? 'edit' : mode;
  const showEditor = view !== 'preview';
  const showPreview = view !== 'edit';
  const status = buffer.error ? 'Not saved' : buffer.saving || buffer.dirty ? 'Saving…' : buffer.savedAt ? 'Saved' : '';

  const format = (action: () => void) => (event: React.MouseEvent) => {
    event.preventDefault();
    action();
  };

  return (
    <div className="note-window">
      <div className="note-toolbar" data-no-drag>
        <div className="segmented">
          <button type="button" className={cn(mode === 'edit' && 'active')} onClick={() => setMode('edit')} title="Edit">
            <PenLine size={13} />
          </button>
          <button
            type="button"
            className={cn(mode === 'split' && 'active')}
            onClick={() => setMode('split')}
            title={canSplit ? 'Split view' : 'Split view (widen the window to see the preview)'}
          >
            <Columns2 size={13} />
          </button>
          <button type="button" className={cn(mode === 'preview' && 'active')} onClick={() => setMode('preview')} title="Preview">
            <Eye size={13} />
          </button>
        </div>
        {showEditor && buffer.editable && (
          <div className="note-format">
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.wrap('**'))} title="Bold (Ctrl+B)">
              <Bold size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.wrap('*'))} title="Italic (Ctrl+I)">
              <Italic size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.prefixLines('## '))} title="Heading">
              <Heading2 size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.prefixLines('- '))} title="Bulleted list">
              <List size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.prefixLines('1. '))} title="Numbered list">
              <ListOrdered size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.prefixLines('- [ ] '))} title="Checklist">
              <ListChecks size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.prefixLines('> '))} title="Quote">
              <Quote size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.wrap('`', '`', 'code'))} title="Inline code (Ctrl+E)">
              <Code size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.wrap('$', '$', 'x^2'))} title="Math">
              <Sigma size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.wrap('[[', ']]', 'Note'))} title="Link a note">
              <Link2 size={14} />
            </button>
          </div>
        )}
        <div className="note-toolbar-spacer" />
        <span className="note-meta">{wordCount(buffer.content)} words</span>
        <span className={cn('save-state', buffer.error ? 'save-state-error' : buffer.dirty || buffer.saving ? 'save-state-pending' : 'save-state-saved')}>
          {status}
        </span>
      </div>
      {!buffer.editable && (
        <div className="note-readonly">
          <AlertTriangle size={13} /> This file is not UTF-8 text, so it opens read-only to keep its characters intact.
        </div>
      )}
      <div className={cn('note-body', view === 'split' && 'note-body-split')}>
        <div className={cn('note-pane note-editor-pane', !showEditor && 'note-pane-hidden')}>
          <MarkdownEditor
            ref={editorRef}
            value={buffer.content}
            onChange={onChange}
            onSave={onSave}
            getFiles={getFiles}
            readOnly={!buffer.editable}
            placeholder="Start writing… Use [[ to link notes, $…$ for math"
          />
        </div>
        {showPreview && (
          <div className="note-pane note-preview-pane content-selectable">
            {buffer.content.trim() ? (
              <MarkdownRenderer content={buffer.content} sourceId={resourceId} />
            ) : (
              <div className="note-empty">Nothing to preview yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(NoteWindow);
