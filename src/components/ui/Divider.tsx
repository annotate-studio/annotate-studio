'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export default function Divider({ vertical, style }: { vertical?: boolean; style?: React.CSSProperties }) {
  return (
    <div
      className={cn(
        'flex-shrink-0',
        vertical ? 'w-px h-4 bg-[var(--border)] mx-2' : 'h-px w-full bg-[var(--border)] my-2'
      )}
      style={style}
    />
  );
}
