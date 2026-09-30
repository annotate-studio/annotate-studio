'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Settings2, Sparkles } from 'lucide-react';
import Popover from './Popover';
import { useApp } from '@/store/app';
import { PROVIDER_LABELS, resolveModel, useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { cn } from '@/lib/utils';

interface ModelPickerProps {
  value?: string;
  onChange?: (id: string) => void;
  className?: string;
  align?: 'start' | 'end';
}

export default function ModelPicker({ value, onChange, className, align = 'end' }: ModelPickerProps) {
  const providers = useProviders((state) => state.providers);
  const loaded = useProviders((state) => state.loaded);
  const refresh = useProviders((state) => state.refresh);
  const selectedModel = useSettings((state) => state.selectedModel);
  const update = useSettings((state) => state.update);
  const setView = useApp((state) => state.setView);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const current = value ?? selectedModel;
  const resolved = resolveModel(current, providers);
  const select = onChange ?? ((id: string) => update({ selectedModel: id }));

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={cn('chip-button', className)}
        onClick={() => {
          if (!open) void refresh();
          setOpen((v) => !v);
        }}
        title="Choose AI model"
      >
        <Sparkles size={12} />
        <span className="chip-button-label">{resolved ? resolved.model : 'No model'}</span>
        <ChevronDown size={12} />
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} align={align} width={260}>
        <div className="menu">
          {providers.length === 0 && <div className="menu-empty">No AI providers yet.</div>}
          {providers.map((provider) => {
            const active = resolved?.id === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                className={cn('menu-item', active && 'menu-item-active')}
                onClick={() => {
                  select(provider.id);
                  setOpen(false);
                }}
              >
                <span className="menu-item-icon">{active ? <Check size={13} /> : null}</span>
                <span className="menu-item-label">
                  {provider.model}
                  <small>{PROVIDER_LABELS[provider.type] ?? provider.type}</small>
                </span>
              </button>
            );
          })}
          <div className="menu-separator" />
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              setView('settings');
            }}
          >
            <span className="menu-item-icon">
              <Settings2 size={13} />
            </span>
            <span className="menu-item-label">Manage providers…</span>
          </button>
        </div>
      </Popover>
    </>
  );
}
