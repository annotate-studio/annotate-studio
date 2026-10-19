'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Annotation, Compartment, EditorSelection, EditorState, Transaction, type Extension } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  placeholder as placeholderExtension,
  tooltips,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import {
  autocompletion,
  closeBrackets,
  snippet,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext,
} from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import type { StudyFile } from '@/lib/tauri-commands';
import type { DirectionMode } from '@/lib/bidi';
import { normalizeForSearch } from '@/lib/bidi';
import { stripExtension } from '@/lib/utils';
import { HighlightExtension, highlightTag, MathExtension, mathMarkTag, mathTag } from './editor/math-syntax';
import { bidiSupport, insertZeroWidthNonJoiner, setDirectionMode } from './editor/bidi';
import { searchPanel } from './editor/search-panel';
import { globalMacros, latexAssist, latexCompletions, type DocumentKind } from './editor/latex-assist';
import { latexLanguage } from './editor/latex-language';

export type EditorLanguage = DocumentKind;

export interface MarkdownEditorHandle {
  wrap: (before: string, after?: string, placeholder?: string) => void;
  prefixLines: (prefix: string) => void;
  insert: (text: string) => void;
  insertSnippet: (template: string, block?: boolean) => void;
  goToLine: (line: number) => void;
  focus: () => void;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  getFiles?: () => StudyFile[];
  placeholder?: string;
  readOnly?: boolean;
  language?: EditorLanguage;
  direction?: DirectionMode;
  zoom?: number;
  macros?: string;
}

const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.45em', fontWeight: '700' },
  { tag: tags.heading2, fontSize: '1.28em', fontWeight: '700' },
  { tag: tags.heading3, fontSize: '1.14em', fontWeight: '650' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '650' },
  { tag: tags.heading, fontWeight: '700', color: 'var(--text-primary)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--primary)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', color: 'var(--code-text)' },
  { tag: tags.quote, color: 'var(--text-secondary)', fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator, tags.labelName], color: 'var(--text-muted)' },
  { tag: mathTag, color: 'var(--math-text)', fontFamily: 'var(--font-mono)', fontSize: '0.92em' },
  { tag: mathMarkTag, color: 'var(--math-mark)', fontWeight: '700' },
  { tag: highlightTag, backgroundColor: 'color-mix(in srgb, #facc15 38%, transparent)', borderRadius: '3px' },
  { tag: tags.keyword, color: 'var(--primary)' },
  { tag: tags.atom, color: 'var(--math-text)' },
  { tag: tags.string, color: 'var(--math-text)' },
  { tag: tags.operator, color: 'var(--math-mark)' },
  { tag: tags.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: tags.tagName, color: '#0d9488' },
  { tag: tags.bracket, color: 'var(--text-secondary)' },
  { tag: tags.escape, color: 'var(--code-text)' },
]);

function editorTheme(zoom: number) {
  return EditorView.theme({
    '&.cm-editor': { height: '100%', fontSize: `${(14.5 * zoom).toFixed(2)}px`, backgroundColor: 'transparent', color: 'var(--text-primary)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-sans)', lineHeight: '1.7', overflow: 'auto' },
    '.cm-content': { padding: '16px 20px 40vh', caretColor: 'var(--primary)' },
    '.cm-line': { padding: '0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--selection) !important',
    },
    '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
    '.cm-selectionMatch': { backgroundColor: 'var(--selection-match)' },
    '.cm-placeholder': { color: 'var(--text-muted)' },
    '.cm-matchingBracket': { backgroundColor: 'var(--selection-match)', outline: 'none' },
  });
}

function wikiCompletions(getFiles: () => StudyFile[]) {
  return (context: CompletionContext) => {
    const match = context.matchBefore(/\[\[[^\]\n|]*$/);
    if (!match) return null;
    const query = normalizeForSearch(match.text.slice(2));
    const options: Completion[] = getFiles()
      .filter((file) => normalizeForSearch(file.name).includes(query))
      .slice(0, 60)
      .map((file) => {
        const label = file.file_type === 'Markdown' ? stripExtension(file.name) : file.name;
        return {
          label,
          detail: file.file_type === 'Markdown' ? 'note' : file.file_type.toLowerCase(),
          apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
            const after = view.state.sliceDoc(to, to + 2);
            const insert = after === ']]' ? label : `${label}]]`;
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + label.length + 2 },
            });
          },
        };
      });
    return { from: match.from + 2, options, filter: false };
  };
}

function imageCompletions(getFiles: () => StudyFile[]) {
  return (context: CompletionContext) => {
    const match = context.matchBefore(/\]\(@[^)\n]*$/);
    if (!match) return null;
    const query = normalizeForSearch(match.text.slice(3));
    const options: Completion[] = getFiles()
      .filter((file) => file.file_type === 'Image' && normalizeForSearch(file.name).includes(query))
      .slice(0, 60)
      .map((file) => ({
        label: file.name,
        detail: 'image',
        apply: `${file.name})`,
      }));
    return { from: match.from + 3, options, filter: false };
  };
}

function wrapSelection(view: EditorView, before: string, after = before, placeholderText = 'text') {
  const transaction = view.state.changeByRange((range) => {
    const selected = view.state.sliceDoc(range.from, range.to);
    const outerBefore = view.state.sliceDoc(range.from - before.length, range.from);
    const outerAfter = view.state.sliceDoc(range.to, range.to + after.length);
    if (selected && outerBefore === before && outerAfter === after) {
      return {
        changes: [
          { from: range.from - before.length, to: range.from, insert: '' },
          { from: range.to, to: range.to + after.length, insert: '' },
        ],
        range: EditorSelection.range(range.from - before.length, range.to - before.length),
      };
    }
    const content = selected || placeholderText;
    return {
      changes: { from: range.from, to: range.to, insert: `${before}${content}${after}` },
      range: EditorSelection.range(range.from + before.length, range.from + before.length + content.length),
    };
  });
  view.dispatch(transaction, { scrollIntoView: true, userEvent: 'input' });
  view.focus();
}

function togglePrefix(view: EditorView, prefix: string) {
  const { state } = view;
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const start = state.doc.lineAt(range.from).number;
    const end = state.doc.lineAt(range.to).number;
    for (let n = start; n <= end; n += 1) lines.add(n);
  }
  const lineObjects = Array.from(lines).map((n) => state.doc.line(n));
  const allPrefixed = lineObjects.every((line) => line.text.startsWith(prefix));
  const changes = lineObjects.map((line) => {
    if (allPrefixed) return { from: line.from, to: line.from + prefix.length, insert: '' };
    const existing = /^(#{1,6} |> |- \[[ xX]\] |[-*+] |\d+\. )/.exec(line.text);
    return { from: line.from, to: line.from + (existing ? existing[0].length : 0), insert: prefix };
  });
  view.dispatch({ changes, userEvent: 'input' });
  view.focus();
}

const externalSync = Annotation.define<boolean>();

function languageExtension(language: EditorLanguage): Extension {
  if (language === 'latex') return latexLanguage;
  return markdown({ base: markdownLanguage, extensions: [MathExtension, HighlightExtension] });
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  { value, onChange, onSave, getFiles, placeholder, readOnly = false, language = 'markdown', direction = 'auto', zoom = 1, macros = '' },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const getFilesRef = useRef(getFiles);
  const themeCompartment = useRef(new Compartment());
  const macroCompartment = useRef(new Compartment());
  const initial = useRef({ direction, zoom, macros });
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  getFilesRef.current = getFiles;

  useImperativeHandle(ref, () => ({
    wrap: (before, after, placeholderText) => {
      if (viewRef.current) wrapSelection(viewRef.current, before, after ?? before, placeholderText);
    },
    prefixLines: (prefix) => {
      if (viewRef.current) togglePrefix(viewRef.current, prefix);
    },
    insert: (text) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input' });
      view.focus();
    },
    insertSnippet: (template, block = false) => {
      const view = viewRef.current;
      if (!view) return;
      const range = view.state.selection.main;
      let text = template;
      if (block) {
        const line = view.state.doc.lineAt(range.from);
        const before = line.text.slice(0, range.from - line.from);
        const after = view.state.sliceDoc(range.to, view.state.doc.lineAt(range.to).to);
        if (before.trim()) text = `\n\n${text}`;
        else if (line.number > 1 && view.state.doc.line(line.number - 1).text.trim()) text = `\n${text}`;
        if (after.trim()) text = `${text}\n\n`;
      }
      snippet(text)(view, { label: 'insert' }, range.from, range.to);
      view.focus();
    },
    goToLine: (line) => {
      const view = viewRef.current;
      if (!view) return;
      const target = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, line)));
      view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) });
      view.focus();
    },
    focus: () => viewRef.current?.focus(),
  }));

  useEffect(() => {
    if (!hostRef.current) return;
    const start = initial.current;
    const completionSources =
      language === 'markdown'
        ? [wikiCompletions(() => getFilesRef.current?.() ?? []), imageCompletions(() => getFilesRef.current?.() ?? []), latexCompletions]
        : [latexCompletions];
    const extensions: Extension[] = [
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      searchPanel(),
      EditorView.lineWrapping,
      bidiSupport(start.direction),
      languageExtension(language),
      syntaxHighlighting(highlight),
      latexAssist(language),
      macroCompartment.current.of(globalMacros.of(start.macros)),
      tooltips({ parent: document.body }),
      autocompletion({ override: completionSources, icons: false }),
      keymap.of([
        { key: 'Mod-s', preventDefault: true, run: () => (onSaveRef.current?.(), true) },
        { key: 'Mod-b', run: (view) => (wrapSelection(view, language === 'latex' ? '\\textbf{' : '**', language === 'latex' ? '}' : '**'), true) },
        { key: 'Mod-i', run: (view) => (wrapSelection(view, language === 'latex' ? '\\emph{' : '*', language === 'latex' ? '}' : '*'), true) },
        { key: 'Mod-e', run: (view) => (wrapSelection(view, language === 'latex' ? '\\texttt{' : '`', language === 'latex' ? '}' : '`', 'code'), true) },
        { key: 'Mod-k', run: (view) => (wrapSelection(view, language === 'latex' ? '\\href{https://}{' : '[', language === 'latex' ? '}' : '](https://)', 'link'), true) },
        { key: 'Mod-m', run: (view) => (wrapSelection(view, '$', '$', 'x'), true) },
        { key: 'Mod-Shift-2', preventDefault: true, run: insertZeroWidthNonJoiner },
        ...closeBracketsKeymap,
        ...completionKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || update.transactions.every((tr) => tr.annotation(externalSync))) return;
        onChangeRef.current(update.state.doc.toString());
      }),
      EditorState.readOnly.of(readOnly),
      themeCompartment.current.of(editorTheme(start.zoom)),
    ];
    if (placeholder) extensions.push(placeholderExtension(placeholder));
    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [placeholder, readOnly, language]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) setDirectionMode(view, direction);
  }, [direction]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) view.dispatch({ effects: themeCompartment.current.reconfigure(editorTheme(zoom)) });
  }, [zoom]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) view.dispatch({ effects: macroCompartment.current.reconfigure(globalMacros.of(macros)) });
  }, [macros]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    const next = value.replace(/\r\n?/g, '\n');
    if (current === next) return;
    const head = Math.min(view.state.selection.main.head, next.length);
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next },
      selection: { anchor: head },
      annotations: [externalSync.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  return <div ref={hostRef} className="md-editor" />;
});

export default MarkdownEditor;
