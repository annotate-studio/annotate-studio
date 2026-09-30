'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import TitleBar from '@/components/layout/TitleBar';
import Sidebar from '@/components/layout/Sidebar';
import Toaster from '@/components/ui/Toaster';
import DialogHost from '@/components/ui/DialogHost';
import ContextMenuHost from '@/components/ui/ContextMenu';
import { useAppEngines } from '@/components/app/useAppEngines';
import { useApp } from '@/store/app';
import { cn } from '@/lib/utils';

const CanvasZone = dynamic(() => import('@/components/canvas/CanvasZone'), { ssr: false });
const ChatPanel = dynamic(() => import('@/components/chatbot/ChatPanel'), { ssr: false });
const LibraryTab = dynamic(() => import('@/components/study/LibraryTab'), { ssr: false });
const FlashcardsTab = dynamic(() => import('@/components/study/flashcards/FlashcardsTab'), { ssr: false });
const ExamsTab = dynamic(() => import('@/components/study/exams/ExamsTab'), { ssr: false });
const PomodoroTab = dynamic(() => import('@/components/study/PomodoroTab'), { ssr: false });
const MotivationTab = dynamic(() => import('@/components/study/MotivationTab'), { ssr: false });
const SettingsTab = dynamic(() => import('@/components/study/SettingsTab'), { ssr: false });

export default function Home() {
  useAppEngines();
  const view = useApp((state) => state.currentView);
  const onCanvas = view === 'canvas';

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <div className="view-stack">
            <div className={cn('view', onCanvas ? 'view-visible' : 'view-hidden')} aria-hidden={!onCanvas}>
              <CanvasZone />
            </div>
            {!onCanvas && (
              <div className="view view-visible view-scroll">
                {view === 'library' && <LibraryTab />}
                {view === 'flashcards' && <FlashcardsTab />}
                {view === 'exams' && <ExamsTab />}
                {view === 'pomodoro' && <PomodoroTab />}
                {view === 'motivation' && <MotivationTab />}
                {view === 'settings' && <SettingsTab />}
              </div>
            )}
          </div>
          <ChatPanel visible={onCanvas} />
        </main>
      </div>
      <Toaster />
      <DialogHost />
      <ContextMenuHost />
    </div>
  );
}
