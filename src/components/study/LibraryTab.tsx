'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  ExternalLink,
  FileImage,
  FileText,
  FileType2,
  FolderOpen,
  Layers,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  RefreshCw,
  ScrollText,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { openContextMenu, type MenuEntry } from '@/components/ui/ContextMenu';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';
import { useApp } from '@/store/app';
import { activeWorkspace, useCanvas } from '@/store/canvas';
import { confirmDialog, promptDialog } from '@/store/dialogs';
import type { FileType, StudyFile } from '@/lib/tauri-commands';
import {
  createNewNote,
  deleteFile,
  displayTitle,
  openFileOnCanvas,
  pickAndImport,
  renameFile,
  resourceTypeFor,
  revealInExplorer,
} from '@/lib/workspace-actions';
import { cn, formatBytes, formatRelativeTime, stripExtension } from '@/lib/utils';

type Filter = 'all' | 'pdf' | 'notes' | 'images' | 'documents';
type Sort = 'recent' | 'modified' | 'name' | 'size';

const FILTERS: { id: Filter; label: string; types: FileType[] }[] = [
  { id: 'all', label: 'All', types: [] },
  { id: 'pdf', label: 'PDFs', types: ['Pdf'] },
  { id: 'notes', label: 'Notes', types: ['Markdown', 'Text'] },
  { id: 'images', label: 'Images', types: ['Image'] },
  { id: 'documents', label: 'Documents', types: ['Document'] },
];

const TYPE_META: Record<FileType, { label: string; icon: React.ReactNode; tone: string }> = {
  Pdf: { label: 'PDF', icon: <FileText size={26} />, tone: 'tone-red' },
  Markdown: { label: 'Note', icon: <NotebookPen size={26} />, tone: 'tone-blue' },
  Text: { label: 'Text', icon: <FileType2 size={26} />, tone: 'tone-slate' },
  Image: { label: 'Image', icon: <FileImage size={26} />, tone: 'tone-green' },
  Document: { label: 'Doc', icon: <FileType2 size={26} />, tone: 'tone-violet' },
  Unknown: { label: 'File', icon: <FileText size={26} />, tone: 'tone-slate' },
};

export default function LibraryTab() {
  const files = useLibrary((state) => state.files);
  const loading = useLibrary((state) => state.loading);
  const refresh = useLibrary((state) => state.refresh);
  const recent = useSettings((state) => state.recentFiles);
  const resources = useCanvas((state) => activeWorkspace(state).resources);
  const openSet = useMemo(() => new Set(resources.map((r) => r.filePath).filter((p): p is string => Boolean(p))), [resources]);
  const setView = useApp((state) => state.setView);
  const requestChat = useApp((state) => state.requestChat);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const types = FILTERS.find((f) => f.id === filter)?.types ?? [];
    const needle = query.trim().toLowerCase();
    const list = files.filter((file) => (types.length === 0 || types.includes(file.file_type)) && (!needle || file.name.toLowerCase().includes(needle)));
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return b.size - a.size;
        case 'modified':
          return b.modified_at.localeCompare(a.modified_at);
        default:
          return (recent[b.path] ?? Date.parse(b.modified_at)) - (recent[a.path] ?? Date.parse(a.modified_at));
      }
    });
  }, [files, filter, query, sort, recent]);

  const open = (file: StudyFile) => {
    if (!resourceTypeFor(file)) {
      requestChat({ kind: 'summarize', title: file.name, path: file.path });
      return;
    }
    if (openFileOnCanvas(file)) setView('canvas');
  };

  const rename = async (file: StudyFile) => {
    const name = await promptDialog({
      title: 'Rename file',
      initialValue: file.file_type === 'Markdown' ? stripExtension(file.name) : file.name,
      selectBaseName: file.file_type !== 'Markdown',
      confirmLabel: 'Rename',
    });
    if (name) await renameFile(file.path, name);
  };

  const remove = async (file: StudyFile) => {
    const ok = await confirmDialog({
      title: `Delete “${file.name}”?`,
      message: 'The file is removed from your workspace and closed on every canvas. This cannot be undone.',
      confirmLabel: 'Delete file',
      danger: true,
    });
    if (ok) await deleteFile(file.path);
  };

  const menuFor = (file: StudyFile): MenuEntry[] => {
    const items: MenuEntry[] = [];
    if (resourceTypeFor(file)) items.push({ label: 'Open on canvas', icon: <ExternalLink size={13} />, onSelect: () => open(file) });
    if (file.file_type !== 'Image') {
      items.push(
        { label: 'Summarize with AI', icon: <ScrollText size={13} />, onSelect: () => requestChat({ kind: 'summarize', title: file.name, path: file.path }) },
        { label: 'Explain step by step', icon: <BookOpenCheck size={13} />, onSelect: () => requestChat({ kind: 'explain', topic: displayTitle(file), path: file.path }) },
        { label: 'Make flashcards', icon: <Layers size={13} />, onSelect: () => requestChat({ kind: 'flashcards', title: file.name, text: '', path: file.path }) },
      );
    }
    items.push('separator', { label: 'View in explorer', icon: <FolderOpen size={13} />, onSelect: () => void revealInExplorer(file.path) });
    items.push({ label: 'Rename…', icon: <Pencil size={13} />, onSelect: () => void rename(file) });
    items.push({ label: 'Delete…', icon: <Trash2 size={13} />, danger: true, onSelect: () => void remove(file) });
    return items;
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Library</h1>
          <p>
            {files.length} file{files.length === 1 ? '' : 's'} in your workspace
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void refresh()} title="Refresh">
            <RefreshCw size={15} className={loading ? 'spin' : undefined} />
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              const file = await createNewNote();
              if (file) setView('canvas');
            }}
          >
            <NotebookPen size={15} /> New note
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void pickAndImport('any')}>
            <Upload size={15} /> Import files
          </button>
        </div>
      </header>

      <div className="library-controls">
        <div className="search-field">
          <Search size={15} />
          <input className="input" value={query} placeholder="Search files…" onChange={(event) => setQuery(event.target.value)} dir="auto" />
        </div>
        <div className="segmented">
          {FILTERS.map((entry) => (
            <button key={entry.id} type="button" className={cn(filter === entry.id && 'active')} onClick={() => setFilter(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
        <select className="select" value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort files">
          <option value="recent">Recently opened</option>
          <option value="modified">Last modified</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <FolderOpen size={40} strokeWidth={1.4} />
          <h2>{query || filter !== 'all' ? 'No matching files' : 'Your library is empty'}</h2>
          <p>{query || filter !== 'all' ? 'Try another search or filter.' : 'Import PDFs, images or notes, or drop them onto the window.'}</p>
        </div>
      ) : (
        <div className="library-grid">
          {visible.map((file) => {
            const meta = TYPE_META[file.file_type] ?? TYPE_META.Unknown;
            return (
              <div
                key={file.path}
                className="file-card"
                role="button"
                tabIndex={0}
                onClick={() => open(file)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                  event.preventDefault();
                  open(file);
                }}
                onContextMenu={(event) => openContextMenu(event, menuFor(file))}
              >
                <div className={cn('file-card-icon', meta.tone)}>{meta.icon}</div>
                <div className="file-card-body">
                  <div className="file-card-name" dir="auto" title={file.name}>
                    {displayTitle(file)}
                  </div>
                  <div className="file-card-meta">
                    <span className={cn('badge', meta.tone)}>{meta.label}</span>
                    <span>{formatBytes(file.size)}</span>
                    <span>{formatRelativeTime(recent[file.path] ?? file.modified_at)}</span>
                    {openSet.has(file.path) && <span className="badge tone-primary">On canvas</span>}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn file-card-menu"
                  onClick={(event) => openContextMenu(event, menuFor(file))}
                  title="More actions"
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
