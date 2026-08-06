'use client';

import dynamic from 'next/dynamic';
import Sidebar from '@/components/layout/Sidebar';

const TitleBar = dynamic(() => import('@/components/layout/TitleBar'), { ssr: false });
import CanvasZone from '@/components/canvas/CanvasZone';
import ChatbotZone from '@/components/chatbot/ChatbotZone';
import FlashcardsTab from '@/components/study/FlashcardsTab';
import ExamsTab from '@/components/study/ExamsTab';
import DocumentsTab from '@/components/study/DocumentsTab';
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

  const renderView = () => {
    switch (currentView) {
      case 'canvas': return <CanvasZone />;
      case 'flashcards': return <FlashcardsTab />;
      case 'exams': return <ExamsTab />;
      case 'documents': return <DocumentsTab />;
      case 'pomodoro': return <PomodoroTab />;
      case 'motivation': return <MotivationTab />;
      case 'settings': return <SettingsTab />;
      default: return <CanvasZone />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {renderView()}
          {currentView === 'canvas' && <ChatbotZone />}
        </main>
      </div>
    </div>
  );
}
