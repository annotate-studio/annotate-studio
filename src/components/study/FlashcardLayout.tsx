'use client';

import React from 'react';
import FlashcardSidebar from './FlashcardSidebar';

export default function FlashcardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flashcard-layout" style={{
      display: 'flex', height: '100%', overflow: 'hidden',
    }}>
      <div className="flashcard-sidebar-area" style={{
        width: 240, flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <FlashcardSidebar />
      </div>
      <div className="flashcard-main" style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}
