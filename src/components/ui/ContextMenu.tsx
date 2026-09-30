'use client';

import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import Portal, { pushEscapeHandler } from './Portal';

export type MenuEntry =
  | {
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | 'separator';

interface ContextMenuState {
  menu: { x: number; y: number; items: MenuEntry[] } | null;
  open: (x: number, y: number, items: MenuEntry[]) => void;
  close: () => void;
}

export const useContextMenu = create<ContextMenuState>((set) => ({
  menu: null,
  open: (x, y, items) => set({ menu: { x, y, items } }),
  close: () => set({ menu: null }),
}));

export function openContextMenu(
  event: { clientX: number; clientY: number; currentTarget?: EventTarget | null; preventDefault: () => void; stopPropagation: () => void },
  items: MenuEntry[],
) {
  event.preventDefault();
  event.stopPropagation();
  if (event.clientX === 0 && event.clientY === 0 && event.currentTarget instanceof Element) {
    const rect = event.currentTarget.getBoundingClientRect();
    useContextMenu.getState().open(rect.left, rect.bottom + 4, items);
    return;
  }
  useContextMenu.getState().open(event.clientX, event.clientY, items);
}

export function MenuList({ items, onDone }: { items: MenuEntry[]; onDone: () => void }) {
  return (
    <>
      {items.map((item, index) =>
        item === 'separator' ? (
          <div key={`sep-${index}`} className="menu-separator" />
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            className={item.danger ? 'menu-item menu-item-danger' : 'menu-item'}
            disabled={item.disabled}
            onClick={() => {
              onDone();
              item.onSelect();
            }}
          >
            <span className="menu-item-icon">{item.icon}</span>
            <span className="menu-item-label">{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </>
  );
}

export default function ContextMenuHost() {
  const menu = useContextMenu((state) => state.menu);
  const close = useContextMenu((state) => state.close);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) {
      setPosition(null);
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const left = Math.min(menu.x, window.innerWidth - rect.width - 8);
    const top = menu.y + rect.height > window.innerHeight - 8 ? Math.max(8, menu.y - rect.height) : menu.y;
    setPosition({ left: Math.max(8, left), top });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const release = pushEscapeHandler(close);
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onBlur = () => close();
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      release();
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [menu, close]);

  if (!menu) return null;
  return (
    <Portal>
      <div
        ref={ref}
        className="menu context-menu"
        role="menu"
        style={{ left: position?.left ?? menu.x, top: position?.top ?? menu.y, visibility: position ? 'visible' : 'hidden' }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <MenuList items={menu.items} onDone={close} />
      </div>
    </Portal>
  );
}
