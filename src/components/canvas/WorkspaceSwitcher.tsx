'use client';

import React, { useRef, useState } from 'react';
import { Check, ChevronDown, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import Popover from '@/components/ui/Popover';
import { useCanvas } from '@/store/canvas';
import { confirmDialog, promptDialog } from '@/store/dialogs';
import { cn } from '@/lib/utils';

export default function WorkspaceSwitcher() {
  const workspaces = useCanvas((state) => state.workspaces);
  const activeId = useCanvas((state) => state.activeWorkspaceId);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  const create = async () => {
    setOpen(false);
    const name = await promptDialog({ title: 'New workspace', placeholder: 'e.g. Organic Chemistry', confirmLabel: 'Create' });
    if (name) useCanvas.getState().createWorkspace(name);
  };

  const rename = async (id: string, current: string) => {
    setOpen(false);
    const name = await promptDialog({ title: 'Rename workspace', initialValue: current, confirmLabel: 'Rename' });
    if (name) useCanvas.getState().renameWorkspace(id, name);
  };

  const remove = async (id: string, name: string, count: number) => {
    setOpen(false);
    const ok = await confirmDialog({
      title: `Delete “${name}”?`,
      message:
        count > 0
          ? `Its ${count} window${count > 1 ? 's' : ''} will be removed from the canvas. Your files stay in the library.`
          : 'This empty workspace will be removed.',
      confirmLabel: 'Delete workspace',
      danger: true,
    });
    if (ok) useCanvas.getState().deleteWorkspace(id);
  };

  return (
    <>
      <button ref={anchorRef} type="button" className="toolbar-btn workspace-btn" onClick={() => setOpen((v) => !v)} title="Workspaces">
        <Layers size={14} />
        <span className="workspace-name">{active?.name ?? 'Workspace'}</span>
        <ChevronDown size={13} />
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={280}>
        <div className="menu">
          <div className="menu-heading">Workspaces</div>
          {workspaces.map((workspace) => {
            const isActive = workspace.id === activeId;
            return (
              <div key={workspace.id} className={cn('menu-row', isActive && 'menu-item-active')}>
                <button
                  type="button"
                  className="menu-item menu-row-main"
                  onClick={() => {
                    useCanvas.getState().switchWorkspace(workspace.id);
                    setOpen(false);
                  }}
                >
                  <span className="menu-item-icon">{isActive ? <Check size={13} /> : null}</span>
                  <span className="menu-item-label">
                    {workspace.name}
                    <small>
                      {workspace.resources.length} window{workspace.resources.length === 1 ? '' : 's'}
                    </small>
                  </span>
                </button>
                <button type="button" className="icon-btn icon-btn-sm" onClick={() => void rename(workspace.id, workspace.name)} title="Rename">
                  <Pencil size={12} />
                </button>
                {workspaces.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm icon-btn-danger"
                    onClick={() => void remove(workspace.id, workspace.name, workspace.resources.length)}
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
          <div className="menu-separator" />
          <button type="button" className="menu-item" onClick={() => void create()}>
            <span className="menu-item-icon">
              <Plus size={13} />
            </span>
            <span className="menu-item-label">New workspace</span>
          </button>
        </div>
      </Popover>
    </>
  );
}
