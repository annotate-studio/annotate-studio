'use client';

import React, { createContext, memo, useContext, useEffect, useId, useMemo, useState } from 'react';
import 'katex/dist/katex.min.css';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Copy,
  Flame,
  Image as ImageIcon,
  Info,
  Lightbulb,
  ListTodo,
  Maximize2,
  Pencil,
  Quote,
  Sigma,
  XCircle,
} from 'lucide-react';
import { inlineProse, isSafeUrl, parseMarkdown, type Block, type Inline } from '@/lib/markdown';
import { analyzeDocument, CALLOUT_TITLES, CALLOUT_TONES, ENV_LABELS, resolveMathRefs, type DocumentModel } from '@/lib/latex';
import { renderMath } from '@/lib/math-render';
import {
  countLetters,
  detectDirection,
  directionFromCounts,
  dominantDirection,
  hasPersianLetters,
  stripNeutralSpans,
  toPersianDigits,
  type DirectionMode,
  type TextDirection,
} from '@/lib/bidi';
import { openExternal } from '@/lib/external';
import { isWorkspaceImageReference, resolveWorkspaceImage, workspaceImageTarget } from '@/lib/images';
import { readFileBytes } from '@/lib/tauri-commands';
import { copyText, cn, extensionOf } from '@/lib/utils';
import { openWikiLink } from '@/lib/workspace-actions';
import { useLibrary } from '@/store/library';
import { useFormula } from '@/store/formula';
import { useSettings } from '@/store/settings';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onWikiLink?: (target: string) => void;
  sourceId?: string;
  direction?: DirectionMode;
}

interface RenderContext {
  model: DocumentModel;
  onWikiLink: (target: string) => void;
  persian: boolean;
}

const Context = createContext<RenderContext | null>(null);

function useRenderContext(): RenderContext {
  const context = useContext(Context);
  if (!context) throw new Error('Markdown context missing');
  return context;
}

function scrollToAnchor(anchor: string) {
  const element = document.getElementById(anchor);
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  element.classList.remove('md-flash');
  void element.offsetWidth;
  element.classList.add('md-flash');
}

function localNumber(value: string, persian: boolean): string {
  return persian ? toPersianDigits(value) : value;
}

const MathNode = memo(function MathNode({
  latex,
  display,
  anchor,
  macrosKey,
}: {
  latex: string;
  display: boolean;
  anchor?: string | null;
  macrosKey: string;
}) {
  const { model } = useRenderContext();
  const resolved = useMemo(() => resolveMathRefs(latex, model.labels), [latex, model.labels]);
  const rendered = useMemo(() => renderMath(resolved, display, model.macros, macrosKey), [resolved, display, model.macros, macrosKey]);
  const openFormula = () =>
    useFormula.getState().open({ latex: resolved, display: true, macros: model.macros, macrosKey, source: latex });
  if (!rendered.html) return <code className="md-inline-code md-math-error" title={rendered.error ?? undefined}>{latex}</code>;
  if (display) {
    return (
      <div className={cn('md-math', rendered.error && 'md-math-has-error')} dir="ltr" id={anchor ?? undefined} onDoubleClick={openFormula}>
        <div className="md-math-body" dangerouslySetInnerHTML={{ __html: rendered.html }} title={rendered.error ?? undefined} />
        <button type="button" className="md-math-zoom" onClick={openFormula} title="Enlarge formula" aria-label="Enlarge formula">
          <Maximize2 size={13} />
        </button>
      </div>
    );
  }
  return (
    <span
      className={cn('md-math-inline', rendered.error && 'md-math-has-error')}
      dir="ltr"
      onDoubleClick={openFormula}
      title={rendered.error ?? undefined}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
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
  const files = useLibrary((state) => state.files);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const target = useMemo(() => {
    const cleaned = workspaceImageTarget(src);
    if (!cleaned) return null;
    const forced = isWorkspaceImageReference(src);
    if (!forced && (cleaned.includes('/') || files.length === 0)) return cleaned;
    return resolveWorkspaceImage(cleaned, files) ?? (forced ? null : cleaned);
  }, [src, files]);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    if (!target) {
      setFailed(true);
      return;
    }
    readFileBytes(target)
      .then((bytes) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[extensionOf(target)] ?? 'application/octet-stream' }));
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [target]);
  if (failed) return <span className="md-image-missing">{alt || workspaceImageTarget(src)}</span>;
  if (!url) return <span className="md-image-loading" />;
  return <img className="md-image" src={url} alt={alt} />;
}

function RefNode({ refKey, style }: { refKey: string; style: 'ref' | 'eqref' | 'auto' }) {
  const { model, persian } = useRenderContext();
  const target = model.labels.get(refKey);
  if (!target) {
    return (
      <span className="md-ref md-ref-missing" title={`Unknown label: ${refKey}`}>
        ??
      </span>
    );
  }
  const number = localNumber(target.text, persian);
  const label = ENV_LABELS[target.kind];
  const text =
    style === 'eqref'
      ? `(${number})`
      : style === 'auto' && label
        ? `${persian ? label.fa : label.en} ${target.kind === 'equation' ? `(${number})` : number}`
        : number;
  return (
    <a
      className="md-ref"
      href={`#${target.anchor}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        scrollToAnchor(target.anchor);
      }}
    >
      {text}
    </a>
  );
}

function FootnoteRef({ id }: { id: string }) {
  const { model, persian } = useRenderContext();
  const number = model.footnotes.numbers.get(id);
  if (number === undefined) return <sup className="md-footnote-ref">[{id}]</sup>;
  return (
    <sup className="md-footnote-ref">
      <a
        href={`#fn-${id}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const element = (event.currentTarget.closest('.md') as HTMLElement | null)?.querySelector(`[data-footnote="${CSS.escape(id)}"]`);
          if (element instanceof HTMLElement) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.remove('md-flash');
            void element.offsetWidth;
            element.classList.add('md-flash');
          }
        }}
      >
        {localNumber(String(number), persian)}
      </a>
    </sup>
  );
}

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  const context = useRenderContext();
  return <>{renderInline(nodes, context)}</>;
}

function renderInline(nodes: Inline[], context: RenderContext): React.ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <React.Fragment key={index}>{node.value}</React.Fragment>;
      case 'strong':
        return <strong key={index}>{renderInline(node.children, context)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(node.children, context)}</em>;
      case 'del':
        return <del key={index}>{renderInline(node.children, context)}</del>;
      case 'mark':
        return (
          <mark key={index} className="md-mark">
            {renderInline(node.children, context)}
          </mark>
        );
      case 'code':
        return (
          <code key={index} className="md-inline-code" dir="auto">
            {node.value}
          </code>
        );
      case 'math': {
        const plan = context.model.inlineMath.get(node);
        const latex = plan ? plan.latex : node.value;
        if (!latex.trim()) return null;
        return <MathNode key={index} latex={latex} display={node.display} macrosKey={context.model.macrosKey} />;
      }
      case 'break':
        return <br key={index} />;
      case 'footnoteRef':
        return <FootnoteRef key={index} id={node.id} />;
      case 'ref':
        return <RefNode key={index} refKey={node.key} style={node.style} />;
      case 'cite':
        return (
          <span key={index} className="md-cite" dir="ltr">
            [{node.keys.join(', ')}]
          </span>
        );
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
            dir="auto"
            onClick={(event) => {
              event.stopPropagation();
              context.onWikiLink(node.target);
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
            {renderInline(node.children, context)}
          </a>
        );
      }
      default:
        return null;
    }
  });
}

function inlineDirection(nodes: Inline[], persian = false): TextDirection | null {
  const prose = inlineProse(nodes);
  const detected = detectDirection(prose);
  if (detected === 'rtl') return 'rtl';
  if (persian && hasPersianLetters(prose)) return 'rtl';
  return detected;
}

function inherentDirection(block: Block, persian = false): TextDirection | null {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return inlineDirection(block.children, persian);
    case 'list': {
      for (const item of block.items) {
        const direction = blocksDirection(item.children, persian);
        if (direction) return direction;
      }
      return null;
    }
    case 'quote':
    case 'footnoteDef':
    case 'env':
      return blocksDirection(block.children, persian) ?? (block.type === 'env' && block.title ? inlineDirection(block.title, persian) : null);
    case 'callout':
      return blocksDirection(block.children, persian) ?? inlineDirection(block.title, persian);
    case 'table': {
      let rtl = 0;
      let ltr = 0;
      const cells = [...block.header, ...block.rows.slice(0, 8).flat()];
      for (const cell of cells) {
        const counts = countLetters(stripNeutralSpans(inlineProse(cell)));
        rtl += counts.rtl;
        ltr += counts.ltr;
      }
      const detected = directionFromCounts({ rtl, ltr });
      if (detected === 'ltr' && persian && rtl > 0) return 'rtl';
      return detected;
    }
    default:
      return null;
  }
}

function blocksDirection(blocks: Block[], persian = false): TextDirection | null {
  for (const block of blocks) {
    const direction = inherentDirection(block, persian);
    if (direction) return direction;
  }
  return null;
}

function blockText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
        case 'paragraph':
          return inlineProse(block.children);
        case 'list':
          return block.items.map((item) => blockText(item.children)).join(' ');
        case 'quote':
        case 'env':
        case 'callout':
        case 'footnoteDef':
          return blockText(block.children);
        default:
          return '';
      }
    })
    .join(' ');
}

const CALLOUT_ICONS: Record<string, React.ReactNode> = {
  blue: <Info size={15} />,
  teal: <Lightbulb size={15} />,
  green: <CheckCircle2 size={15} />,
  amber: <CircleHelp size={15} />,
  orange: <AlertTriangle size={15} />,
  red: <XCircle size={15} />,
  violet: <Sigma size={15} />,
  gray: <Quote size={15} />,
};

function calloutIcon(kind: string, tone: string): React.ReactNode {
  if (kind === 'todo') return <ListTodo size={15} />;
  if (kind === 'example') return <Pencil size={15} />;
  if (kind === 'abstract' || kind === 'summary' || kind === 'tldr') return <BookOpen size={15} />;
  if (kind === 'danger' || kind === 'error') return <Flame size={15} />;
  return CALLOUT_ICONS[tone] ?? CALLOUT_ICONS.blue;
}

function Callout({ block, dir }: { block: Extract<Block, { type: 'callout' }>; dir: TextDirection }) {
  const context = useRenderContext();
  const [open, setOpen] = useState(block.fold !== 'closed');
  const theorem = ENV_LABELS[block.kind];
  const tone = CALLOUT_TONES[block.kind] ?? (theorem ? 'violet' : 'blue');
  const persian = hasPersianLetters(inlineProse(block.title) + blockText(block.children)) || (dir === 'rtl' && context.persian);
  const fallback = CALLOUT_TITLES[block.kind] ?? (theorem ? { en: theorem.en, fa: theorem.fa } : { en: block.kind.charAt(0).toUpperCase() + block.kind.slice(1), fa: block.kind });
  const title = block.title.length > 0 ? <InlineNodes nodes={block.title} /> : persian ? fallback.fa : fallback.en;
  const foldable = block.fold !== null;
  return (
    <div className={cn('md-callout', `md-tone-${tone}`, foldable && !open && 'md-callout-closed')} dir={dir}>
      <div
        className={cn('md-callout-title', foldable && 'md-callout-toggle')}
        onClick={foldable ? () => setOpen((value) => !value) : undefined}
        role={foldable ? 'button' : undefined}
      >
        <span className="md-callout-icon">{calloutIcon(block.kind, tone)}</span>
        <span className="md-callout-label">{title}</span>
        {foldable && <ChevronRight size={14} className="md-callout-chevron" />}
      </div>
      {(!foldable || open) && block.children.length > 0 && <div className="md-callout-body">{renderBlocks(block.children, context, dir)}</div>}
    </div>
  );
}

function EnvBlock({ block, dir }: { block: Extract<Block, { type: 'env' }>; dir: TextDirection }) {
  const context = useRenderContext();
  const plan = context.model.envs.get(block);
  const meta = ENV_LABELS[block.name] ?? { en: block.name, fa: block.name, numbered: false };
  const persian = hasPersianLetters(blockText(block.children) + (block.title ? inlineProse(block.title) : '')) || (dir === 'rtl' && context.persian);
  const name = persian ? meta.fa : meta.en;
  const number = plan?.number ? ` ${localNumber(plan.number, persian)}` : '';
  const proofLike = block.name === 'proof' || block.name === 'solution';
  return (
    <div className={cn('md-env', `md-env-${block.name}`, proofLike && 'md-env-proof')} dir={dir} id={plan?.anchor ?? undefined}>
      <span className="md-env-head">
        {name}
        {number}
        {block.title && (
          <span className="md-env-title">
            {' '}
            (<InlineNodes nodes={block.title} />)
          </span>
        )}
        {'. '}
      </span>
      {renderBlocks(block.children, context, dir)}
      {proofLike && <span className="md-qed" aria-hidden="true">∎</span>}
    </div>
  );
}

function renderBlocks(blocks: Block[], context: RenderContext, parentDir: TextDirection, tight = false): React.ReactNode[] {
  return blocks.map((block, index) => {
    const dir = inherentDirection(block, context.persian) ?? parentDir;
    switch (block.type) {
      case 'heading': {
        const Tag = `h${block.level}` as 'h1';
        return (
          <Tag key={index} dir={dir}>
            {renderInline(block.children, context)}
          </Tag>
        );
      }
      case 'paragraph':
        return tight ? (
          <span key={index} className="md-tight" dir={dir}>
            {renderInline(block.children, context)}
          </span>
        ) : (
          <p key={index} dir={dir}>
            {renderInline(block.children, context)}
          </p>
        );
      case 'code':
        return <CodeBlock key={index} lang={block.lang} value={block.value} />;
      case 'math': {
        const plan = context.model.blockMath.get(block);
        if (plan?.hidden) return null;
        return <MathNode key={index} latex={plan ? plan.latex : block.value} display anchor={plan?.anchor} macrosKey={context.model.macrosKey} />;
      }
      case 'quote':
        return (
          <blockquote key={index} dir={dir}>
            {renderBlocks(block.children, context, dir)}
          </blockquote>
        );
      case 'callout':
        return <Callout key={index} block={block} dir={dir} />;
      case 'env':
        return <EnvBlock key={index} block={block} dir={dir} />;
      case 'hr':
        return <hr key={index} />;
      case 'defs':
      case 'footnoteDef':
        return null;
      case 'list': {
        const items = block.items.map((item, itemIndex) => {
          const itemDir = blocksDirection(item.children, context.persian) ?? dir;
          return (
            <li key={itemIndex} dir={itemDir} className={item.checked !== null ? 'md-task' : undefined}>
              {item.checked !== null ? (
                <>
                  <span className="md-task-line">
                    <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} />
                    <span className="md-task-text">{renderBlocks(item.children.slice(0, 1), context, itemDir, true)}</span>
                  </span>
                  {renderBlocks(item.children.slice(1), context, itemDir, block.tight)}
                </>
              ) : (
                renderBlocks(item.children, context, itemDir, block.tight)
              )}
            </li>
          );
        });
        if (block.ordered) {
          const persian = dir === 'rtl' && hasPersianLetters(blockText(block.items.flatMap((item) => item.children)));
          return (
            <ol key={index} dir={dir} className={persian ? 'md-ol-persian' : undefined} start={block.start !== 1 ? block.start : undefined}>
              {items}
            </ol>
          );
        }
        return (
          <ul key={index} dir={dir} className={block.items.every((item) => item.checked !== null) ? 'md-task-list' : undefined}>
            {items}
          </ul>
        );
      }
      case 'table':
        return (
          <div key={index} className="md-table" dir={dir}>
            <table dir={dir}>
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th key={cellIndex} dir={inlineDirection(cell, context.persian) ?? dir} style={{ textAlign: block.align[cellIndex] ?? undefined }}>
                      {renderInline(cell, context)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} dir={inlineDirection(cell, context.persian) ?? dir} style={{ textAlign: block.align[cellIndex] ?? undefined }}>
                        {renderInline(cell, context)}
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

function Footnotes({ dir }: { dir: TextDirection }) {
  const context = useRenderContext();
  const { order, defs } = context.model.footnotes;
  const entries = order.filter((id) => defs.has(id));
  if (entries.length === 0) return null;
  return (
    <section className="md-footnotes" dir={dir}>
      <ol className={dir === 'rtl' && context.persian ? 'md-ol-persian' : undefined}>
        {entries.map((id) => {
          const children = defs.get(id) ?? [];
          const itemDir = blocksDirection(children, context.persian) ?? dir;
          return (
            <li key={id} data-footnote={id} dir={itemDir}>
              {renderBlocks(children, context, itemDir, true)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function MarkdownRenderer({ content, className, onWikiLink, sourceId, direction = 'auto' }: MarkdownRendererProps) {
  const prefix = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const globalMacros = useSettings((state) => state.latexMacros);
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  const baseDir: TextDirection = direction === 'auto' ? dominantDirection(content) : direction;
  const persian = baseDir === 'rtl' && hasPersianLetters(content.slice(0, 20_000));
  const model = useMemo(
    () => analyzeDocument(blocks, { prefix: `md${prefix}`, globalMacros, formatNumber: persian ? (value) => toPersianDigits(value) : undefined }),
    [blocks, prefix, globalMacros, persian],
  );
  const handleWikiLink = useMemo(
    () => onWikiLink ?? ((target: string) => void openWikiLink(target, sourceId)),
    [onWikiLink, sourceId],
  );
  const context = useMemo<RenderContext>(() => ({ model, onWikiLink: handleWikiLink, persian }), [model, handleWikiLink, persian]);
  return (
    <Context.Provider value={context}>
      <div className={cn('md', className)} dir={baseDir}>
        {renderBlocks(blocks, context, baseDir)}
        <Footnotes dir={baseDir} />
      </div>
    </Context.Provider>
  );
}

export default memo(MarkdownRenderer);
