'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Send, X } from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import type { LessonState } from './useChatEngine';
import { isRtlText } from '@/lib/utils';

interface LessonViewProps {
  lesson: LessonState;
  onChange: (lesson: LessonState | null) => void;
  onAsk: (question: string) => void;
}

export default function LessonView({ lesson, onChange, onAsk }: LessonViewProps) {
  const [question, setQuestion] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const total = lesson.steps.length;
  const last = lesson.index === total - 1;

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [lesson.index]);

  useEffect(() => {
    const element = bodyRef.current;
    if (element && lesson.thread.length > 0) element.scrollTop = element.scrollHeight;
  }, [lesson.thread.length]);

  const go = (index: number) => onChange({ ...lesson, index: Math.max(0, Math.min(total - 1, index)), thread: [] });

  const ask = () => {
    const text = question.trim();
    if (!text || lesson.asking) return;
    setQuestion('');
    onAsk(text);
  };

  return (
    <div className="lesson">
      <div className="lesson-header">
        <div className="lesson-title">
          <small>
            Part {lesson.index + 1} of {total}
          </small>
          <strong dir="auto">{lesson.topic}</strong>
        </div>
        <button type="button" className="icon-btn" onClick={() => onChange(null)} title="Close lesson">
          <X size={15} />
        </button>
      </div>
      <div className="lesson-progress">
        <div style={{ width: `${((lesson.index + 1) / total) * 100}%` }} />
      </div>
      <div ref={bodyRef} className="lesson-body content-selectable">
        <MarkdownRenderer content={lesson.steps[lesson.index]} />
        {lesson.thread.length > 0 && (
          <div className="lesson-thread">
            {lesson.thread.map((entry, index) => (
              <div key={index} className={`chat-row chat-row-${entry.role}`}>
                <div className={`chat-bubble chat-bubble-${entry.role}`} dir={entry.role === 'user' && isRtlText(entry.content) ? 'rtl' : undefined}>
                  {entry.role === 'user' ? entry.content : <MarkdownRenderer content={entry.content} />}
                </div>
              </div>
            ))}
            {lesson.asking && (
              <div className="chat-row chat-row-assistant">
                <div className="chat-typing">
                  <span className="typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="lesson-ask">
        <input
          className="input"
          value={question}
          dir="auto"
          placeholder="Ask about this part…"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              ask();
            }
          }}
        />
        <button type="button" className="send-btn" onClick={ask} disabled={!question.trim() || lesson.asking} title="Ask">
          <Send size={14} />
        </button>
      </div>
      <div className="lesson-nav">
        <button type="button" className="btn btn-ghost" onClick={() => go(lesson.index - 1)} disabled={lesson.index === 0}>
          <ArrowLeft size={14} /> Previous
        </button>
        <div className="lesson-dots">
          {lesson.steps.map((_, index) => (
            <button key={index} type="button" className={index === lesson.index ? 'active' : undefined} onClick={() => go(index)} aria-label={`Part ${index + 1}`} />
          ))}
        </div>
        {last ? (
          <button type="button" className="btn btn-primary" onClick={() => onChange(null)}>
            Done
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => go(lesson.index + 1)}>
            Next <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
