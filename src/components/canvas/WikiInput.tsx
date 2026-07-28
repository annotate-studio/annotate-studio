'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Bold, Italic, Heading, Code, List, Link, Eye } from 'lucide-react';
import { getAllFiles } from '@/lib/tauri-commands';
import type { StudyFile } from '@/lib/tauri-commands';

interface WikiInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function WikiInput({ value, onChange, placeholder, style }: WikiInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [files, setFiles] = useState<StudyFile[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompletePrefix, setAutocompletePrefix] = useState('');
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    getAllFiles().then(setFiles).catch(() => {});
  }, []);

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(autocompletePrefix.toLowerCase())
  );

  const getCursorPos = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return { top: 0, left: 0 };
    const pos = ta.selectionStart;
    const textUpToCursor = ta.value.slice(0, pos);
    const lines = textUpToCursor.split('\n');
    const lineNum = lines.length - 1;
    const colNum = lines[lineNum].length;
    const lineHeight = 20;
    const charWidth = 8.2;
    return { top: lineNum * lineHeight + 30, left: colNum * charWidth + 12 };
  }, []);

  const insert = useCallback((before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newVal);
    setTimeout(() => {
      ta.focus();
      const pos = start + before.length + selected.length + after.length;
      ta.setSelectionRange(start + before.length, pos);
    }, 0);
  }, [value, onChange]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);
    const pos = e.target.selectionStart;
    const beforeCursor = val.slice(0, pos);
    const openIdx = beforeCursor.lastIndexOf('[[');
    if (openIdx !== -1 && beforeCursor.slice(openIdx + 2).indexOf(']]') === -1) {
      setAutocompletePrefix(beforeCursor.slice(openIdx + 2));
      setShowAutocomplete(true);
      setSelectedIndex(0);
      setAutocompletePos(getCursorPos());
    } else {
      setShowAutocomplete(false);
    }
  }, [onChange, getCursorPos]);

  const insertWikiLink = useCallback((name: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const beforeCursor = value.slice(0, pos);
    const openIdx = beforeCursor.lastIndexOf('[[');
    if (openIdx === -1) return;
    const displayName = name.replace(/\.(md|pdf|png|jpg|jpeg)$/, '');
    const newVal = `${value.slice(0, openIdx)}[[${displayName}]]${value.slice(pos)}`;
    onChange(newVal);
    setShowAutocomplete(false);
    setTimeout(() => {
      ta.focus();
      const newPos = openIdx + displayName.length + 4;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }, [value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showAutocomplete) return;
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertWikiLink(filtered[selectedIndex].name); }
    else if (e.key === 'Escape') { setShowAutocomplete(false); }
  }, [showAutocomplete, filtered, selectedIndex, insertWikiLink]);

  const toolbar = [
    { icon: <Bold size={13} />, title: 'Bold', action: () => insert('**', '**') },
    { icon: <Italic size={13} />, title: 'Italic', action: () => insert('*', '*') },
    { icon: <Heading size={13} />, title: 'Heading', action: () => insert('## ', '') },
    { icon: <Code size={13} />, title: 'Code', action: () => insert('`', '`') },
    { icon: <List size={13} />, title: 'List', action: () => insert('- ', '') },
    { icon: <Link size={13} />, title: 'Link', action: () => insert('[', '](url)') },
  ];

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '4px 8px', display: 'flex', gap: 2, borderBottom: '1px solid var(--border)',
        flexShrink: 0, background: 'var(--bg-surface)',
      }}>
        {toolbar.map((t, i) => (
          <button key={i} onClick={t.action} title={t.title}
            style={{
              width: 28, height: 28, border: 'none', background: 'transparent',
              cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: 'var(--radius-xs)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            {t.icon}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>
          Markdown
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Start writing... use [[ to link files"}
          style={{
            width: '100%', height: '100%', border: 'none', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.7,
            resize: 'none', outline: 'none', fontFamily: "'JetBrains Mono', monospace",
            padding: 12,
            ...style,
          }}
        />
        {showAutocomplete && filtered.length > 0 && (
          <div style={{
            position: 'absolute', top: autocompletePos.top, left: autocompletePos.left,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            maxHeight: 200, overflow: 'auto', minWidth: 200, zIndex: 100,
          }}>
            {filtered.map((f, i) => (
              <div key={f.id} onClick={() => insertWikiLink(f.name)}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                  background: i === selectedIndex ? 'var(--primary-light)' : 'transparent',
                  color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                  background: f.file_type === 'Markdown' ? 'var(--primary-light)' : f.file_type === 'Pdf' ? 'var(--danger-light)' : 'var(--success-light)',
                  color: f.file_type === 'Markdown' ? 'var(--primary)' : f.file_type === 'Pdf' ? 'var(--danger)' : 'var(--success)',
                }}>
                  {f.file_type === 'Markdown' ? 'MD' : f.file_type === 'Pdf' ? 'PDF' : 'IMG'}
                </span>
                {f.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
