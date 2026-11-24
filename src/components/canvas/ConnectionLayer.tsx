'use client';

import React, { memo } from 'react';
import { X } from 'lucide-react';
import { useActiveWorkspace, useCanvas, type CanvasConnection, type Resource } from '@/store/canvas';
import { promptDialog } from '@/store/dialogs';

function anchorPoints(a: Resource, b: Resource): { x1: number; y1: number; x2: number; y2: number; cx1: number; cy1: number; cx2: number; cy2: number } {
  const acx = a.x + a.width / 2;
  const acy = a.y + a.height / 2;
  const bcx = b.x + b.width / 2;
  const bcy = b.y + b.height / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;

  let x1: number;
  let y1: number;
  let x2: number;
  let y2: number;

  if (Math.abs(dx) >= Math.abs(dy)) {
    x1 = dx >= 0 ? a.x + a.width : a.x;
    y1 = acy;
    x2 = dx >= 0 ? b.x : b.x + b.width;
    y2 = bcy;
    const bend = Math.max(40, Math.min(180, Math.abs(x2 - x1) * 0.45));
    return {
      x1,
      y1,
      x2,
      y2,
      cx1: x1 + (dx >= 0 ? bend : -bend),
      cy1: y1,
      cx2: x2 + (dx >= 0 ? -bend : bend),
      cy2: y2,
    };
  }

  x1 = acx;
  y1 = dy >= 0 ? a.y + a.height : a.y;
  x2 = bcx;
  y2 = dy >= 0 ? b.y : b.y + b.height;
  const bend = Math.max(40, Math.min(180, Math.abs(y2 - y1) * 0.45));
  return {
    x1,
    y1,
    x2,
    y2,
    cx1: x1,
    cy1: y1 + (dy >= 0 ? bend : -bend),
    cx2: x2,
    cy2: y2 + (dy >= 0 ? -bend : bend),
  };
}

function ConnectionLayer() {
  const workspace = useActiveWorkspace();
  const connections = workspace.connections ?? [];
  if (connections.length === 0) return null;

  const byId = new Map(workspace.resources.filter((r) => !r.minimized).map((r) => [r.id, r]));
  const active: { conn: CanvasConnection; from: Resource; to: Resource }[] = [];
  for (const conn of connections) {
    const from = byId.get(conn.fromId);
    const to = byId.get(conn.toId);
    if (from && to) active.push({ conn, from, to });
  }
  if (active.length === 0) return null;

  const editLabel = async (conn: CanvasConnection) => {
    const label = await promptDialog({
      title: 'Connection label',
      placeholder: 'e.g. proves, contradicts, example of',
      initialValue: conn.label ?? '',
      confirmLabel: 'Save',
    });
    if (label !== null) useCanvas.getState().updateConnection(conn.id, label.trim());
  };

  return (
    <div className="canvas-connections" aria-hidden="false">
      <svg className="canvas-connections-svg">
        <defs>
          <marker id="canvas-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--primary)" />
          </marker>
        </defs>
        {active.map(({ conn, from, to }) => {
          const p = anchorPoints(from, to);
          const d = `M ${p.x1} ${p.y1} C ${p.cx1} ${p.cy1}, ${p.cx2} ${p.cy2}, ${p.x2} ${p.y2}`;
          return <path key={conn.id} d={d} className="canvas-connection-path" markerEnd="url(#canvas-arrow)" />;
        })}
      </svg>
      {active.map(({ conn, from, to }) => {
        const p = anchorPoints(from, to);
        const mx = (p.x1 + p.x2) / 2;
        const my = (p.y1 + p.y2) / 2;
        return (
          <div
            key={conn.id}
            className="canvas-connection-pill"
            style={{ transform: `translate(${mx}px, ${my}px) translate(-50%, -50%)` }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button type="button" className="canvas-connection-label" onClick={() => void editLabel(conn)} title="Edit label">
              {conn.label || 'linked'}
            </button>
            <button
              type="button"
              className="canvas-connection-remove"
              onClick={() => useCanvas.getState().removeConnection(conn.id)}
              title="Remove connection"
              aria-label="Remove connection"
            >
              <X size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default memo(ConnectionLayer);
