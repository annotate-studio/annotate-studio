import { Facet, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, showTooltip, type Tooltip, type TooltipView, type ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { snippet, snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { SyntaxNode } from '@lezer/common';
import { collectMacros, planMath, type MacroMap } from '@/lib/latex';
import { renderMath } from '@/lib/math-render';
import { LATEX_COMMANDS, LATEX_ENVIRONMENTS } from './latex-commands';

export type DocumentKind = 'markdown' | 'latex';

export const documentKind = Facet.define<DocumentKind, DocumentKind>({
  combine: (values) => values[values.length - 1] ?? 'markdown',
});

export const globalMacros = Facet.define<string, string>({
  combine: (values) => values[values.length - 1] ?? '',
});

export interface MathSpan {
  from: number;
  to: number;
  content: string;
  env: string | null;
  display: boolean;
}

const ENV_PATTERN = /^\\begin\{([A-Za-z]+\*?)\}/;

function spanFromText(from: number, to: number, raw: string): MathSpan {
  if (raw.startsWith('$$') && raw.endsWith('$$') && raw.length >= 4) return { from, to, content: raw.slice(2, -2), env: null, display: true };
  if (raw.startsWith('\\[') && raw.endsWith('\\]')) return { from, to, content: raw.slice(2, -2), env: null, display: true };
  if (raw.startsWith('\\(') && raw.endsWith('\\)')) return { from, to, content: raw.slice(2, -2), env: null, display: false };
  const env = ENV_PATTERN.exec(raw);
  if (env) return { from, to, content: raw, env: env[1], display: true };
  if (raw.startsWith('$') && raw.endsWith('$') && raw.length >= 2) return { from, to, content: raw.slice(1, -1), env: null, display: false };
  return { from, to, content: raw, env: null, display: false };
}

function markdownMathAt(state: EditorState, pos: number): MathSpan | null {
  const tree = syntaxTree(state);
  for (const side of [-1, 1] as const) {
    let node: SyntaxNode | null = tree.resolveInner(pos, side);
    while (node) {
      if (node.name === 'InlineMath' || node.name === 'BlockMath') {
        if (pos <= node.from || pos >= node.to) break;
        return spanFromText(node.from, node.to, state.sliceDoc(node.from, node.to));
      }
      node = node.parent;
    }
  }
  return null;
}

const LATEX_TOKEN = /\$\$|\$|\\\(|\\\)|\\\[|\\\]|\\begin\{(equation|align|gather|multline|flalign|alignat|eqnarray|displaymath)(\*?)\}|\\end\{(equation|align|gather|multline|flalign|alignat|eqnarray|displaymath)(\*?)\}|%[^\n]*|\\./g;

function latexMathAt(state: EditorState, pos: number): MathSpan | null {
  const line = state.doc.lineAt(pos);
  let startLine = line.number;
  while (startLine > 1 && startLine > line.number - 60 && state.doc.line(startLine - 1).text.trim()) startLine -= 1;
  let endLine = line.number;
  while (endLine < state.doc.lines && endLine < line.number + 60 && state.doc.line(endLine + 1).text.trim()) endLine += 1;
  const from = state.doc.line(startLine).from;
  const to = state.doc.line(endLine).to;
  const text = state.sliceDoc(from, to);
  let open: { token: string; at: number } | null = null;
  LATEX_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LATEX_TOKEN.exec(text)) !== null) {
    const token = match[0];
    if (token.startsWith('%') || (token.length === 2 && token[0] === '\\' && !'()[]'.includes(token[1]))) continue;
    const at = from + match.index;
    if (!open) {
      if (token === '\\)' || token === '\\]' || token.startsWith('\\end')) continue;
      open = { token, at };
      continue;
    }
    const closes =
      (open.token === '$$' && token === '$$') ||
      (open.token === '$' && token === '$') ||
      (open.token === '\\(' && token === '\\)') ||
      (open.token === '\\[' && token === '\\]') ||
      (open.token.startsWith('\\begin') && token.startsWith('\\end') && token.slice(5) === open.token.slice(7));
    if (!closes) continue;
    const end = at + token.length;
    if (pos > open.at && pos < end) return spanFromText(open.at, end, state.sliceDoc(open.at, end));
    if (open.at > pos) return null;
    open = null;
  }
  return null;
}

export function mathAt(state: EditorState, pos: number): MathSpan | null {
  return state.facet(documentKind) === 'latex' ? latexMathAt(state, pos) : markdownMathAt(state, pos);
}

const MACRO_HINT = /\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator|def|gdef|let)\b/;

function touchesMacroDefinition(tr: import('@codemirror/state').Transaction): boolean {
  let touched = false;
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    if (touched) return;
    if (MACRO_HINT.test(inserted.toString())) {
      touched = true;
      return;
    }
    const oldStart = tr.startState.doc.lineAt(fromA).from;
    const oldEnd = tr.startState.doc.lineAt(toA).to;
    if (MACRO_HINT.test(tr.startState.sliceDoc(oldStart, oldEnd))) {
      touched = true;
      return;
    }
    const newStart = tr.state.doc.lineAt(fromB).from;
    const newEnd = tr.state.doc.lineAt(toB).to;
    if (MACRO_HINT.test(tr.state.sliceDoc(newStart, newEnd))) {
      touched = true;
    }
  });
  return touched;
}

const macroField = StateField.define<{ macros: MacroMap; key: string; stale: boolean }>({
  create: () => ({ macros: {}, key: '', stale: true }),
  update: (value, tr) => {
    if (tr.reconfigured) return { ...value, stale: true };
    if (!tr.docChanged || value.stale) return value;
    return touchesMacroDefinition(tr) ? { ...value, stale: true } : value;
  },
});

function currentMacros(view: EditorView): { macros: MacroMap; key: string } {
  const field = view.state.field(macroField);
  if (!field.stale) return field;
  const macros = collectMacros(view.state.doc.toString(), view.state.facet(globalMacros));
  const key = Object.keys(macros).length ? JSON.stringify(macros) : '';
  field.macros = macros;
  field.key = key;
  field.stale = false;
  return field;
}

function previewLatex(span: MathSpan): string {
  if (!span.env) return span.content;
  let counter = 0;
  return planMath(span.content, span.env, { next: () => String((counter += 1)), label: () => undefined }).latex;
}

class MathPreview implements TooltipView {
  dom: HTMLElement;
  private body: HTMLElement;
  private error: HTMLElement;
  private last = '';

  constructor(private view: EditorView) {
    this.dom = document.createElement('div');
    this.dom.className = 'cm-math-preview';
    this.body = document.createElement('div');
    this.body.className = 'cm-math-preview-body';
    this.body.dir = 'ltr';
    this.error = document.createElement('div');
    this.error.className = 'cm-math-preview-error';
    this.dom.append(this.body, this.error);
    this.render();
  }

  private render() {
    const span = mathAt(this.view.state, this.view.state.selection.main.head);
    if (!span) return;
    const latex = previewLatex(span);
    const { macros, key } = currentMacros(this.view);
    const signature = `${span.display}\u0000${key}\u0000${latex}`;
    if (signature === this.last) return;
    this.last = signature;
    if (!latex.trim()) {
      this.body.textContent = '';
      this.error.textContent = '';
      return;
    }
    const rendered = renderMath(latex, span.display, macros, key);
    this.body.innerHTML = rendered.html;
    this.error.textContent = rendered.error ?? '';
    this.error.hidden = !rendered.error;
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet) this.render();
  }
}

const createPreview = (view: EditorView) => new MathPreview(view);

const previewFocus = StateEffect.define<boolean>();

interface PreviewState {
  focused: boolean;
  tooltip: Tooltip | null;
}

function previewTooltip(state: EditorState, current: Tooltip | null): Tooltip | null {
  const range = state.selection.main;
  if (!range.empty) return null;
  const span = mathAt(state, range.head);
  if (!span || !span.content.trim()) return null;
  if (current && current.pos === span.to) return current;
  return { pos: span.to, above: false, strictSide: false, arrow: false, create: createPreview };
}

const previewField = StateField.define<PreviewState>({
  create: () => ({ focused: false, tooltip: null }),
  update(value, tr) {
    let focused = value.focused;
    for (const effect of tr.effects) if (effect.is(previewFocus)) focused = effect.value;
    if (!focused) return value.focused || value.tooltip ? { focused: false, tooltip: null } : value;
    if (value.focused && !tr.docChanged && !tr.selection) return value;
    const tooltip = previewTooltip(tr.state, value.tooltip);
    return value.focused && tooltip === value.tooltip ? value : { focused, tooltip };
  },
  provide: (field) => showTooltip.compute([field], (state) => state.field(field).tooltip),
});

const previewFocusChange = EditorView.focusChangeEffect.of((_state, focusing) => previewFocus.of(focusing));

function insideMath(context: CompletionContext): boolean {
  if (context.state.facet(documentKind) === 'latex') return true;
  return markdownMathAt(context.state, context.pos) !== null;
}

function previewInfo(latex: string): () => Node {
  return () => {
    const element = document.createElement('div');
    element.className = 'cm-latex-info';
    element.dir = 'ltr';
    element.innerHTML = renderMath(latex, false).html;
    return element;
  };
}

const commandOptions = (latexDocument: boolean): Completion[] =>
  LATEX_COMMANDS.filter((command) => latexDocument || !command.documentOnly).map((command) => {
    const base: Completion = {
      label: command.label,
      detail: command.detail,
      type: command.documentOnly ? 'keyword' : 'function',
      info: command.preview ? previewInfo(command.preview) : undefined,
      boost: command.documentOnly ? -1 : 0,
    };
    return command.template ? snippetCompletion(command.template, base) : base;
  });

let cachedOptions: { latex: boolean; options: Completion[] } | null = null;

function optionsFor(latexDocument: boolean): Completion[] {
  if (!cachedOptions || cachedOptions.latex !== latexDocument) cachedOptions = { latex: latexDocument, options: commandOptions(latexDocument) };
  return cachedOptions.options;
}

function environmentCompletions(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\\begin\{[A-Za-z*]*$/);
  if (!match) return null;
  const latexDocument = context.state.facet(documentKind) === 'latex';
  const inMath = insideMath(context);
  const from = match.from + '\\begin{'.length;
  const options = LATEX_ENVIRONMENTS.filter((env) => latexDocument || env.math || !inMath || ['aligned', 'cases'].includes(env.name)).map<Completion>((env) => ({
    label: env.name,
    detail: env.detail,
    type: 'type',
    apply: (view, _completion, applyFrom, applyTo) => {
      const after = view.state.sliceDoc(applyTo, applyTo + 1);
      const end = after === '}' ? applyTo + 1 : applyTo;
      const line = view.state.doc.lineAt(applyFrom);
      const indent = /^\s*/.exec(line.text)?.[0] ?? '';
      const body = env.body ?? '${}';
      const template = `${env.name}}\n${indent}  ${body.replace(/\n/g, `\n${indent}`)}\n${indent}\\end{${env.name}}`;
      snippet(template)(view, { label: env.name }, applyFrom, end);
    },
  }));
  return { from, options, validFor: /^[A-Za-z*]*$/ };
}

export function latexCompletions(context: CompletionContext): CompletionResult | null {
  const environment = environmentCompletions(context);
  if (environment) return environment;
  const word = context.matchBefore(/\\[A-Za-z]*\*?$/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;
  if (!insideMath(context)) return null;
  const latexDocument = context.state.facet(documentKind) === 'latex';
  return { from: word.from, options: optionsFor(latexDocument), validFor: /^\\[A-Za-z]*\*?$/ };
}

export function latexAssist(kind: DocumentKind): Extension {
  return [documentKind.of(kind), macroField, previewField, previewFocusChange];
}
