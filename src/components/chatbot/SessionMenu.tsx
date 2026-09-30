'use client';

import React, { useRef, useState } from 'react';
import { ChevronDown, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import Popover from '@/components/ui/Popover';
import { confirmDialog, promptDialog } from '@/store/dialogs';
import type { ChatSession, SessionStore } from '@/store/sessions';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { StoreApi, UseBoundStore } from 'zustand';

interface SessionMenuProps {
  store: UseBoundStore<StoreApi<SessionStore>>;
  label: string;
}

export default function SessionMenu({ store, label }: SessionMenuProps) {
  const sessions = store((state) => state.sessions);
  const activeId = store((state) => state.activeId);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const active = sessions.find((s) => s.id === activeId);

  const rename = async (session: ChatSession) => {
    setOpen(false);
    const name = await promptDialog({ title: `Rename ${label.toLowerCase()}`, initialValue: session.name, confirmLabel: 'Rename' });
    if (name) store.getState().renameSession(session.id, name);
  };

  const remove = async (session: ChatSession) => {
    setOpen(false);
    const ok = await confirmDialog({
      title: `Delete “${session.name}”?`,
      message: `${session.messages.length} message${session.messages.length === 1 ? '' : 's'} will be deleted permanently.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) store.getState().deleteSession(session.id);
  };

  return (
    <>
      <button ref={anchorRef} type="button" className="session-button" onClick={() => setOpen((v) => !v)} title={`${label} history`}>
        <MessageSquare size={14} />
        <span dir="auto">{active?.name ?? `New ${label.toLowerCase()}`}</span>
        <ChevronDown size={13} />
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={300}>
        <div className="menu">
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              store.getState().createSession();
              setOpen(false);
            }}
          >
            <span className="menu-item-icon">
              <Plus size={13} />
            </span>
            <span className="menu-item-label">New {label.toLowerCase()}</span>
          </button>
          {sessions.length > 0 && <div className="menu-separator" />}
          <div className="menu-scroll">
            {sessions.map((session) => (
              <div key={session.id} className={cn('menu-row', session.id === activeId && 'menu-item-active')}>
                <button
                  type="button"
                  className="menu-item menu-row-main"
                  onClick={() => {
                    store.getState().switchSession(session.id);
                    setOpen(false);
                  }}
                >
                  <span className="menu-item-label" dir="auto">
                    {session.name}
                    <small>
                      {session.messages.length} message{session.messages.length === 1 ? '' : 's'} · {formatRelativeTime(session.updatedAt)}
                    </small>
                  </span>
                </button>
                <button type="button" className="icon-btn icon-btn-sm" onClick={() => void rename(session)} title="Rename">
                  <Pencil size={12} />
                </button>
                <button type="button" className="icon-btn icon-btn-sm icon-btn-danger" onClick={() => void remove(session)} title="Delete">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}
