'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}

export default function Dialog({ open, onClose, title, children, width = 400 }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
      className='fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)]'
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className='card w-full max-w-[90vw] overflow-hidden'
        style={{ width }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '16px 18px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
