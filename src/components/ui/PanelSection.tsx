'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface PanelSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export default function PanelSection({
  title,
  children,
  className = '',
  action,
}: PanelSectionProps) {
  return (
    <div className={cn('card p-5', className)}>
      {title && (
        <div className='flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-subtle)]'>
          <h3 className='text-base font-semibold text-[var(--text-primary)]'>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
