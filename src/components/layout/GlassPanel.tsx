'use client';

import React from 'react';

interface GlassPanelProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
}

export default function GlassPanel({
  children,
  style,
  className = '',
  ...rest
}: GlassPanelProps) {
  return (
    <div
      className={`glass ${className}`}
      style={{
        borderRadius: 'var(--radius-xl)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
