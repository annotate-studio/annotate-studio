'use client';

import React, { useEffect } from 'react';
import IconButton from './IconButton';
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
        <div className='flex items-center justify-between px-4 py-3.5 border-b border-[var(--border)]'>
          <span className='text-sm font-semibold text-[var(--text-primary)]'>{title}</span>
          <IconButton onClick={onClose} variant='default' size='sm' aria-label='Close'>
            <X size={14} />
          </IconButton>
        </div>
        <div className='px-4 py-4'>{children}</div>
      </div>
    </div>
  );
}
