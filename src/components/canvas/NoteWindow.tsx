'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bold,
  Code,
  Columns2,
  Eye,
  FileCode2,
  FileOutput,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  PenLine,
  Pilcrow,
  PilcrowLeft,
  PilcrowRight,
  Play,
  Plus,
  Presentation,
  Quote,
  Sigma,
  X,
} from 'lucide-react';
import MarkdownEditor, { type EditorLanguage, type MarkdownEditorHandle } from '@/components/markdown/MarkdownEditor';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import Popover from '@/components/ui/Popover';
import { useNotes } from '@/store/notes';
import { useLibrary } from '@/store/library';
import { activeWorkspace, useCanvas } from '@/store/canvas';
import { useSettings } from '@/store/settings';
import { useApp } from '@/store/app';
import { toast } from '@/store/toast';
import { cn, extensionOf, stripExtension, baseName } from '@/lib/utils';
import { resolveWorkspaceImage } from '@/lib/images';
import { registerWindowKeyHandler } from '@/lib/window-keys';
import { compileLatex, type CompileIssue, type CompileResult } from '@/lib/tauri-commands';
import { latexToMarkdown, markdownToLatex } from '@/lib/latex-convert';
import { createNewNote, LATEX_EXTENSIONS, openFileOnCanvas } from '@/lib/workspace-actions';
import type { DirectionMode } from '@/lib/bidi';

type Mode = 'edit' | 'split' | 'preview';

const modeMemory = new Map<string, Mode>();
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

function wordCount(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’\u200c-]*/gu);
  return words ? words.length : 0;
}

function clampZoom(value: number): number {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 100) / 100;
}

interface InsertItem {
  label: string;
  hint: string;
  markdown: string;
  latex?: string;
}

const INSERT_ITEMS: InsertItem[] = [
  { label: 'Numbered equation', hint: '\\begin{equation}', markdown: '\\begin{equation}\n  ${E = mc^2} \\label{eq:${name}}\n\\end{equation}' },
  { label: 'Aligned equations', hint: '\\begin{align}', markdown: '\\begin{align}\n  ${a} &= ${b} \\\\\n  ${c} &= ${d}\n\\end{align}' },
  { label: 'Display math', hint: '$$ … $$', markdown: '$$\n${x}\n$$', latex: '\\[\n  ${x}\n\\]' },
  { label: 'Theorem', hint: '\\begin{theorem}', markdown: '\\begin{theorem}[${Name}]\n${Statement}\n\\end{theorem}' },
  { label: 'Definition', hint: '\\begin{definition}', markdown: '\\begin{definition}[${Term}]\n${Definition}\n\\end{definition}' },
  { label: 'Lemma', hint: '\\begin{lemma}', markdown: '\\begin{lemma}\n${Statement}\n\\end{lemma}' },
  { label: 'Proof', hint: '\\begin{proof}', markdown: '\\begin{proof}\n${Argument}\n\\end{proof}' },
  { label: 'Example', hint: '\\begin{example}', markdown: '\\begin{example}\n${Example}\n\\end{example}' },
  { label: 'Exercise and solution', hint: '\\begin{exercise}', markdown: '\\begin{exercise}\n${Question}\n\\end{exercise}\n\n\\begin{solution}\n${Answer}\n\\end{solution}' },
  { label: 'Tip box', hint: '> [!tip]', markdown: '> [!tip] ${Title}\n> ${Text}', latex: '\\begin{quote}\n  \\textbf{${Tip}.} ${Text}\n\\end{quote}' },
  { label: 'Warning box', hint: '> [!warning]', markdown: '> [!warning] ${Title}\n> ${Text}', latex: '\\begin{quote}\n  \\textbf{${Warning}.} ${Text}\n\\end{quote}' },
  { label: 'Formula box', hint: '> [!formula]', markdown: '> [!formula] ${Title}\n> $$${x}$$', latex: '\\begin{equation}\n  \\boxed{${x}}\n\\end{equation}' },
  { label: 'Footnote', hint: '[^1]', markdown: '[^${1}]', latex: '\\footnote{${text}}' },
  { label: 'Image', hint: '](@file.png)', markdown: '[${1:Description}](@${2:file.png})' },
  { label: 'Table', hint: '| a | b |', markdown: '| ${Column} | ${Column} |\n| --- | --- |\n| ${} | ${} |', latex: '\\begin{tabular}{|l|l|}\n  \\hline\n  ${a} & ${b} \\\\\n  \\hline\n\\end{tabular}' },
  { label: 'Chemical equation', hint: '\\ce{…}', markdown: '$\\ce{${2H2 + O2 -> 2H2O}}$' },
];

const INLINE_ITEMS = new Set(['Footnote', 'Chemical equation', 'Image']);

function NoteWindow({ resourceId, path, title }: { resourceId: string; path: string; title: string }) {
  const buffer = useNotes((state) => state.buffers[path]);
  const load = useNotes((state) => state.load);
  const edit = useNotes((state) => state.edit);
  const save = useNotes((state) => state.save);
  const width = useCanvas((state) => activeWorkspace(state).resources.find((r) => r.id === resourceId)?.width ?? 700);
  const maximized = useCanvas((state) => activeWorkspace(state).resources.find((r) => r.id === resourceId)?.maximized ?? false);
  const zoom = useCanvas((state) => activeWorkspace(state).resources.find((r) => r.id === resourceId)?.textZoom ?? 1);
  const direction = useSettings((state): DirectionMode => (state.noteDirections[path] as DirectionMode | undefined) ?? 'auto');
  const macros = useSettings((state) => state.latexMacros);
  const texEngine = useSettings((state) => state.texEngine);
  const files = useLibrary((state) => state.files);
  const [mode, setModeState] = useState<Mode>(() => modeMemory.get(resourceId) ?? (width >= 760 ? 'split' : 'edit'));
  const [insertOpen, setInsertOpen] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [issues, setIssues] = useState<CompileIssue[] | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const insertRef = useRef<HTMLButtonElement>(null);
  const language: EditorLanguage = LATEX_EXTENSIONS.includes(extensionOf(path)) ? 'latex' : 'markdown';

  const setMode = (next: Mode) => {
    modeMemory.set(resourceId, next);
    setModeState(next);
  };

  useEffect(() => {
    void load(path);
  }, [load, path]);

  const setZoom = useCallback(
    (value: number) => {
      const next = clampZoom(value);
      useCanvas.getState().updateResource(resourceId, { textZoom: next === 1 ? undefined : next });
    },
    [resourceId],
  );

  useEffect(() => {
    return registerWindowKeyHandler(resourceId, (event, inContent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey || !inContent) return false;
      const current = activeWorkspace(useCanvas.getState()).resources.find((r) => r.id === resourceId)?.textZoom ?? 1;
      if (event.key === '=' || event.key === '+') {
        setZoom(current + 0.1);
        return true;
      }
      if (event.key === '-') {
        setZoom(current - 0.1);
        return true;
      }
      if (event.key === '0') {
        setZoom(1);
        return true;
      }
      return false;
    });
  }, [resourceId, setZoom]);

  const ready = buffer?.status === 'ready';

  useEffect(() => {
    const element = rootRef.current;
    if (!element || !ready) return;
    let pending = 0;
    let frame = 0;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !useSettings.getState().ctrlWheelZoom) return;
      const windowElement = element.closest('[data-window-id]');
      const resource = activeWorkspace(useCanvas.getState()).resources.find((r) => r.id === resourceId);
      if (!resource?.maximized && windowElement?.getAttribute('data-active') !== 'true') return;
      event.preventDefault();
      event.stopPropagation();
      pending += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const delta = pending;
        pending = 0;
        const current = activeWorkspace(useCanvas.getState()).resources.find((r) => r.id === resourceId)?.textZoom ?? 1;
        setZoom(current * Math.exp(-delta * 0.0016));
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [resourceId, setZoom, ready]);

  const getFiles = useCallback(() => useLibrary.getState().files, []);
  const onChange = useCallback((value: string) => edit(path, value), [edit, path]);
  const onSave = useCallback(() => void save(path), [save, path]);

  const resolveImage = useCallback((target: string) => resolveWorkspaceImage(target, files), [files]);

  const previewSource = useMemo(() => {
    if (!buffer || buffer.status !== 'ready') return '';
    return language === 'latex' ? latexToMarkdown(buffer.content, { resolveImage }) : buffer.content;
  }, [buffer, language, resolveImage]);

  if (!buffer || buffer.status === 'loading') {
    return (
      <div className="cw-state">
        <Loader2 size={18} className="spin" />
        <div>Loading {title}…</div>
      </div>
    );
  }
  if (buffer.status === 'error') {
    return (
      <div className="cw-state cw-state-error">
        <AlertTriangle size={20} />
        <div>{buffer.error ?? 'This note could not be opened.'}</div>
      </div>
    );
  }

  const canSplit = width >= 560 || maximized;
  const view: Mode = mode === 'split' && !canSplit ? 'edit' : mode;
  const showEditor = view !== 'preview';
  const showPreview = view !== 'edit';
  const status = buffer.error ? 'Not saved' : buffer.saving || buffer.dirty ? 'Saving…' : buffer.savedAt ? 'Saved' : '';
  const latex = language === 'latex';

  const format = (action: () => void) => (event: React.MouseEvent) => {
    event.preventDefault();
    action();
  };

  const cycleDirection = () => {
    const next: DirectionMode = direction === 'auto' ? 'rtl' : direction === 'rtl' ? 'ltr' : 'auto';
    useSettings.getState().setNoteDirection(path, next);
  };

  const exportLatex = async () => {
    const source = useNotes.getState().buffers[path]?.content ?? '';
    const stem = stripExtension(baseName(path));
    const file = await createNewNote({ title: stem, content: markdownToLatex(source, { title: stem, resolveImage }), extension: 'tex', near: resourceId });
    if (file) toast.success('Exported to LaTeX', file.name);
  };

  const openCompiledPdf = (result: CompileResult) => {
    if (result.success && result.pdf) {
      useLibrary.getState().upsert(result.pdf);
      useLibrary.getState().bumpRevision(result.pdf.path);
      openFileOnCanvas(result.pdf, { near: resourceId });
      toast.success('PDF ready', `${result.pdf.name} · ${result.engine}`);
      setIssues(result.issues.length ? result.issues : null);
    } else {
      setIssues(result.issues.length ? result.issues : [{ line: null, message: result.log.split('\n').slice(-6).join(' ').trim() || 'Compilation failed.' }]);
      toast.error('LaTeX compilation failed', `${result.engine}: ${result.issues[0]?.message ?? 'see the error list'}`);
    }
  };

  const compile = async () => {
    if (compiling) return;
    setCompiling(true);
    setIssues(null);
    try {
      await save(path);
      openCompiledPdf(await compileLatex(path, texEngine));
    } catch (error) {
      toast.error('LaTeX compilation failed', error);
    } finally {
      setCompiling(false);
    }
  };

  const exportPdf = async () => {
    if (compiling) return;
    const source = useNotes.getState().buffers[path]?.content ?? '';
    const stem = stripExtension(baseName(path));
    setCompiling(true);
    setIssues(null);
    try {
      const tex = await createNewNote({ title: stem, content: markdownToLatex(source, { title: stem, resolveImage }), extension: 'tex', near: resourceId });
      if (!tex) return;
      openCompiledPdf(await compileLatex(tex.path, texEngine));
    } catch (error) {
      toast.error('PDF export failed', error);
    } finally {
      setCompiling(false);
    }
  };

  const present = () => {
    useApp.getState().requestChat({ kind: 'walkthrough', title: stripExtension(title), markdown: previewSource });
  };

  const directionIcon = direction === 'rtl' ? <PilcrowLeft size={14} /> : direction === 'ltr' ? <PilcrowRight size={14} /> : <Pilcrow size={14} />;
  const directionLabel = direction === 'rtl' ? 'Right to left' : direction === 'ltr' ? 'Left to right' : 'Automatic direction';

  return (
    <div ref={rootRef} className="note-window" style={{ '--note-zoom': zoom } as React.CSSProperties}>
      <div className="note-toolbar" data-no-drag>
        <div className="segmented">
          <button type="button" className={cn(mode === 'edit' && 'active')} onClick={() => setMode('edit')} title="Edit">
            <PenLine size={13} />
          </button>
          <button
            type="button"
            className={cn(mode === 'split' && 'active')}
            onClick={() => setMode('split')}
            title={canSplit ? 'Split view' : 'Split view (widen the window to see the preview)'}
          >
            <Columns2 size={13} />
          </button>
          <button type="button" className={cn(mode === 'preview' && 'active')} onClick={() => setMode('preview')} title="Preview">
            <Eye size={13} />
          </button>
        </div>
        {showEditor && buffer.editable && (
          <div className="note-format">
            <button type="button" className="tool-btn" onMouseDown={format(() => (latex ? editorRef.current?.wrap('\\textbf{', '}') : editorRef.current?.wrap('**')))} title="Bold (Ctrl+B)">
              <Bold size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => (latex ? editorRef.current?.wrap('\\emph{', '}') : editorRef.current?.wrap('*')))} title="Italic (Ctrl+I)">
              <Italic size={14} />
            </button>
            <button
              type="button"
              className="tool-btn"
              onMouseDown={format(() => (latex ? editorRef.current?.insertSnippet('\\section{${Title}}', true) : editorRef.current?.prefixLines('## ')))}
              title="Heading"
            >
              <Heading2 size={14} />
            </button>
            <button
              type="button"
              className="tool-btn"
              onMouseDown={format(() =>
                latex ? editorRef.current?.insertSnippet('\\begin{itemize}\n  \\item ${}\n\\end{itemize}', true) : editorRef.current?.prefixLines('- '),
              )}
              title="Bulleted list"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              className="tool-btn"
              onMouseDown={format(() =>
                latex ? editorRef.current?.insertSnippet('\\begin{enumerate}\n  \\item ${}\n\\end{enumerate}', true) : editorRef.current?.prefixLines('1. '),
              )}
              title="Numbered list"
            >
              <ListOrdered size={14} />
            </button>
            {!latex && (
              <>
                <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.prefixLines('- [ ] '))} title="Checklist">
                  <ListChecks size={14} />
                </button>
                <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.prefixLines('> '))} title="Quote">
                  <Quote size={14} />
                </button>
              </>
            )}
            <button
              type="button"
              className="tool-btn"
              onMouseDown={format(() => (latex ? editorRef.current?.wrap('\\texttt{', '}', 'code') : editorRef.current?.wrap('`', '`', 'code')))}
              title="Inline code (Ctrl+E)"
            >
              <Code size={14} />
            </button>
            <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.wrap('$', '$', 'x^2'))} title="Math (Ctrl+M)">
              <Sigma size={14} />
            </button>
            {!latex && (
              <button type="button" className="tool-btn" onMouseDown={format(() => editorRef.current?.wrap('[[', ']]', 'Note'))} title="Link a note">
                <Link2 size={14} />
              </button>
            )}
            <button
              ref={insertRef}
              type="button"
              className={cn('tool-btn', insertOpen && 'tool-btn-active')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setInsertOpen((value) => !value)}
              title="Insert equation, theorem, proof, box…"
            >
              <Plus size={14} />
            </button>
            <Popover anchorRef={insertRef} open={insertOpen} onClose={() => setInsertOpen(false)} align="start" width={250}>
              <div className="menu">
                {INSERT_ITEMS.filter((item) => !latex || item.label !== 'Formula box' || item.latex).map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="menu-item"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setInsertOpen(false);
                      const template = latex ? item.latex ?? item.markdown : item.markdown;
                      editorRef.current?.insertSnippet(template, !INLINE_ITEMS.has(item.label));
                    }}
                  >
                    <span className="menu-item-label">
                      {item.label}
                      <small dir="ltr">{item.hint}</small>
                    </span>
                  </button>
                ))}
              </div>
            </Popover>
          </div>
        )}
        <div className="note-toolbar-spacer" />
        {zoom !== 1 && (
          <button type="button" className="note-zoom-chip" onClick={() => setZoom(1)} title="Reset text size (Ctrl+0)">
            {Math.round(zoom * 100)}%
          </button>
        )}
        <button type="button" className={cn('tool-btn', direction !== 'auto' && 'tool-btn-active')} onClick={cycleDirection} title={`${directionLabel} (click to change)`}>
          {directionIcon}
        </button>
        <button type="button" className="tool-btn" onClick={present} title="Present step by step">
          <Presentation size={14} />
        </button>
        {latex ? (
          <button type="button" className="tool-btn note-compile" onClick={() => void compile()} disabled={compiling} title="Compile to PDF">
            {compiling ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
            <span>PDF</span>
          </button>
        ) : (
          <>
            <button type="button" className="tool-btn note-compile" onClick={() => void exportPdf()} disabled={compiling} title="Export to PDF (via LaTeX)">
              {compiling ? <Loader2 size={14} className="spin" /> : <FileOutput size={14} />}
              <span>PDF</span>
            </button>
            <button type="button" className="tool-btn" onClick={() => void exportLatex()} title="Export as LaTeX (.tex)">
              <FileCode2 size={14} />
            </button>
          </>
        )}
        <span className="note-meta">{wordCount(buffer.content)} words</span>
        <span className={cn('save-state', buffer.error ? 'save-state-error' : buffer.dirty || buffer.saving ? 'save-state-pending' : 'save-state-saved')}>
          {status}
        </span>
      </div>
      {!buffer.editable && (
        <div className="note-readonly">
          <AlertTriangle size={13} /> This file is not UTF-8 text, so it opens read-only to keep its characters intact.
        </div>
      )}
      {issues && (
        <div className="note-issues">
          <div className="note-issues-head">
            <FileCode2 size={13} />
            <span>{issues.length === 1 ? '1 LaTeX problem' : `${issues.length} LaTeX problems`}</span>
            <button type="button" className="icon-btn" onClick={() => setIssues(null)} aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
          <ul>
            {issues.map((issue, index) => (
              <li key={index}>
                {issue.line !== null ? (
                  <button type="button" onClick={() => editorRef.current?.goToLine(issue.line ?? 1)}>
                    Line {issue.line}
                  </button>
                ) : null}
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={cn('note-body', view === 'split' && 'note-body-split')}>
        <div className={cn('note-pane note-editor-pane', !showEditor && 'note-pane-hidden')}>
          <MarkdownEditor
            ref={editorRef}
            value={buffer.content}
            onChange={onChange}
            onSave={onSave}
            getFiles={getFiles}
            readOnly={!buffer.editable}
            language={language}
            direction={direction}
            zoom={zoom}
            macros={macros}
            placeholder={latex ? 'Write LaTeX… Type \\ for commands' : 'Start writing… Use [[ to link notes, $…$ for math, \\ for LaTeX commands'}
          />
        </div>
        {showPreview && (
          <div className="note-pane note-preview-pane content-selectable">
            {previewSource.trim() ? (
              <MarkdownRenderer content={previewSource} sourceId={resourceId} direction={direction} />
            ) : (
              <div className="note-empty">Nothing to preview yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(NoteWindow);
