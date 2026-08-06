'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

interface StatusIndicatorProps {
  status: 'success' | 'error' | 'warning' | 'info' | 'loading';
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  className?: string;
}

const statusConfig = {
  success: {
    icon: CheckCircle,
    iconClass: 'text-[var(--success)]',
    bgClass: 'bg-[var(--success-light)]',
    textClass: 'text-[var(--success)]',
  },
  error: {
    icon: XCircle,
    iconClass: 'text-[var(--danger)]',
    bgClass: 'bg-[var(--danger-light)]',
    textClass: 'text-[var(--danger)]',
  },
  warning: {
    icon: AlertCircle,
    iconClass: 'text-[var(--warning)]',
    bgClass: 'bg-[var(--warning-light)]',
    textClass: 'text-[var(--warning)]',
  },
  info: {
    icon: Info,
    iconClass: 'text-[var(--primary)]',
    bgClass: 'bg-[var(--primary-light)]',
    textClass: 'text-[var(--primary)]',
  },
  loading: {
    icon: (props: any) => (
      <div className='w-full h-full rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin' />
    ),
    iconClass: 'text-[var(--primary)]',
    bgClass: 'bg-[var(--primary-light)]',
    textClass: 'text-[var(--primary)]',
  },
};

const sizeConfig = {
  sm: {
    container: 'px-2 py-1 gap-1',
    icon: 'w-3 h-3',
    text: 'text-xs',
  },
  md: {
    container: 'px-3 py-1.5 gap-1.5',
    icon: 'w-4 h-4',
    text: 'text-sm',
  },
  lg: {
    container: 'px-4 py-2 gap-2',
    icon: 'w-5 h-5',
    text: 'text-base',
  },
};

export default function StatusIndicator({
  status,
  size = 'sm',
  message,
  className = '',
}: StatusIndicatorProps) {
  const config = statusConfig[status];
  const sizeStyle = sizeConfig[size];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-[var(--radius-sm)] font-medium',
        sizeStyle.container,
        config.bgClass,
        className
      )}
    >
      <Icon className={sizeStyle.icon + ' ' + config.iconClass} />
      {message && <span className={sizeStyle.text + ' ' + config.textClass}>{message}</span>}
    </div>
  );
}
