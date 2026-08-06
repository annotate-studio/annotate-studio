'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function InlineKatex({ formula }: { formula: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(formula, { throwOnError: false, displayMode: false });
    } catch { return formula; }
  }, [formula]);
  return <span className="katex-inline" style={{ fontSize: 'inherit' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function BlockKatex({ formula }: { formula: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(formula, { throwOnError: false, displayMode: true });
    } catch { return formula; }
  }, [formula]);
  return (
    <div
      className="katex-block"
      style={{
        overflowX: 'auto', overflowY: 'hidden', padding: '4px 0',
        fontSize: 17, lineHeight: 1.8,
        WebkitOverflowScrolling: 'touch',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={parts.length}>{renderInline(boldMatch[1])}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      parts.push(<em key={parts.length}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }
    const codeMatch = remaining.match(/^`(.+?)`/);
    if (codeMatch) {
      parts.push(<code key={parts.length} style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: '0.9em' }}>{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }
    const wikiMatch = remaining.match(/^\[\[(.+?)\]\]/);
    if (wikiMatch) {
      parts.push(
        <span key={parts.length} style={{ color: 'var(--primary)', background: 'var(--primary-light)', padding: '1px 6px', borderRadius: 4, fontSize: '0.9em', cursor: 'pointer' }}>
          [[{wikiMatch[1]}]]
        </span>
      );
      remaining = remaining.slice(wikiMatch[0].length);
      continue;
    }
    const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/);
    if (linkMatch) {
      parts.push(<a key={parts.length} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>{linkMatch[1]}</a>);
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }
    const latexMatch = remaining.match(/^\$(.+?)\$/);
    if (latexMatch) {
      parts.push(<InlineKatex key={parts.length} formula={latexMatch[1]} />);
      remaining = remaining.slice(latexMatch[0].length);
      continue;
    }
    const nextSpecial = remaining.search(/(\*\*|\*|`|\[\[|\[|`|\$)/);
    if (nextSpecial === 0) {
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else if (nextSpecial > 0) {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    } else {
      parts.push(remaining);
      remaining = '';
    }
  }
  return parts;
}

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let inMathBlock = false;
  let codeBlockContent = '';
  let codeBlockLang = '';

  const flushCodeBlock = () => {
    if (codeBlockContent) {
      const trimmed = codeBlockContent.replace(/\n$/, '');
      elements.push(
        <div key={elements.length} style={{ marginBottom: 12, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
          {codeBlockLang && (
            <div style={{ padding: '4px 12px', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono', monospace" }}>
              {codeBlockLang}
            </div>
          )}
          <pre style={{
            background: 'var(--bg-elevated)', padding: 14, margin: 0,
            fontSize: 13, overflow: 'auto', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5,
          }}>
            <code>{trimmed}</code>
          </pre>
        </div>
      );
      codeBlockContent = '';
      codeBlockLang = '';
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('$$') && line.endsWith('$$') && line.length > 4) {
      flushCodeBlock();
      const formula = line.slice(2, -2).trim();
      elements.push(<BlockKatex key={elements.length} formula={formula} />);
      continue;
    }
    if (line.trim() === '$$' && !inMathBlock) {
      flushCodeBlock();
      inMathBlock = true;
      codeBlockContent = '';
      continue;
    }
    if (line.trim() === '$$' && inMathBlock) {
      inMathBlock = false;
      elements.push(<BlockKatex key={elements.length} formula={codeBlockContent.trim()} />);
      codeBlockContent = '';
      continue;
    }
    if (inMathBlock) {
      codeBlockContent += line + '\n';
      continue;
    }

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushCodeBlock();
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent += line + '\n';
      continue;
    }

    if (line.trim() === '') {
      flushCodeBlock();
      elements.push(<div key={elements.length} style={{ height: 8 }} />);
      continue;
    }

    if (line.startsWith('#### ')) {
      flushCodeBlock();
      elements.push(<h4 key={elements.length} style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, marginTop: 10, color: 'var(--text-primary)' }}>{renderInline(line.slice(5))}</h4>);
      continue;
    }
    if (line.startsWith('### ')) {
      flushCodeBlock();
      elements.push(<h3 key={elements.length} style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, marginTop: 12, color: 'var(--text-primary)' }}>{renderInline(line.slice(4))}</h3>);
      continue;
    }
    if (line.startsWith('## ')) {
      flushCodeBlock();
      elements.push(<h2 key={elements.length} style={{ fontSize: 19, fontWeight: 600, marginBottom: 8, marginTop: 16, color: 'var(--text-primary)' }}>{renderInline(line.slice(3))}</h2>);
      continue;
    }
    if (line.startsWith('# ')) {
      flushCodeBlock();
      elements.push(<h1 key={elements.length} style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, marginTop: 16, color: 'var(--text-primary)' }}>{renderInline(line.slice(2))}</h1>);
      continue;
    }

    if (line.startsWith('|') && line.endsWith('|') && line.includes('|')) {
      flushCodeBlock();
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        continue;
      }
      const headerRow = i > 0 && /^\|.+\|$/.test(lines[i - 1]) && !/^:?-+:?$/.test(lines[i - 1]);
      const tableRows = [cells];
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith('|') && lines[j].endsWith('|')) {
        const n = lines[j].split('|').slice(1, -1).map((c) => c.trim());
        if (n.every((c) => /^:?-+:?$/.test(c))) { j++; continue; }
        tableRows.push(n);
        j++;
      }
      elements.push(
          <div key={elements.length} style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
              <tbody>
                {tableRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      ri === 0 && headerRow ? (
                        <th key={ci} style={{ border: '1px solid var(--border)', padding: '8px 12px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600, textAlign: 'left' }}>{cell}</th>
                      ) : (
                        <td key={ci} style={{ border: '1px solid var(--border)', padding: '8px 12px', color: 'var(--text-secondary)' }}>{cell}</td>
                      )
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      );
      i = j - 1;
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushCodeBlock();
      const listItems = [{ text: line.slice(2), indent: 0 }];
      let j = i + 1;
      while (j < lines.length && (lines[j].startsWith('- ') || lines[j].startsWith('* ') || lines[j].match(/^\d+\.\s/))) {
        if (lines[j].startsWith('- ') || lines[j].startsWith('* ')) {
          listItems.push({ text: lines[j].slice(2), indent: 0 });
        } else {
          listItems.push({ text: lines[j].replace(/^\d+\.\s/, ''), indent: 0 });
        }
        j++;
      }
      i = j - 1;
      elements.push(
        <ul key={elements.length} style={{ margin: '4px 0 8px', paddingLeft: 20 }}>
          {listItems.map((item, li) => (
            <li key={li} style={{ marginBottom: 4, color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 15 }}>{renderInline(item.text)}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      flushCodeBlock();
      const listItems = [{ text: line.replace(/^\d+\.\s/, ''), indent: 0 }];
      let j = i + 1;
      while (j < lines.length && (lines[j].match(/^\d+\.\s/) || lines[j].startsWith('- ') || lines[j].startsWith('* '))) {
        if (lines[j].match(/^\d+\.\s/)) {
          listItems.push({ text: lines[j].replace(/^\d+\.\s/, ''), indent: 0 });
        } else {
          listItems.push({ text: lines[j].slice(2), indent: 0 });
        }
        j++;
      }
      i = j - 1;
      elements.push(
        <ol key={elements.length} style={{ margin: '4px 0 8px', paddingLeft: 20 }}>
          {listItems.map((item, li) => (
            <li key={li} style={{ marginBottom: 4, color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 15 }}>{renderInline(item.text)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.startsWith('---') || line.startsWith('***')) {
      flushCodeBlock();
      elements.push(<hr key={elements.length} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />);
      continue;
    }
    if (line.startsWith('> ')) {
      flushCodeBlock();
      const quoteLines = [line.slice(2)];
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith('> ')) {
        quoteLines.push(lines[j].slice(2));
        j++;
      }
      i = j - 1;
      elements.push(
        <blockquote key={elements.length} style={{
          borderLeft: '3px solid var(--primary)', padding: '10px 16px', margin: '8px 0',
          color: 'var(--text-secondary)', fontStyle: 'italic', background: 'var(--bg-elevated)',
          borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
        }}>
          {quoteLines.map((ql, qi) => (
            <p key={qi} style={{ marginBottom: qi < quoteLines.length - 1 ? 6 : 0, lineHeight: 1.7, fontSize: 15 }}>{renderInline(ql)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    flushCodeBlock();
    elements.push(<p key={elements.length} style={{ marginBottom: 8, lineHeight: 1.7, color: 'var(--text-secondary)', fontSize: 15 }}>{renderInline(line)}</p>);
  }
  flushCodeBlock();

  return <>{elements}</>;
}
