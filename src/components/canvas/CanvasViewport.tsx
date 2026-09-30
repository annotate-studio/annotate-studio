'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FilePlus2, ImagePlus, LayoutGrid, Lock, NotebookPen, Unlock, Upload } from 'lucide-react';
import CanvasWindow from './CanvasWindow';
import Minimap from './Minimap';
import MinimizedDock from './MinimizedDock';
import { openContextMenu } from '@/components/ui/ContextMenu';
import { activeWorkspace, screenToWorld, useActiveWorkspace, useCanvas, type CanvasStore } from '@/store/canvas';
import { useApp } from '@/store/app';
import { webviewZoomFactor } from '@/store/settings';
import { isTauri } from '@/lib/tauri-commands';
import { createNewNote, importBrowserFiles, importPaths, pickAndImport } from '@/lib/workspace-actions';
import { cn, isEditableTarget, isModalOpen } from '@/lib/utils';
import { dispatchWindowKey, isContentWindow, setContentWindow } from '@/lib/window-keys';

function gridStep(zoom: number): number {
  let step = 24 * zoom;
  while (step < 12) step *= 4;
  return step;
}

function wheelDelta(event: WheelEvent, pageSize: number): { dx: number; dy: number } {
  const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageSize : 1;
  return { dx: event.deltaX * factor, dy: event.deltaY * factor };
}

function isBackground(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-window-id], [data-canvas-ui], button, a, input, textarea')) return false;
  return target.closest('[data-canvas-surface]') !== null;
}

function isFrozen(state: CanvasStore): boolean {
  return state.locked || activeWorkspace(state).resources.some((r) => r.maximized && !r.minimized);
}

function dropPointToClient(position: { x: number; y: number }): { x: number; y: number } {
  const physical = /Windows/i.test(navigator.userAgent);
  const divisor = physical ? window.devicePixelRatio || 1 : webviewZoomFactor();
  return { x: position.x / divisor, y: position.y / divisor };
}

export default function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const movingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const spaceRef = useRef(false);
  const panPointer = useRef<number | null>(null);
  const workspace = useActiveWorkspace();
  const locked = useCanvas((state) => state.locked);
  const hydrated = useCanvas((state) => state.hydrated);
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const view = workspace.view;
  const visible = useMemo(() => workspace.resources.filter((r) => !r.minimized), [workspace.resources]);
  const maximized = visible.some((r) => r.maximized);

  const markMoving = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    world.classList.add('is-moving');
    if (movingTimer.current) clearTimeout(movingTimer.current);
    movingTimer.current = setTimeout(() => world.classList.remove('is-moving'), 180);
  }, []);

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const current = activeWorkspace(useCanvas.getState()).view;
    if (!rect) return { x: 0, y: 0 };
    return screenToWorld(current, { x: clientX - rect.left, y: clientY - rect.top });
  }, []);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      useCanvas.getState().setViewport({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const state = useCanvas.getState();
      const current = activeWorkspace(state);
      const frozen = isFrozen(state);
      const { dx, dy } = wheelDelta(event, element.clientHeight);
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (frozen) return;
        const rect = element.getBoundingClientRect();
        const factor = Math.min(2, Math.max(0.5, Math.exp(-dy * 0.0018)));
        state.zoomAt(current.view.zoom * factor, { x: event.clientX - rect.left, y: event.clientY - rect.top });
        markMoving();
        return;
      }
      if (!isBackground(event.target) || frozen) return;
      event.preventDefault();
      const horizontal = event.shiftKey && dx === 0;
      state.panBy(-(horizontal ? dy : dx), -(horizontal ? 0 : dy));
      markMoving();
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [markMoving]);

  const startPan = useCallback(
    (event: React.PointerEvent) => {
      const state = useCanvas.getState();
      if (panPointer.current !== null || isFrozen(state)) return false;
      const element = containerRef.current;
      if (!element) return false;
      event.preventDefault();
      const pointerId = event.pointerId;
      panPointer.current = pointerId;
      element.setPointerCapture(pointerId);
      const start = { x: event.clientX, y: event.clientY };
      const origin = activeWorkspace(state).view;
      let frame = 0;
      let latest = start;
      setPanning(true);
      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        latest = { x: e.clientX, y: e.clientY };
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          useCanvas.getState().setView({ x: origin.x + latest.x - start.x, y: origin.y + latest.y - start.y, zoom: origin.zoom });
          markMoving();
        });
      };
      const onEnd = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        if (frame) cancelAnimationFrame(frame);
        useCanvas.getState().setView({ x: origin.x + latest.x - start.x, y: origin.y + latest.y - start.y, zoom: origin.zoom });
        element.removeEventListener('pointermove', onMove);
        element.removeEventListener('pointerup', onEnd);
        element.removeEventListener('pointercancel', onEnd);
        panPointer.current = null;
        setPanning(false);
      };
      element.addEventListener('pointermove', onMove);
      element.addEventListener('pointerup', onEnd);
      element.addEventListener('pointercancel', onEnd);
      return true;
    },
    [markMoving],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (useApp.getState().currentView !== 'canvas' || event.defaultPrevented || isModalOpen()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.dialog-overlay, .popover, .context-menu')) return;
      const state = useCanvas.getState();
      const focusedWindow = target?.closest('[data-window-id]')?.getAttribute('data-window-id') ?? null;
      const windowId = focusedWindow ?? state.selectedId;
      if (dispatchWindowKey(windowId, event, focusedWindow !== null || isContentWindow(windowId))) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (isEditableTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const current = activeWorkspace(state);
      const frozen = isFrozen(state);
      let handled = true;
      if (event.code === 'Space' && !mod) {
        if (!event.repeat) {
          spaceRef.current = true;
          setSpaceHeld(true);
        }
      } else if (mod && key === 'z' && !event.shiftKey) state.undo();
      else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) state.redo();
      else if (mod && (key === '=' || key === '+')) {
        if (!frozen) state.zoomAt(current.view.zoom * 1.2);
      } else if (mod && key === '-') {
        if (!frozen) state.zoomAt(current.view.zoom / 1.2);
      } else if (mod && key === '0') {
        if (!frozen) state.resetZoom();
      } else if (event.shiftKey && !mod && event.code === 'Digit1' && !frozen) state.fitToContent();
      else if (event.shiftKey && !mod && event.code === 'Digit2' && !frozen && state.selectedId) state.fitToContent([state.selectedId]);
      else if (key === 'escape') {
        if (current.resources.some((r) => r.maximized)) state.exitMaximize();
        else if (state.selectedId) state.select(null);
        else handled = false;
      } else if (mod && event.altKey && key === 'n') void createNewNote();
      else handled = false;
      if (handled) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && spaceRef.current) {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    const onBlur = () => {
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (useApp.getState().currentView !== 'canvas' || isEditableTarget(event.target)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-window-id], .dialog-overlay, .popover')) return;
      const images = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
      const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
      if (images.length > 0) {
        event.preventDefault();
        const renamed = images.map(
          (file, index) => new File([file], `Pasted image ${stamp}${index ? ` ${index + 1}` : ''}.${file.type.split('/')[1] || 'png'}`, { type: file.type }),
        );
        void importBrowserFiles(renamed);
        return;
      }
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (text.trim()) {
        event.preventDefault();
        const firstLine = text.trim().split('\n')[0].replace(/^#+\s*/, '').trim();
        void createNewNote({ title: firstLine.slice(0, 48) || 'Pasted note', content: text });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import('@tauri-apps/api/webview').then(({ getCurrentWebview }) =>
      getCurrentWebview()
        .onDragDropEvent((event) => {
          const view = useApp.getState().currentView;
          if (view !== 'canvas' && view !== 'library') return;
          const payload = event.payload;
          if (payload.type === 'enter' || payload.type === 'over') setDropActive(true);
          else if (payload.type === 'leave') setDropActive(false);
          else if (payload.type === 'drop') {
            setDropActive(false);
            if (payload.paths.length === 0) return;
            const point = dropPointToClient(payload.position);
            const world = clientToWorld(point.x, point.y);
            void importPaths(payload.paths, view === 'canvas' ? world : undefined);
          }
        })
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        }),
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [clientToWorld]);

  const onPointerDownCapture = (event: React.PointerEvent) => {
    if (!spaceRef.current || event.button !== 0) return;
    if (startPan(event)) event.stopPropagation();
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button === 1) {
      startPan(event);
      return;
    }
    if (event.button !== 0 || !isBackground(event.target)) return;
    setContentWindow(null);
    useCanvas.getState().select(null);
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    startPan(event);
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    if (!isBackground(event.target) || locked) return;
    const point = clientToWorld(event.clientX, event.clientY);
    void createNewNote({ at: { x: point.x - 24, y: point.y - 18 } });
  };

  const onContextMenu = (event: React.MouseEvent) => {
    if (!isBackground(event.target)) return;
    const world = clientToWorld(event.clientX, event.clientY);
    const state = useCanvas.getState();
    openContextMenu(event, [
      { label: 'New note here', icon: <NotebookPen size={13} />, shortcut: 'Double-click', onSelect: () => void createNewNote({ at: world }) },
      { label: 'Import PDF…', icon: <FilePlus2 size={13} />, onSelect: () => void pickAndImport('pdf', world) },
      { label: 'Import image…', icon: <ImagePlus size={13} />, onSelect: () => void pickAndImport('image', world) },
      'separator',
      { label: 'Fit all windows', icon: <LayoutGrid size={13} />, shortcut: 'Shift+1', onSelect: () => state.fitToContent() },
      { label: 'Reset zoom', shortcut: 'Ctrl+0', onSelect: () => state.resetZoom() },
      {
        label: state.locked ? 'Unlock canvas' : 'Lock canvas',
        icon: state.locked ? <Unlock size={13} /> : <Lock size={13} />,
        onSelect: () => state.setLocked(!state.locked),
      },
    ]);
  };

  const step = gridStep(view.zoom);

  return (
    <div
      ref={containerRef}
      className={cn('canvas-viewport', panning && 'is-panning', spaceHeld && 'is-space', locked && 'is-locked', maximized && 'has-maximized')}
      data-canvas-surface
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDropActive(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.target === containerRef.current) setDropActive(false);
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files);
        setDropActive(false);
        if (files.length === 0) return;
        event.preventDefault();
        void importBrowserFiles(files, clientToWorld(event.clientX, event.clientY));
      }}
    >
      <div
        className="canvas-grid"
        style={{ backgroundSize: `${step}px ${step}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      />
      <div ref={worldRef} className="canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {workspace.resources.map((resource) => (
          <CanvasWindow key={resource.id} resource={resource} />
        ))}
      </div>

      {hydrated && visible.length === 0 && (
        <div className="canvas-empty">
          <LayoutGrid size={40} strokeWidth={1.4} />
          <h2>Your study canvas</h2>
          <p>Bring your PDFs, notes and images together and arrange them freely.</p>
          <div className="canvas-empty-actions">
            <button type="button" className="btn btn-primary" onClick={() => void pickAndImport('pdf')}>
              <FilePlus2 size={15} /> Import PDF
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void createNewNote()}>
              <NotebookPen size={15} /> New note
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void pickAndImport('image')}>
              <ImagePlus size={15} /> Image
            </button>
          </div>
          <ul className="canvas-hints">
            <li>Drop files anywhere or paste an image</li>
            <li>Double-click the canvas for a quick note</li>
            <li>
              Drag the background or hold <kbd>Space</kbd> to pan · <kbd>Ctrl</kbd> + scroll to zoom
            </li>
          </ul>
        </div>
      )}

      {locked && !maximized && (
        <button type="button" className="canvas-locked" onClick={() => useCanvas.getState().setLocked(false)}>
          <Lock size={12} /> Canvas locked — click to unlock
        </button>
      )}

      {!maximized && <Minimap />}
      <MinimizedDock />

      {dropActive && (
        <div className="drop-overlay">
          <Upload size={28} />
          <span>Drop to add to your canvas</span>
        </div>
      )}
    </div>
  );
}
