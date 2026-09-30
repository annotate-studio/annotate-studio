'use client';

import React, { memo, useEffect, useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Check, Copy, Image as ImageIcon } from 'lucide-react';
import { isSafeUrl, parseMarkdown, type Block, type Inline } from '@/lib/markdown';
import { openExternal } from '@/lib/external';
import { readFileBytes } from '@/lib/tauri-commands';
import { copyText, cn, extensionOf } from '@/lib/utils';
import { openWikiLink } from '@/lib/workspace-actions';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onWikiLink?: (target: string) => void;
  sourceId?: string;
}

const MathNode = memo(function MathNode({ value, display }: { value: string; display: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(value, { throwOnError: false, displayMode: display, strict: 'ignore' });
    } catch {
      return null;
    }
  }, [value, display]);
  if (html === null) return <code className="md-inline-code">{value}</code>;
  if (display) return <div className="md-math" dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />;
  return <span className="md-math-inline" dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />;
});

function CodeBlock({ lang, value }: { lang: string; value: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="md-code" dir="ltr">
      <div className="md-code-header">
        <span>{lang || 'text'}</span>
        <button type="button" onClick={() => copyText(value).then(setCopied)} aria-label="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{value}</code>
      </pre>
    </div>
  );
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function WorkspaceImage({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    readFileBytes(src)
      .then((bytes) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[extensionOf(src)] ?? 'application/octet-stream' }));
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  if (failed) return <span className="md-image-missing">{alt || src}</span>;
  if (!url) return <span className="md-image-loading" />;
  return <img className="md-image" src={url} alt={alt} />;
}

function renderInline(nodes: Inline[], onWikiLink: (target: string) => void): React.ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <React.Fragment key={index}>{node.value}</React.Fragment>;
      case 'strong':
        return <strong key={index}>{renderInline(node.children, onWikiLink)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(node.children, onWikiLink)}</em>;
      case 'del':
        return <del key={index}>{renderInline(node.children, onWikiLink)}</del>;
      case 'code':
        return (
          <code key={index} className="md-inline-code">
            {node.value}
          </code>
        );
      case 'math':
        return <MathNode key={index} value={node.value} display={node.display} />;
      case 'break':
        return <br key={index} />;
      case 'image': {
        if (/^data:image\//i.test(node.src)) return <img key={index} className="md-image" src={node.src} alt={node.alt} />;
        if (/^https?:/i.test(node.src)) {
          return (
            <a
              key={index}
              className="md-link md-remote-image"
              href={node.src}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void openExternal(node.src);
              }}
              title={`Open image: ${node.src}`}
            >
              <ImageIcon size={13} /> {node.alt || hostOf(node.src)}
            </a>
          );
        }
        return <WorkspaceImage key={index} src={node.src} alt={node.alt} />;
      }
      case 'wikilink':
        return (
          <button
            key={index}
            type="button"
            className="md-wikilink"
            onClick={(event) => {
              event.stopPropagation();
              onWikiLink(node.target);
            }}
            title={`Open ${node.target}`}
          >
            {node.label}
          </button>
        );
      case 'link': {
        const safe = isSafeUrl(node.href);
        return (
          <a
            key={index}
            className="md-link"
            href={safe ? node.href : undefined}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (safe) void openExternal(node.href);
            }}
            title={node.href}
          >
            {renderInline(node.children, onWikiLink)}
          </a>
        );
      }
      default:
        return null;
    }
  });
}

function renderBlocks(blocks: Block[], onWikiLink: (target: string) => void, tight = false): React.ReactNode[] {
  return blocks.map((block, index) => {
    switch (block.type) {
      case 'heading': {
        const Tag = `h${block.level}` as 'h1';
        return (
          <Tag key={index} dir="auto">
            {renderInline(block.children, onWikiLink)}
          </Tag>
        );
      }
      case 'paragraph':
        return tight ? (
          <span key={index} className="md-tight" dir="auto">
            {renderInline(block.children, onWikiLink)}
          </span>
        ) : (
          <p key={index} dir="auto">
            {renderInline(block.children, onWikiLink)}
          </p>
        );
      case 'code':
        return <CodeBlock key={index} lang={block.lang} value={block.value} />;
      case 'math':
        return <MathNode key={index} value={block.value} display />;
      case 'quote':
        return (
          <blockquote key={index} dir="auto">
            {renderBlocks(block.children, onWikiLink)}
          </blockquote>
        );
      case 'hr':
        return <hr key={index} />;
      case 'list': {
        const items = block.items.map((item, itemIndex) => (
          <li key={itemIndex} dir="auto" className={item.checked !== null ? 'md-task' : undefined}>
            {item.checked !== null ? (
              <>
                <span className="md-task-line">
                  <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} />
                  <span className="md-task-text">{renderBlocks(item.children.slice(0, 1), onWikiLink, true)}</span>
                </span>
                {renderBlocks(item.children.slice(1), onWikiLink, block.tight)}
              </>
            ) : (
              renderBlocks(item.children, onWikiLink, block.tight)
            )}
          </li>
        ));
        return block.ordered ? (
          <ol key={index} dir="auto" start={block.start !== 1 ? block.start : undefined}>
            {items}
          </ol>
        ) : (
          <ul key={index} dir="auto" className={block.items.every((item) => item.checked !== null) ? 'md-task-list' : undefined}>
            {items}
          </ul>
        );
      }
      case 'table':
        return (
          <div key={index} className="md-table">
            <table dir="auto">
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th key={cellIndex} dir="auto" style={{ textAlign: block.align[cellIndex] ?? undefined }}>
                      {renderInline(cell, onWikiLink)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} dir="auto" style={{ textAlign: block.align[cellIndex] ?? undefined }}>
                        {renderInline(cell, onWikiLink)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  });
}

function MarkdownRenderer({ content, className, onWikiLink, sourceId }: MarkdownRendererProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  const handleWikiLink = useMemo(
    () => onWikiLink ?? ((target: string) => void openWikiLink(target, sourceId)),
    [onWikiLink, sourceId],
  );
  return <div className={cn('md', className)}>{renderBlocks(blocks, handleWikiLink)}</div>;
}

export default memo(MarkdownRenderer);
