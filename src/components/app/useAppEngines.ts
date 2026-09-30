'use client';

import { useEffect } from 'react';
import { getStudyStats, isTauri, logStudyActivity } from '@/lib/tauri-commands';
import { flushAll } from '@/lib/persist';
import { notify } from '@/lib/notify';
import { playChime } from '@/lib/sound';
import { isEditableTarget, isModalOpen } from '@/lib/utils';
import { migrateInlineNotes } from '@/lib/workspace-actions';
import { useApp, type ViewMode } from '@/store/app';
import { useCanvas } from '@/store/canvas';
import { isDue, isNewCard, useFlashcards } from '@/store/flashcards';
import { useLibrary } from '@/store/library';
import { usePomodoro, type PomodoroPhase } from '@/store/pomodoro';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';

const PHASE_LABEL: Record<PomodoroPhase, string> = {
  focus: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
};

const VIEW_KEYS: Record<string, ViewMode> = {
  '1': 'canvas',
  '2': 'library',
  '3': 'flashcards',
  '4': 'exams',
  '5': 'pomodoro',
  '6': 'motivation',
  ',': 'settings',
};

let startup: Promise<void> | null = null;

function startApp(): Promise<void> {
  startup ??= (async () => {
    await useSettings.getState().hydrate();
    await Promise.all([useCanvas.getState().hydrate(), useLibrary.getState().refresh()]);
    await migrateInlineNotes();
    void useFlashcards.getState().hydrate();
    void useProviders.getState().refresh();
    usePomodoro.getState().syncDuration();
    void getStudyStats()
      .then((stats) => usePomodoro.getState().seedCompletedToday(stats.today_pomodoro_sessions))
      .catch(() => undefined);
  })();
  return startup;
}

export function useAppEngines() {
  useEffect(() => {
    void startApp();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const completion = usePomodoro.getState().tick();
      if (!completion) return;
      const sound = useSettings.getState().pomodoro.sound;
      playChime(sound);
      const finished = PHASE_LABEL[completion.phase];
      const next = PHASE_LABEL[completion.next];
      const message = completion.autoStarted ? `${next} has started.` : `Time for a ${next.toLowerCase()}.`;
      toast.info(`${finished} complete`, message);
      void notify(`${finished} complete`, message);
      if (completion.phase === 'focus') {
        void logStudyActivity('pomodoro', 'Focus session', completion.durationSeconds).catch(() => undefined);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let lastCheck = Date.now();
    let previousTotal = -1;
    const dueNow = (now: number) => useFlashcards.getState().cards.filter((card) => isDue(card, now)).length;
    const updateBadge = () => {
      if (!useFlashcards.getState().hydrated) return;
      useApp.getState().setDueCards(dueNow(Date.now()));
    };
    const onTimer = () => {
      const { cards, hydrated } = useFlashcards.getState();
      const now = Date.now();
      const since = lastCheck;
      lastCheck = now;
      if (!hydrated) return;
      const total = dueNow(now);
      useApp.getState().setDueCards(total);
      const becameDue = cards.some((card) => {
        if (isNewCard(card)) return false;
        const due = Date.parse(card.next_review);
        return due > since && due <= now;
      });
      const away = document.hidden || !document.hasFocus();
      if (previousTotal === 0 && becameDue && away) {
        void notify('Flashcards are due', `${total} card${total === 1 ? ' is' : 's are'} ready for review.`);
      }
      previousTotal = total;
    };
    updateBadge();
    const unsubscribe = useFlashcards.subscribe((state, previous) => {
      if (state.cards !== previous.cards || state.hydrated !== previous.hydrated) updateBadge();
      if (state.hydrated && !previous.hydrated) previousTotal = dueNow(Date.now());
    });
    const timer = setInterval(onTimer, 60_000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (isModalOpen()) return;
      const view = VIEW_KEYS[event.key];
      if (view && !isEditableTarget(event.target)) {
        event.preventDefault();
        useApp.getState().setView(view);
        return;
      }
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        const app = useApp.getState();
        if (app.currentView !== 'canvas') app.setView('canvas');
        app.setChatOpen(!app.chatOpen || app.currentView !== 'canvas');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      void flushAll();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    let unlisten: (() => void) | undefined;
    let disposed = false;
    if (isTauri()) {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
        getCurrentWindow()
          .onCloseRequested(async () => {
            await Promise.race([flushAll(), new Promise((resolve) => setTimeout(resolve, 4000))]);
          })
          .then((fn) => {
            if (disposed) fn();
            else unlisten = fn;
          }),
      );
    }
    return () => {
      disposed = true;
      window.removeEventListener('beforeunload', onBeforeUnload);
      unlisten?.();
    };
  }, []);
}
