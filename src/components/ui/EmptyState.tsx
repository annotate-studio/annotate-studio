'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  hint?: string;
  children?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  hint,
  children,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={cn('absolute inset-0 flex flex-col items-center justify-center text-[var(--text-muted)] pointer-events-none z-0', className)}>
      {icon && <div className='opacity-20 mb-4'>{icon}</div>}
      <div className='text-sm font-medium text-[var(--text-secondary)] mb-2'>{title}</div>
      {description && <div className='text-xs mb-1'>{description}</div>}
      {hint && <div className='text-xs mt-2 text-[var(--text-muted)]'>{hint}</div>}
      {children}
    </div>
  );
}
