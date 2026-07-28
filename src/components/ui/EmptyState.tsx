'use client';

import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  hint?: string;
  children?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, hint, children }: EmptyStateProps) {
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      textAlign: 'center', color: 'var(--text-muted)',
      pointerEvents: 'none', zIndex: 0,
    }}>
      {icon && <div style={{ opacity: 0.2, margin: '0 auto 16px' }}>{icon}</div>}
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {title}
      </div>
      {description && <div style={{ fontSize: 12 }}>{description}</div>}
      {hint && <div style={{ fontSize: 11, marginTop: 8, color: 'var(--text-muted)' }}>{hint}</div>}
      {children}
    </div>
  );
}
