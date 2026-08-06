'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps {
  value: string | number;
  onChange: (value: string | number) => void;
  options: SelectOption[];
  title?: string;
  style?: React.CSSProperties;
}

export default function Select({ value, onChange, options, title, style }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? String(value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(
    (v: string | number) => {
      onChange(v);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={title}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontFamily: 'inherit', lineHeight: 1.5,
          padding: '2px 4px', borderRadius: 'var(--radius-xs)',
          background: 'var(--bg-surface)', color: 'var(--text-primary)',
          border: '1px solid var(--border)', cursor: 'pointer', outline: 'none',
          whiteSpace: 'nowrap', minWidth: 40,
        }}
      >
        {label}
        <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 1200,
            marginTop: 2, minWidth: '100%',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px var(--bg-overlay)',
            overflow: 'hidden',
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              style={{
                display: 'block', width: '100%',
                padding: '4px 8px', fontSize: 10, fontFamily: 'inherit',
                textAlign: 'left', background: opt.value === value ? 'var(--primary-light)' : 'transparent',
                color: 'var(--text-primary)', border: 'none', cursor: 'pointer',
                outline: 'none',
              }}
              onMouseEnter={(e) => { if (opt.value !== value) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              onMouseLeave={(e) => { if (opt.value !== value) e.currentTarget.style.background = 'transparent'; }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
