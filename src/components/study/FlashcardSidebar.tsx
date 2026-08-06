'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, MoreHorizontal, Clock, Layers, Eraser } from 'lucide-react';
import { useStore } from '@/lib/store';
import Dialog from '@/components/ui/Dialog';
import { deleteFlashcardsByCollection, getFlashcardStats } from '@/lib/tauri-commands';

export default function FlashcardSidebar() {
  const {
    flashcardCollections, addCollection, renameCollection, removeCollection,
    setCollectionReviewPeriod,
    activeCollectionId, setActiveCollection,
    flashcards, setFlashcards, flashcardStats, setFlashcardStats,
  } = useStore();

  const [dialogAdd, setDialogAdd] = useState(false);
  const [menuTarget, setMenuTarget] = useState<{ id: string; name: string } | null>(null);
  const [dialogRename, setDialogRename] = useState<{ id: string; name: string } | null>(null);
  const [dialogDelete, setDialogDelete] = useState<{ id: string; name: string } | null>(null);
  const [dialogClear, setDialogClear] = useState<{ id: string; name: string } | null>(null);
  const [dialogPeriod, setDialogPeriod] = useState<{ id: string; days: number } | null>(null);
  const [addName, setAddName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [periodValue, setPeriodValue] = useState(1);
  const [periodUnit, setPeriodUnit] = useState<'days' | 'hours'>('days');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dialogAdd && addRef.current) addRef.current.focus();
  }, [dialogAdd]);

  useEffect(() => {
    if (dialogRename && renameRef.current) renameRef.current.focus();
  }, [dialogRename]);

  const handleAdd = () => {
    const name = addName.trim();
    if (!name) return;
    addCollection(name);
    setAddName('');
    setDialogAdd(false);
  };

  const handleRename = () => {
    if (!dialogRename) return;
    const name = renameName.trim();
    if (!name) return;
    renameCollection(dialogRename.id, name);
    setDialogRename(null);
  };

  const handleDelete = () => {
    if (!dialogDelete) return;
    removeCollection(dialogDelete.id);
    setDialogDelete(null);
  };

  const openMenu = (col: { id: string; name: string }) => {
    setMenuTarget(col);
  };

  const openPeriod = (col: { id: string; reviewPeriodDays: number }) => {
    const days = col.reviewPeriodDays;
    if (days < 1) {
      setPeriodValue(Math.round(days * 24));
      setPeriodUnit('hours');
    } else {
      setPeriodValue(days);
      setPeriodUnit('days');
    }
    setDialogPeriod({ id: col.id, days });
  };

  const menuEdit = () => {
    if (!menuTarget) return;
    setRenameName(menuTarget.name);
    setDialogRename({ id: menuTarget.id, name: menuTarget.name });
    setMenuTarget(null);
  };

  const menuRemove = () => {
    if (!menuTarget) return;
    setDialogDelete({ id: menuTarget.id, name: menuTarget.name });
    setMenuTarget(null);
  };

  const menuClear = () => {
    if (!menuTarget) return;
    setDialogClear({ id: menuTarget.id, name: menuTarget.name });
    setMenuTarget(null);
  };

  const handleClear = async () => {
    if (!dialogClear) return;
    try {
      await deleteFlashcardsByCollection(dialogClear.id);
      setFlashcards(flashcards.filter(c => {
        if (dialogClear.id === 'default') return c.collectionId !== undefined && c.collectionId !== 'default';
        return c.collectionId !== dialogClear.id;
      }));
      const stats = await getFlashcardStats().catch(() => null);
      if (stats) setFlashcardStats(stats);
    } catch {}
    setDialogClear(null);
  };

  const handlePeriodSave = () => {
    if (!dialogPeriod) return;
    const days = periodUnit === 'hours' ? Math.max(1, periodValue) / 24 : Math.max(1, periodValue);
    setCollectionReviewPeriod(dialogPeriod.id, days);
    setDialogPeriod(null);
  };

  return (
    <>
      {/* Header */}
      <div style={{
        padding: '16px 16px 10px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.03em' }}>
          Collections
        </span>
        <button
          className="btn btn-primary"
          onClick={() => { setAddName(''); setDialogAdd(true); }}
          style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
          title="New collection"
        >
          <Plus size={13} /> New
        </button>
      </div>

      {/* Collection list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {flashcardCollections.map(col => {
          const isActive = activeCollectionId === col.id || (!activeCollectionId && col.id === 'default');
          const isHovered = hoveredId === col.id;

          return (
            <div
              key={col.id}
              onClick={() => setActiveCollection(col.id === 'default' ? null : col.id)}
              onMouseEnter={() => setHoveredId(col.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', cursor: 'pointer',
                background: isActive ? 'var(--primary-light)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                transition: 'all 0.12s',
                borderRadius: 0,
                margin: '1px 0',
              }}
            >
              <Layers size={15} style={{
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                flexShrink: 0, opacity: isActive ? 1 : 0.5,
              }} />

              <div style={{
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {col.name}
              </div>

              {col.id !== 'default' && (
                <button
                  onClick={e => { e.stopPropagation(); openPeriod(col); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '3px 7px', border: '1px solid var(--border)',
                    background: isHovered ? 'var(--bg-surface)' : 'transparent',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', fontSize: 10, fontWeight: 600,
                    color: 'var(--text-muted)', flexShrink: 0,
                    transition: 'all 0.12s',
                    opacity: isHovered ? 1 : 0.7,
                  }}
                  title="Change review period"
                >
                  <Clock size={10} />
                  {col.reviewPeriodDays < 1 ? `${Math.round(col.reviewPeriodDays * 24)}h` : `${col.reviewPeriodDays}d`}
                </button>
              )}

              {col.id !== 'default' && (
                <button
                  onClick={e => { e.stopPropagation(); openMenu(col); }}
                  style={{
                    padding: '3px', border: 'none', background: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)',
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.15s',
                    display: 'flex', alignItems: 'center',
                    flexShrink: 0,
                  }}
                  title="Collection actions"
                >
                  <MoreHorizontal size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────── */}

      {/* Add collection */}
      <Dialog open={dialogAdd} onClose={() => { setDialogAdd(false); setAddName(''); }} title="New Collection">
        <input
          ref={addRef}
          value={addName}
          onChange={e => setAddName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="Collection name"
          className="input"
          style={{ width: '100%', fontSize: 13, padding: '8px 10px', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => { setDialogAdd(false); setAddName(''); }} style={{ fontSize: 12, padding: '6px 14px' }}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleAdd} style={{ fontSize: 12, padding: '6px 14px' }}>
            Create
          </button>
        </div>
      </Dialog>

      {/* Collection action menu */}
      <Dialog open={!!menuTarget} onClose={() => setMenuTarget(null)} title={menuTarget?.name || ''} width={320}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={menuEdit}
            className="btn btn-ghost"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', fontSize: 13, fontWeight: 500,
              width: '100%', justifyContent: 'flex-start',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Pencil size={15} style={{ color: 'var(--primary)' }} />
            Edit name
          </button>
          <button
            onClick={menuClear}
            className="btn btn-ghost"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', fontSize: 13, fontWeight: 500,
              width: '100%', justifyContent: 'flex-start',
              borderRadius: 'var(--radius-md)',
              color: 'var(--warning)',
            }}
          >
            <Eraser size={15} />
            Clear all flashcards
          </button>
          <button
            onClick={menuRemove}
            className="btn btn-ghost"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', fontSize: 13, fontWeight: 500,
              width: '100%', justifyContent: 'flex-start',
              borderRadius: 'var(--radius-md)',
              color: 'var(--danger)',
            }}
          >
            <Trash2 size={15} />
            Remove collection
          </button>
        </div>
      </Dialog>

      {/* Clear flashcards */}
      <Dialog open={!!dialogClear} onClose={() => setDialogClear(null)} title="Clear Flashcards" width={360}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          Are you sure you want to delete all flashcards in <strong style={{ color: 'var(--text-primary)' }}>{dialogClear?.name}</strong>? This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setDialogClear(null)} style={{ fontSize: 12, padding: '6px 14px' }}>
            Cancel
          </button>
          <button className="btn" onClick={handleClear} style={{
            fontSize: 12, padding: '6px 14px',
            background: 'var(--warning)', color: 'var(--primary-text)', border: 'none',
            borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600,
          }}>
            Clear All
          </button>
        </div>
      </Dialog>

      {/* Rename collection */}
      <Dialog open={!!dialogRename} onClose={() => setDialogRename(null)} title="Rename Collection">
        <input
          ref={renameRef}
          value={renameName}
          onChange={e => setRenameName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleRename(); }}
          placeholder="Collection name"
          className="input"
          style={{ width: '100%', fontSize: 13, padding: '8px 10px', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setDialogRename(null)} style={{ fontSize: 12, padding: '6px 14px' }}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleRename} style={{ fontSize: 12, padding: '6px 14px' }}>
            Rename
          </button>
        </div>
      </Dialog>

      {/* Delete collection */}
      <Dialog open={!!dialogDelete} onClose={() => setDialogDelete(null)} title="Delete Collection" width={360}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{dialogDelete?.name}</strong>?<br />
          Flashcards in this collection will not be deleted but will become unorganized.
        </p>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setDialogDelete(null)} style={{ fontSize: 12, padding: '6px 14px' }}>
            Cancel
          </button>
          <button className="btn" onClick={handleDelete} style={{
            fontSize: 12, padding: '6px 14px',
            background: 'var(--danger)', color: 'var(--primary-text)', border: 'none',
            borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600,
          }}>
            Delete
          </button>
        </div>
      </Dialog>

      {/* Review period */}
      <Dialog open={!!dialogPeriod} onClose={() => setDialogPeriod(null)} title="Review Period" width={340}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          How often do you want to review this collection?<br />
          Cards will be scheduled this many days/hours apart after a restore.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>Every</span>
          <input
            type="number" min={1} max={periodUnit === 'days' ? 365 : 8760}
            value={periodValue}
            onChange={e => setPeriodValue(Math.max(1, parseInt(e.target.value) || 1))}
            onKeyDown={e => { if (e.key === 'Enter') handlePeriodSave(); }}
            className="input"
            style={{ width: 80, textAlign: 'center', fontSize: 14, padding: '6px 8px' }}
          />
          <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button onClick={() => { setPeriodUnit('days'); setPeriodValue(1); }}
              style={{
                padding: '6px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: periodUnit === 'days' ? 'var(--primary)' : 'transparent',
                color: periodUnit === 'days' ? 'var(--primary-text)' : 'var(--text-secondary)',
              }}>Days</button>
            <button onClick={() => { setPeriodUnit('hours'); setPeriodValue(periodValue * 24 > 0 ? periodValue * 24 : 24); }}
              style={{
                padding: '6px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: periodUnit === 'hours' ? 'var(--primary)' : 'transparent',
                color: periodUnit === 'hours' ? 'var(--primary-text)' : 'var(--text-secondary)',
              }}>Hours</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setDialogPeriod(null)} style={{ fontSize: 12, padding: '6px 14px' }}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handlePeriodSave} style={{ fontSize: 12, padding: '6px 14px' }}>
            Save
          </button>
        </div>
      </Dialog>
    </>
  );
}
