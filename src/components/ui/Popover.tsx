'use client';

import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import Portal, { pushEscapeHandler } from './Portal';
import { cn } from '@/lib/utils';

interface PopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
  width?: number;
}

export default function Popover({ anchorRef, open, onClose, children, align = 'start', className, width }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const panel = ref.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      let left = align === 'end' ? anchor.right - panel.width : anchor.left;
      left = Math.max(8, Math.min(left, window.innerWidth - panel.width - 8));
      let top = anchor.bottom + 6;
      if (top + panel.height > window.innerHeight - 8) top = Math.max(8, anchor.top - panel.height - 6);
      setPosition({ left, top });
    };
    place();
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [open, anchorRef, align]);

  useEffect(() => {
    if (!open) return;
    const release = pushEscapeHandler(() => closeRef.current());
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchorRef.current?.contains(target)) return;
      closeRef.current();
    };
    const onResize = () => closeRef.current();
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', onResize);
    return () => {
      release();
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, anchorRef]);

  if (!open) return null;
  return (
    <Portal>
      <div
        ref={ref}
        className={cn('popover', className)}
        style={{ left: position?.left ?? -9999, top: position?.top ?? -9999, width, visibility: position ? 'visible' : 'hidden' }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </Portal>
  );
}
