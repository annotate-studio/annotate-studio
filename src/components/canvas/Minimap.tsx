'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Map as MapIcon, X } from 'lucide-react';
import { useActiveWorkspace, useCanvas, visibleWorldRect } from '@/store/canvas';
import { cn } from '@/lib/utils';

const WIDTH = 196;
const HEIGHT = 128;

interface MinimapLayout {
  bounds: { x: number; y: number; width: number; height: number };
  scale: number;
  offsetX: number;
  offsetY: number;
}

export default function Minimap() {
  const workspace = useActiveWorkspace();
  const viewport = useCanvas((state) => state.viewport);
  const selectedId = useCanvas((state) => state.selectedId);
  const [collapsed, setCollapsed] = useState(false);
  const [frozen, setFrozen] = useState<MinimapLayout | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragLayout = useRef<MinimapLayout | null>(null);

  const visible = useMemo(() => workspace.resources.filter((r) => !r.minimized), [workspace.resources]);
  const view = workspace.view;
  const viewRect = visibleWorldRect(view, viewport);

  const liveLayout = useMemo((): MinimapLayout => {
    const rects = [...visible, viewRect];
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.width));
    const maxY = Math.max(...rects.map((r) => r.y + r.height));
    const pad = 60;
    const bounds = { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
    const scale = Math.min(WIDTH / bounds.width, HEIGHT / bounds.height);
    const offsetX = (WIDTH - bounds.width * scale) / 2;
    const offsetY = (HEIGHT - bounds.height * scale) / 2;
    return { bounds, scale, offsetX, offsetY };
  }, [visible, viewRect.x, viewRect.y, viewRect.width, viewRect.height]);

  const layout = frozen ?? liveLayout;

  if (visible.length === 0) return null;

  if (collapsed) {
    return (
      <button type="button" data-canvas-ui className="minimap-toggle" onClick={() => setCollapsed(false)} title="Show minimap">
        <MapIcon size={14} />
      </button>
    );
  }

  const project = (r: { x: number; y: number; width: number; height: number }) => ({
    left: layout.offsetX + (r.x - layout.bounds.x) * layout.scale,
    top: layout.offsetY + (r.y - layout.bounds.y) * layout.scale,
    width: Math.max(2, r.width * layout.scale),
    height: Math.max(2, r.height * layout.scale),
  });

  const navigate = (clientX: number, clientY: number, mapping: MinimapLayout) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const worldX = mapping.bounds.x + (clientX - rect.left - mapping.offsetX) / mapping.scale;
    const worldY = mapping.bounds.y + (clientY - rect.top - mapping.offsetY) / mapping.scale;
    const { zoom } = view;
    useCanvas.getState().setView({ x: viewport.width / 2 - worldX * zoom, y: viewport.height / 2 - worldY * zoom, zoom });
  };

  const endDrag = () => {
    dragLayout.current = null;
    setFrozen(null);
  };

  return (
    <div className="minimap" data-canvas-ui onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <div
        ref={surfaceRef}
        className="minimap-surface"
        style={{ width: WIDTH, height: HEIGHT }}
        onPointerDown={(event) => {
          if (event.button !== 0 || useCanvas.getState().locked) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragLayout.current = liveLayout;
          setFrozen(liveLayout);
          navigate(event.clientX, event.clientY, liveLayout);
        }}
        onPointerMove={(event) => {
          const mapping = dragLayout.current;
          if (mapping && event.currentTarget.hasPointerCapture(event.pointerId)) navigate(event.clientX, event.clientY, mapping);
        }}
        onPointerUp={endDrag}
        onLostPointerCapture={endDrag}
      >
        {visible.map((resource) => (
          <div
            key={resource.id}
            className={cn('minimap-window', `minimap-${resource.type}`, resource.id === selectedId && 'minimap-selected')}
            style={project(resource)}
          />
        ))}
        <div className="minimap-viewport" style={project(viewRect)} />
      </div>
      <button type="button" className="minimap-close" onClick={() => setCollapsed(true)} title="Hide minimap">
        <X size={11} />
      </button>
    </div>
  );
}
