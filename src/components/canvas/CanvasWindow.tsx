'use client';

import React, { memo, useCallback, useRef, useState } from 'react';
import {
  Copy,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Minus,
  NotebookPen,
  Pencil,
  ScanSearch,
  X,
} from 'lucide-react';
import {
  activeWorkspace,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  useCanvas,
  type Resource,
} from '@/store/canvas';
import { openContextMenu, type MenuEntry } from '@/components/ui/ContextMenu';
import { promptDialog } from '@/store/dialogs';
import { renameFile } from '@/lib/workspace-actions';
import { baseName, copyText, cn, stripExtension } from '@/lib/utils';
import { setContentWindow } from '@/lib/window-keys';
import { toast } from '@/store/toast';
import PdfWindow from './PdfWindow';
import NoteWindow from './NoteWindow';
import ImageWindow from './ImageWindow';
import AiActionsButton from './AiActionsButton';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

const TYPE_ICONS = {
  pdf: <FileText size={14} />,
  note: <NotebookPen size={14} />,
  image: <ImageIcon size={14} />,
};

function currentZoom(): number {
  return activeWorkspace(useCanvas.getState()).view.zoom;
}

function snap(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / 20) * 20 : Math.round(value);
}

const WindowBody = memo(function WindowBody({
  id,
  type,
  filePath,
  title,
  selected,
}: {
  id: string;
  type: Resource['type'];
  filePath?: string;
  title: string;
  selected: boolean;
}) {
  if (!filePath) {
    return <div className="cw-empty">This window has no file attached.</div>;
  }
  if (type === 'pdf') return <PdfWindow resourceId={id} path={filePath} title={title} active={selected} />;
  if (type === 'note') return <NoteWindow resourceId={id} path={filePath} title={title} />;
  return <ImageWindow path={filePath} title={title} />;
});

function CanvasWindow({ resource }: { resource: Resource }) {
  const selected = useCanvas((state) => state.selectedId === resource.id);
  const maximizedView = useCanvas((state) => (resource.maximized ? activeWorkspace(state).view : null));
  const maximizedViewport = useCanvas((state) => (resource.maximized ? state.viewport : null));
  const frameRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<'dragging' | 'resizing' | null>(null);

  const activate = useCallback(() => {
    const state = useCanvas.getState();
    if (state.selectedId !== resource.id) state.select(resource.id);
    state.bringToFront(resource.id);
  }, [resource.id]);

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    setContentWindow(null);
    if (event.button !== 0 || resource.maximized) return;
    if ((event.target as Element).closest('button, input, textarea, [data-no-drag]')) return;
    const frame = frameRef.current;
    if (!frame) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const zoom = currentZoom();
    const start = { x: event.clientX, y: event.clientY };
    const origin = { x: resource.x, y: resource.y };
    let next = origin;
    let moved = false;

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved) {
        moved = true;
        setInteraction('dragging');
      }
      next = { x: snap(origin.x + dx / zoom, e.shiftKey), y: snap(origin.y + dy / zoom, e.shiftKey) };
      frame.style.transform = `translate(${next.x}px, ${next.y}px)`;
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      if (!moved) return;
      setInteraction(null);
      useCanvas.getState().setResourceRect(resource.id, next);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>, edge: Handle) => {
    setContentWindow(null);
    if (event.button !== 0) return;
    const frame = frameRef.current;
    if (!frame) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    activate();
    const zoom = currentZoom();
    const start = { x: event.clientX, y: event.clientY };
    const origin = { x: resource.x, y: resource.y, width: resource.width, height: resource.height };
    let next = origin;
    setInteraction('resizing');

    const onMove = (e: PointerEvent) => {
      const dx = (e.clientX - start.x) / zoom;
      const dy = (e.clientY - start.y) / zoom;
      let { x, y, width, height } = origin;
      if (edge.includes('e')) width = Math.max(MIN_WINDOW_WIDTH, origin.width + dx);
      if (edge.includes('s')) height = Math.max(MIN_WINDOW_HEIGHT, origin.height + dy);
      if (edge.includes('w')) {
        width = Math.max(MIN_WINDOW_WIDTH, origin.width - dx);
        x = origin.x + origin.width - width;
      }
      if (edge.includes('n')) {
        height = Math.max(MIN_WINDOW_HEIGHT, origin.height - dy);
        y = origin.y + origin.height - height;
      }
      next = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
      frame.style.transform = `translate(${next.x}px, ${next.y}px)`;
      frame.style.width = `${next.width}px`;
      frame.style.height = `${next.height}px`;
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      setInteraction(null);
      useCanvas.getState().setResourceRect(resource.id, next);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  };

  const rename = async () => {
    const isNote = resource.type === 'note' && resource.filePath;
    const value = await promptDialog({
      title: isNote ? 'Rename note' : 'Rename window',
      initialValue: isNote && resource.filePath ? stripExtension(baseName(resource.filePath)) : resource.title,
      confirmLabel: 'Rename',
    });
    if (!value) return;
    if (isNote && resource.filePath) {
      await renameFile(resource.filePath, value);
    } else {
      useCanvas.getState().updateResource(resource.id, { title: value }, true);
    }
  };

  const showMenu = (event: React.MouseEvent) => {
    const canvas = useCanvas.getState();
    const items: MenuEntry[] = [
      { label: 'Rename…', icon: <Pencil size={13} />, onSelect: rename },
      {
        label: resource.maximized ? 'Restore size' : 'Maximize',
        icon: resource.maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />,
        onSelect: () => canvas.toggleMaximize(resource.id),
      },
      { label: 'Minimize', icon: <Minus size={13} />, onSelect: () => canvas.toggleMinimize(resource.id) },
      { label: 'Zoom to window', icon: <ScanSearch size={13} />, onSelect: () => canvas.fitToContent([resource.id]) },
    ];
    if (resource.filePath) {
      items.push({
        label: 'Copy file path',
        icon: <Copy size={13} />,
        onSelect: () => void copyText(resource.filePath ?? '').then((ok) => ok && toast.success('Path copied')),
      });
    }
    items.push('separator', { label: 'Close', icon: <X size={13} />, danger: true, onSelect: () => canvas.closeResource(resource.id) });
    openContextMenu(event, items);
  };

  const style: React.CSSProperties =
    resource.maximized && maximizedView && maximizedViewport
      ? {
          transform: `translate(${-maximizedView.x / maximizedView.zoom}px, ${-maximizedView.y / maximizedView.zoom}px) scale(${1 / maximizedView.zoom})`,
          transformOrigin: '0 0',
          width: maximizedViewport.width,
          height: maximizedViewport.height,
          zIndex: 1_000_000,
        }
      : {
          transform: `translate(${resource.x}px, ${resource.y}px)`,
          width: resource.width,
          height: resource.height,
          zIndex: resource.z,
        };

  return (
    <div
      ref={frameRef}
      className={cn(
        'cw',
        `cw-${resource.type}`,
        selected && 'cw-selected',
        resource.maximized && 'cw-maximized',
        resource.minimized && 'cw-minimized',
        interaction && `cw-${interaction}`,
      )}
      style={style}
      inert={resource.minimized || undefined}
      aria-hidden={resource.minimized || undefined}
      data-window-id={resource.id}
      data-window-type={resource.type}
      data-active={selected ? 'true' : undefined}
      onPointerDownCapture={activate}
    >
      <header
        className="cw-titlebar"
        onPointerDown={startDrag}
        onDoubleClick={(event) => {
          if ((event.target as Element).closest('button')) return;
          useCanvas.getState().toggleMaximize(resource.id);
        }}
        onContextMenu={showMenu}
      >
        <span className="cw-icon">{TYPE_ICONS[resource.type]}</span>
        <span className="cw-title" title={resource.filePath ?? resource.title} dir="auto">
          {resource.title}
        </span>
        <div className="cw-actions" data-no-drag>
          {resource.filePath && resource.type !== 'image' && (
            <AiActionsButton path={resource.filePath} title={resource.title} resourceId={resource.id} />
          )}
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={() => useCanvas.getState().toggleMinimize(resource.id)}
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={() => useCanvas.getState().toggleMaximize(resource.id)}
            title={resource.maximized ? 'Restore (Esc)' : 'Maximize'}
          >
            {resource.maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-sm icon-btn-danger"
            onClick={() => useCanvas.getState().closeResource(resource.id)}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="cw-body" onPointerDownCapture={() => setContentWindow(resource.id)}>
        <WindowBody
          id={resource.id}
          type={resource.type}
          filePath={resource.filePath}
          title={resource.title}
          selected={selected}
        />
      </div>
      {!resource.maximized &&
        HANDLES.map((edge) => (
          <div key={edge} className={`cw-resize cw-resize-${edge}`} onPointerDown={(event) => startResize(event, edge)} />
        ))}
    </div>
  );
}

export default memo(CanvasWindow);
