'use client';

import React, { useState, useEffect, useRef } from 'react';

const PRESET_COLORS = [
  '#1a1a1a', '#333333', '#666666', '#999999', '#cccccc',
  '#ffffff', '#EF4444', '#F97316', '#F59E0B', '#22C55E',
  '#10B981', '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1',
  '#8B5CF6', '#A855F7', '#D946EF', '#EC4899', '#F43F5E',
  '#dc2626', '#ea580c', '#d97706', '#16a34a', '#059669',
  '#0d9488', '#0891b2', '#2563EB', '#4f46e5', '#7c3aed',
  '#9333ea', '#c026d3', '#db2777', '#e11d48',
];

interface ColorPickerDialogProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (color: string) => void;
}

export default function ColorPickerDialog({ open, onClose, value, onChange }: ColorPickerDialogProps) {
  const [currentColor, setCurrentColor] = useState(value);
  const [customHex, setCustomHex] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCurrentColor(value);
      setCustomHex(value);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handlePresetClick = (e: React.MouseEvent, color: string) => {
    e.stopPropagation();
    setCurrentColor(color);
    setCustomHex(color);
    onChange(color);
    onClose();
  };

  const handleCustomHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomHex(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setCurrentColor(val);
    }
  };

  const handleApplyCustom = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (/^#[0-9a-fA-F]{6}$/.test(customHex)) {
      onChange(customHex);
      onClose();
    }
  };

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onClick={onClose}
      onPointerDown={stopProp}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 2147483647,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-overlay)',
      }}
    >
      <div
        onClick={stopProp}
        onPointerDown={stopProp}
        className="card"
        style={{
          width: 280, maxWidth: '90vw',
          padding: 0, overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Pick a Color
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 20, height: 20, borderRadius: 4,
              background: currentColor, border: '1px solid var(--border)',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>
              {currentColor}
            </span>
          </div>
        </div>

        <div style={{ padding: '12px 16px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 4, marginBottom: 12,
          }}>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={(e) => handlePresetClick(e, color)}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  border: color === currentColor ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: color, cursor: 'pointer', padding: 0,
                  outline: 'none',
                }}
                title={color}
              />
            ))}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 0', borderTop: '1px solid var(--border)',
          }}>
            <input
              ref={inputRef}
              type="text"
              value={customHex}
              onChange={handleCustomHexChange}
              placeholder="#000000"
              style={{
                flex: 1, padding: '4px 8px', fontSize: 12, fontFamily: 'monospace',
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleApplyCustom}
              disabled={!/^#[0-9a-fA-F]{6}$/.test(customHex)}
              onPointerDown={stopProp}
              className="btn btn-ghost"
              style={{
                padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)',
                background: 'var(--primary)', color: 'var(--primary-text)',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                opacity: /^#[0-9a-fA-F]{6}$/.test(customHex) ? 1 : 0.4,
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
