'use client';

import React, { useMemo } from 'react';
import { FileText, Image as ImageIcon, NotebookPen, X } from 'lucide-react';
import { useActiveWorkspace, useCanvas } from '@/store/canvas';

const ICONS = {
  pdf: <FileText size={13} />,
  note: <NotebookPen size={13} />,
  image: <ImageIcon size={13} />,
};

export default function MinimizedDock() {
  const workspace = useActiveWorkspace();
  const minimized = useMemo(() => workspace.resources.filter((r) => r.minimized), [workspace.resources]);
  if (minimized.length === 0) return null;
  return (
    <div className="minimized-dock" data-canvas-ui onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      {minimized.map((resource) => (
        <div key={resource.id} className={`dock-chip dock-chip-${resource.type}`}>
          <button type="button" className="dock-chip-main" onClick={() => useCanvas.getState().focusResource(resource.id)} title={`Restore ${resource.title}`}>
            {ICONS[resource.type]}
            <span dir="auto">{resource.title}</span>
          </button>
          <button type="button" className="dock-chip-close" onClick={() => useCanvas.getState().closeResource(resource.id)} title="Close">
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
