'use client';

import React, { useEffect, useState } from 'react';
import { Copy, Minus, Pause, Play, Square, Timer, X } from 'lucide-react';
import { isTauri } from '@/lib/tauri-commands';
import { useIsClient } from '@/components/ui/Portal';
import { flushAll } from '@/lib/persist';
import { useApp } from '@/store/app';
import { activeWorkspace, useCanvas } from '@/store/canvas';
import { usePomodoro } from '@/store/pomodoro';
import { cn, formatDuration } from '@/lib/utils';

async function currentWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

function PomodoroChip() {
  const status = usePomodoro((state) => state.status);
  const phase = usePomodoro((state) => state.phase);
  const remaining = usePomodoro((state) => state.remaining);
  const setView = useApp((state) => state.setView);
  if (status === 'idle') return null;
  return (
    <div className={cn('titlebar-chip', phase === 'focus' ? 'chip-focus' : 'chip-break')}>
      <button type="button" onClick={() => setView('pomodoro')} title="Open Pomodoro">
        <Timer size={12} />
        <span>{formatDuration(remaining)}</span>
      </button>
      <button
        type="button"
        onClick={() => (status === 'running' ? usePomodoro.getState().pause() : usePomodoro.getState().resume())}
        title={status === 'running' ? 'Pause' : 'Resume'}
      >
        {status === 'running' ? <Pause size={11} /> : <Play size={11} />}
      </button>
    </div>
  );
}

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const isClient = useIsClient();
  const desktop = isClient && isTauri();
  const view = useApp((state) => state.currentView);
  const workspaceName = useCanvas((state) => activeWorkspace(state).name);

  useEffect(() => {
    if (!desktop) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void currentWindow().then(async (win) => {
      setMaximized(await win.isMaximized());
      const fn = await win.onResized(async () => setMaximized(await win.isMaximized()));
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-logo" data-tauri-drag-region>
          A
        </span>
        <span data-tauri-drag-region>Annotate Studio</span>
        {view === 'canvas' && (
          <span className="titlebar-context" data-tauri-drag-region>
            {workspaceName}
          </span>
        )}
      </div>
      <div className="titlebar-center" data-tauri-drag-region>
        <PomodoroChip />
      </div>
      {desktop && (
        <div className="window-controls">
          <button type="button" onClick={() => void currentWindow().then((win) => win.minimize())} title="Minimize">
            <Minus size={14} />
          </button>
          <button type="button" onClick={() => void currentWindow().then((win) => win.toggleMaximize())} title={maximized ? 'Restore' : 'Maximize'}>
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button
            type="button"
            className="window-close"
            onClick={async () => {
              await Promise.race([flushAll(), new Promise((resolve) => setTimeout(resolve, 4000))]);
              const win = await currentWindow();
              await win.close();
            }}
            title="Close"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </header>
  );
}
