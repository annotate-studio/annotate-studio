'use client';

import dynamic from 'next/dynamic';
import Sidebar from '@/components/layout/Sidebar';

const TitleBar = dynamic(() => import('@/components/layout/TitleBar'), { ssr: false });
import CanvasZone from '@/components/canvas/CanvasZone';
import ChatbotZone from '@/components/chatbot/ChatbotZone';
import FlashcardsTab from '@/components/study/FlashcardsTab';
import ExamsTab from '@/components/study/ExamsTab';
import PomodoroTab from '@/components/study/PomodoroTab';
import MotivationTab from '@/components/study/MotivationTab';
import SettingsTab from '@/components/study/SettingsTab';
import { useStore } from '@/lib/store';
import { useEffect, useRef } from 'react';

export default function Home() {
  const { currentView, loadSettingsFromDisk } = useStore();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadSettingsFromDisk();
  }, [loadSettingsFromDisk]);

  const isCanvas = currentView === 'canvas';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* CanvasZone is ALWAYS mounted to preserve PDF/viewer state */}
          <div style={{ position: 'absolute', inset: 0, visibility: isCanvas ? 'visible' : 'hidden', pointerEvents: isCanvas ? 'auto' : 'none' }}>
            <CanvasZone />
          </div>
          {/* Other views render on top when active */}
          {!isCanvas && (
            <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
              {currentView === 'flashcards' && <FlashcardsTab />}
              {currentView === 'exams' && <ExamsTab />}
              {currentView === 'pomodoro' && <PomodoroTab />}
              {currentView === 'motivation' && <MotivationTab />}
              {currentView === 'settings' && <SettingsTab />}
            </div>
          )}
          {isCanvas && <ChatbotZone />}
        </main>
      </div>
    </div>
  );
}
