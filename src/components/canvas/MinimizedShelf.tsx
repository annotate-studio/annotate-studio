'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useStore, type Resource } from '@/lib/store';

const typeIcons: Record<string, string> = {
  pdf: 'PDF', note: 'MD', image: 'IMG',
};

export default function MinimizedShelf({ resources }: { resources: Resource[] }) {
  const { toggleResourceState, removeResource } = useStore();

  return (
    <div
      className="glass"
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '8px 16px',
        display: 'flex', gap: 8,
        borderTop: '1px solid var(--border)',
        borderRadius: 0,
        zIndex: 40,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', marginRight: 8 }}>
        Minimized
      </span>
      {resources.map((r) => (
        <div
          key={`min-${r.id}`}
          className="card animate-fade-in"
          onClick={() => toggleResourceState(r.id)}
          style={{
            padding: '6px 12px', borderRadius: 'var(--radius-md)',
            display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', fontSize: 12,
          }}
        >
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 6px',
            borderRadius: 4, background: 'var(--primary-light)', color: 'var(--primary)',
          }}>
            {typeIcons[r.type]}
          </span>
          <span style={{ color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.title}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); removeResource(r.id); }}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center',
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
