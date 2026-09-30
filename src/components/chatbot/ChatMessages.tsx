'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpenCheck, Check, Copy, FileText, Layers, RotateCcw } from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import type { ChatMessage } from '@/store/sessions';
import { useApp } from '@/store/app';
import { copyText, cn, isRtlText } from '@/lib/utils';

interface ChatMessagesProps {
  messages: ChatMessage[];
  busy: boolean;
  status: string | null;
  onRetry: (id: string) => void;
  onOpenLesson: (topic: string, steps: string[]) => void;
  emptyHint: React.ReactNode;
}

const MessageBubble = memo(function MessageBubble({
  message,
  onRetry,
  onOpenLesson,
}: {
  message: ChatMessage;
  onRetry: (id: string) => void;
  onOpenLesson: (topic: string, steps: string[]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const setView = useApp((state) => state.setView);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (message.role === 'user') {
    return (
      <div className="chat-row chat-row-user">
        <div className="chat-bubble chat-bubble-user content-selectable" dir={isRtlText(message.content) ? 'rtl' : 'ltr'}>
          {message.content}
          {message.attachments && message.attachments.length > 0 && (
            <div className="chat-bubble-attachments">
              {message.attachments.map((name) => (
                <span key={name}>
                  <FileText size={11} /> {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-row chat-row-assistant">
      <div className={cn('chat-bubble chat-bubble-assistant content-selectable', message.error && 'chat-bubble-error')}>
        {message.error && (
          <div className="chat-error-title">
            <AlertTriangle size={14} /> {message.stopped ? 'Stopped' : 'Something went wrong'}
          </div>
        )}
        <MarkdownRenderer content={message.content} />
        {message.explainer && (
          <button type="button" className="chip-button chip-button-primary" onClick={() => onOpenLesson(message.explainer!.topic, message.explainer!.steps)}>
            <BookOpenCheck size={13} /> Open lesson
          </button>
        )}
        {message.flashcards && (
          <button type="button" className="chip-button chip-button-success" onClick={() => setView('flashcards')}>
            <Layers size={13} /> Review in Flashcards
          </button>
        )}
        <div className="chat-bubble-actions">
          {message.error ? (
            <button type="button" onClick={() => onRetry(message.id)} title="Try again">
              <RotateCcw size={12} /> Retry
            </button>
          ) : (
            <button type="button" onClick={() => void copyText(message.content).then(setCopied)} title="Copy">
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default function ChatMessages({ messages, busy, status, onRetry, onOpenLesson, emptyHint }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && stickRef.current) element.scrollTop = element.scrollHeight;
  }, [messages, busy, status]);

  return (
    <div
      ref={scrollRef}
      className="chat-messages"
      onScroll={(event) => {
        const element = event.currentTarget;
        stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}
    >
      {messages.length === 0 && !busy && <div className="chat-empty">{emptyHint}</div>}
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} onRetry={onRetry} onOpenLesson={onOpenLesson} />
      ))}
      {busy && (
        <div className="chat-row chat-row-assistant">
          <div className="chat-typing">
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>
            {status && <span>{status}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
