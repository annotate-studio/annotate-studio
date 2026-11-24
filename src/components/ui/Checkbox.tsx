'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  readOnly?: boolean;
  label?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  title?: string;
  tabIndex?: number;
  'aria-label'?: string;
}

export default function Checkbox({
  checked,
  onChange,
  disabled = false,
  readOnly = false,
  label,
  className,
  size = 'md',
  title,
  tabIndex,
  'aria-label': ariaLabel,
}: CheckboxProps) {
  const control = (
    <span className={cn('ui-checkbox', `ui-checkbox-${size}`, checked && 'ui-checkbox-checked', disabled && 'ui-checkbox-disabled', readOnly && 'ui-checkbox-readonly')}>
      <input
        type="checkbox"
        className="ui-checkbox-input"
        checked={checked}
        disabled={disabled}
        readOnly={readOnly}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        onChange={readOnly ? undefined : (event) => onChange?.(event.target.checked)}
      />
      <span className="ui-checkbox-box" aria-hidden="true">
        <Check size={size === 'sm' ? 10 : 12} strokeWidth={3} className="ui-checkbox-mark" />
      </span>
    </span>
  );

  if (label === undefined) {
    return (
      <span className={cn('ui-checkbox-wrap', className)} title={title}>
        {control}
      </span>
    );
  }

  return (
    <label className={cn('checkbox-row', disabled && 'checkbox-row-disabled', className)} title={title}>
      {control}
      <span className="checkbox-row-label">{label}</span>
    </label>
  );
}
