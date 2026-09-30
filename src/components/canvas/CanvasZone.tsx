'use client';

import React, { useRef, useState } from 'react';
import {
  Bot,
  Columns3,
  FilePlus2,
  Grid2x2,
  ImagePlus,
  LayoutDashboard,
  Lock,
  Maximize,
  Minus,
  NotebookPen,
  Plus,
  Redo2,
  Rows3,
  Undo2,
  Unlock,
} from 'lucide-react';
import CanvasViewport from './CanvasViewport';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import Popover from '@/components/ui/Popover';
import { MenuList } from '@/components/ui/ContextMenu';
import { useActiveWorkspace, useCanvas } from '@/store/canvas';
import { useApp } from '@/store/app';
import { createNewNote, pickAndImport } from '@/lib/workspace-actions';
import { cn } from '@/lib/utils';

function ArrangeMenu({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const canvas = useCanvas.getState;
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="toolbar-btn"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Arrange windows"
      >
        <LayoutDashboard size={14} />
        <span className="toolbar-label">Arrange</span>
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={220}>
        <div className="menu">
          <MenuList
            onDone={() => setOpen(false)}
            items={[
              { label: 'Side by side', icon: <Columns3 size={13} />, onSelect: () => canvas().arrange('columns') },
              { label: 'Stacked', icon: <Rows3 size={13} />, onSelect: () => canvas().arrange('rows') },
              { label: 'Grid', icon: <Grid2x2 size={13} />, onSelect: () => canvas().arrange('grid') },
              'separator',
              { label: 'Fit all in view', icon: <Maximize size={13} />, shortcut: 'Shift+1', onSelect: () => canvas().fitToContent() },
              { label: 'Minimize all', icon: <Minus size={13} />, onSelect: () => canvas().minimizeAll() },
            ]}
          />
        </div>
      </Popover>
    </>
  );
}

function CanvasToolbar() {
  const workspace = useActiveWorkspace();
  const canUndo = useCanvas((state) => state.past.length > 0);
  const canRedo = useCanvas((state) => state.future.length > 0);
  const locked = useCanvas((state) => state.locked);
  const chatOpen = useApp((state) => state.chatOpen);
  const toggleChat = useApp((state) => state.toggleChat);
  const zoom = workspace.view.zoom;
  const hasWindows = workspace.resources.some((r) => !r.minimized);
  const canvas = useCanvas.getState;

  return (
    <div className="canvas-toolbar">
      <WorkspaceSwitcher />
      <div className="toolbar-divider" />
      <button type="button" className="toolbar-btn" onClick={() => void pickAndImport('pdf')} title="Import PDF">
        <FilePlus2 size={14} />
        <span className="toolbar-label">PDF</span>
      </button>
      <button type="button" className="toolbar-btn" onClick={() => void createNewNote()} title="New note (Ctrl+Alt+N)">
        <NotebookPen size={14} />
        <span className="toolbar-label">Note</span>
      </button>
      <button type="button" className="toolbar-btn" onClick={() => void pickAndImport('image')} title="Import image">
        <ImagePlus size={14} />
        <span className="toolbar-label">Image</span>
      </button>
      <div className="toolbar-divider" />
      <ArrangeMenu disabled={!hasWindows} />
      <button type="button" className="toolbar-btn" onClick={() => canvas().undo()} disabled={!canUndo} title="Undo layout change (Ctrl+Z)">
        <Undo2 size={14} />
      </button>
      <button type="button" className="toolbar-btn" onClick={() => canvas().redo()} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        <Redo2 size={14} />
      </button>
      <div className="toolbar-spacer" />
      <button
        type="button"
        className={cn('toolbar-btn', locked && 'toolbar-btn-warning')}
        onClick={() => canvas().setLocked(!locked)}
        title={locked ? 'Unlock panning and zooming' : 'Lock panning and zooming'}
      >
        {locked ? <Lock size={14} /> : <Unlock size={14} />}
      </button>
      <div className="zoom-control">
        <button type="button" className="toolbar-btn" onClick={() => canvas().zoomAt(zoom / 1.2)} title="Zoom out (Ctrl+-)">
          <Minus size={14} />
        </button>
        <button type="button" className="zoom-value" onClick={() => canvas().resetZoom()} title="Reset to 100% (Ctrl+0)">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className="toolbar-btn" onClick={() => canvas().zoomAt(zoom * 1.2)} title="Zoom in (Ctrl+=)">
          <Plus size={14} />
        </button>
        <button type="button" className="toolbar-btn" onClick={() => canvas().fitToContent()} disabled={!hasWindows} title="Fit all windows (Shift+1)">
          <Maximize size={14} />
        </button>
      </div>
      <div className="toolbar-divider" />
      <button type="button" className={cn('toolbar-btn toolbar-btn-accent', chatOpen && 'toolbar-btn-active')} onClick={toggleChat} title="AI assistant (Ctrl+J)">
        <Bot size={15} />
        <span className="toolbar-label">Assistant</span>
      </button>
    </div>
  );
}

export default function CanvasZone() {
  return (
    <div className="canvas-zone">
      <CanvasToolbar />
      <CanvasViewport />
    </div>
  );
}
