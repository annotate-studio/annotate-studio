'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const noopSubscribe = () => () => {};

export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export default function Portal({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  if (!isClient) return null;
  return createPortal(children, document.body);
}

const stack: Array<() => void> = [];

export function pushEscapeHandler(handler: () => void): () => void {
  stack.push(handler);
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index >= 0) stack.splice(index, 1);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || stack.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      stack[stack.length - 1]();
    },
    true,
  );
}

export function stopPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}
