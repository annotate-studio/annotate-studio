'use client';

import React, { useRef, useState } from 'react';
import { BookOpenCheck, Layers, ScrollText, Sparkles } from 'lucide-react';
import Popover from '@/components/ui/Popover';
import { MenuList } from '@/components/ui/ContextMenu';
import { useApp } from '@/store/app';

export default function AiActionsButton({ path, title }: { path: string; title: string; resourceId: string }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const requestChat = useApp((state) => state.requestChat);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="icon-btn icon-btn-sm icon-btn-accent"
        onClick={() => setOpen((v) => !v)}
        title="AI actions"
      >
        <Sparkles size={13} />
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} align="end" width={220}>
        <div className="menu">
          <MenuList
            onDone={() => setOpen(false)}
            items={[
              {
                label: 'Summarize',
                icon: <ScrollText size={13} />,
                onSelect: () => requestChat({ kind: 'summarize', title, path }),
              },
              {
                label: 'Explain step by step',
                icon: <BookOpenCheck size={13} />,
                onSelect: () => requestChat({ kind: 'explain', topic: title, path }),
              },
              {
                label: 'Make flashcards',
                icon: <Layers size={13} />,
                onSelect: () => requestChat({ kind: 'flashcards', title, text: '', path }),
              },
            ]}
          />
        </div>
      </Popover>
    </>
  );
}
