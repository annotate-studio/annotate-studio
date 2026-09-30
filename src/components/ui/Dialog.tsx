'use client';

import React, { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import Portal, { pushEscapeHandler, stopPropagation } from './Portal';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
  dismissable?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
}

export default function Dialog({ open, onClose, title, children, footer, width = 440, className, dismissable = true }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissableRef = useRef(dismissable);
  dismissableRef.current = dismissable;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const release = pushEscapeHandler(() => {
      if (dismissableRef.current) closeRef.current();
    });
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ??
        panel.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button.btn-primary:not([disabled])') ??
        panel;
      target.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const overlays = document.querySelectorAll('.dialog-overlay');
      if (overlays[overlays.length - 1] !== panel.parentElement) return;
      const active = document.activeElement;
      if (active instanceof Element && !panel.contains(active) && active.closest('.popover, .context-menu')) return;
      const items = focusableIn(panel);
      event.preventDefault();
      if (items.length === 0) {
        panel.focus();
        return;
      }
      const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : index < 0 || index === items.length - 1 ? 0 : index + 1;
      items[next].focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      release();
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <Portal>
      <div
        className="dialog-overlay"
        onPointerDown={(event) => {
          event.stopPropagation();
          if (dismissable && event.target === event.currentTarget) onClose();
        }}
        onClick={stopPropagation}
        onDoubleClick={stopPropagation}
        onContextMenu={stopPropagation}
        onKeyDown={stopPropagation}
        onWheel={stopPropagation}
      >
        <div
          ref={panelRef}
          className={cn('dialog', className)}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          style={{ width }}
        >
          <div className="dialog-header">
            <h2>{title}</h2>
            {dismissable && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                <X size={15} />
              </button>
            )}
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-footer">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}
