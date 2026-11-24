'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileText,
  Layers,
  Loader2,
  Maximize2,
  Presentation,
  RotateCcw,
  Sparkles,
  Swords,
  Undo2,
  XCircle,
} from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import FileLabel from '@/components/ui/FileLabel';
import DiffView from '@/components/ui/DiffView';
import type { ChatMessage, ChatStep } from '@/store/sessions';
import VisualizationView from './VisualizationView';
import VisualizationDialog, { visualizationSummary, visualizationTitle } from './VisualizationDialog';
import { useApp } from '@/store/app';
import { useLibrary } from '@/store/library';
import { useFlashcards, UNSORTED_ID } from '@/store/flashcards';
import { createFlashcard } from '@/lib/tauri-commands';
import { toast } from '@/store/toast';
import { copyText, cn, baseName } from '@/lib/utils';
import { isRtlText } from '@/lib/bidi';
import { splitLesson } from '@/lib/ai';
import { openFileOnCanvas } from '@/lib/workspace-actions';
import type { Visualization } from '@/lib/visualizations';

interface ChatMessagesProps {
  messages: ChatMessage[];
  busy: boolean;
  status: string | null;
  onRetry: (id: string) => void;
  onRevert?: (id: string) => void;
  onOpenLesson: (topic: string, steps: string[]) => void;
  onChallenge?: (id: string) => void;
  onUndo?: (messageId: string, stepId: string) => void;
  canUndo?: (stepId: string) => boolean;
  emptyHint: React.ReactNode;
}

function openPath(path: string) {
  const file = useLibrary.getState().files.find((entry) => entry.path === path);
  if (!file) return;
  useApp.getState().setView('canvas');
  openFileOnCanvas(file);
}

function StepRow({ step, onUndo, canUndo }: { step: ChatStep; onUndo?: () => void; canUndo: boolean }) {
  return (
    <div className="agent-step-group">
      <div className={cn('agent-step', `agent-step-${step.status}`)}>
        <span className="agent-step-icon">
          {step.status === 'running' ? <Loader2 size={12} className="spin" /> : step.status === 'error' ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
        </span>
        <span className="agent-step-label" dir="auto">
          {step.label}
        </span>
        {step.summary && !(step.paths ?? []).some((path) => baseName(path) === step.summary) && (
          <span className="agent-step-summary" dir="auto">
            {step.summary}
          </span>
        )}
        {step.paths?.slice(0, 3).map((path) => (
          <button key={path} type="button" className="agent-step-link" onClick={() => openPath(path)} title={`Open ${path}`}>
            <FileText size={11} />
            <FileLabel path={path} />
          </button>
        ))}
        {step.undone ? (
          <span className="agent-step-undone">Undone</span>
        ) : step.undoable && canUndo && onUndo ? (
          <button type="button" className="agent-step-undo" onClick={onUndo} title="Undo this change">
            <Undo2 size={11} /> Undo
          </button>
        ) : null}
      </div>
      {step.diff && (
        <DiffView
          path={step.diff.path}
          before={step.diff.before}
          after={step.diff.after}
          defaultOpen={false}
          compact
        />
      )}
    </div>
  );
}

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && live && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [text, open, live]);
  return (
    <div className={cn('agent-reasoning', open && 'agent-reasoning-open')}>
      <button type="button" className="agent-reasoning-toggle" onClick={() => setOpen((value) => !value)}>
        <Brain size={12} />
        <span>{live ? 'Thinking…' : 'Thought process'}</span>
        <ChevronRight size={12} className="agent-reasoning-chevron" />
      </button>
      {open && (
        <div ref={bodyRef} className="agent-reasoning-body" dir="auto">
          {text}
        </div>
      )}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  message,
  previousUserPrompt,
  onRetry,
  onRevert,
  onOpenLesson,
  onOpenVisual,
  onChallenge,
  onUndo,
  canUndo,
}: {
  message: ChatMessage;
  previousUserPrompt?: string;
  onRetry: (id: string) => void;
  onRevert?: (id: string) => void;
  onOpenLesson: (topic: string, steps: string[]) => void;
  onOpenVisual: (viz: Visualization) => void;
  onChallenge?: (id: string) => void;
  onUndo?: (messageId: string, stepId: string) => void;
  canUndo?: (stepId: string) => boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [savedCard, setSavedCard] = useState(false);
  const setView = useApp((state) => state.setView);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const saveToFlashcard = async () => {
    if (savedCard || !message.content.trim()) return;
    const front = (previousUserPrompt?.trim() || 'Key takeaway').slice(0, 280);
    const back = message.content.trim().slice(0, 1200);
    try {
      const activeCollection = useFlashcards.getState().activeCollectionId;
      const collectionId = activeCollection && activeCollection !== UNSORTED_ID ? activeCollection : undefined;
      const card = await createFlashcard(front, back, undefined, collectionId);
      useFlashcards.getState().addCards([card]);
      setSavedCard(true);
      toast.success('Saved as flashcard');
    } catch (error) {
      toast.error('Could not save flashcard', error);
    }
  };

  if (message.role === 'user') {
    return (
      <div className="chat-row chat-row-user">
        <div className="chat-bubble chat-bubble-user content-selectable" dir={isRtlText(message.content) ? 'rtl' : 'ltr'}>
          {message.content}
          {message.attachments && message.attachments.length > 0 && (
            <div className="chat-bubble-attachments">
              {message.attachments.map((name) => (
                <span key={name}>
                  <FileText size={11} /> <FileLabel path={name} />
                </span>
              ))}
            </div>
          )}
          {onRevert && (
            <div className="chat-user-actions">
              <button type="button" onClick={() => onRevert(message.id)} title="Revert conversation to this prompt and edit">
                <Undo2 size={11} /> Revert
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const streaming = message.streaming === true;
  const steppable = !streaming && !message.error && /^##\s+(step|گام|مرحله)/im.test(message.content);
  const lessonSteps = steppable ? splitLesson(message.content) : [];

  return (
    <div className="chat-row chat-row-assistant">
      <div
        className={cn(
          'chat-bubble chat-bubble-assistant content-selectable',
          message.error && 'chat-bubble-error',
          message.mode === 'critique' && 'chat-bubble-critique',
        )}
      >
        {(message.model || message.mode === 'deep' || message.mode === 'critique') && (
          <div className="chat-bubble-meta">
            {message.mode === 'deep' && (
              <span className="chat-mode-tag">
                <Brain size={11} /> Deep thinking
              </span>
            )}
            {message.mode === 'critique' && (
              <span className="chat-mode-tag chat-mode-critique">
                <Swords size={11} /> Critique
              </span>
            )}
            {message.model && <span className="chat-model-name">{message.model}</span>}
          </div>
        )}
        {message.error && (
          <div className="chat-error-title">
            <AlertTriangle size={14} /> {message.stopped ? 'Stopped' : 'Something went wrong'}
          </div>
        )}
        {message.reasoning && <Reasoning text={message.reasoning} live={streaming && !message.content} />}
        {message.steps && message.steps.length > 0 && (
          <div className="agent-steps">
            {message.steps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                canUndo={canUndo ? canUndo(step.id) : false}
                onUndo={onUndo ? () => onUndo(message.id, step.id) : undefined}
              />
            ))}
          </div>
        )}
        {message.visualization ? (
          message.visualization.type === 'text' ? (
            <VisualizationView data={message.visualization} />
          ) : (
            <div className="viz-launch-card">
              <div className="viz-launch-info">
                <span className="viz-launch-icon">
                  <Sparkles size={15} />
                </span>
                <div className="viz-launch-text">
                  <strong dir="auto">{visualizationTitle(message.visualization)}</strong>
                  <span>{visualizationSummary(message.visualization)}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onOpenVisual(message.visualization!)}
              >
                <Maximize2 size={13} /> Open visual
              </button>
            </div>
          )
        ) : (
          message.content && <MarkdownRenderer content={message.content} />
        )}
        {streaming && (
          <div className="chat-streaming">
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>
            {message.status && <span dir="auto">{message.status}</span>}
          </div>
        )}
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
        {!streaming && (
          <div className="chat-bubble-actions">
            {message.error ? (
              <button type="button" onClick={() => onRetry(message.id)} title="Try again">
                <RotateCcw size={12} /> Retry
              </button>
            ) : (
              <>
                <button type="button" onClick={() => void copyText(message.content).then(setCopied)} title="Copy">
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                </button>
                {message.content.length > 20 && (
                  <button type="button" onClick={() => void saveToFlashcard()} disabled={savedCard} title="Save this answer as a flashcard">
                    {savedCard ? <Check size={12} /> : <Layers size={12} />} {savedCard ? 'Saved' : 'Flashcard'}
                  </button>
                )}
                {lessonSteps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onOpenLesson(lessonSteps[0].split('\n')[0].replace(/^#+\s*/, '') || 'Steps', lessonSteps)}
                    title="Go through it step by step"
                  >
                    <Presentation size={12} /> Step by step
                  </button>
                )}
                {onChallenge && message.mode !== 'critique' && message.content.length > 40 && (
                  <button type="button" onClick={() => onChallenge(message.id)} title="Ask the reasoning model to find weaknesses in this answer">
                    <Swords size={12} /> Challenge
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default function ChatMessages({ messages, busy, status, onRetry, onRevert, onOpenLesson, onChallenge, onUndo, canUndo, emptyHint }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [activeVisual, setActiveVisual] = useState<Visualization | null>(null);
  const streamingVisible = messages.some((message) => message.streaming);

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
      {messages.map((message, index) => {
        const prevUser =
          message.role === 'assistant'
            ? [...messages.slice(0, index)].reverse().find((m) => m.role === 'user')?.content
            : undefined;
        return (
          <MessageBubble
            key={message.id}
            message={message}
            previousUserPrompt={prevUser}
            onRetry={onRetry}
            onRevert={onRevert}
            onOpenLesson={onOpenLesson}
            onOpenVisual={setActiveVisual}
            onChallenge={onChallenge}
            onUndo={onUndo}
            canUndo={canUndo}
          />
        );
      })}
      {busy && !streamingVisible && (
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
      <VisualizationDialog data={activeVisual} onClose={() => setActiveVisual(null)} />
    </div>
  );
}
