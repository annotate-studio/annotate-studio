'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Heart, Sparkles, MessageCircle, RefreshCw, Send, Maximize2, Minimize2, Trash2, ChevronDown } from 'lucide-react';
import { useStore } from '@/lib/store';
import MarkdownRenderer from '@/components/canvas/MarkdownRenderer';

const QUOTES = [
  'The only way to do great work is to love what you do. — Steve Jobs',
  'Believe you can and you\'re halfway there. — Theodore Roosevelt',
  'It does not matter how slowly you go as long as you do not stop. — Confucius',
  'The future belongs to those who believe in the beauty of their dreams. — Eleanor Roosevelt',
  'Success is not final, failure is not fatal: it is the courage to continue that counts. — Winston Churchill',
  'You are never too old to set another goal or to dream a new dream. — C. S. Lewis',
  'The expert in anything was once a beginner. — Helen Hayes',
  'Your limitation—it\'s only your imagination.',
  'Great things never come from comfort zones.',
  'Dream it. Wish it. Do it.',
  'Talent without working hard is nothing. — Cristiano Ronaldo',
  'Push yourself, because no one else is going to do it for you.',
  'Small progress is still progress.',
  'Don\'t stop when you\'re tired. Stop when you\'re done.',
  'Wake up with determination. Go to bed with satisfaction.',
];

interface TherapyMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

const STORAGE_KEY = 'motivation-messages';

function loadSavedMessages(): TherapyMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MotivationTab() {
  const { motivationQuote, setMotivationQuote, motivationChatMaximized, setMotivationChatMaximized } = useStore();
  const [messages, setMessages] = useState<TherapyMessage[]>(loadSavedMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Save messages to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {}
  }, [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // Track scroll position to show/hide FAB
  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(dist > 80);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowScrollBtn(false);
  }, []);

  const pickNewQuote = () => {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    setMotivationQuote(q);
  };

  const clearChat = () => {
    setMessages([]);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: TherapyMessage = { role: 'user', content: input, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { aiChat } = await import('@/lib/tauri-commands');
      const res = await aiChat(
        [
          { role: 'system', content: 'You are a compassionate and professional study counselor. Provide warm, heart-felt encouragement, mental health advice, and study motivation. Be supportive, understanding, and practical. Keep responses concise (under 150 words) and always end with an uplifting note. Use occasional emojis to convey warmth.' },
          { role: 'user', content: input },
        ],
        'Custom',
        'study-counselor'
      );
      setMessages((prev) => [...prev, { role: 'ai', content: res.content, timestamp: Date.now() }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', content: 'You\'ve got this. Take a deep breath. Every step forward counts, no matter how small. I believe in you. 🌟', timestamp: Date.now() }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPills = [
    'I feel overwhelmed',
    'I need study motivation',
    'Help me focus',
    'Tips for exam stress',
    'I want to give up',
  ];

  return (
    <div style={{ height: '100%', display: 'flex', gap: 24, padding: 24 }}>
      {/* Quote & encouragement — hidden when chatbot is maximized */}
      {!motivationChatMaximized && (
        <div style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Daily quote */}
          <div className="card" style={{
            padding: 32, textAlign: 'center',
            background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-surface) 100%)',
          }}>
            <Heart size={24} style={{ color: 'var(--danger)', marginBottom: 16 }} />
            <div style={{ fontSize: 20, lineHeight: 1.6, color: 'var(--text-primary)', fontStyle: 'italic', marginBottom: 16, minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="content-selectable" key={motivationQuote} style={{ animation: 'fadeIn 0.4s ease' }}>
                &ldquo;{motivationQuote}&rdquo;
              </span>
            </div>
            <button className="btn btn-ghost" onClick={pickNewQuote} style={{ fontSize: 12 }}>
              <RefreshCw size={14} /> New Quote
            </button>
          </div>

          {/* Encouraging cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card" style={{ padding: 24 }}>
              <Sparkles size={20} style={{ color: 'var(--warning)', marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>You are capable</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Every expert was once a beginner. Your journey is unique and every effort you make is building towards something great.
              </div>
            </div>
            <div className="card" style={{ padding: 24 }}>
              <MessageCircle size={20} style={{ color: 'var(--primary)', marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>Talk to AI Counselor</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Feeling stressed or stuck? Chat with our AI counselor below. It&apos;s a safe space to share how you feel.
              </div>
            </div>
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>💪</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>Progress not perfection</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Done is better than perfect. Keep moving forward, one step at a time.
              </div>
            </div>
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🌟</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>Your potential is limitless</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                The only comparison you should make is between who you are today and who you were yesterday.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Counselor Chat — full area when maximized */}
      <div className="card" style={{
        flexGrow: motivationChatMaximized ? 1 : 0,
        flexShrink: 0,
        flexBasis: motivationChatMaximized ? '0%' : '380px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        width: motivationChatMaximized ? '100%' : 380,
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Heart size={16} style={{ color: 'var(--danger)' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>AI Counselor</span>
            {messages.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{messages.length} messages</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {messages.length > 0 && (
              <button className="btn btn-ghost" onClick={clearChat}
                style={{ padding: '3px 6px', color: 'var(--text-muted)' }} title="Clear conversation">
                <Trash2 size={14} />
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setMotivationChatMaximized(!motivationChatMaximized)}
              style={{ padding: '3px 6px' }} title={motivationChatMaximized ? 'Minimize' : 'Maximize'}>
              {motivationChatMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesRef} onScroll={handleScroll} style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7 }}>
              <Heart size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              Hi, I&apos;m your study counselor. Share what&apos;s on your mind — I&apos;m here to listen and help.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              animation: 'fadeInUp 0.25s ease',
            }}>
              <div className="content-selectable" style={{
                padding: '10px 14px',
                borderRadius: m.role === 'user' ? 'var(--radius-md) var(--radius-md) 4px var(--radius-md)' : 'var(--radius-md) var(--radius-md) var(--radius-md) 4px',
                background: m.role === 'user' ? 'var(--primary)' : 'var(--bg-elevated)',
                color: m.role === 'user' ? 'var(--primary-text)' : 'var(--text-primary)',
                fontSize: 13,
                lineHeight: 1.6,
              }}>
                {m.role === 'user' ? m.content : <MarkdownRenderer content={m.content} />}
              </div>
              <div style={{
                fontSize: 10, color: 'var(--text-muted)', marginTop: 3,
                textAlign: m.role === 'user' ? 'right' : 'left',
                padding: '0 2px',
              }}>
                {formatTime(m.timestamp)}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', animation: 'fadeInUp 0.2s ease' }}>
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md) var(--radius-md) var(--radius-md) 4px', background: 'var(--bg-elevated)', fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />
                  <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animationDelay: '0.2s' }} />
                  <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animationDelay: '0.4s' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scroll-to-bottom FAB */}
        {showScrollBtn && (
          <button onClick={scrollToBottom} style={{
            position: 'absolute', bottom: 80, right: 16, zIndex: 10,
            width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}>
            <ChevronDown size={16} />
          </button>
        )}

        {/* Quick action pills — hidden when maximized */}
        {!motivationChatMaximized && messages.length === 0 && (
          <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {quickPills.map((pill) => (
              <button key={pill} className="btn btn-ghost" onClick={() => { setInput(pill); inputRef.current?.focus(); }}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-pill)' }}>
                {pill}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share how you're feeling..."
            rows={1}
            className="scrollbar-hide"
            style={{
              flex: 1, border: 'none', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
              padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)',
              resize: 'none', outline: 'none', fontFamily: 'inherit',
              maxHeight: 80,
            }}
          />
          <button className="btn btn-primary" onClick={handleSend} disabled={loading || !input.trim()}
            style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', flexShrink: 0 }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
