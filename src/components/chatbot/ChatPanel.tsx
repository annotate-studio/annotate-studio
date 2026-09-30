'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { Rnd } from 'react-rnd';
import { Bot, PanelBottom, PictureInPicture2, SquarePen, X } from 'lucide-react';
import ChatMessages from './ChatMessages';
import ChatComposer, { type ChatComposerHandle } from './ChatComposer';
import LessonView from './LessonView';
import SessionMenu from './SessionMenu';
import { useChatEngine } from './useChatEngine';
import ModelPicker from '@/components/ui/ModelPicker';
import { useApp } from '@/store/app';
import { useChatSessions, type ChatMessage } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { clamp } from '@/lib/utils';

const EMPTY: ChatMessage[] = [];

export default function ChatPanel({ visible }: { visible: boolean }) {
  const open = useApp((state) => state.chatOpen);
  const setChatOpen = useApp((state) => state.setChatOpen);
  const queued = useApp((state) => state.chatQueue.length);
  const layout = useSettings((state) => state.chatLayout);
  const updateLayout = useSettings((state) => state.updateChatLayout);
  const messages = useChatSessions((state) => state.sessions.find((s) => s.id === state.activeId)?.messages ?? EMPTY);
  const engine = useChatEngine();
  const composerRef = useRef<ChatComposerHandle>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const floatingRef = useRef<Rnd>(null);

  const fitFloating = useCallback(() => {
    const parent = floatingRef.current?.getSelfElement()?.parentElement;
    if (!parent) return;
    const bounds = parent.getBoundingClientRect();
    if (bounds.width < 50 || bounds.height < 50) return;
    const current = useSettings.getState().chatLayout;
    const width = Math.round(Math.min(current.width, Math.max(340, bounds.width - 16)));
    const height = Math.round(Math.min(current.height, Math.max(360, bounds.height - 16)));
    const x = Math.round(clamp(current.x, 0, Math.max(0, bounds.width - width)));
    const y = Math.round(clamp(current.y, 0, Math.max(0, bounds.height - height)));
    if (x !== current.x || y !== current.y || width !== current.width || height !== current.height) {
      updateLayout({ x, y, width, height });
    }
  }, [updateLayout]);

  const floatingShown = visible && open && layout.detached;
  useEffect(() => {
    if (!floatingShown) return;
    fitFloating();
    window.addEventListener('resize', fitFloating);
    return () => window.removeEventListener('resize', fitFloating);
  }, [floatingShown, fitFloating]);

  useEffect(() => {
    void useChatSessions.getState().hydrate();
  }, []);

  useEffect(() => {
    if (queued === 0) return;
    const next = useApp.getState().chatQueue[0];
    if (!next || (next.kind !== 'draft' && engine.isBusy())) return;
    const request = useApp.getState().consumeChatRequest();
    if (!request) return;
    switch (request.kind) {
      case 'draft':
        engine.setLesson(null);
        requestAnimationFrame(() => composerRef.current?.setDraft(request.text));
        break;
      case 'summarize':
        engine.setLesson(null);
        void engine.summarize(request.title, request.path, request.text);
        break;
      case 'explain':
        void engine.explain(request.topic, { context: request.context, path: request.path });
        break;
      case 'flashcards':
        engine.setLesson(null);
        void engine.makeFlashcards({
          text: request.text || undefined,
          path: request.path,
          title: request.title,
          announce: `Make flashcards from ${request.title}`,
        });
        break;
    }
  }, [queued, engine]);

  if (!visible) return null;

  if (!open) return null;

  const startDockResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const dock = dockRef.current;
    const parent = dock?.parentElement;
    if (!dock || !parent) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = dock.getBoundingClientRect().height;
    const maxHeight = parent.getBoundingClientRect().height - 160;
    let next = startHeight;
    const onMove = (e: PointerEvent) => {
      next = Math.round(Math.min(maxHeight, Math.max(200, startHeight - (e.clientY - startY))));
      dock.style.height = `${next}px`;
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      updateLayout({ dockedHeight: next });
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  };

  const panel = (
    <div className="chat-panel">
      <div className="chat-header chat-drag-handle">
        <span className="chat-header-icon">
          <Bot size={16} />
        </span>
        <SessionMenu store={useChatSessions} label="Chat" />
        <div className="chat-header-spacer" />
        <ModelPicker />
        <button type="button" className="icon-btn" onClick={() => useChatSessions.getState().createSession()} title="New chat">
          <SquarePen size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => updateLayout({ detached: !layout.detached })}
          title={layout.detached ? 'Dock to the bottom' : 'Pop out as a floating window'}
        >
          {layout.detached ? <PanelBottom size={15} /> : <PictureInPicture2 size={15} />}
        </button>
        <button type="button" className="icon-btn" onClick={() => setChatOpen(false)} title="Close">
          <X size={15} />
        </button>
      </div>
      {engine.lesson ? (
        <LessonView lesson={engine.lesson} onChange={engine.setLesson} onAsk={(question) => void engine.askLesson(question)} />
      ) : (
        <>
          <ChatMessages
            messages={messages}
            busy={engine.busy}
            status={engine.status}
            onRetry={(id) => {
              if (!engine.isBusy()) void engine.retry(id);
            }}
            onOpenLesson={engine.openLesson}
            emptyHint={
              <>
                <Bot size={30} strokeWidth={1.5} />
                <strong>Study assistant</strong>
                <span>Ask a question, type @ to attach a PDF or note, or select text in a PDF and choose “Ask AI”.</span>
              </>
            }
          />
          <ChatComposer ref={composerRef} engine={engine} />
        </>
      )}
    </div>
  );

  if (layout.detached) {
    return (
      <Rnd
        ref={floatingRef}
        className="chat-floating"
        bounds="parent"
        dragHandleClassName="chat-drag-handle"
        cancel=".icon-btn, .session-button, .chip-button"
        position={{ x: layout.x, y: layout.y }}
        size={{ width: layout.width, height: layout.height }}
        minWidth={340}
        minHeight={360}
        onDragStop={(_event, data) => updateLayout({ x: Math.round(data.x), y: Math.round(data.y) })}
        onResizeStop={(_event, _direction, element, _delta, position) =>
          updateLayout({
            width: element.offsetWidth,
            height: element.offsetHeight,
            x: Math.round(position.x),
            y: Math.round(position.y),
          })
        }
      >
        {panel}
      </Rnd>
    );
  }

  return (
    <div ref={dockRef} className="chat-dock" style={{ height: layout.dockedHeight }}>
      <div className="chat-dock-resizer" onPointerDown={startDockResize} />
      {panel}
    </div>
  );
}
