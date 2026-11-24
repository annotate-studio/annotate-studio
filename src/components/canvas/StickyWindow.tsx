'use client';

import React, { memo, useState } from 'react';
import { Eye, PenLine } from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import { activeWorkspace, useCanvas, type StickyColor } from '@/store/canvas';
import { cn } from '@/lib/utils';

const COLORS: { id: StickyColor; hex: string; label: string }[] = [
  { id: 'yellow', hex: '#fde68a', label: 'Yellow' },
  { id: 'blue', hex: '#bfdbfe', label: 'Blue' },
  { id: 'green', hex: '#bbf7d0', label: 'Green' },
  { id: 'pink', hex: '#fbcfe8', label: 'Pink' },
  { id: 'purple', hex: '#ddd6fe', label: 'Purple' },
];

function StickyWindow({ resourceId }: { resourceId: string }) {
  const content = useCanvas((state) => activeWorkspace(state).resources.find((r) => r.id === resourceId)?.content ?? '');
  const color = useCanvas((state) => activeWorkspace(state).resources.find((r) => r.id === resourceId)?.stickyColor ?? 'yellow');
  const [preview, setPreview] = useState(false);

  const setContent = (value: string) => useCanvas.getState().updateResource(resourceId, { content: value }, false);
  const setColor = (stickyColor: StickyColor) => useCanvas.getState().updateResource(resourceId, { stickyColor }, false);

  return (
    <div className={cn('sticky-window', `sticky-${color}`)}>
      <div className="sticky-toolbar" data-no-drag>
        <div className="sticky-swatches">
          {COLORS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={cn('sticky-swatch', color === entry.id && 'sticky-swatch-active')}
              style={{ background: entry.hex }}
              onClick={() => setColor(entry.id)}
              title={entry.label}
              aria-label={entry.label}
            />
          ))}
        </div>
        <button
          type="button"
          className={cn('tool-btn', preview && 'tool-btn-active')}
          onClick={() => setPreview((v) => !v)}
          title={preview ? 'Edit takeaway' : 'Render Markdown / LaTeX'}
        >
          {preview ? <PenLine size={13} /> : <Eye size={13} />}
        </button>
      </div>
      <div className="sticky-body content-selectable">
        {preview ? (
          content.trim() ? (
            <MarkdownRenderer content={content} />
          ) : (
            <span className="muted">Empty takeaway card</span>
          )
        ) : (
          <textarea
            className="sticky-textarea"
            dir="auto"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write a key takeaway, definition, or $formula$…"
          />
        )}
      </div>
    </div>
  );
}

export default memo(StickyWindow);
