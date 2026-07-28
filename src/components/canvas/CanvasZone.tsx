'use client';

import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { Plus, Columns3, Rows3, Minus, LayoutGrid, ZoomIn, ZoomOut, Lock, Unlock, FileImage } from 'lucide-react';
import { useStore } from '@/lib/store';
import ResourceWindow from './ResourceWindow';
import MinimizedShelf from './MinimizedShelf';

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;

const MemoizedResourceWindow = React.memo(ResourceWindow);
const MemoizedMinimizedShelf = React.memo(MinimizedShelf);

export default function CanvasZone() {
  const resources = useStore((s) => s.resources);
  const canvasView = useStore((s) => s.canvasView);
  const canvasLoaded = useStore((s) => s.canvasLoaded);
  const canvasLocked = useStore((s) => s.canvasLocked);
  const chatbotOpen = useStore((s) => s.chatbotOpen);
  const chatbotHeight = useStore((s) => s.chatbotHeight);
  const addResource = useStore((s) => s.addResource);
  const setCanvasView = useStore((s) => s.setCanvasView);
  const loadCanvasFromDisk = useStore((s) => s.loadCanvasFromDisk);
  const saveCanvasToDisk = useStore((s) => s.saveCanvasToDisk);
  const setDocuments = useStore((s) => s.setDocuments);
  const arrangeResources = useStore((s) => s.arrangeResources);
  const minimizeAllResources = useStore((s) => s.minimizeAllResources);
  const setCanvasLocked = useStore((s) => s.setCanvasLocked);
  const setSelectedResource = useStore((s) => s.setSelectedResource);

  const canvasRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const loadedRef = useRef(false);
  const mountCountRef = useRef(0);
  const panStart = useRef({ x: 0, y: 0, viewX: 0, viewY: 0 });
  const chatHeightRef = useRef(chatbotHeight);
  const [chatPadding, setChatPadding] = useState('0px');

  useEffect(() => {
    mountCountRef.current += 1;
    console.log('[CanvasZone] mount #' + mountCountRef.current);
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadCanvasFromDisk();
    }
    return () => {
      console.log('[CanvasZone] unmount #' + mountCountRef.current);
    };
  }, [loadCanvasFromDisk]);

  // Debounced save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!canvasLoaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveCanvasToDisk(), 1000);
    return () => clearTimeout(saveTimer.current);
  }, [resources, canvasView, canvasLoaded, saveCanvasToDisk]);

  // Chat bottom padding with no transition during pan
  useEffect(() => {
    chatHeightRef.current = chatbotHeight;
    requestAnimationFrame(() => setChatPadding(chatbotOpen ? `${chatbotHeight}vh` : '0px'));
  }, [chatbotOpen, chatbotHeight]);

  const anyFullscreen = useMemo(() => resources.some((r) => r.isFullscreen), [resources]);

  useEffect(() => {
    if (anyFullscreen) {
      setCanvasLocked(true);
      setCanvasView({ x: 0, y: 0, zoom: 1 });
    }
  }, [anyFullscreen]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (canvasLocked) return;
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, viewX: canvasView.x, viewY: canvasView.y };
      const el = canvasRef.current;
      if (el) {
        el.style.cursor = 'grabbing';
        el.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
    }
  }, [canvasLocked, canvasView.x, canvasView.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setCanvasView({
      x: panStart.current.viewX + dx,
      y: panStart.current.viewY + dy,
      zoom: canvasView.zoom,
    });
  }, [setCanvasView, canvasView.zoom]);

  const handlePointerUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = '';
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (canvasLocked) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const v = canvasView;
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom + delta));
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) { setCanvasView({ ...v, zoom: newZoom }); return; }
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setCanvasView({
      x: mx - (mx - v.x) * (newZoom / v.zoom),
      y: my - (my - v.y) * (newZoom / v.zoom),
      zoom: newZoom,
    });
  }, [canvasLocked, canvasView, setCanvasView]);

  const handleArrange = useCallback((layout: 'splitH' | 'splitV') => {
    arrangeResources(layout);
    setCanvasView({ x: 0, y: 0, zoom: 1 });
    setCanvasLocked(true);
  }, [arrangeResources, setCanvasLocked, setCanvasView]);

  const handleMinimizeAll = useCallback(() => {
    minimizeAllResources();
    setCanvasLocked(false);
  }, [minimizeAllResources, setCanvasLocked]);

  const toggleLock = useCallback(() => {
    setCanvasLocked(!canvasLocked);
    if (!canvasLocked) setCanvasView({ x: 0, y: 0, zoom: 1 });
  }, [canvasLocked, setCanvasLocked, setCanvasView]);

  const importFile = useCallback(async (file: File, index: number) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isPdf = file.type === 'application/pdf' || ext === 'pdf';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
    const isMd = ext === 'md' || ext === 'markdown' || file.type === 'text/markdown';
    const type = isPdf ? 'pdf' as const : isImage ? 'image' as const : 'note' as const;
    const dir = isMd ? 'notes' : 'documents';
    const relativePath = `${dir}/${file.name}`;
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const chunk = 8192;
      let binary = '';
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(binary);
      if (isPdf || isImage) {
        const { saveFileBinary } = await import('@/lib/tauri-commands');
        await saveFileBinary(file.name, b64, dir);
      } else {
        const { saveFile } = await import('@/lib/tauri-commands');
        await saveFile(file.name, await file.text(), dir);
      }
      addResource({
        id: crypto.randomUUID(), type, title: file.name,
        filePath: relativePath,
        content: type === 'note' ? await file.text() : undefined,
        state: 'maximized',
        position: { x: 200 + index * 30, y: 200 + index * 30 },
        zIndex: Date.now() + index,
      });
      const { getAllFiles } = await import('@/lib/tauri-commands');
      getAllFiles().then(setDocuments).catch(() => {});
    } catch {}
  }, [addResource, setDocuments]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files) as File[];
    files.forEach((file, i) => importFile(file, i));
    setCanvasLocked(false);
  }, [importFile, setCanvasLocked]);

  const addNewPdf = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.onchange = (e: any) => { const file = e.target?.files?.[0]; if (file) importFile(file, 0); };
    input.click();
  }, [importFile]);

  const addNewNote = useCallback(() => {
    addResource({
      id: crypto.randomUUID(), type: 'note', title: 'Untitled.md',
      content: '# New Note\n\nStart writing...',
      state: 'maximized', position: { x: 200 + Math.random() * 300, y: 200 + Math.random() * 300 },
      zIndex: Date.now(),
    });
    setCanvasLocked(false);
  }, [addResource, setCanvasLocked]);

  const addNewImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,.jpg,.jpeg,.gif,.webp,.svg,image/*';
    input.multiple = true;
    input.onchange = (e: any) => {
      (Array.from(e.target?.files || []) as File[]).forEach((file, i) => importFile(file, i));
    };
    input.click();
  }, [importFile]);

  const maximizedResources = useMemo(
    () => resources.filter((r) => r.state === 'maximized' && !r.isFullscreen),
    [resources]
  );
  const fullscreenResources = useMemo(
    () => resources.filter((r) => r.state === 'maximized' && r.isFullscreen),
    [resources]
  );
  const minimizedResources = useMemo(
    () => resources.filter((r) => r.state === 'minimized'),
    [resources]
  );
  const hasWindows = maximizedResources.length > 0 || fullscreenResources.length > 0;
  const zoomPercent = Math.round(canvasView.zoom * 100);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) setSelectedResource(null);
  }, [setSelectedResource]);

  return (
    <div
      ref={canvasRef}
      style={{
        width: '100%', height: '100%', position: 'relative',
        overflow: 'hidden', cursor: canvasLocked ? 'default' : 'grab',
        background: 'var(--bg-app)',
        paddingBottom: chatPadding,
        userSelect: 'none',
        contain: 'layout style',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={handleCanvasClick}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 31,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-app)',
        height: 44,
      }}>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={addNewPdf}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={12} /> PDF
          </button>
          <button className="btn btn-ghost" onClick={addNewImage}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileImage size={12} /> Image
          </button>
          <button className="btn btn-ghost" onClick={addNewNote}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={12} /> Note
          </button>
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }} />
        {hasWindows && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <button onClick={() => handleArrange('splitH')} className="btn btn-ghost"
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)' }} title="Split horizontally">
              <Columns3 size={13} />
            </button>
            <button onClick={() => handleArrange('splitV')} className="btn btn-ghost"
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)' }} title="Split vertically">
              <Rows3 size={13} />
            </button>
            <button onClick={handleMinimizeAll} className="btn btn-ghost"
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', color: 'var(--danger)' }} title="Minimize all">
              <Minus size={13} />
            </button>
          </div>
        )}
        {hasWindows && <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }} />}
        <button className="btn btn-ghost" onClick={toggleLock}
          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 4, color: canvasLocked ? 'var(--warning)' : 'var(--text-muted)' }}
          title={canvasLocked ? 'Unlock canvas' : 'Lock canvas'}>
          {canvasLocked ? <Lock size={12} /> : <Unlock size={12} />}
          {canvasLocked ? 'Locked' : 'Free'}
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={() => setCanvasView({ ...canvasView, zoom: Math.min(ZOOM_MAX, canvasView.zoom + ZOOM_STEP) })}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 'var(--radius-sm)' }} title="Zoom in">
            <ZoomIn size={13} />
          </button>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {zoomPercent}%
          </span>
          <button className="btn btn-ghost" onClick={() => setCanvasView({ ...canvasView, zoom: Math.max(ZOOM_MIN, canvasView.zoom - ZOOM_STEP) })}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 'var(--radius-sm)' }} title="Zoom out">
            <ZoomOut size={13} />
          </button>
          <button className="btn btn-ghost" onClick={() => setCanvasView({ x: 0, y: 0, zoom: 1 })}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)' }} title="Reset view">
            Fit
          </button>
        </div>
      </div>

      {resources.length === 0 && canvasLoaded && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center', color: 'var(--text-muted)',
          pointerEvents: 'none', zIndex: 0,
        }}>
          <LayoutGrid size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>Your study canvas</div>
          <div style={{ fontSize: 12 }}>Drop PDFs, images, or markdown files here</div>
          <div style={{ fontSize: 11, marginTop: 8, color: 'var(--text-muted)' }}>Alt+drag or middle-click to pan · Ctrl+scroll to zoom</div>
        </div>
      )}

      {!canvasLoaded && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--text-muted)', fontSize: 13 }}>
          Loading canvas...
        </div>
      )}

      {fullscreenResources.map((resource) => (
        <div key={`fs-${resource.id}`} style={{
          position: 'absolute', top: 44, left: 0, right: 0, bottom: 0,
          zIndex: 30, borderRadius: 0, overflow: 'hidden',
          background: 'var(--bg-card)', border: 'none',
          contain: 'strict',
        }}>
          <MemoizedResourceWindow resource={resource} />
        </div>
      ))}

      <div data-stage
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          transform: `translate(${canvasView.x}px, ${canvasView.y}px) scale(${canvasView.zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
          contain: 'layout style',
        }}
      >
        <div style={{ position: 'relative', width: 10000, height: 10000 }}>
          {maximizedResources.map((resource) => (
            <MemoizedResourceWindow key={`max-${resource.id}`} resource={resource} />
          ))}
        </div>
      </div>

      {canvasLocked && !anyFullscreen && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          zIndex: 35, padding: '6px 14px', borderRadius: 'var(--radius-pill)',
          background: 'var(--warning-light)', color: 'var(--warning)',
          fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--warning)', pointerEvents: 'none',
        }}>
          <Lock size={11} /> Locked — click Unlock to pan/zoom
        </div>
      )}

      {minimizedResources.length > 0 && (
        <MemoizedMinimizedShelf resources={minimizedResources} />
      )}
    </div>
  );
}
