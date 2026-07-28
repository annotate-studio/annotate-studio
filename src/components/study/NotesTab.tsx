'use client';

import React, { useState } from 'react';

export default function NotesTab() {
  const [content, setContent] = useState('# New Note\n\nStart writing in Markdown...\n\n## Key Concepts\n\n- **Bold text** and *italic text*\n- LaTeX: $E = mc^2$\n- Code: `console.log("hello")`\n\n```python\ndef fib(n):\n    return n if n <= 1 else fib(n-1) + fib(n-2)\n```');

  return (
    <div style={{ height: '100%', display: 'flex', padding: 16, gap: 16 }}>
      {/* Editor */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Note header */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <input
            defaultValue="New Note"
            style={{
              border: 'none', background: 'transparent', color: 'var(--text-primary)',
              fontSize: 15, fontWeight: 600, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 12px' }}>Save</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 12px' }}>Export</button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '6px 12px', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 4, fontSize: 13,
        }}>
          {['B', 'I', 'U', 'H1', 'H2', 'Link', 'Code', 'LaTeX', 'List'].map((btn) => (
            <button key={btn} className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12, minWidth: 28 }}>
              {btn}
            </button>
          ))}
        </div>

        {/* Editor textarea */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{
            flex: 1, padding: 16, border: 'none', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.7,
            resize: 'none', outline: 'none', fontFamily: "'JetBrains Mono', monospace",
          }}
        />
      </div>

      {/* Preview */}
      <div className="card" style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Preview
        </div>
        <div className="content-selectable" style={{ lineHeight: 1.7, color: 'var(--text-primary)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>New Note</div>
          <p style={{ marginBottom: 12 }}>Start writing in Markdown...</p>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>Key Concepts</h2>
          <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
            <li><strong>Bold text</strong> and <em>italic text</em></li>
            <li>LaTeX: <span style={{ fontStyle: 'italic' }}>E = mc²</span></li>
            <li>Code: <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>console.log(&quot;hello&quot;)</code></li>
          </ul>
          <pre style={{
            background: 'var(--bg-elevated)', padding: 14, borderRadius: 'var(--radius-md)',
            fontSize: 13, overflow: 'auto',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {`def fib(n):
    return n if n <= 1 else fib(n-1) + fib(n-2)`}
          </pre>
        </div>
      </div>
    </div>
  );
}
