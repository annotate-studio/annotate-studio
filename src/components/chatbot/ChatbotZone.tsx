'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Rnd } from 'react-rnd';
import { Sparkles, X, ChevronDown, ArrowUp, Bot, Maximize2, Minimize2, Plus, Trash2, Edit3, Check, MessageSquare, History, Zap, FileText, BookOpen, Send, ArrowLeft as ArrowLeftIcon, ArrowRight as ArrowRightIcon } from 'lucide-react';
import { useStore } from '@/lib/store';
import { aiChat, generateFlashcard, getAIProviders, getFlashcardStats, readFile, readFileBase64 } from '@/lib/tauri-commands';
import MarkdownRenderer from '@/components/canvas/MarkdownRenderer';
import Dialog from '@/components/ui/Dialog';

let _pdfjsLoaded = false;
let _pdfjsLoading: Promise<void> | null = null;

function isRTL(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const rtlChars = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  return rtlChars.test(trimmed[0]);
}

async function loadPdfjs(): Promise<void> {
  if (_pdfjsLoaded) return;
  if (_pdfjsLoading) return _pdfjsLoading;
  _pdfjsLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/pdf.min.js';
    s.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (!lib) { reject(new Error('pdfjsLib not found')); return; }
      lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      _pdfjsLoaded = true;
      resolve();
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return _pdfjsLoading;
}

async function getPdfPageCount(base64: string): Promise<string> {
  await loadPdfjs();
  const pdfjsLib = (window as any).pdfjsLib;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: bytes.buffer }).promise;
  const pages = pdf.numPages;
  pdf.destroy();
  return `${pages} page${pages > 1 ? 's' : ''}`;
}

/** True if the extracted text looks like real readable content, not binary garbage or an empty scrape. */
function hasReadableText(text: string): boolean {
  const sample = text.trim();
  if (sample.length < 20) return false;
  const body = sample.slice(0, 3000);
  let printable = 0;
  for (const ch of body) {
    if (ch === '\uFFFD') return false;
    if (ch === '\n' || ch === '\t' || ch === '\r' || ch >= ' ') printable++;
  }
  return printable / Math.max(1, body.length) > 0.95;
}

async function extractPdfText(base64: string, maxChars = 3000): Promise<string> {
  await loadPdfjs();
  const pdfjsLib = (window as any).pdfjsLib;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: bytes.buffer }).promise;
  const totalPages = pdf.numPages;
  const parts: string[] = [];
  let lastPageRead = 0;
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map((item: any) => item.str).join(' ');
    parts.push(text);
    lastPageRead = i;
    if (parts.join('\n').length >= maxChars) break;
  }
  pdf.destroy();
  const excerpt = parts.join('\n').slice(0, maxChars);
  const isTruncated = lastPageRead < totalPages;
  let note = `[Extracted from ${totalPages} page${totalPages > 1 ? 's' : ''}`;
  if (isTruncated) note += ` (showing first ~${maxChars} chars from ${lastPageRead} page${lastPageRead > 1 ? 's' : ''})`;
  note += ']';
  return `${excerpt}\n\n${note}`;
}

export default function ChatbotZone() {
  const {
    chatbotOpen, toggleChatbot, chatbotHeight, setChatbotHeight,
    chatMessages, addChatMessage, clearChat, chatLoading, setChatLoading,
    selectedModel, setSelectedModel, showExplainer,
    aiDetached, setAiDetached, aiWindowPosition, aiWindowSize,
    setAiWindowPosition, setAiWindowSize,
    summarizeTarget, setSummarizeTarget,
    chatSessions, activeSessionId, createChatSession, switchChatSession, deleteChatSession,
    documents, resources,
  } = useStore();

  const [input, setInput] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [providerOptions, setProviderOptions] = useState<{ type: string; model: string; label: string }[]>([]);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompletePrefix, setAutocompletePrefix] = useState('');
  const [autocompleteIdx, setAutocompleteIdx] = useState(0);

  // Explainer state (inline within chat)
  const [explainerActive, setExplainerActive] = useState(false);
  const [explainerTopic, setExplainerTopic] = useState('');
  const [explainerQaInput, setExplainerQaInput] = useState('');
  const [explainerSteps, setExplainerSteps] = useState<string[]>([]);
  const [explainerStep, setExplainerStep] = useState(0);
  const [explainerConv, setExplainerConv] = useState<{ role: string; content: string }[]>([]);
  const [explainerLoading, setExplainerLoading] = useState(false);

  const docNames = useMemo(() => {
    const names = new Set<string>();
    documents.forEach((d) => names.add(d.name));
    resources.filter((r) => r.type === 'pdf' || r.type === 'note' || r.type === 'image').forEach((r) => names.add(r.title));
    return Array.from(names).sort();
  }, [documents, resources]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef(false);
  const explainerChatRef = useRef<HTMLDivElement>(null);

  const explainerSystem = `You are a focused, adaptive tutor. Reduce the effort needed to understand, remember, and apply the topic. Preserve the user's agency and the source's accuracy.

Start with immediate value
Lead with what the topic is and why it matters — one or two sentences. Show only the smallest useful first layer.

Adapt the information
Use short paragraphs, descriptive headings, and lists with one idea per item.
Front-load the important words. Put setup and background after the takeaway.
Explain a necessary technical term in plain language, then use the exact term consistently.
Give one concrete example before adding more abstraction.
Use bold sparingly for scan targets, not whole sentences.
Never use visual clutter, decorative emoji chains, fake urgency, or motivational filler.

Reveal detail in layers — use this order:
1. Orientation: what the topic is and why it matters.
2. Working layer: the facts, steps, or explanation needed now.
3. Depth on demand: caveats, evidence, alternatives, and exhaustive detail.

Structure the response as a step-by-step lesson:

## Orientation
A brief overview of what the topic is and why it matters. Front-load the key takeaway.

## Step 1: [Title]
Explain with a concrete example first, then connect back to the exact terminology.

## Step 2: [Title]
Continue with the next concept, following the same pattern.

Continue with as many steps as needed (3-6 recommended). Use descriptive headings for each step. End with:

## Summary
Recap the key takeaways in a short list. Include one useful next step or implication.

Preserve accuracy and safety
Simplify language, not truth. Retain conditions, warnings, units, and meaningful uncertainty.
Clearly label an analogy as an analogy. Never invent a detail to make an explanation feel complete.

End with a clean handoff
After the summary, offer a small continuation menu — such as "go deeper on any step, see an example, or move to a related topic."`;

  const generateExplainer = async (topic: string) => {
    cancelRef.current = false;
    // Record user message in chat history
    addChatMessage({ role: 'user', content: topic, timestamp: Date.now() });
    setExplainerActive(true);
    setExplainerTopic(topic);
    setExplainerLoading(true);
    setExplainerSteps([]);
    setExplainerStep(0);
    setExplainerConv([]);
    try {
      const resp = await aiChat([
        { role: 'system', content: explainerSystem },
        { role: 'user', content: `Explain this topic in a step-by-step manner: ${topic}` },
      ], 'Explain');
      if (cancelRef.current) return;
      const parts = resp.content.split(/(?=## Step \d+:)/);
      const parsed: string[] = [];
      let overview = '';
      for (const p of parts) {
        if (p.startsWith('## Step')) parsed.push(p.trim());
        else if (p.includes('## Overview')) overview = p.trim();
      }
      if (overview) parsed.unshift(overview);
      if (parsed.length === 0) parsed.push(resp.content);
      setExplainerSteps(parsed);
      setExplainerStep(0);
      // Record assistant message in chat history with explainer data
      addChatMessage({
        role: 'assistant',
        content: `**${topic}** — ${parsed.length} step${parsed.length > 1 ? 's' : ''}`,
        timestamp: Date.now(),
        explainerData: { topic, steps: parsed, conv: [] },
      });
    } catch {
      if (cancelRef.current) return;
      setExplainerConv([{ role: 'assistant', content: 'Failed to generate explanation. Please try again.' }]);
    }
    setExplainerLoading(false);
  };

  const askExplainer = async (q: string) => {
    if (!q.trim() || explainerLoading) return;
    cancelRef.current = false;
    const question = q.trim();
    setExplainerConv((prev) => [...prev, { role: 'user', content: question }]);
    setExplainerLoading(true);
    try {
      const stepContext = explainerSteps[explainerStep] || '';
      const resp = await aiChat([
        { role: 'system', content: `You are explaining "${explainerTopic}". The user is currently on this step:\n\n${stepContext}\n\nAnswer their question concisely and helpfully, relating it to the current step.` },
        ...explainerConv.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: question },
      ], 'Explain');
      if (cancelRef.current) return;
      setExplainerConv((prev) => [...prev, { role: 'assistant', content: resp.content }]);
    } catch {
      if (cancelRef.current) return;
      setExplainerConv((prev) => [...prev, { role: 'assistant', content: 'Sorry, I had trouble answering that.' }]);
    }
    setExplainerLoading(false);
  };

  const resizeRef = useRef({ startY: 0, startH: 35 });

  useEffect(() => {
    // Load persisted chat sessions
    useStore.getState().loadChatSessionsFromDisk();
    getAIProviders().then((providers) => {
      const opts = providers.map((p) => ({
        type: p.type, model: p.model,
        label: p.model,
      }));
      setProviderOptions(opts);
      // If the current selectedModel doesn't match any provider, pick the first one
      if (opts.length > 0 && !opts.some((o) => o.label === selectedModel)) {
        setSelectedModel(opts[0].label);
      }
    }).catch(() => { });
  }, []);

  useEffect(() => {
    if (!summarizeTarget) return;
    let { content, title } = summarizeTarget;
    if (!content) { setSummarizeTarget(null); return; }
    const doSummarize = async () => {
      setChatLoading(true);
      let summaryContent = content;
      let userLabel = `[${title}]`;
      // If content looks like a file path (not raw text), try to read it
      if (!content.includes('\n') && content.length < 200 && (content.includes('/') || content.includes('\\'))) {
        try {
          const ext = content.split('.').pop()?.toLowerCase() || '';
          if (['pdf'].includes(ext)) {
            try {
              const b64 = await readFileBase64(content);
              const pages = await getPdfPageCount(b64);
              userLabel = `[PDF: ${title} (${pages})]`;
              const extracted = await extractPdfText(b64, 8000);
              summaryContent = hasReadableText(extracted) ? extracted : '';
            } catch { summaryContent = ''; }
          } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
            userLabel = `[IMAGE: ${title}]`;
            summaryContent = '';
          } else {
            try { summaryContent = await readFile(content); } catch { summaryContent = ''; }
          }
        } catch { summaryContent = ''; }
      }
      addChatMessage({ role: 'user', content: `Summarize this: ${userLabel}`, timestamp: Date.now() });
      setSummarizeTarget(null);
      if (!summaryContent) {
        addChatMessage({ role: 'assistant', content: `I couldn't read the content of **${title}**. Make sure the file exists and is accessible.`, timestamp: Date.now() });
        setChatLoading(false);
        return;
      }
      try {
        const resp = await aiChat([
          { role: 'system', content: 'You are a study assistant. Summarize the following document concisely, highlighting key concepts, important details, and connections to related topics.' },
          { role: 'user', content: `Title: ${title}\n\n${summaryContent}` },
        ], 'Summarize');
        addChatMessage({ role: 'assistant', content: resp.content, timestamp: Date.now() });
      } catch (err) {
        addChatMessage({ role: 'assistant', content: `Error: ${err}`, timestamp: Date.now() });
      }
      setChatLoading(false);
    };
    doSummarize();
  }, [summarizeTarget]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // Flashcard intent: when the user asks the chatbot to create flashcards,
  // use the same backend API as the Flashcards page (generate_flashcard) so
  // cards are inserted directly into the requested collection's database.
  const runFlashcardRequest = useCallback(async (userMsg: string, material: string) => {
    const state = useStore.getState();
    const collections = state.flashcardCollections;

    // Resolve target collection: named in the message → active → default
    let collectionId = state.activeCollectionId ?? undefined;
    let collectionName = collections.find((c) => c.id === collectionId)?.name || '';
    for (const c of collections) {
      const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(userMsg)) {
        collectionId = c.id;
        collectionName = c.name;
        break;
      }
    }
    if (!collectionName) collectionName = 'Default';

    addChatMessage({ role: 'user', content: userMsg, timestamp: Date.now() });
    setChatLoading(true);
    cancelRef.current = false;

    // No obligation for pre-existing material: fall back to the request itself,
    // e.g. "make 10 flashcards about photosynthesis" is enough context.
    const content = material.trim() || userMsg;

    try {
      const cards = await generateFlashcard(content, undefined, collectionId);
      if (cancelRef.current) return;
      // Keep the local store in sync with what was inserted into the DB
      useStore.setState({ flashcards: [...useStore.getState().flashcards, ...cards] });
      getFlashcardStats().then((s) => { if (s) useStore.getState().setFlashcardStats(s); }).catch(() => { });
      addChatMessage({
        role: 'assistant',
        content: cards.length > 0
          ? `Created ${cards.length} flashcard${cards.length > 1 ? 's' : ''} in **${collectionName}**.`
          : 'The AI returned no flashcards — try rephrasing the topic or providing more detail.',
        timestamp: Date.now(),
        flashcardData: cards.length > 0 ? { inserted: cards.length, collectionName } : undefined,
      });
    } catch (err) {
      if (cancelRef.current) return;
      addChatMessage({ role: 'assistant', content: `Failed to generate flashcards: ${err}`, timestamp: Date.now() });
    }
    setChatLoading(false);
  }, [addChatMessage, setChatLoading]);

  // ── Agent-style persistent study-material attachments ──────────────
  // Assigned once via @mention, they stay attached (toggleable) across
  // messages until removed — no need to re-mention them every time.

  interface AttachedDoc {
    id: string;
    name: string;
    path?: string;
    type: 'pdf' | 'note' | 'image' | 'other';
    enabled: boolean;
    cachedContent?: string;
  }

  const [attachedDocs, setAttachedDocs] = useState<AttachedDoc[]>([]);

  const resolveMention = useCallback((name: string): Omit<AttachedDoc, 'id' | 'enabled'> | null => {
    const clean = name.replace(/[,.;:!?)\]]+$/, '');
    const res = resources.find((r) =>
      r.title === clean || r.title.startsWith(clean) ||
      (r.filePath && r.filePath.endsWith(clean))
    );
    if (res) {
      return {
        name: res.title,
        path: res.filePath,
        type: res.type === 'pdf' ? 'pdf' : res.type === 'note' ? 'note' : res.type === 'image' ? 'image' : 'other',
      };
    }
    const doc = documents.find((d) =>
      d.name === clean || d.name.startsWith(clean) || d.path.endsWith(clean)
    );
    if (doc) {
      const ext = doc.name.split('.').pop()?.toLowerCase() || '';
      return {
        name: doc.name,
        path: doc.path,
        type: ext === 'pdf' ? 'pdf' : ['md', 'markdown'].includes(ext) ? 'note' : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? 'image' : 'other',
      };
    }
    return null;
  }, [resources, documents]);

  /** Build a text block for one attachment, extracting/caching PDF content. */
  const buildAttachmentBlock = useCallback(async (att: AttachedDoc): Promise<string> => {
    if (att.cachedContent) return att.cachedContent;
    let block = `[File: ${att.name}]`;
    try {
      if (att.type === 'image') {
        block = `[Attached Image: ${att.name}]`;
      } else if (att.path) {
        const ext = att.name.split('.').pop()?.toLowerCase() || '';
        if (att.type === 'pdf') {
          const b64 = await readFileBase64(att.path);
          let pages = '';
          try { pages = await getPdfPageCount(b64); } catch { }
          const text = await extractPdfText(b64, 12000);
          block = hasReadableText(text)
            ? `[Attached PDF: ${att.name}${pages ? ` (${pages})` : ''}]\n\`\`\`\n${text}\n\`\`\``
            : `[Attached PDF: ${att.name}${pages ? ` (${pages})` : ''}]`;
        } else {
          const content = att.type === 'note'
            ? (resources.find((r) => r.title === att.name)?.content ?? await readFile(att.path))
            : await readFile(att.path);
          block = `[Attached Document: ${att.name}]\n\`\`\`\n${content.slice(0, 4000)}\n\`\`\``;
        }
      }
    } catch {
      block = `[File: ${att.name} — could not be read]`;
    }
    // Cache so subsequent messages don't re-extract
    setAttachedDocs((prev) => prev.map((a) => (a.id === att.id ? { ...a, cachedContent: block } : a)));
    return block;
  }, [resources]);

  const addAttachment = useCallback((doc: Omit<AttachedDoc, 'id' | 'enabled'>) => {
    let added = false;
    setAttachedDocs((prev) => {
      if (prev.some((a) => a.name === doc.name)) return prev;
      added = true;
      return [...prev, { ...doc, id: crypto.randomUUID(), enabled: true }];
    });
    return added;
  }, []);

  const toggleAttachment = useCallback((id: string) => {
    setAttachedDocs((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachedDocs((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || chatLoading) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // Resolve @mentions → register as persistent attachments (agent-style).
    const refs = msg.match(/@(\S+)/g) || [];
    for (const ref of refs) {
      const resolved = resolveMention(ref.slice(1));
      if (resolved) addAttachment(resolved);
    }

    // Enabled attachments (persistent + any just mentioned)
    const activeDocs = attachedDocs.filter((a) => a.enabled);

    // Flashcard intent → insert cards via backend instead of a plain chat reply
    const wantsFlashcards = /\bflash\s?cards?\b/i.test(msg) && /\b(make|create|generate|build|add|insert)\b/i.test(msg);
    if (wantsFlashcards) {
      const blocks = await Promise.all(activeDocs.map(buildAttachmentBlock));
      const history = useStore.getState().chatMessages.slice(-8)
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      const material = [...blocks, history].filter(Boolean).join('\n\n');
      await runFlashcardRequest(msg, material);
      return;
    }

    addChatMessage({ role: 'user', content: msg, timestamp: Date.now() });
    setChatLoading(true);
    cancelRef.current = false;
    try {
      // Full conversation history (plain text) + fresh injection of every
      // enabled attachment's content into the current user message.
      const history = useStore.getState().chatMessages
        .map((m) => ({ role: m.role, content: m.content }));
      history.pop(); // drop the just-added plain copy; we append composed below
      const blocks = await Promise.all(activeDocs.map(buildAttachmentBlock));
      const composed = [
        ...blocks,
        blocks.length > 0 ? '' : undefined,
        msg,
      ].filter(Boolean).join('\n\n');
      history.push({ role: 'user', content: composed });
      const resp = await aiChat(history, 'Custom');
      if (cancelRef.current) return;
      addChatMessage({ role: 'assistant', content: resp.content, timestamp: Date.now() });
    } catch (err) {
      if (cancelRef.current) return;
      addChatMessage({ role: 'assistant', content: `Error: ${err}`, timestamp: Date.now() });
    }
    setChatLoading(false);
  }, [input, chatLoading, addChatMessage, setChatLoading, attachedDocs, resolveMention, addAttachment, buildAttachmentBlock, runFlashcardRequest]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (autocompleteOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteIdx((i) => Math.min(i + 1, filteredDocs.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredDocs[autocompleteIdx];
        if (selected) {
          const atPos = input.lastIndexOf('@', input.length - autocompletePrefix.length - 1);
          if (atPos >= 0) {
            setInput(input.slice(0, atPos + 1) + selected + ' ');
          }
        }
        setAutocompleteOpen(false);
        return;
      }
      if (e.key === 'Escape') {
        setAutocompleteOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Autocomplete logic
  const filteredDocs = useMemo(() => {
    if (!autocompletePrefix) return docNames;
    return docNames.filter((n) => n.toLowerCase().includes(autocompletePrefix.toLowerCase()));
  }, [autocompletePrefix, docNames]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    const val = el.value;
    setInput(val);
    // Messenger-style auto-grow: start single line, expand with content
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    const atPos = val.lastIndexOf('@');
    if (atPos >= 0 && (atPos === 0 || val[atPos - 1] === ' ')) {
      const after = val.slice(atPos + 1);
      if (!after.includes(' ')) {
        setAutocompletePrefix(after);
        setAutocompleteOpen(true);
        setAutocompleteIdx(0);
        return;
      }
    }
    setAutocompleteOpen(false);
  }, []);

  const closeExplainer = () => {
    setExplainerActive(false);
    setExplainerSteps([]);
    setExplainerStep(0);
    setExplainerConv([]);
    setExplainerTopic('');
    setExplainerQaInput('');
  };

  const openRenameDialog = () => {
    const s = chatSessions.find((s) => s.id === activeSessionId);
    if (s) { setRenameValue(s.name); setRenameDialogOpen(true); }
  };

  const confirmRename = () => {
    if (renameValue.trim()) {
      const s = chatSessions.find((s) => s.id === activeSessionId);
      if (s) { s.name = renameValue.trim(); }
    }
    setRenameDialogOpen(false);
  };

  if (!chatbotOpen) {
    return (
      <button onClick={toggleChatbot}
        style={{
          position: 'absolute', right: 12, bottom: 12, zIndex: 50,
          width: 50, height: 50, borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--primary)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}
        title="Open AI Counselor">
        <Bot size={25} />
      </button>
    );
  }

  const activeSession = chatSessions.find((s) => s.id === activeSessionId);

  const inner = (detached: boolean) => (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', minHeight: 0 }}>
      {/* ── Header (drag handle when detached) ───────── */}
      <div className="chatbot-header" style={{
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6,
        borderBottom: '1px solid var(--border)', flexShrink: 0, minHeight: 40,
        cursor: detached ? 'grab' : 'default',
      }}>
        <Bot size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <History size={14} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeSession?.name || 'AI Counselor'}</span>
            {activeSession && (
              <button onClick={openRenameDialog}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
                <Edit3 size={14} />
              </button>
            )}
          </div>
        </div>

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

        <div style={{ display: 'flex', gap: 2 }}>
          <button className="btn btn-ghost" onClick={() => setSessionsDialogOpen(true)}
            style={{ padding: '3px 7px', fontSize: 11 }} title="Chat Sessions">
            <MessageSquare size={13} />
          </button>
          <button className="btn btn-ghost" onClick={() => { setExplainerActive(true); }}
            style={{ padding: '3px 7px', fontSize: 11 }} title="AI Explainer">
            <BookOpen size={13} />
          </button>
          {!detached && (
            <button className="btn btn-ghost" onClick={() => setAiDetached(true)}
              style={{ padding: '3px 7px', fontSize: 11 }} title="Detach">
              <Maximize2 size={13} />
            </button>
          )}
          {detached && (
            <button className="btn btn-ghost" onClick={() => setAiDetached(false)}
              style={{ padding: '3px 7px', fontSize: 11 }} title="Dock">
              <Minimize2 size={13} />
            </button>
          )}
          <button className="btn btn-ghost" onClick={toggleChatbot}
            style={{ padding: '3px 7px', fontSize: 11 }} title="Close">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Main content: Explainer OR Chat ─────────── */}
      {explainerActive ? (
        explainerSteps.length > 0 ? (
          /* ── Explainer full-screen ──────────────────── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Step header */}
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, background: 'var(--bg-surface)',
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Step {explainerStep + 1} of {explainerSteps.length}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {explainerTopic || 'Explainer'}
                </div>
              </div>
              <button onClick={closeExplainer}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                <X size={16} />
              </button>
            </div>
            {/* Progress bar */}
            <div style={{ height: 3, background: 'var(--bg-elevated)', flexShrink: 0 }}>
              <div style={{
                height: '100%', width: `${((explainerStep + 1) / explainerSteps.length) * 100}%`,
                background: 'var(--primary)', transition: 'width 0.3s ease',
              }} />
            </div>
            {/* Step content (scrollable) */}
            <div className="content-selectable" style={{ flex: 1, overflow: 'auto', padding: '12px 16px', userSelect: 'text', fontSize: 15, lineHeight: 1.8 }}>
              <MarkdownRenderer content={explainerSteps[explainerStep]} />
              {explainerConv.length > 0 && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {explainerConv.map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '92%', padding: '8px 12px',
                      borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      background: m.role === 'user' ? 'var(--primary)' : 'var(--bg-elevated)',
                      color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                      fontSize: 14, lineHeight: 1.6,
                    }}>
                      {m.role === 'user' ? m.content : <MarkdownRenderer content={m.content} />}
                    </div>
                  ))}
                  {explainerLoading && (
                    <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 3, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 12 }}>
                      <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animationDelay: '0s' }} />
                      <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animationDelay: '0.15s' }} />
                      <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animationDelay: '0.3s' }} />
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Q&A input */}
            <div style={{ padding: '8px 14px 10px', flexShrink: 0, borderTop: '1px solid var(--border)', display: 'flex', gap: 4 }}>
              <input
                value={explainerQaInput}
                onChange={(e) => setExplainerQaInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && explainerQaInput.trim()) { askExplainer(explainerQaInput.trim()); setExplainerQaInput(''); } }}
                placeholder="Ask a question about this step..."
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', outline: 'none',
                  fontSize: 13, fontFamily: 'inherit',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)',
                }}
              />
              <button onClick={() => { if (explainerQaInput.trim()) { askExplainer(explainerQaInput.trim()); setExplainerQaInput(''); } }}
                style={{
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: 'none',
                  background: explainerQaInput.trim() ? 'var(--primary)' : 'var(--bg-surface)',
                  color: explainerQaInput.trim() ? '#fff' : 'var(--text-muted)',
                  cursor: explainerQaInput.trim() ? 'pointer' : 'default', transition: 'all 0.15s ease',
                }}>
                <Send size={14} />
              </button>
            </div>
            {/* Navigation */}
            <div style={{
              padding: '8px 14px', borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, background: 'var(--bg-surface)',
            }}>
              <button onClick={() => setExplainerStep((s) => Math.max(0, s - 1))}
                disabled={explainerStep === 0}
                style={{
                  fontSize: 12, padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', cursor: explainerStep > 0 ? 'pointer' : 'default',
                  background: 'transparent', color: 'var(--text-secondary)',
                  opacity: explainerStep === 0 ? 0.4 : 1, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                <ArrowLeftIcon size={13} /> Prev
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {explainerStep + 1} / {explainerSteps.length}
              </span>
              {explainerStep === explainerSteps.length - 1 ? (
                <button onClick={closeExplainer}
                  style={{
                    fontSize: 12, padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--primary)', cursor: 'pointer',
                    background: 'var(--primary)', color: 'var(--primary-text)', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  Close <X size={13} />
                </button>
              ) : (
                <button onClick={() => setExplainerStep((s) => Math.min(explainerSteps.length - 1, s + 1))}
                  style={{
                    fontSize: 12, padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                    background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  Next <ArrowRightIcon size={13} />
                </button>
              )}
            </div>
          </div>
        ) : explainerLoading ? (
          /* ── Explainer loading ──────────────────────── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, position: 'relative' }}>
            <button onClick={closeExplainer}
              style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
              <X size={16} />
            </button>
            <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Generating step-by-step explanation...</div>
            <button onClick={() => { cancelRef.current = true; setExplainerLoading(false); }}
              style={{ fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        ) : (
          /* ── Explainer topic input ──────────────────── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, position: 'relative' }}>
            <button onClick={closeExplainer}
              style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
              <X size={16} />
            </button>
            <Bot size={40} style={{ color: 'var(--primary)', opacity: 0.25 }} />
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6, maxWidth: 260 }}>
              What topic would you like me to explain step by step?
            </div>
            <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: 320 }}>
              <input autoFocus value={explainerTopic}
                onChange={(e) => setExplainerTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && explainerTopic.trim()) generateExplainer(explainerTopic.trim()); }}
                placeholder="e.g. Quantum Computing..."
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)', outline: 'none',
                  fontSize: 14, fontFamily: 'inherit',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)',
                }} />
              <button onClick={() => { if (explainerTopic.trim()) generateExplainer(explainerTopic.trim()); }}
                style={{
                  padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none',
                  background: 'var(--primary)', color: 'var(--primary-text)', cursor: 'pointer',
                }}>
                <Sparkles size={16} />
              </button>
            </div>
          </div>
        )
      ) : (
        /* ── Normal chat ────────────────────────────── */
        <>
          {/* ── Messages ──────────────────────────────── */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chatMessages.length === 0 && !chatLoading && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center' }}>
                <Bot size={36} style={{ opacity: 0.2, marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>AI Counselor</div>
                <div style={{ fontSize: 12 }}>Ask anything about your studies</div>
              </div>
            )}
            {chatMessages.map((msg, i) => {
              const msgRtl = msg.role === 'user' ? isRTL(msg.content) : false;
              return (
              <div key={i} className={`animate-morph-in ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                borderRadius: msg.role === 'user'
                  ? (msgRtl ? '16px 16px 16px 4px' : '16px 16px 4px 16px')
                  : '16px 16px 16px 4px',
                background: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-surface)',
                color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                fontSize: 14, lineHeight: 1.7, wordBreak: 'break-word', overflowWrap: 'break-word',
              }}>
                {msg.role === 'user' ? (
                  <div className="content-selectable" style={{ padding: '10px 14px', whiteSpace: 'pre-wrap', userSelect: 'text', textAlign: msgRtl ? 'right' : 'left', direction: msgRtl ? 'rtl' : 'ltr', fontFamily: msgRtl ? "'Vazirmatn', 'Inter', sans-serif" : undefined }}>{msg.content}</div>
                ) : (
                  <div className="content-selectable" style={{ padding: '10px 14px', userSelect: 'text' }}>
                    <MarkdownRenderer content={msg.content} />
                    {msg.flashcardData && (
                      <div style={{
                        marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 'var(--radius-md)',
                        background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                        border: '1px solid var(--success)',
                      }}>
                        <Check size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {msg.flashcardData.inserted} flashcard{msg.flashcardData.inserted > 1 ? 's' : ''} inserted into “{msg.flashcardData.collectionName}”
                        </div>
                      </div>
                    )}
                    {msg.explainerData && (
                      <div style={{ marginTop: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
                        <button onClick={() => {
                          setExplainerTopic(msg.explainerData!.topic);
                          setExplainerSteps(msg.explainerData!.steps);
                          setExplainerStep(0);
                          setExplainerConv(msg.explainerData!.conv || []);
                          setExplainerActive(true);
                        }}
                          style={{
                            fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                            border: '1px solid var(--border)', background: 'var(--bg-surface)',
                            color: 'var(--primary)', cursor: 'pointer', fontFamily: 'inherit',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          <BookOpen size={12} /> View Explainer
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
            {chatLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', padding: '8px 12px' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animationDelay: '0s' }} />
                  <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animationDelay: '0.15s' }} />
                  <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animationDelay: '0.3s' }} />
                </div>
                <button onClick={() => { cancelRef.current = true; setChatLoading(false); }}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Quick actions ─────────────────────────── */}
          <div style={{ padding: '0 12px 4px', display: 'flex', gap: 4, flexShrink: 0 }}>
            <button className="btn btn-ghost" onClick={() => {
              if (input.trim()) {
                const topic = input.trim();
                setInput('');
                generateExplainer(topic);
              } else {
                setExplainerActive(true);
              }
            }}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--primary-light)', color: 'var(--primary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <BookOpen size={12} /> Explain
            </button>
          </div>

          {/* ── Attached study materials (persistent, toggleable) ── */}
          {attachedDocs.length > 0 && (
            <div style={{ padding: '4px 12px 0', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Context
              </span>
              {attachedDocs.map((a) => (
                <span key={a.id}
                  onClick={() => toggleAttachment(a.id)}
                  title={a.enabled ? 'Click to disable for new messages' : 'Click to enable'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '2px 6px 2px 8px', borderRadius: 'var(--radius-pill)',
                    fontSize: 11, cursor: 'pointer', userSelect: 'none',
                    background: a.enabled ? 'var(--primary-light)' : 'transparent',
                    border: `1px solid ${a.enabled ? 'var(--primary)' : 'var(--border)'}`,
                    color: a.enabled ? 'var(--primary)' : 'var(--text-muted)',
                    opacity: a.enabled ? 1 : 0.55,
                    maxWidth: 180,
                  }}>
                  <FileText size={10} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeAttachment(a.id); }}
                    title="Remove"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 1, display: 'flex', alignItems: 'center' }}>
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* ── Input ─────────────────────────────────── */}
          <div style={{ padding: '6px 12px 10px', display: 'flex', gap: 6, flexShrink: 0, borderTop: '1px solid var(--border)', position: 'relative' }}>
            {autocompleteOpen && filteredDocs.length > 0 && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 12, right: 12, zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', padding: 4, maxHeight: 200, overflow: 'auto',
                boxShadow: '0 -4px 16px rgba(0,0,0,0.12)',
              }}>
                {filteredDocs.map((name, i) => (
                  <div key={name} onClick={() => {
                    const atPos = input.lastIndexOf('@', input.length - autocompletePrefix.length - 1);
                    if (atPos >= 0) setInput(input.slice(0, atPos + 1) + name + ' ');
                    setAutocompleteOpen(false);
                    inputRef.current?.focus();
                  }}
                    style={{
                      padding: '6px 12px', fontSize: 13, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: i === autocompleteIdx ? 'var(--primary-light)' : 'transparent',
                      color: i === autocompleteIdx ? 'var(--primary)' : 'var(--text-secondary)',
                    }}>
                    <FileText size={13} /> {name}
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
              placeholder="Ask anything... (@ to mention a document)"
              rows={1}
              style={{
                flex: 1, border: '1px solid transparent', outline: 'none', resize: 'none', padding: '9px 12px',
                borderRadius: 'var(--radius-md)', fontSize: 14, fontFamily: 'inherit',
                background: 'var(--bg-surface)', color: 'var(--text-primary)', lineHeight: 1.6,
                maxHeight: 120, overflowY: 'auto', transition: 'border-color 0.15s ease, height 0.1s ease',
              }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
            />
            <button onClick={handleSend} disabled={!input.trim() || chatLoading}
              style={{
                alignSelf: 'flex-end', width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                border: 'none', cursor: input.trim() && !chatLoading ? 'pointer' : 'default',
                background: input.trim() && !chatLoading ? 'var(--primary)' : 'var(--bg-surface)',
                color: input.trim() && !chatLoading ? 'white' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}>
              <ArrowUp size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );

  const sessionDialog = (
    <Dialog open={sessionsDialogOpen} onClose={() => setSessionsDialogOpen(false)} title="Chat Sessions" width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflow: 'auto' }}>
        <button onClick={() => { createChatSession(); setSessionsDialogOpen(false); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)',
            background: 'transparent', color: 'var(--primary)', cursor: 'pointer',
            fontSize: 13, fontFamily: 'inherit', marginBottom: 4,
          }}>
          <Plus size={16} /> New Session
        </button>
        {chatSessions.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
            No sessions yet. Create one to get started.
          </div>
        )}
        {chatSessions.map((s) => (
          <div key={s.id} onClick={() => { switchChatSession(s.id); setSessionsDialogOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', fontSize: 13,
              background: s.id === activeSessionId ? 'var(--primary-light)' : 'transparent',
              color: s.id === activeSessionId ? 'var(--primary)' : 'var(--text-secondary)',
              transition: 'background 0.1s ease',
            }}>
            <MessageSquare size={14} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: s.id === activeSessionId ? 600 : 400 }}>
                {s.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {s.messages.length} messages · {new Date(s.createdAt).toLocaleDateString()}
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); deleteChatSession(s.id); }}
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

  if (aiDetached) {
    return (
      <>
        <Rnd
          position={{ x: aiWindowPosition.x, y: aiWindowPosition.y }}
          size={{ width: aiWindowSize.width, height: aiWindowSize.height }}
          dragHandleClassName="chatbot-header"
          onDragStop={(_e, d) => setAiWindowPosition({ x: d.x, y: d.y })}
          onResizeStop={(_e, _dir, ref, _delta, pos) => {
            setAiWindowSize({ width: parseInt(ref.style.width), height: parseInt(ref.style.height) });
            setAiWindowPosition({ x: pos.x, y: pos.y });
          }}
          minWidth={320} maxWidth={600} minHeight={300} maxHeight={700}
          style={{ zIndex: 40 }}
          enableResizing={{ top: true, right: true, bottom: true, left: true, topRight: true, bottomRight: true, bottomLeft: true, topLeft: true }}
        >
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            {inner(true)}
          </div>
        </Rnd>
        {sessionDialog}
        {renameDialog}
      </>
    );
  }

  return (
    <>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        height: `${chatbotHeight}vh`, borderTop: '1px solid var(--border)',
        background: 'var(--bg-card)',
        transition: 'height 0.05s linear',
      }}>
        {inner(false)}
        {/* Resize handle */}
        <div
          onPointerDown={(e) => {
            const startY = e.clientY;
            const startH = chatbotHeight;
            const onMove = (ev: PointerEvent) => {
              const dy = startY - ev.clientY;
              const newH = Math.min(60, Math.max(20, startH + (dy / window.innerHeight) * 100));
              setChatbotHeight(newH);
            };
            const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
          }}
          style={{
            position: 'absolute', top: -6, left: 0, right: 0, height: 12, cursor: 'ns-resize', zIndex: 5,
          }}
        />
      </div>
      {sessionDialog}
      {renameDialog}
    </>
  );
}
