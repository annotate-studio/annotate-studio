'use client';

import React from 'react';

interface ButtonProps {
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  variant?: 'ghost' | 'primary' | 'danger' | 'warning' | 'secondary';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const variantStyles = {
  ghost: 'bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--primary-light)] hover:text-[var(--primary)]',
  primary: 'bg-[var(--primary)] text-[var(--primary-text)] border border-transparent hover:brightness-90',
  danger: 'bg-transparent text-[var(--danger)] border border-[var(--danger)] hover:bg-[var(--danger-light)]',
  warning: 'bg-[var(--warning-light)] text-[var(--warning)] border border-[var(--warning)] hover:bg-yellow-100',
  secondary: 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-elevated)]',
};

const sizeStyles = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
};

export default function Button({
  onClick,
  children,
  active = false,
  disabled = false,
  title,
  variant = 'ghost',
  size = 'sm',
  className = '',
}: ButtonProps) {
  const activeStyles = active
    ? variant === 'ghost'
      ? 'bg-[var(--primary-light)] text-[var(--primary)] border border-[var(--primary)]'
      : ''
    : '';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] font-medium transition-all duration-150 ease-in-out cursor-pointer ${variantStyles[variant]} ${sizeStyles[size]} ${activeStyles} ${disabled ? 'opacity-40 cursor-default' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
