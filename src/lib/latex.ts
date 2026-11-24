import type { Block, Inline } from './markdown';

export type MacroMap = Record<string, string>;

interface Group {
  value: string;
  end: number;
}

function skipSpaces(src: string, index: number): number {
  let i = index;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  return i;
}

export function readGroup(src: string, start: number): Group | null {
  const i = skipSpaces(src, start);
  if (src[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    const char = src[j];
    if (char === '\\') {
      j += 1;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return { value: src.slice(i + 1, j), end: j + 1 };
    }
  }
  return null;
}

function readOptional(src: string, start: number): Group | null {
  const i = skipSpaces(src, start);
  if (src[i] !== '[') return null;
  const close = src.indexOf(']', i + 1);
  if (close < 0) return null;
  return { value: src.slice(i + 1, close), end: close + 1 };
}

const CONTROL_SEQ = /\\[A-Za-z@]+/y;
const DEF_PARAMS = /(\s*#\d)*/y;
const ROW_SPACING = /\s*\[[^\]]*\]/y;

function readControlSequence(src: string, start: number): Group | null {
  const i = skipSpaces(src, start);
  if (src[i] !== '\\') return null;
  CONTROL_SEQ.lastIndex = i;
  const letters = CONTROL_SEQ.exec(src);
  if (letters) return { value: letters[0], end: i + letters[0].length };
  if (i + 1 < src.length) return { value: src.slice(i, i + 2), end: i + 2 };
  return null;
}

function readName(src: string, start: number): Group | null {
  const group = readGroup(src, start);
  if (group) {
    const name = group.value.trim();
    return /^\\[A-Za-z@]+$/.test(name) ? { value: name, end: group.end } : null;
  }
  return readControlSequence(src, start);
}

const DEFINITION = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator|def|gdef|let)(\*?)(?![A-Za-z])/g;

function parseDefinition(src: string, match: RegExpExecArray, macros: MacroMap): number | null {
  const kind = match[1];
  const star = match[2] === '*';
  let cursor = match.index + match[0].length;
  if (kind === 'DeclareMathOperator') {
    const name = readName(src, cursor);
    if (!name) return null;
    const body = readGroup(src, name.end);
    if (!body) return null;
    macros[name.value] = `\\operatorname${star ? '*' : ''}{${body.value}}`;
    return body.end;
  }
  if (kind === 'let') {
    const name = readControlSequence(src, cursor);
    if (!name) return null;
    cursor = skipSpaces(src, name.end);
    if (src[cursor] === '=') cursor += 1;
    const target = readControlSequence(src, cursor);
    if (!target) return null;
    macros[name.value] = target.value;
    return target.end;
  }
  if (kind === 'def' || kind === 'gdef') {
    const name = readControlSequence(src, cursor);
    if (!name) return null;
    cursor = name.end;
    DEF_PARAMS.lastIndex = cursor;
    const params = DEF_PARAMS.exec(src)?.[0] ?? '';
    cursor += params.length;
    const body = readGroup(src, cursor);
    if (!body) return null;
    macros[name.value] = body.value;
    return body.end;
  }
  const name = readName(src, cursor);
  if (!name) return null;
  cursor = name.end;
  const count = readOptional(src, cursor);
  if (count) cursor = count.end;
  const fallback = count ? readOptional(src, cursor) : null;
  if (fallback) cursor = fallback.end;
  const body = readGroup(src, cursor);
  if (!body) return null;
  if (kind !== 'providecommand' || !(name.value in macros)) macros[name.value] = body.value;
  return body.end;
}

export function extractMacros(source: string, macros: MacroMap): string {
  if (!source.includes('\\')) return source;
  let out = '';
  let last = 0;
  DEFINITION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DEFINITION.exec(source)) !== null) {
    const end = parseDefinition(source, match, macros);
    if (end === null) continue;
    out += source.slice(last, match.index);
    last = end;
    DEFINITION.lastIndex = end;
  }
  return out + source.slice(last);
}

export function findDefinitions(source: string): string[] {
  const found: string[] = [];
  if (!source.includes('\\')) return found;
  const scratch: MacroMap = {};
  DEFINITION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DEFINITION.exec(source)) !== null) {
    const end = parseDefinition(source, match, scratch);
    if (end === null) continue;
    found.push(source.slice(match.index, end));
    DEFINITION.lastIndex = end;
  }
  return found;
}

export function collectMacros(text: string, base?: string): MacroMap {
  const macros: MacroMap = {};
  if (base) extractMacros(base, macros);
  extractMacros(text, macros);
  return macros;
}

interface Row {
  text: string;
  separator: string;
}

function splitRows(body: string): Row[] {
  const rows: Row[] = [];
  let depth = 0;
  let envDepth = 0;
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const char = body[i];
    if (char === '\\') {
      if (body.startsWith('\\begin{', i)) envDepth += 1;
      else if (body.startsWith('\\end{', i)) envDepth = Math.max(0, envDepth - 1);
      if (body[i + 1] === '\\' && depth === 0 && envDepth === 0) {
        let end = i + 2;
        ROW_SPACING.lastIndex = end;
        const spacing = ROW_SPACING.exec(body);
        if (spacing) end += spacing[0].length;
        rows.push({ text: body.slice(start, i), separator: body.slice(i, end) });
        start = end;
        i = end;
        continue;
      }
      i += 2;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') depth = Math.max(0, depth - 1);
    i += 1;
  }
  rows.push({ text: body.slice(start), separator: '' });
  return rows;
}

const ROW_ENVIRONMENTS = new Set(['align', 'gather', 'flalign', 'alignat', 'eqnarray']);
const SINGLE_ENVIRONMENTS = new Set(['equation', 'multline']);
const LABEL = /\\label\{([^}]*)\}/g;
const NO_NUMBER = /\\(nonumber|notag)(?![A-Za-z])/g;
const TAG = /\\tag\*?\{([^}]*)\}/;

export interface NumberingContext {
  next: () => string;
  label: (key: string, text: string) => void;
  format?: (number: string) => string;
}

interface RowPlan {
  text: string;
  number: string | null;
}

function planRow(text: string, numbered: boolean, context: NumberingContext): RowPlan {
  const labels: string[] = [];
  let cleaned = text.replace(LABEL, (_match, key: string) => {
    labels.push(key.trim());
    return '';
  });
  const suppressed = NO_NUMBER.test(cleaned);
  NO_NUMBER.lastIndex = 0;
  cleaned = cleaned.replace(NO_NUMBER, '');
  const tag = TAG.exec(cleaned);
  let number: string | null = null;
  if (tag) number = tag[1];
  else if (numbered && !suppressed && cleaned.trim()) {
    number = context.next();
    cleaned = `${cleaned.replace(/\s+$/, '')} \\tag{${context.format ? context.format(number) : number}}`;
  }
  if (number !== null) for (const key of labels) context.label(key, number);
  return { text: cleaned, number };
}

export interface MathPlan {
  latex: string;
  numbers: string[];
}

export function planMath(value: string, env: string | null, context: NumberingContext): MathPlan {
  if (!env) {
    const hasLabel = /\\label\{/.test(value);
    const plan = planRow(value, hasLabel, context);
    return { latex: plan.text, numbers: plan.number ? [plan.number] : [] };
  }
  const starred = env.endsWith('*');
  const name = starred ? env.slice(0, -1) : env;
  const open = `\\begin{${env}}`;
  const close = `\\end{${env}}`;
  let body = value.startsWith(open) && value.endsWith(close) ? value.slice(open.length, value.length - close.length) : value;
  let argument = '';
  if (name === 'alignat') {
    const group = readGroup(body, 0);
    if (group) {
      argument = `{${group.value}}`;
      body = body.slice(group.end);
    }
  }
  if (ROW_ENVIRONMENTS.has(name)) {
    const rows = splitRows(body).map((row) => ({ ...planRow(row.text, !starred, context), separator: row.separator }));
    const target = name === 'gather' ? 'gather*' : name === 'alignat' ? 'alignat*' : 'align*';
    let text = rows.map((row) => row.text + row.separator).join('');
    if (name === 'eqnarray') text = text.replace(/&([^&\\]*)&/g, '&$1');
    return {
      latex: `\\begin{${target}}${argument}${text}\\end{${target}}`,
      numbers: rows.map((row) => row.number).filter((n): n is string => n !== null),
    };
  }
  if (SINGLE_ENVIRONMENTS.has(name)) {
    if (name === 'multline') {
      const rows = splitRows(body);
      const last = rows.length - 1;
      const planned = rows.map((row, index) => ({ ...planRow(row.text, !starred && index === last, context), separator: row.separator }));
      return {
        latex: `\\begin{gather*}${planned.map((row) => row.text + row.separator).join('')}\\end{gather*}`,
        numbers: planned.map((row) => row.number).filter((n): n is string => n !== null),
      };
    }
    const plan = planRow(body, !starred, context);
    return { latex: `\\begin{equation*}${plan.text}\\end{equation*}`, numbers: plan.number ? [plan.number] : [] };
  }
  if (name === 'displaymath') {
    const plan = planRow(body, false, context);
    return { latex: plan.text, numbers: plan.number ? [plan.number] : [] };
  }
  const plan = planRow(value, false, context);
  return { latex: plan.text, numbers: plan.number ? [plan.number] : [] };
}

export interface LabelTarget {
  text: string;
  anchor: string;
  kind: string;
}

export function resolveMathRefs(latex: string, labels: Map<string, LabelTarget>): string {
  if (!latex.includes('ref{')) return latex;
  return latex.replace(/\\(eqref|ref|autoref|cref)\{([^}]*)\}/g, (_match, style: string, key: string) => {
    const target = labels.get(key.trim());
    const text = target ? target.text : '??';
    return style === 'eqref' ? `\\text{(${text})}` : `\\text{${text}}`;
  });
}

export const ENV_LABELS: Record<string, { en: string; fa: string; numbered: boolean }> = {
  theorem: { en: 'Theorem', fa: 'قضیه', numbered: true },
  lemma: { en: 'Lemma', fa: 'لم', numbered: true },
  proposition: { en: 'Proposition', fa: 'گزاره', numbered: true },
  corollary: { en: 'Corollary', fa: 'نتیجه', numbered: true },
  definition: { en: 'Definition', fa: 'تعریف', numbered: true },
  example: { en: 'Example', fa: 'مثال', numbered: true },
  remark: { en: 'Remark', fa: 'تذکر', numbered: false },
  note: { en: 'Note', fa: 'نکته', numbered: false },
  proof: { en: 'Proof', fa: 'اثبات', numbered: false },
  exercise: { en: 'Exercise', fa: 'تمرین', numbered: true },
  solution: { en: 'Solution', fa: 'حل', numbered: false },
  problem: { en: 'Problem', fa: 'مسئله', numbered: true },
  claim: { en: 'Claim', fa: 'ادعا', numbered: true },
  conjecture: { en: 'Conjecture', fa: 'حدس', numbered: true },
  axiom: { en: 'Axiom', fa: 'اصل', numbered: true },
  hint: { en: 'Hint', fa: 'راهنمایی', numbered: false },
  question: { en: 'Question', fa: 'پرسش', numbered: true },
  answer: { en: 'Answer', fa: 'پاسخ', numbered: false },
  equation: { en: 'Equation', fa: 'معادله', numbered: true },
};

export const CALLOUT_TITLES: Record<string, { en: string; fa: string }> = {
  note: { en: 'Note', fa: 'یادداشت' },
  info: { en: 'Info', fa: 'اطلاعات' },
  tip: { en: 'Tip', fa: 'نکته' },
  hint: { en: 'Hint', fa: 'راهنمایی' },
  important: { en: 'Important', fa: 'مهم' },
  success: { en: 'Success', fa: 'موفق' },
  check: { en: 'Check', fa: 'بررسی' },
  done: { en: 'Done', fa: 'انجام شد' },
  question: { en: 'Question', fa: 'پرسش' },
  help: { en: 'Help', fa: 'کمک' },
  faq: { en: 'FAQ', fa: 'پرسش‌های رایج' },
  warning: { en: 'Warning', fa: 'هشدار' },
  caution: { en: 'Caution', fa: 'احتیاط' },
  attention: { en: 'Attention', fa: 'توجه' },
  danger: { en: 'Danger', fa: 'خطر' },
  error: { en: 'Error', fa: 'خطا' },
  failure: { en: 'Failure', fa: 'ناموفق' },
  bug: { en: 'Bug', fa: 'اشکال' },
  example: { en: 'Example', fa: 'مثال' },
  quote: { en: 'Quote', fa: 'نقل‌قول' },
  cite: { en: 'Cite', fa: 'نقل‌قول' },
  abstract: { en: 'Abstract', fa: 'چکیده' },
  summary: { en: 'Summary', fa: 'خلاصه' },
  tldr: { en: 'TL;DR', fa: 'خلاصه' },
  todo: { en: 'To do', fa: 'کارها' },
  formula: { en: 'Formula', fa: 'فرمول' },
  key: { en: 'Key point', fa: 'نکتهٔ کلیدی' },
};

export const CALLOUT_TONES: Record<string, string> = {
  note: 'blue',
  info: 'blue',
  todo: 'blue',
  tip: 'teal',
  hint: 'teal',
  important: 'teal',
  formula: 'violet',
  key: 'violet',
  abstract: 'teal',
  summary: 'teal',
  tldr: 'teal',
  success: 'green',
  check: 'green',
  done: 'green',
  question: 'amber',
  help: 'amber',
  faq: 'amber',
  warning: 'orange',
  caution: 'orange',
  attention: 'orange',
  danger: 'red',
  error: 'red',
  failure: 'red',
  bug: 'red',
  example: 'violet',
  quote: 'gray',
  cite: 'gray',
};

export function envNumbered(name: string): boolean {
  return ENV_LABELS[name]?.numbered ?? false;
}

export interface EnvPlan {
  number: string | null;
  anchor: string | null;
}

export interface InlineMathPlan {
  latex: string;
}

export interface BlockMathPlan {
  latex: string;
  anchor: string | null;
  hidden: boolean;
}

export interface FootnotePlan {
  numbers: Map<string, number>;
  order: string[];
  defs: Map<string, Block[]>;
}

export interface DocumentModel {
  macros: MacroMap;
  macrosKey: string;
  blockMath: Map<Block, BlockMathPlan>;
  inlineMath: Map<Inline, InlineMathPlan>;
  envs: Map<Block, EnvPlan>;
  labels: Map<string, LabelTarget>;
  footnotes: FootnotePlan;
}

function isEmptyMath(latex: string): boolean {
  return latex.replace(/\\(begin|end)\{[^}]*\}/g, '').trim() === '';
}

export function analyzeDocument(blocks: Block[], options: { prefix: string; globalMacros?: string; formatNumber?: (number: string) => string }): DocumentModel {
  const macros: MacroMap = {};
  if (options.globalMacros) extractMacros(options.globalMacros, macros);
  const blockMath = new Map<Block, BlockMathPlan>();
  const inlineMath = new Map<Inline, InlineMathPlan>();
  const envs = new Map<Block, EnvPlan>();
  const labels = new Map<string, LabelTarget>();
  const footnoteNumbers = new Map<string, number>();
  const footnoteOrder: string[] = [];
  const footnoteDefs = new Map<string, Block[]>();
  const envCounters = new Map<string, number>();
  let equations = 0;

  const visitInlines = (nodes: Inline[]) => {
    for (const node of nodes) {
      switch (node.type) {
        case 'math': {
          const stripped = extractMacros(node.value, macros).replace(LABEL, '');
          inlineMath.set(node, { latex: stripped });
          break;
        }
        case 'footnoteRef':
          if (!footnoteNumbers.has(node.id)) {
            footnoteOrder.push(node.id);
            footnoteNumbers.set(node.id, footnoteOrder.length);
          }
          break;
        case 'strong':
        case 'em':
        case 'del':
        case 'mark':
        case 'link':
          visitInlines(node.children);
          break;
        default:
          break;
      }
    }
  };

  const visit = (list: Block[]) => {
    for (const block of list) {
      switch (block.type) {
        case 'defs':
          extractMacros(block.value, macros);
          break;
        case 'math': {
          const stripped = extractMacros(block.value, macros);
          if (isEmptyMath(stripped)) {
            blockMath.set(block, { latex: '', anchor: null, hidden: true });
            break;
          }
          const pending: [string, string][] = [];
          const plan = planMath(stripped, block.env, {
            next: () => {
              equations += 1;
              return String(equations);
            },
            label: (key, text) => pending.push([key, text]),
            format: options.formatNumber,
          });
          const anchor = plan.numbers.length ? `${options.prefix}-eq-${plan.numbers[0].replace(/[^\w.-]/g, '_')}` : null;
          if (anchor) for (const [key, text] of pending) labels.set(key, { text, anchor, kind: 'equation' });
          blockMath.set(block, { latex: plan.latex, anchor, hidden: false });
          break;
        }
        case 'env': {
          let number: string | null = null;
          if (envNumbered(block.name)) {
            const count = (envCounters.get(block.name) ?? 0) + 1;
            envCounters.set(block.name, count);
            number = String(count);
          }
          const anchor = `${options.prefix}-${block.name}-${number ?? envs.size + 1}`;
          envs.set(block, { number, anchor });
          if (block.label) labels.set(block.label, { text: number ?? '', anchor, kind: block.name });
          if (block.title) visitInlines(block.title);
          visit(block.children);
          break;
        }
        case 'heading':
        case 'paragraph':
          visitInlines(block.children);
          break;
        case 'table':
          block.header.forEach(visitInlines);
          block.rows.forEach((row) => row.forEach(visitInlines));
          break;
        case 'list':
          block.items.forEach((item) => visit(item.children));
          break;
        case 'quote':
          visit(block.children);
          break;
        case 'callout':
          visitInlines(block.title);
          visit(block.children);
          break;
        case 'footnoteDef':
          if (!footnoteDefs.has(block.id)) footnoteDefs.set(block.id, block.children);
          break;
        default:
          break;
      }
    }
  };

  visit(blocks);
  for (const [id, children] of footnoteDefs) {
    visit(children);
    if (!footnoteNumbers.has(id)) {
      footnoteOrder.push(id);
      footnoteNumbers.set(id, footnoteOrder.length);
    }
  }

  const macrosKey = Object.keys(macros).length ? JSON.stringify(macros) : '';
  return {
    macros,
    macrosKey,
    blockMath,
    inlineMath,
    envs,
    labels,
    footnotes: { numbers: footnoteNumbers, order: footnoteOrder, defs: footnoteDefs },
  };
}
