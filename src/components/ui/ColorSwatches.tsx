'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export const ANNOTATION_COLORS = [
  '#1F2937', '#6B7280', '#FFFFFF', '#E44234', '#F97316', '#F59E0B', '#FFCD45', '#22C55E',
  '#10B981', '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#D946EF', '#EC4899',
];

interface ColorSwatchesProps {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
}

export default function ColorSwatches({ value, onChange, colors = ANNOTATION_COLORS }: ColorSwatchesProps) {
  const [custom, setCustom] = useState(value);
  const valid = /^#[0-9a-fA-F]{6}$/.test(custom);
  return (
    <div className="swatches">
      <div className="swatch-grid">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            className={cn('swatch', color.toLowerCase() === value.toLowerCase() && 'swatch-active')}
            style={{ background: color }}
            onClick={() => onChange(color)}
            title={color}
            aria-label={`Use color ${color}`}
          />
        ))}
      </div>
      <div className="swatch-custom">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(event) => {
            setCustom(event.target.value);
            onChange(event.target.value);
          }}
          aria-label="Pick a custom color"
        />
        <input
          className="input input-sm mono"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && valid) onChange(custom);
          }}
          onBlur={() => {
            if (valid) onChange(custom);
          }}
          maxLength={7}
        />
      </div>
    </div>
  );
}
