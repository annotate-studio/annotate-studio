'use client';

import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function TitleBar() {
  const appWindow = getCurrentWindow();

  return (
    <div data-tauri-drag-region style={{
      height: 36,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'var(--bg-app)',
      borderBottom: '1px solid var(--border-subtle)',
      flexShrink: 0,
      padding: '0 8px 0 14px',
      userSelect: 'none',
    }}>
      <span style={{
        fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
        letterSpacing: '0.02em',
      }}>
        Annotate Studio
      </span>

      <div style={{
        display: 'flex', gap: 2, alignItems: 'center',
      }}>
        <button
          onClick={() => appWindow.minimize()}
          style={{
            width: 36, height: 28, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-xs)',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          title="Minimize"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          style={{
            width: 36, height: 28, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-xs)',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          title="Maximize"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => appWindow.close()}
          style={{
            width: 36, height: 28, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-xs)',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = 'white'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          title="Close"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
