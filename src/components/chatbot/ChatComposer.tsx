'use client';

import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ArrowUp, BookOpenCheck, FileText, Paperclip, Square, Wand2, X } from 'lucide-react';
import type { ChatEngine } from './useChatEngine';
import PromptsDialog from './PromptsDialog';
import { getPreset, type PromptId } from '@/lib/promptPresets';
import { useLibrary } from '@/store/library';
import { useChatSessions } from '@/store/sessions';
import type { StudyFile } from '@/lib/tauri-commands';
import { cn, isRtlText } from '@/lib/utils';

export interface ChatComposerHandle {
  setDraft: (text: string) => void;
  focus: () => void;
}

interface ChatComposerProps {
  engine: ChatEngine;
}

const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({ engine }, ref) {
  const [value, setValue] = useState('');
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [enabledPrompt, setEnabledPrompt] = useState<PromptId | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const files = useLibrary((state) => state.files);
  const hasConversation = useChatSessions((state) => {
    const session = state.sessions.find((item) => item.id === state.activeId);
    return (session?.messages ?? []).some((message) => !message.error);
  });

  const resize = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  };

  useImperativeHandle(ref, () => ({
    setDraft: (text) => {
      setValue(text);
      requestAnimationFrame(() => {
        resize();
        const element = textareaRef.current;
        if (element) {
          element.focus();
          element.setSelectionRange(text.length, text.length);
        }
      });
    },
    focus: () => textareaRef.current?.focus(),
  }));

  const suggestions = useMemo(() => {
    if (!mention) return [] as StudyFile[];
    const query = mention.query.toLowerCase();
    return files.filter((file) => file.file_type !== 'Image' && file.name.toLowerCase().includes(query)).slice(0, 8);
  }, [mention, files]);

  const updateMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const match = /(^|\s)@([^\s@]*)$/.exec(before);
    if (match) {
      setMention({ query: match[2], start: caret - match[2].length - 1 });
      setHighlight(0);
    } else {
      setMention(null);
    }
  };

  const pickMention = (file: StudyFile) => {
    if (!mention) return;
    const element = textareaRef.current;
    const caret = element?.selectionStart ?? value.length;
    const next = `${value.slice(0, mention.start)}${value.slice(caret)}`.replace(/\s{2,}/g, ' ');
    setValue(next);
    setMention(null);
    engine.addAttachments([file]);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(mention.start, mention.start);
      resize();
    });
  };

  const submit = () => {
    const text = value.trim();
    if (!text || engine.busy) return;
    const prompt = enabledPrompt;
    setValue('');
    setMention(null);
    setEnabledPrompt(null);
    requestAnimationFrame(resize);
    if (prompt) void engine.runPrompt(prompt, { text });
    else void engine.send(text);
  };

  const draft = value.trim();

  const explain = () => {
    if (!draft || engine.busy) return;
    setValue('');
    requestAnimationFrame(resize);
    void engine.explain(draft);
  };

  const pickPrompt = (preset: PromptId) => {
    setPromptsOpen(false);
    if (engine.busy) return;
    setEnabledPrompt(preset);
    setMention(null);
    requestAnimationFrame(() => {
      resize();
      textareaRef.current?.focus();
    });
  };

  const clearPrompt = () => {
    setEnabledPrompt(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const activePreset = enabledPrompt ? getPreset(enabledPrompt) : null;
  const activeAttachments = engine.attachments.filter((attachment) => attachment.enabled).length;
  const promptSource = activeAttachments
    ? `${activeAttachments} attached document${activeAttachments === 1 ? '' : 's'}${draft ? ' and your message' : ''}`
    : draft
      ? 'the text in your message'
      : hasConversation
        ? 'the latest messages in this chat'
        : null;
  const promptHint = !promptSource
    ? 'Attach a document, paste some text, or ask a question first.'
    : activePreset
      ? `Press Enter to run ${activePreset.label} on ${promptSource}.`
      : `Pick a prompt to enable it, then write your request and press Enter. It runs on ${promptSource}.`;

  return (
    <div className="chat-composer">
      {(engine.attachments.length > 0 || activePreset) && (
        <div className="chat-attachments">
          {activePreset && (
            <span className="prompt-chip">
              <button
                type="button"
                onClick={() => textareaRef.current?.focus()}
                title={`${activePreset.label} is enabled — write your request and press Enter`}
              >
                <Wand2 size={12} />
                <span>{activePreset.label}</span>
              </button>
              <button type="button" onClick={clearPrompt} aria-label="Remove prompt">
                <X size={11} />
              </button>
            </span>
          )}
          {engine.attachments.map((attachment) => (
            <span key={attachment.path} className={cn('attachment-chip', !attachment.enabled && 'attachment-chip-off')}>
              <button type="button" onClick={() => engine.toggleAttachment(attachment.path)} title={attachment.enabled ? 'Included in the next message' : 'Not included'}>
                <FileText size={12} />
                <span>{attachment.name}</span>
              </button>
              <button type="button" onClick={() => engine.removeAttachment(attachment.path)} aria-label="Remove attachment">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="chat-input-row">
        {mention && suggestions.length > 0 && (
          <div className="mention-menu menu">
            {suggestions.map((file, index) => (
              <button
                key={file.path}
                type="button"
                className={cn('menu-item', index === highlight && 'menu-item-active')}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickMention(file);
                }}
              >
                <span className="menu-item-icon">
                  <FileText size={13} />
                </span>
                <span className="menu-item-label">{file.name}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          dir={isRtlText(value) ? 'rtl' : 'auto'}
          placeholder="Ask anything… type @ to attach a document"
          onChange={(event) => {
            setValue(event.target.value);
            updateMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
            resize();
          }}
          onKeyDown={(event) => {
            if (mention && suggestions.length > 0) {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlight((i) => (i + 1) % suggestions.length);
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlight((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                pickMention(suggestions[highlight]);
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setMention(null);
                return;
              }
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="chat-input-actions">
          <button
            type="button"
            className="icon-btn"
            title="Attach a document (@)"
            onClick={() => {
              const next = value.endsWith(' ') || !value ? `${value}@` : `${value} @`;
              setValue(next);
              setMention({ query: '', start: next.length - 1 });
              requestAnimationFrame(() => textareaRef.current?.focus());
            }}
          >
            <Paperclip size={15} />
          </button>
          <button type="button" className="icon-btn" title="Explain step by step" onClick={explain} disabled={!draft || engine.busy}>
            <BookOpenCheck size={15} />
          </button>
          <button
            type="button"
            className={cn('icon-btn', activePreset && 'icon-btn-accent')}
            title={activePreset ? `Prompts — ${activePreset.label} enabled` : 'Prompts'}
            aria-label="Prompts"
            onClick={() => setPromptsOpen(true)}
            disabled={engine.busy}
          >
            <Wand2 size={15} />
          </button>
          {engine.busy ? (
            <button type="button" className="send-btn send-btn-stop" onClick={engine.cancel} title="Stop">
              <Square size={13} />
            </button>
          ) : (
            <button type="button" className="send-btn" onClick={submit} disabled={!value.trim()} title="Send (Enter)">
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
      <PromptsDialog open={promptsOpen} onClose={() => setPromptsOpen(false)} onPick={pickPrompt} hint={promptHint} />
    </div>
  );
});

export default ChatComposer;
