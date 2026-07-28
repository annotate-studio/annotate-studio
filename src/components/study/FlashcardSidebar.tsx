'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, MoreHorizontal, Clock } from 'lucide-react';
import { useStore } from '@/lib/store';
import Dialog from '@/components/ui/Dialog';

export default function FlashcardSidebar() {
  const {
    flashcardCollections, addCollection, renameCollection, removeCollection,
    setCollectionReviewPeriod,
    activeCollectionId, setActiveCollection,
  } = useStore();

  const [dialogAdd, setDialogAdd] = useState(false);
  const [menuTarget, setMenuTarget] = useState<{ id: string; name: string } | null>(null);
  const [dialogRename, setDialogRename] = useState<{ id: string; name: string } | null>(null);
  const [dialogDelete, setDialogDelete] = useState<{ id: string; name: string } | null>(null);
  const [dialogPeriod, setDialogPeriod] = useState<{ id: string; days: number } | null>(null);
  const [addName, setAddName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [periodDays, setPeriodDays] = useState(1);
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

  const menuPeriod = () => {
    if (!menuTarget) return;
    const col = flashcardCollections.find(c => c.id === menuTarget.id);
    setPeriodDays(col?.reviewPeriodDays ?? 1);
    setDialogPeriod({ id: menuTarget.id, days: col?.reviewPeriodDays ?? 1 });
    setMenuTarget(null);
  };

  const handlePeriodSave = () => {
    if (!dialogPeriod) return;
    const days = Math.max(1, Math.floor(periodDays));
    setCollectionReviewPeriod(dialogPeriod.id, days);
    setDialogPeriod(null);
  };

  return (
    <>
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
          COLLECTIONS
        </span>
        <button
          className="btn btn-primary"
          onClick={() => { setAddName(''); setDialogAdd(true); }}
          style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
          title="New collection"
        >
          <Plus size={13} /> New
        </button>
      </div>

      {/* Collection list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
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
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px', cursor: 'pointer',
                background: isActive ? 'var(--primary-light)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                transition: 'all 0.12s',
                borderRadius: 0,
              }}
            >
              <div style={{
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {col.name}
              </div>

              {col.id !== 'default' && (
                <button
                  onClick={e => { e.stopPropagation(); openMenu(col); }}
                  style={{
                    padding: '2px 4px', border: 'none', background: 'none', cursor: 'pointer',
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
            onClick={menuPeriod}
            className="btn btn-ghost"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', fontSize: 13, fontWeight: 500,
              width: '100%', justifyContent: 'flex-start',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Clock size={15} style={{ color: 'var(--primary)' }} />
            Review period
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
      <Dialog open={!!dialogPeriod} onClose={() => setDialogPeriod(null)} title="Review Period" width={320}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          How often do you want to review this collection?<br />
          Cards will be scheduled this many days apart after a restore.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>Every</span>
          <input
            type="number" min={1} max={365}
            value={periodDays}
            onChange={e => setPeriodDays(Math.max(1, parseInt(e.target.value) || 1))}
            onKeyDown={e => { if (e.key === 'Enter') handlePeriodSave(); }}
            className="input"
            style={{ width: 80, textAlign: 'center', fontSize: 14, padding: '6px 8px' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>day{periodDays !== 1 ? 's' : ''}</span>
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
