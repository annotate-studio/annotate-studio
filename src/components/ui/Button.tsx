'use client';

import React from 'react';

interface ButtonProps {
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  variant?: 'ghost' | 'primary' | 'danger' | 'warning';
  size?: 'sm' | 'md';
  className?: string;
  style?: React.CSSProperties;
}

const variantStyles: Record<string, React.CSSProperties> = {
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  primary: {
    background: 'var(--primary)',
    color: 'var(--primary-text)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'transparent',
    color: 'var(--danger)',
    border: '1px solid var(--danger)',
  },
  warning: {
    background: 'var(--warning-light)',
    color: 'var(--warning)',
    border: '1px solid var(--warning)',
  },
};

const activeOverrides: Record<string, React.CSSProperties> = {
  ghost: { background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)' },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { padding: '3px 8px', fontSize: 11 },
  md: { padding: '6px 12px', fontSize: 12 },
};

export default function Button({
  onClick, children, active, disabled, title,
  variant = 'ghost', size = 'sm', className, style,
}: ButtonProps) {
  const base: React.CSSProperties = {
    borderRadius: 'var(--radius-sm)',
    cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', gap: 4,
    fontFamily: 'inherit', lineHeight: 1.5, whiteSpace: 'nowrap',
    transition: 'background 0.1s, color 0.1s, border-color 0.1s',
    opacity: disabled ? 0.4 : 1,
    ...variantStyles[variant],
    ...(active ? activeOverrides[variant] || {} : {}),
    ...sizeStyles[size],
    ...style,
  };

  return (
    <button className={className} onClick={onClick} disabled={disabled} title={title} style={base}>
      {children}
    </button>
  );
}
