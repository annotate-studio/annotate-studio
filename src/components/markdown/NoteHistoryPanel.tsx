'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RotateCcw, Save, X } from 'lucide-react';
import DiffView from '@/components/ui/DiffView';
import {
  listFileRevisions,
  readFileRevisionText,
  recordFileRevision,
  restoreFileRevision,
  type FileRevision,
} from '@/lib/tauri-commands';
import { useNotes } from '@/store/notes';
import { useLibrary } from '@/store/library';
import { confirmDialog } from '@/store/dialogs';
import { toast } from '@/store/toast';
import { cn, formatBytes } from '@/lib/utils';

interface NoteHistoryPanelProps {
  path: string;
  currentContent: string;
  onClose: () => void;
}

function formatStamp(ms: number): string {
  const date = new Date(ms);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NoteHistoryPanel({ path, currentContent, onClose }: NoteHistoryPanelProps) {
  const [revisions, setRevisions] = useState<FileRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revText, setRevText] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listFileRevisions(path);
      setRevisions(items);
      if (items.length > 0 && !selectedId) {
        setSelectedId(items[0].id);
      }
    } catch {
      setRevisions([]);
    } finally {
      setLoading(false);
    }
  }, [path, selectedId]);

  useEffect(() => {
    void loadList();
  }, [path]);

  useEffect(() => {
    if (!selectedId) {
      setRevText(null);
      return;
    }
    let cancelled = false;
    setLoadingText(true);
    readFileRevisionText(path, selectedId)
      .then((text) => {
        if (!cancelled) setRevText(text);
      })
      .catch(() => {
        if (!cancelled) setRevText(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, selectedId]);

  const snapshotNow = async () => {
    try {
      await useNotes.getState().save(path);
      await recordFileRevision(path, 'manual', 'Manual snapshot');
      await loadList();
      toast.success('Snapshot saved');
    } catch (error) {
      toast.error('Could not save snapshot', error);
    }
  };

  const restore = async (rev: FileRevision) => {
    const ok = await confirmDialog({
      title: 'Restore this revision?',
      message: `Replace the current note with the version from ${formatStamp(rev.timestamp)}. Your current content will be saved as a new revision first.`,
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    setRestoring(true);
    try {
      const file = await restoreFileRevision(path, rev.id);
      const restored = await readFileRevisionText(path, rev.id);
      useNotes.getState().reset(path, restored);
      useLibrary.getState().upsert(file);
      await loadList();
      toast.success('Revision restored');
    } catch (error) {
      toast.error('Restore failed', error);
    } finally {
      setRestoring(false);
    }
  };

  const selected = revisions.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="note-history-panel">
      <div className="note-history-head">
        <div className="note-history-title">
          <History size={14} />
          <span>Revision history</span>
          <span className="muted">({revisions.length})</span>
        </div>
        <div className="note-history-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void snapshotNow()} title="Save a manual snapshot now">
            <Save size={12} /> Snapshot
          </button>
          <button type="button" className="icon-btn icon-btn-sm" onClick={onClose} title="Close history">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="note-history-body">
        <div className="note-history-list">
          {loading ? (
            <div className="note-history-empty">
              <Loader2 size={15} className="spin" /> Loading history…
            </div>
          ) : revisions.length === 0 ? (
            <div className="note-history-empty">No revisions recorded yet. Edits are saved automatically.</div>
          ) : (
            revisions.map((rev, idx) => (
              <button
                key={rev.id}
                type="button"
                className={cn('note-history-item', selectedId === rev.id && 'note-history-item-active')}
                onClick={() => setSelectedId(rev.id)}
              >
                <div className="note-history-item-top">
                  <span className={cn('rev-badge', `rev-badge-${rev.source}`)}>{rev.source}</span>
                  <span className="note-history-time">{formatStamp(rev.timestamp)}</span>
                </div>
                <div className="note-history-item-meta">
                  <span>{rev.summary ?? (idx === 0 ? 'Latest saved' : `Revision #${revisions.length - idx}`)}</span>
                  <span>
                    {formatBytes(rev.size)} ({formatBytes(rev.storedSize)} zst)
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="note-history-diff">
          {loadingText ? (
            <div className="note-history-empty">
              <Loader2 size={15} className="spin" /> Loading diff…
            </div>
          ) : selected && revText !== null ? (
            <DiffView
              label={`Comparing ${formatStamp(selected.timestamp)} → Current`}
              before={revText}
              after={currentContent}
              defaultOpen
              actions={
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={restoring}
                  onClick={() => void restore(selected)}
                >
                  {restoring ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />} Restore
                </button>
              }
            />
          ) : (
            <div className="note-history-empty">Select a revision to inspect changes.</div>
          )}
        </div>
      </div>
    </div>
  );
}
