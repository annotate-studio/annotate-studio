'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'success' | 'error' | 'warning' | 'info' | 'pending';
  children: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

const statusStyles = {
  success: 'bg-[var(--success-light)] text-[var(--success)]',
  error: 'bg-[var(--danger-light)] text-[var(--danger)]',
  warning: 'bg-[var(--warning-light)] text-[var(--warning)]',
  info: 'bg-[var(--primary-light)] text-[var(--primary)]',
  pending: 'bg-[var(--bg-surface)] text-[var(--text-muted)]',
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
};

export default function StatusBadge({
  status,
  children,
  size = 'sm',
  className = '',
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-pill)] font-medium whitespace-nowrap',
        statusStyles[status],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
}
