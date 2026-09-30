'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, HeartHandshake, Quote, RefreshCw, Sparkles, Square, SquarePen } from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import ModelPicker from '@/components/ui/ModelPicker';
import SessionMenu from '@/components/chatbot/SessionMenu';
import { aiChat, errorMessage } from '@/lib/tauri-commands';
import { trimHistory } from '@/lib/ai';
import { useMotivationSessions, type ChatMessage } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { cn, isRtlText } from '@/lib/utils';

const QUOTES = [
  { text: 'The expert in anything was once a beginner.', author: 'Helen Hayes' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Learning never exhausts the mind.', author: 'Leonardo da Vinci' },
  { text: 'You don’t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { text: 'Believe you can and you’re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'Small progress is still progress.', author: 'Unknown' },
  { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
  { text: 'Education is not preparation for life; education is life itself.', author: 'John Dewey' },
  { text: 'Genius is one percent inspiration and ninety-nine percent perspiration.', author: 'Thomas Edison' },
  { text: 'The beautiful thing about learning is that nobody can take it away from you.', author: 'B. B. King' },
  { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
  { text: 'Rest when you’re weary. Refresh and renew yourself.', author: 'Ralph Marston' },
  { text: 'Do the best you can until you know better. Then when you know better, do better.', author: 'Maya Angelou' },
];

const PROMPTS = ['I feel overwhelmed', 'Help me get started', 'I keep procrastinating', 'Exam anxiety tips', 'I want to give up'];

const COUNSELOR_PROMPT = `You are a warm, supportive study coach and wellbeing companion for a student.
Listen carefully, validate feelings without judgement and offer practical, evidence-based strategies (breaking work into small steps, planning, the Pomodoro technique, sleep, breaks, self-compassion).
Keep replies under 150 words, conversational and kind. End with a gentle question or a small next step.
You are not a therapist: if the student mentions self-harm or a crisis, respond with care and encourage them to contact local emergency services or a crisis line right away.
Reply in the student's language.`;

const EMPTY: ChatMessage[] = [];

export default function MotivationTab() {
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const messages = useMotivationSessions((state) => state.sessions.find((s) => s.id === state.activeId)?.messages ?? EMPTY);

  useEffect(() => {
    void useMotivationSessions.getState().hydrate();
  }, []);

  useEffect(() => {
    const element = listRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, busy]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const store = useMotivationSessions.getState();
    const sessionId = store.ensureSession();
    const history = store.sessions.find((s) => s.id === sessionId)?.messages ?? [];
    store.appendMessage(sessionId, { role: 'user', content });
    setInput('');
    const id = ++requestRef.current;
    setBusy(true);
    try {
      const response = await aiChat(
        [
          { role: 'system', content: COUNSELOR_PROMPT },
          ...trimHistory(history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })), 12),
          { role: 'user', content },
        ],
        { model: useSettings.getState().selectedModel || undefined, temperature: 0.8, maxTokens: 800 },
      );
      if (id !== requestRef.current) return;
      useMotivationSessions.getState().appendMessage(sessionId, { role: 'assistant', content: response.content });
    } catch (error) {
      if (id !== requestRef.current) return;
      useMotivationSessions.getState().appendMessage(sessionId, {
        role: 'assistant',
        content: `I couldn't reach the AI right now (${errorMessage(error)}). While you wait: take three slow breaths, drink some water, and pick the smallest next step you can finish in five minutes. You’ve got this.`,
        error: true,
      });
    } finally {
      if (id === requestRef.current) setBusy(false);
    }
  };

  const quote = QUOTES[quoteIndex];

  return (
    <div className="page motivation-page">
      <header className="page-header">
        <div>
          <h1>Motivation</h1>
          <p>A calm corner to reset, refocus and talk things through.</p>
        </div>
      </header>
      <div className="motivation-grid">
        <div className="motivation-side">
          <div className="quote-card">
            <Quote size={22} />
            <blockquote>{quote.text}</blockquote>
            <cite>— {quote.author}</cite>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuoteIndex((i) => (i + 1 + Math.floor(Math.random() * (QUOTES.length - 1))) % QUOTES.length)}>
              <RefreshCw size={13} /> Another one
            </button>
          </div>
          <div className="tips-card">
            <h3>
              <Sparkles size={15} /> Quick resets
            </h3>
            <ul>
              <li>Shrink the task: what can you finish in the next 10 minutes?</li>
              <li>Start a 25-minute focus session and silence your phone.</li>
              <li>Stand up, stretch and drink a glass of water.</li>
              <li>Explain today’s topic out loud as if teaching a friend.</li>
            </ul>
          </div>
        </div>

        <div className="counselor">
          <div className="counselor-header">
            <HeartHandshake size={17} />
            <SessionMenu store={useMotivationSessions} label="Session" />
            <div className="chat-header-spacer" />
            <ModelPicker />
            <button type="button" className="icon-btn" onClick={() => useMotivationSessions.getState().createSession()} title="New session">
              <SquarePen size={15} />
            </button>
          </div>
          <div ref={listRef} className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <HeartHandshake size={30} strokeWidth={1.5} />
                <strong>How are you feeling about your studies?</strong>
                <span>Share what’s on your mind — stress, focus, motivation or anything else.</span>
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`chat-row chat-row-${message.role}`}>
                <div
                  className={cn(`chat-bubble chat-bubble-${message.role} content-selectable`, message.error && 'chat-bubble-error')}
                  dir={message.role === 'user' && isRtlText(message.content) ? 'rtl' : undefined}
                >
                  {message.role === 'user' ? message.content : <MarkdownRenderer content={message.content} />}
                </div>
              </div>
            ))}
            {busy && (
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
          <div className="chip-row counselor-prompts">
            {PROMPTS.map((prompt) => (
              <button key={prompt} type="button" className="chip" onClick={() => void send(prompt)} disabled={busy}>
                {prompt}
              </button>
            ))}
          </div>
          <div className="chat-composer">
            <div className="chat-input-row">
              <textarea
                rows={1}
                value={input}
                dir="auto"
                placeholder="Write how you feel…"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
              />
              <div className="chat-input-actions">
                {busy ? (
                  <button
                    type="button"
                    className="send-btn send-btn-stop"
                    onClick={() => {
                      requestRef.current += 1;
                      setBusy(false);
                    }}
                    title="Stop"
                  >
                    <Square size={13} />
                  </button>
                ) : (
                  <button type="button" className="send-btn" onClick={() => void send(input)} disabled={!input.trim()} title="Send">
                    <ArrowUp size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
