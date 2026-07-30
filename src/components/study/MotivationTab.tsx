'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Heart, Sparkles, MessageCircle, RefreshCw, Send, Maximize2, Minimize2, Trash2, ChevronDown, Plus, MessageSquare, Edit3, Zap } from 'lucide-react';
import { useStore, ChatMessage } from '@/lib/store';
import { getAIProviders } from '@/lib/tauri-commands';
import MarkdownRenderer from '@/components/canvas/MarkdownRenderer';
import Dialog from '@/components/ui/Dialog';

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
  'Push yourself, because no one else is going to do it for you.',
  'Small progress is still progress.',
  'Don\'t stop when you\'re tired. Stop when you\'re done.',
  'Wake up with determination. Go to bed with satisfaction.',
];

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MotivationTab() {
  const {
    motivationQuote, setMotivationQuote, motivationChatMaximized, setMotivationChatMaximized,
    selectedModel, setSelectedModel,
    motivationMessages, motivationSessions, motivationActiveSessionId,
    createMotivationSession, switchMotivationSession, deleteMotivationSession,
    addMotivationMessage, clearMotivationMessages, loadMotivationSessions,
  } = useStore();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [providerOptions, setProviderOptions] = useState<{ type: string; model: string; label: string }[]>([]);
  const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [windowWidth, setWindowWidth] = useState(0);

  useEffect(() => {
    const update = () => setWindowWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const isSmall = windowWidth < 900;

  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions and providers on mount
  useEffect(() => {
    loadMotivationSessions();
    getAIProviders().then((providers) => {
      const opts = providers.map((p) => ({
        type: p.type, model: p.model,
        label: p.model,
      }));
      setProviderOptions(opts);
      if (opts.length > 0 && !opts.some((o) => o.label === selectedModel)) {
        setSelectedModel(opts[0].label);
      }
    }).catch(() => {});
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [motivationMessages, loading]);

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
    clearMotivationMessages();
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userContent = input;
    const userMsg: ChatMessage = { role: 'user', content: userContent, timestamp: Date.now() };
    addMotivationMessage(userMsg);
    setInput('');
    setLoading(true);

    try {
      const { aiChat } = await import('@/lib/tauri-commands');
      // Include full conversation history for context (slices off the just-added user message)
      const history = useStore.getState().motivationMessages
        .slice(0, -1)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const res = await aiChat(
        [
          { role: 'system', content: 'You are a compassionate, professional therapy and motivation assistant. Provide warm, heartfelt encouragement, mental health support, study motivation, and practical coping strategies. Be supportive, understanding, and non-judgmental. Use therapeutic techniques like reflective listening, validation, and gentle reframing. Keep responses concise (under 150 words). End with an uplifting note or an open-ended question to continue the conversation. Use occasional emojis to convey warmth.' },
          ...history,
          { role: 'user', content: userContent },
        ],
        'Custom',
        'study-counselor'
      );
      addMotivationMessage({ role: 'assistant', content: res.content, timestamp: Date.now() });
    } catch {
      addMotivationMessage({ role: 'assistant', content: 'You\'ve got this. Take a deep breath. Every step forward counts, no matter how small. I believe in you. 🌟', timestamp: Date.now() });
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openRenameDialog = () => {
    const s = motivationSessions.find((s) => s.id === motivationActiveSessionId);
    if (s) { setRenameValue(s.name); setRenameDialogOpen(true); }
  };

  const confirmRename = () => {
    if (renameValue.trim()) {
      const s = motivationSessions.find((s) => s.id === motivationActiveSessionId);
      if (s) { s.name = renameValue.trim(); }
      try { localStorage.setItem('motivation-sessions', JSON.stringify(motivationSessions)); } catch {}
    }
    setRenameDialogOpen(false);
  };

  const quickPills = [
    'I feel overwhelmed',
    'I need study motivation',
    'Help me focus',
    'Tips for exam stress',
    'I want to give up',
  ];

  const activeSession = motivationSessions.find((s) => s.id === motivationActiveSessionId);

  const sessionDialog = (
    <Dialog open={sessionsDialogOpen} onClose={() => setSessionsDialogOpen(false)} title="Counselor Sessions" width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflow: 'auto' }}>
        <button onClick={() => { createMotivationSession(); setSessionsDialogOpen(false); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)',
            background: 'transparent', color: 'var(--primary)', cursor: 'pointer',
            fontSize: 13, fontFamily: 'inherit', marginBottom: 4,
          }}>
          <Plus size={16} /> New Session
        </button>
        {motivationSessions.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
            No sessions yet. Create one to get started.
          </div>
        )}
        {motivationSessions.map((s) => (
          <div key={s.id} onClick={() => { switchMotivationSession(s.id); setSessionsDialogOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', fontSize: 13,
              background: s.id === motivationActiveSessionId ? 'var(--primary-light)' : 'transparent',
              color: s.id === motivationActiveSessionId ? 'var(--primary)' : 'var(--text-secondary)',
              transition: 'background 0.1s ease',
            }}>
            <MessageSquare size={14} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: s.id === motivationActiveSessionId ? 600 : 400 }}>
                {s.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {s.messages.length} messages · {new Date(s.createdAt).toLocaleDateString()}
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); deleteMotivationSession(s.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 'var(--radius-sm)' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );

  const renameDialog = (
    <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)} title="Rename Session" width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); }}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', outline: 'none',
            fontSize: 14, fontFamily: 'inherit',
            background: 'var(--bg-surface)', color: 'var(--text-primary)',
          }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button onClick={() => setRenameDialogOpen(false)}
            style={{
              padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: 13, fontFamily: 'inherit',
            }}>Cancel</button>
          <button onClick={confirmRename}
            style={{
              padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--primary)', color: 'var(--primary-text)', cursor: 'pointer',
              fontSize: 13, fontFamily: 'inherit',
            }}>Save</button>
        </div>
      </div>
    </Dialog>
  );

  return (
    <div style={{ height: '100%', display: 'flex', gap: motivationChatMaximized ? 0 : 24, padding: motivationChatMaximized ? 0 : 24, flexDirection: isSmall ? 'column' : 'row', overflow: 'auto' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: isSmall ? '1fr' : '1fr 1fr', gap: 16 }}>
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
        flexGrow: 1,
        flexShrink: 0,
        flexBasis: motivationChatMaximized ? '100%' : (isSmall ? '100%' : '460px'),
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        width: motivationChatMaximized ? '100%' : (isSmall ? '100%' : 460),
        maxWidth: motivationChatMaximized ? '100%' : (isSmall ? '100%' : 460),
        borderRadius: motivationChatMaximized ? 0 : undefined,
        border: motivationChatMaximized ? 'none' : undefined,
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <Heart size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeSession?.name || 'AI Counselor'}
            </span>
            {activeSession && (
              <button onClick={openRenameDialog}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <Edit3 size={14} />
              </button>
            )}
            {motivationMessages.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{motivationMessages.length} messages</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            {/* Model selector */}
            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost" onClick={() => setModelMenuOpen(!modelMenuOpen)}
                style={{ fontSize: 11, padding: '3px 10px', gap: 4 }}>
                <Zap size={12} /> {selectedModel || 'Model'}
                <ChevronDown size={12} />
              </button>
              {modelMenuOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: 100,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)', padding: 4, minWidth: 200,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 4,
                }}>
                  {providerOptions.length === 0 && (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)' }}>
                      No providers. Add one in Settings.
                    </div>
                  )}
                  {providerOptions.map((opt, i) => (
                    <button key={i} onClick={() => { setSelectedModel(opt.label); setModelMenuOpen(false); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', fontSize: 12,
                        border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit',
                        background: selectedModel === opt.label ? 'var(--primary-light)' : 'transparent',
                        color: selectedModel === opt.label ? 'var(--primary)' : 'var(--text-secondary)',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-ghost" onClick={() => setSessionsDialogOpen(true)}
              style={{ padding: '3px 7px', fontSize: 11 }} title="Chat Sessions">
              <MessageSquare size={13} />
            </button>
            {motivationMessages.length > 0 && (
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
          {motivationMessages.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7 }}>
              <Heart size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              Hi, I&apos;m your study counselor. Share what&apos;s on your mind — I&apos;m here to listen and help.
            </div>
          )}
          {motivationMessages.map((m, i) => (
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
        {!motivationChatMaximized && motivationMessages.length === 0 && (
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

      {sessionDialog}
      {renameDialog}
    </div>
  );
}
