'use client';

import React from 'react';

interface IconButtonProps {
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'danger' | 'success' | 'warning';
  title?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

const sizeStyles = {
  xs: 'w-7 h-7',
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
  lg: 'w-10 h-10',
};

const variantStyles = {
  default: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
  danger: 'bg-transparent text-[var(--danger)] hover:bg-[var(--danger-light)]',
  success: 'bg-transparent text-[var(--success)] hover:bg-[var(--success-light)]',
  warning: 'bg-transparent text-[var(--warning)] hover:bg-[var(--warning-light)]',
};

export default function IconButton({
  onClick,
  children,
  size = 'md',
  variant = 'default',
  title,
  disabled = false,
  className = '',
  style,
  'aria-label': ariaLabel,
}: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={style}
      className={`inline-flex items-center justify-center rounded-[var(--radius-xs)] transition-all duration-150 ease-in-out cursor-pointer ${sizeStyles[size]} ${variantStyles[variant]} ${disabled ? 'opacity-40 cursor-default' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
