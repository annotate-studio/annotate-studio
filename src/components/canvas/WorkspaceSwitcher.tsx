'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Layers, Plus, Pencil, Trash2, Check, ArrowLeft } from 'lucide-react';
import { useStore } from '@/lib/store';
import Dialog from '@/components/ui/Dialog';

type DialogView =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'rename'; id: string; name: string }
  | { mode: 'delete'; id: string; name: string };

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)', color: 'var(--text-primary)',
  outline: 'none', fontFamily: 'inherit',
};

export default function WorkspaceSwitcher() {
  const workspaces = useStore((s) => s.workspaces);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const createWorkspace = useStore((s) => s.createWorkspace);
  const removeWorkspace = useStore((s) => s.removeWorkspace);
  const renameWorkspace = useStore((s) => s.renameWorkspace);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DialogView>({ mode: 'list' });
  const [wsName, setWsName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];

  useEffect(() => {
    if (open && view.mode !== 'list' && inputRef.current) inputRef.current.focus();
  }, [open, view.mode]);

  const goBack = () => setView({ mode: 'list' });

  const handleCreate = () => {
    const name = wsName.trim();
    if (!name) return;
    createWorkspace(name);
    setWsName('');
    setView({ mode: 'list' });
  };

  const handleRename = () => {
    if (view.mode !== 'rename') return;
    const name = wsName.trim();
    if (!name) return;
    renameWorkspace(view.id, name);
    setView({ mode: 'list' });
  };

  const handleDelete = () => {
    if (view.mode !== 'delete') return;
    removeWorkspace(view.id);
    setView({ mode: 'list' });
  };

  const dialogTitle =
    view.mode === 'create' ? 'New Workspace' :
    view.mode === 'rename' ? 'Rename Workspace' :
    view.mode === 'delete' ? 'Delete Workspace' :
    'Workspaces';

  return (
    <>
      <button
        className="btn btn-ghost"
        onClick={() => { setView({ mode: 'list' }); setOpen(true); }}
        style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)',
          display: 'flex', alignItems: 'center', gap: 5,
          color: 'var(--text-secondary)',
        }}
        title="Switch workspace"
      >
        <Layers size={12} />
        <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeWs?.name || 'Default'}
        </span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={dialogTitle} width={380}>
        {view.mode === 'list' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflow: 'auto' }}>
              {workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <div
                    key={ws.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                      background: isActive ? 'var(--primary-light)' : 'transparent',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onClick={() => { setActiveWorkspace(ws.id); setOpen(false); }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Layers size={14} style={{ color: isActive ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{
                      flex: 1, fontSize: 13, fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--primary)' : 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ws.name}
                    </span>
                    {isActive && <Check size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                    <button
                      onClick={(e) => { e.stopPropagation(); setWsName(ws.name); setView({ mode: 'rename', id: ws.id, name: ws.name }); }}
                      style={{ padding: 3, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', borderRadius: 'var(--radius-xs)' }}
                      title="Rename"
                    >
                      <Pencil size={12} />
                    </button>
                    {workspaces.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setView({ mode: 'delete', id: ws.id, name: ws.name }); }}
                        style={{ padding: 3, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', borderRadius: 'var(--radius-xs)' }}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
              <button
                onClick={() => { setWsName(''); setView({ mode: 'create' }); }}
                className="btn btn-ghost"
                style={{
                  width: '100%', fontSize: 12, padding: '7px 12px', borderRadius: 'var(--radius-sm)',
                  display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)',
                  justifyContent: 'flex-start',
                }}
              >
                <Plus size={13} /> New Workspace
              </button>
            </div>
          </>
        )}

        {view.mode === 'create' && (
          <>
            <input
              ref={inputRef}
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Workspace name"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={goBack} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)' }}>Cancel</button>
              <button onClick={handleCreate} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)' }}>Create</button>
            </div>
          </>
        )}

        {view.mode === 'rename' && (
          <>
            <input
              ref={inputRef}
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
              placeholder="Workspace name"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={goBack} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)' }}>Cancel</button>
              <button onClick={handleRename} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)' }}>Rename</button>
            </div>
          </>
        )}

        {view.mode === 'delete' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              Delete workspace <strong>{view.name}</strong>? All materials in this workspace will be removed from the canvas.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={goBack} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)' }}>Cancel</button>
              <button onClick={handleDelete} className="btn" style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--danger)', color: 'white', border: 'none' }}>Delete</button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
