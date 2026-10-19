import { detectDirection, hasPersianLetters, toPersianDigits } from './bidi';
import { workspaceImageTarget } from './images';
import { ENV_LABELS, findDefinitions, readGroup } from './latex';
import { inlineProse, MATH_ENVIRONMENTS, parseMarkdown, THEOREM_ENVIRONMENTS, type Align, type Block, type Inline } from './markdown';
import { baseName } from './utils';

export interface LatexToMarkdownOptions {
  resolveImage?: (path: string) => string | null;
}

interface ConvertState {
  persian: boolean;
  counters: number[];
  sectionLabels: Map<string, string>;
  footnotes: string[];
  figures: number;
  tables: number;
  theoremKinds: Map<string, string>;
  resolveImage: (path: string) => string | null;
  verbatim: string[];
  pendingLabelFor: string | null;
}

const SECTION_LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

const INLINE_WRAP: Record<string, [string, string]> = {
  textbf: ['**', '**'],
  bfseries: ['', ''],
  textit: ['*', '*'],
  emph: ['*', '*'],
  textsl: ['*', '*'],
  underline: ['', ''],
  uline: ['', ''],
  textsc: ['', ''],
  textrm: ['', ''],
  textsf: ['', ''],
  textnormal: ['', ''],
  textup: ['', ''],
  mbox: ['', ''],
  makebox: ['', ''],
  fbox: ['', ''],
  hl: ['==', '=='],
  lr: ['', ''],
  rl: ['', ''],
  text: ['', ''],
  textcolor: ['', ''],
  colorbox: ['', ''],
};

const DROP_WITH_ARG = new Set([
  'vspace', 'hspace', 'setlength', 'addtolength', 'pagestyle', 'thispagestyle', 'setcounter', 'addtocounter',
  'usepackage', 'documentclass', 'bibliographystyle', 'settextfont', 'setlatintextfont', 'setdigitfont',
  'setmainfont', 'setsansfont', 'setmonofont', 'definecolor', 'newgeometry', 'geometry', 'input', 'include',
  'graphicspath', 'hypersetup', 'linespread',
]);

const DROP_SIMPLE = new Set([
  'noindent', 'centering', 'raggedright', 'raggedleft', 'newpage', 'clearpage', 'cleardoublepage', 'pagebreak',
  'linebreak', 'smallskip', 'medskip', 'bigskip', 'small', 'footnotesize', 'scriptsize', 'tiny', 'large', 'Large',
  'LARGE', 'huge', 'Huge', 'normalsize', 'tableofcontents', 'listoffigures', 'listoftables', 'hline', 'toprule',
  'midrule', 'bottomrule', 'protect', 'relax', 'indent', 'par', 'appendix', 'frontmatter', 'mainmatter', 'backmatter',
  'itshape', 'bfseries', 'ttfamily', 'rmfamily', 'sffamily', 'scshape', 'upshape', 'normalfont', 'hfill', 'vfill',
]);

const SYMBOLS: Record<string, string> = {
  LaTeX: 'LaTeX',
  TeX: 'TeX',
  XeLaTeX: 'XeLaTeX',
  ldots: '…',
  dots: '…',
  textbackslash: '\\\\',
  textasciitilde: '~',
  textasciicircum: '^',
  textendash: '–',
  textemdash: '—',
  today: new Date().toLocaleDateString(),
  copyright: '©',
  S: '§',
  P: '¶',
  quad: ' ',
  qquad: '  ',
  newline: '  \n',
  item: '',
};

function escapeMarkdown(text: string): string {
  return text.replace(/([*`|<>[\]])/g, '\\$1');
}

function findEnvironmentEnd(src: string, name: string, from: number): { contentEnd: number; end: number } | null {
  const pattern = new RegExp(`\\\\(begin|end)\\{${name.replace(/\*/g, '\\*')}\\}`, 'g');
  pattern.lastIndex = from;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(src)) !== null) {
    depth += match[1] === 'begin' ? 1 : -1;
    if (depth === 0) return { contentEnd: match.index, end: match.index + match[0].length };
  }
  return null;
}

function readOptionalArg(src: string, start: number): { value: string; end: number } | null {
  let i = start;
  while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i += 1;
  if (src[i] !== '[') return null;
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') depth -= 1;
    else if (src[j] === ']' && depth === 0) return { value: src.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

function splitTopLevel(src: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let envDepth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (char === '\\') {
      if (src.startsWith('\\begin{', i)) envDepth += 1;
      else if (src.startsWith('\\end{', i)) envDepth -= 1;
      if (depth === 0 && envDepth === 0) {
        separator.lastIndex = 0;
        const match = separator.exec(src.slice(i));
        if (match && match.index === 0) {
          parts.push(src.slice(start, i));
          i += match[0].length - 1;
          start = i + 1;
          continue;
        }
      }
      i += 1;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '&' && separator.source === '&' && depth === 0 && envDepth === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start));
  return parts;
}

function stripComments(src: string): string {
  return src.replace(/(^|[^\\])%.*$/gm, '$1');
}

function protectVerbatim(src: string, state: ConvertState): string {
  const store = (markdown: string) => {
    state.verbatim.push(markdown);
    return `\u0000V${state.verbatim.length - 1}\u0000`;
  };
  let out = src.replace(/\\begin\{(verbatim\*?|lstlisting|minted)\}(\[[^\]]*\])?(\{[^}]*\})?([\s\S]*?)\\end\{\1\}/g, (_match, env: string, options = '', argument = '', body: string) => {
    const language = env === 'minted' ? String(argument).slice(1, -1) : /language=([\w+#-]+)/i.exec(String(options))?.[1] ?? '';
    return `\n\n${store(`\`\`\`${language.toLowerCase()}\n${body.replace(/^\n/, '').replace(/\s+$/, '')}\n\`\`\``)}\n\n`;
  });
  out = out.replace(/\\verb\*?([^A-Za-z\s])(.*?)\1/g, (_match, _delimiter, body: string) => store(`\`${body}\``));
  return out;
}

function restoreVerbatim(src: string, state: ConvertState): string {
  return src.replace(/\u0000V(\d+)\u0000/g, (_match, index: string) => state.verbatim[Number(index)] ?? '');
}

function theoremKind(title: string): string {
  const lower = title.trim().toLowerCase();
  for (const [kind, label] of Object.entries(ENV_LABELS)) {
    if (kind === 'equation') continue;
    if (lower === label.en.toLowerCase() || title.trim() === label.fa) return kind;
  }
  for (const kind of THEOREM_ENVIRONMENTS) if (lower.startsWith(kind)) return kind;
  return 'theorem';
}

function sectionNumber(state: ConvertState, level: number): string {
  while (state.counters.length <= level) state.counters.push(0);
  state.counters[level] += 1;
  for (let i = level + 1; i < state.counters.length; i += 1) state.counters[i] = 0;
  const first = state.counters.findIndex((value, index) => index >= 1 && value > 0);
  const parts = state.counters.slice(first < 0 ? level : first, level + 1).filter((value) => value > 0);
  const number = parts.join('.');
  return state.persian ? toPersianDigits(number) : number;
}

function convertInline(src: string, state: ConvertState): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const char = src[i];
    if (char === '$') {
      const double = src[i + 1] === '$';
      const closer = double ? '$$' : '$';
      let close = src.indexOf(closer, i + closer.length);
      while (close > 0 && src[close - 1] === '\\') close = src.indexOf(closer, close + 1);
      if (close > i) {
        out += src.slice(i, close + closer.length);
        i = close + closer.length;
        continue;
      }
    }
    if (char === '\\') {
      const next = src[i + 1] ?? '';
      if (next === '(' || next === '[') {
        const closer = next === '(' ? '\\)' : '\\]';
        const close = src.indexOf(closer, i + 2);
        if (close > i) {
          out += src.slice(i, close + 2);
          i = close + 2;
          continue;
        }
      }
      if (next === '\\') {
        let end = i + 2;
        const spacing = /^\s*\[[^\]]*\]/.exec(src.slice(end));
        if (spacing) end += spacing[0].length;
        out += '  \n';
        i = end;
        continue;
      }
      if ('&%$#_{}~^ '.includes(next) && next) {
        out += next === '_' ? '\\_' : next === '$' ? '\\$' : next === ' ' ? ' ' : next === '~' || next === '^' ? next : next;
        i += 2;
        continue;
      }
      if (next === ',' || next === ';' || next === ':' || next === '!') {
        out += next === '!' ? '' : ' ';
        i += 2;
        continue;
      }
      const command = /^\\([A-Za-z@]+)(\*?)/.exec(src.slice(i));
      if (!command) {
        out += next;
        i += 2;
        continue;
      }
      const name = command[1];
      let cursor = i + command[0].length;
      if (name === 'footnote') {
        const optional = readOptionalArg(src, cursor);
        if (optional) cursor = optional.end;
        const group = readGroup(src, cursor);
        if (group) {
          state.footnotes.push(convertInline(group.value, state).replace(/\n+/g, ' ').trim());
          out += `[^${state.footnotes.length}]`;
          i = group.end;
          continue;
        }
      }
      if (name === 'href') {
        const url = readGroup(src, cursor);
        const label = url ? readGroup(src, url.end) : null;
        if (url && label) {
          out += `[${convertInline(label.value, state)}](${url.value.trim()})`;
          i = label.end;
          continue;
        }
      }
      if (name === 'url') {
        const url = readGroup(src, cursor);
        if (url) {
          out += `<${url.value.trim()}>`;
          i = url.end;
          continue;
        }
      }
      if (name === 'texttt' || name === 'code') {
        const group = readGroup(src, cursor);
        if (group) {
          out += `\`${group.value.replace(/\\([&%$#_{}])/g, '$1')}\``;
          i = group.end;
          continue;
        }
      }
      if (name === 'ref' || name === 'eqref' || name === 'autoref' || name === 'cref' || name === 'Cref' || name === 'pageref') {
        const group = readGroup(src, cursor);
        if (group) {
          const key = group.value.trim();
          const section = state.sectionLabels.get(key);
          out += section ?? `\\${name === 'pageref' ? 'ref' : name}{${key}}`;
          i = group.end;
          continue;
        }
      }
      if (name === 'cite' || name === 'citep' || name === 'citet' || name === 'parencite' || name === 'textcite') {
        const optional = readOptionalArg(src, cursor);
        if (optional) cursor = optional.end;
        const group = readGroup(src, cursor);
        if (group) {
          out += `\\cite{${group.value}}`;
          i = group.end;
          continue;
        }
      }
      if (name === 'label') {
        const group = readGroup(src, cursor);
        if (group) {
          if (state.pendingLabelFor) state.sectionLabels.set(group.value.trim(), state.pendingLabelFor);
          i = group.end;
          continue;
        }
      }
      if (name === 'textcolor' || name === 'colorbox') {
        const color = readGroup(src, cursor);
        if (color) cursor = color.end;
      }
      if (INLINE_WRAP[name]) {
        const group = readGroup(src, cursor);
        if (group) {
          const [open, close] = INLINE_WRAP[name];
          const inner = convertInline(group.value, state);
          out += inner.trim() ? `${open}${inner}${close}` : inner;
          i = group.end;
          continue;
        }
        i = cursor;
        continue;
      }
      if (DROP_WITH_ARG.has(name)) {
        const optional = readOptionalArg(src, cursor);
        if (optional) cursor = optional.end;
        const group = readGroup(src, cursor);
        i = group ? group.end : cursor;
        continue;
      }
      if (DROP_SIMPLE.has(name)) {
        i = cursor;
        if (src[i] === ' ') i += 1;
        continue;
      }
      if (name in SYMBOLS) {
        out += SYMBOLS[name];
        i = cursor;
        if (src[i] === '{' && src[i + 1] === '}') i += 2;
        continue;
      }
      const group = readGroup(src, cursor);
      if (group && src[cursor] === '{') {
        out += convertInline(group.value, state);
        i = group.end;
        continue;
      }
      i = cursor;
      continue;
    }
    if (char === '~') {
      out += ' ';
      i += 1;
      continue;
    }
    if (char === '{' || char === '}') {
      i += 1;
      continue;
    }
    if (char === '-' && src.startsWith('---', i)) {
      out += '—';
      i += 3;
      continue;
    }
    if (char === '-' && src.startsWith('--', i)) {
      out += '–';
      i += 2;
      continue;
    }
    if (char === '`' && src[i + 1] === '`') {
      out += '“';
      i += 2;
      continue;
    }
    if (char === "'" && src[i + 1] === "'") {
      out += '”';
      i += 2;
      continue;
    }
    out += escapeMarkdown(char);
    i += 1;
  }
  return out;
}

function convertParagraphs(src: string, state: ConvertState): string {
  return src
    .split(/\n\s*\n/)
    .map((paragraph) => {
      const text = convertInline(paragraph.replace(/\s*\n\s*/g, ' ').trim(), state).trim();
      return text.replace(/^(#{1,6}\s|>|[-+]\s|\d+[.)]\s)/, '\\$1');
    })
    .filter(Boolean)
    .join('\n\n');
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line, index) => (index === 0 || !line.trim() ? line : pad + line))
    .join('\n');
}

function convertList(body: string, ordered: boolean, description: boolean, state: ConvertState): string {
  const items = splitTopLevel(body, /\\item(?![A-Za-z])/g).slice(1);
  return items
    .map((raw, index) => {
      let text = raw;
      let label = '';
      const optional = readOptionalArg(text, 0);
      if (optional && /^\s*\[/.test(text)) {
        label = convertInline(optional.value, state).trim();
        text = text.slice(optional.end);
      }
      const content = convertBody(text.trim(), state).trim();
      const marker = ordered ? `${index + 1}. ` : '- ';
      const prefix = label ? (description ? `**${label}** ` : `**${label}** `) : '';
      return `${marker}${indent(`${prefix}${content}`, marker.length)}`;
    })
    .join('\n');
}

function convertTabular(body: string, state: ConvertState, spec: string): string {
  const alignments: Align[] = (spec.replace(/[|@{}\d\s.]|p\{[^}]*\}/g, '').match(/[lcrpXm]/g) ?? []).map((char) =>
    char === 'c' ? 'center' : char === 'r' ? 'right' : char === 'l' ? 'left' : null,
  );
  const rows = splitTopLevel(body, /\\\\(\s*\[[^\]]*\])?/g)
    .map((row) => row.replace(/\\(hline|toprule|midrule|bottomrule|cline\{[^}]*\}|cmidrule(\([^)]*\))?\{[^}]*\})/g, '').trim())
    .filter((row) => row.length > 0);
  if (rows.length === 0) return '';
  const cells = rows.map((row) =>
    splitTopLevel(row, /&/g).map((cell) =>
      convertInline(cell.trim(), state)
        .replace(/\n+/g, ' ')
        .replace(/\|/g, '\\|')
        .trim(),
    ),
  );
  const width = Math.max(...cells.map((row) => row.length));
  const line = (row: string[]) => `| ${Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ')} |`;
  const separator = `| ${Array.from({ length: width }, (_, index) => {
    const align = alignments[index];
    return align === 'center' ? ':---:' : align === 'right' ? '---:' : align === 'left' ? ':---' : '---';
  }).join(' | ')} |`;
  return [line(cells[0]), separator, ...cells.slice(1).map(line)].join('\n');
}

function convertEnvironment(name: string, argument: string, body: string, state: ConvertState): string {
  const base = name.replace(/\*$/, '');
  if (MATH_ENVIRONMENTS.includes(base) || base === 'math') {
    if (base === 'math') return `$${body.trim()}$`;
    return `\\begin{${name}}${body}\\end{${name}}`;
  }
  const kind = state.theoremKinds.get(base) ?? (THEOREM_ENVIRONMENTS.includes(base.toLowerCase()) ? base.toLowerCase() : null);
  if (kind) {
    const optional = readOptionalArg(body, 0);
    const title = optional && /^\s*\[/.test(body) ? optional.value : '';
    const inner = optional && title ? body.slice(optional.end) : body;
    const label = /\\label\{([^}]*)\}/.exec(inner)?.[1];
    const content = convertBody(inner.replace(/\\label\{[^}]*\}/, ''), state).trim();
    return `\\begin{${kind}}${title ? `[${convertInline(title, state).trim()}]` : ''}${label ? `\\label{${label}}` : ''}\n${content}\n\\end{${kind}}`;
  }
  switch (base) {
    case 'itemize':
      return convertList(body, false, false, state);
    case 'enumerate':
      return convertList(body, true, false, state);
    case 'description':
      return convertList(body, false, true, state);
    case 'abstract': {
      const content = convertBody(body, state).trim();
      return `> [!abstract]\n${content.split('\n').map((line) => `> ${line}`).join('\n')}`;
    }
    case 'quote':
    case 'quotation':
    case 'verse': {
      const content = convertBody(body, state).trim();
      return content.split('\n').map((line) => `> ${line}`).join('\n');
    }
    case 'tabular':
    case 'tabularx':
    case 'longtable':
    case 'array': {
      let spec = argument;
      let rest = body;
      if (base === 'tabularx') {
        const width = readGroup(rest, 0);
        if (width) rest = rest.slice(width.end);
      }
      if (!spec) {
        const group = readGroup(rest, 0);
        if (group && /^\s*\{/.test(rest)) {
          spec = group.value;
          rest = rest.slice(group.end);
        }
      }
      return convertTabular(rest, state, spec);
    }
    case 'figure':
    case 'figure*':
    case 'wrapfigure': {
      const lines: string[] = [];
      const pattern = /\\includegraphics(\[[^\]]*\])?\{([^}]*)\}/g;
      let match: RegExpExecArray | null;
      const caption = /\\caption(?:\[[^\]]*\])?\{/.exec(body);
      let captionText = '';
      if (caption) {
        const group = readGroup(body, caption.index + caption[0].length - 1);
        if (group) captionText = convertInline(group.value, state).trim();
      }
      while ((match = pattern.exec(body)) !== null) {
        const resolved = state.resolveImage(match[2].trim());
        lines.push(resolved ? `![${captionText}](${resolved})` : `*[${match[2].trim()}]*`);
      }
      if (captionText) {
        state.figures += 1;
        const number = state.persian ? toPersianDigits(state.figures) : String(state.figures);
        lines.push(`*${state.persian ? 'شکل' : 'Figure'} ${number}: ${captionText}*`);
      }
      return lines.join('\n\n');
    }
    case 'table':
    case 'table*': {
      const caption = /\\caption(?:\[[^\]]*\])?\{/.exec(body);
      let captionText = '';
      let rest = body;
      if (caption) {
        const group = readGroup(body, caption.index + caption[0].length - 1);
        if (group) {
          captionText = convertInline(group.value, state).trim();
          rest = body.slice(0, caption.index) + body.slice(group.end);
        }
      }
      const content = convertBody(rest, state).trim();
      if (!captionText) return content;
      state.tables += 1;
      const number = state.persian ? toPersianDigits(state.tables) : String(state.tables);
      return `${content}\n\n*${state.persian ? 'جدول' : 'Table'} ${number}: ${captionText}*`;
    }
    default:
      return convertBody(body, state);
  }
}

function convertBody(src: string, state: ConvertState): string {
  const blocks: string[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer.trim()) blocks.push(convertParagraphs(buffer, state));
    buffer = '';
  };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('\u0000V', i)) {
      const end = src.indexOf('\u0000', i + 2);
      if (end > 0) {
        const token = src.slice(i, end + 1);
        const stored = state.verbatim[Number(token.slice(2, -1))] ?? '';
        if (stored.startsWith('```')) {
          flush();
          blocks.push(token);
        } else buffer += token;
        i = end + 1;
        continue;
      }
    }
    if (src[i] === '$' && src[i + 1] === '$') {
      const close = src.indexOf('$$', i + 2);
      if (close > i) {
        flush();
        blocks.push(src.slice(i, close + 2));
        i = close + 2;
        continue;
      }
    }
    if (src.startsWith('\\[', i)) {
      const close = src.indexOf('\\]', i + 2);
      if (close > i) {
        flush();
        blocks.push(src.slice(i, close + 2));
        i = close + 2;
        continue;
      }
    }
    const begin = /^\\begin\{([A-Za-z]+\*?)\}/.exec(src.slice(i, i + 80));
    if (begin) {
      const name = begin[1];
      const start = i + begin[0].length;
      const end = findEnvironmentEnd(src, name, start);
      if (end) {
        let body = src.slice(start, end.contentEnd);
        let argument = '';
        if (/^(tabular|array|longtable)\*?$/.test(name)) {
          const group = readGroup(body, 0);
          if (group && /^\s*\{/.test(body)) {
            argument = group.value;
            body = body.slice(group.end);
          }
        } else if (/^(figure|table)\*?$/.test(name) || name === 'wrapfigure') {
          const optional = readOptionalArg(body, 0);
          if (optional && /^\s*\[/.test(body)) body = body.slice(optional.end);
        }
        const converted = convertEnvironment(name, argument, body, state);
        const inline = name === 'math';
        if (inline) buffer += converted;
        else {
          flush();
          if (converted.trim()) blocks.push(converted.trim());
        }
        i = end.end;
        continue;
      }
    }
    const section = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)/.exec(src.slice(i, i + 40));
    if (section) {
      let cursor = i + section[0].length;
      const optional = readOptionalArg(src, cursor);
      if (optional) cursor = optional.end;
      const group = readGroup(src, cursor);
      if (group) {
        flush();
        const level = SECTION_LEVELS[section[1]];
        const number = section[2] ? '' : sectionNumber(state, level);
        const title = convertInline(group.value, state).replace(/\n+/g, ' ').trim();
        const hashes = '#'.repeat(Math.min(6, Math.max(2, level)));
        blocks.push(level >= 5 ? `**${number ? `${number} ` : ''}${title}**` : `${hashes} ${number ? `${number} ` : ''}${title}`);
        state.pendingLabelFor = number || title;
        i = group.end;
        const label = /^\s*\\label\{([^}]*)\}/.exec(src.slice(i));
        if (label) {
          state.sectionLabels.set(label[1].trim(), number || title);
          i += label[0].length;
        }
        state.pendingLabelFor = null;
        continue;
      }
    }
    if (src.startsWith('\\maketitle', i)) {
      flush();
      blocks.push('\u0000TITLE\u0000');
      i += '\\maketitle'.length;
      continue;
    }
    buffer += src[i];
    i += 1;
  }
  flush();
  return blocks.join('\n\n');
}

function preambleValue(preamble: string, command: string): string | null {
  const match = new RegExp(`\\\\${command}(\\[[^\\]]*\\])?\\{`).exec(preamble);
  if (!match) return null;
  const group = readGroup(preamble, match.index + match[0].length - 1);
  return group ? group.value : null;
}

export function latexToMarkdown(source: string, options: LatexToMarkdownOptions = {}): string {
  const state: ConvertState = {
    persian: false,
    counters: [],
    sectionLabels: new Map(),
    footnotes: [],
    figures: 0,
    tables: 0,
    theoremKinds: new Map(),
    resolveImage: options.resolveImage ?? (() => null),
    verbatim: [],
    pendingLabelFor: null,
  };
  const cleaned = stripComments(protectVerbatim(source.replace(/\r\n?/g, '\n'), state));
  const beginDocument = cleaned.indexOf('\\begin{document}');
  const endDocument = cleaned.lastIndexOf('\\end{document}');
  const preamble = beginDocument >= 0 ? cleaned.slice(0, beginDocument) : '';
  const body = beginDocument >= 0 ? cleaned.slice(beginDocument + '\\begin{document}'.length, endDocument > beginDocument ? endDocument : undefined) : cleaned;
  state.persian = hasPersianLetters(body) || /xepersian/.test(preamble);

  const theoremPattern = /\\newtheorem\*?\{([^}]+)\}(?:\[[^\]]*\])?\{([^}]*)\}/g;
  let theorem: RegExpExecArray | null;
  while ((theorem = theoremPattern.exec(cleaned)) !== null) state.theoremKinds.set(theorem[1].trim(), theoremKind(theorem[2]));

  const definitions = findDefinitions(preamble).filter((definition) => !definition.startsWith('\\newenvironment'));
  const bodyDefinitions = findDefinitions(body);
  let bodyWithoutDefinitions = body;
  for (const definition of bodyDefinitions) bodyWithoutDefinitions = bodyWithoutDefinitions.replace(definition, '');

  let markdown = convertBody(bodyWithoutDefinitions, state);
  const title = preambleValue(cleaned, 'title');
  const author = preambleValue(cleaned, 'author');
  const date = preambleValue(cleaned, 'date');
  const titleBlock = title
    ? [`# ${convertInline(title, state).replace(/\n+/g, ' ').trim()}`, [author, date].filter(Boolean).map((value) => `*${convertInline(String(value), state).replace(/\\and/g, '·').trim()}*`).join(' · ')]
        .filter(Boolean)
        .join('\n\n')
    : '';
  markdown = markdown.includes('\u0000TITLE\u0000') ? markdown.replace('\u0000TITLE\u0000', titleBlock) : markdown;
  const head = [...definitions, ...bodyDefinitions].join('\n');
  const notes = state.footnotes.map((text, index) => `[^${index + 1}]: ${text}`).join('\n');
  const output = [head, markdown, notes].filter((part) => part.trim()).join('\n\n');
  return restoreVerbatim(output, state).replace(/\n{3,}/g, '\n\n').trim();
}

export interface MarkdownToLatexOptions {
  title?: string;
  author?: string;
  resolveImage?: (target: string) => string | null;
}

interface ExportState {
  rtl: boolean;
  persian: boolean;
  footnotes: Map<string, Block[]>;
  packages: Set<string>;
  theorems: Set<string>;
  definitions: string[];
  resolveImage?: (target: string) => string | null;
}

const LATEX_SPECIALS: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
};

function escapeLatex(text: string): string {
  return text.replace(/[\\{}$&#^_%~]/g, (char) => LATEX_SPECIALS[char]);
}

function wrapLatinRuns(text: string): string {
  return text.replace(/[A-Za-z][A-Za-z0-9]*(?:[ \-.'/][A-Za-z0-9]+)*/g, (run) => `\\lr{${run}}`);
}

function textToLatex(text: string, state: ExportState): string {
  const escaped = escapeLatex(text);
  return state.rtl ? wrapLatinRuns(escaped) : escaped;
}

function inlineToLatex(nodes: Inline[], state: ExportState): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return textToLatex(node.value, state);
        case 'strong':
          return `\\textbf{${inlineToLatex(node.children, state)}}`;
        case 'em':
          return `\\emph{${inlineToLatex(node.children, state)}}`;
        case 'del':
          state.packages.add('ulem');
          return `\\sout{${inlineToLatex(node.children, state)}}`;
        case 'mark':
          state.packages.add('xcolor');
          state.packages.add('highlight');
          return `\\hl{${inlineToLatex(node.children, state)}}`;
        case 'code':
          return state.rtl ? `\\lr{\\texttt{${escapeLatex(node.value)}}}` : `\\texttt{${escapeLatex(node.value)}}`;
        case 'math':
          if (node.value.includes('\\ce{') || node.value.includes('\\pu{')) state.packages.add('mhchem');
          return node.display ? `\\[${node.value}\\]` : `$${node.value}$`;
        case 'link':
          state.packages.add('hyperref');
          return `\\href{${node.href.replace(/[%#]/g, (char) => `\\${char}`)}}{${inlineToLatex(node.children, state)}}`;
        case 'image': {
          state.packages.add('graphicx');
          const target = workspaceImageTarget(node.src);
          const resolved = state.resolveImage ? state.resolveImage(target) : null;
          // The TeX engine searches the workspace `notes/` and `documents/`
          // folders through TEXINPUTS, so the bare file name resolves fine.
          const file = baseName((resolved ?? target).replace(/\\/g, '/'));
          return `\\includegraphics[width=0.8\\linewidth]{${file}}`;
        }
        case 'wikilink':
          return textToLatex(node.label, state);
        case 'footnoteRef': {
          const blocks = state.footnotes.get(node.id);
          return blocks ? `\\footnote{${blocksToLatex(blocks, state).trim()}}` : '';
        }
        case 'ref':
          return node.style === 'eqref' ? `\\eqref{${node.key}}` : `\\ref{${node.key}}`;
        case 'cite':
          return `\\cite{${node.keys.join(',')}}`;
        case 'break':
          return '\\\\\n';
        default:
          return '';
      }
    })
    .join('');
}

function sectionCommand(level: number, hasTitle: boolean): string {
  const shifted = hasTitle ? level - 1 : level;
  return ['section', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'subparagraph'][Math.max(0, Math.min(6, shifted))];
}

function tableToLatex(block: Extract<Block, { type: 'table' }>, state: ExportState): string {
  const columns = block.align.map((align) => (align === 'center' ? 'c' : align === 'right' ? 'r' : 'l')).join('|');
  const row = (cells: Inline[][]) => `${cells.map((cell) => inlineToLatex(cell, state)).join(' & ')} \\\\`;
  return [
    '\\begin{center}',
    `\\begin{tabular}{|${columns}|}`,
    '\\hline',
    row(block.header),
    '\\hline',
    ...block.rows.map(row),
    '\\hline',
    '\\end{tabular}',
    '\\end{center}',
  ].join('\n');
}

function blocksToLatex(blocks: Block[], state: ExportState, hasTitle = false): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading': {
          const numbered = /^\s*[\d\u06f0-\u06f9\u0660-\u0669]+(\.[\d\u06f0-\u06f9]+)*\s*[.):-]/.test(inlineProse(block.children));
          return `\\${sectionCommand(block.level, hasTitle)}${numbered ? '*' : ''}{${inlineToLatex(block.children, state)}}`;
        }
        case 'paragraph':
          return inlineToLatex(block.children, state);
        case 'code':
          return `\\begin{verbatim}\n${block.value}\n\\end{verbatim}`;
        case 'math':
          if (block.value.includes('\\ce{')) state.packages.add('mhchem');
          if (block.env) return block.value;
          return /\\label\{/.test(block.value) ? `\\begin{equation}\n${block.value}\n\\end{equation}` : `\\[\n${block.value}\n\\]`;
        case 'quote':
          return `\\begin{quote}\n${blocksToLatex(block.children, state)}\n\\end{quote}`;
        case 'callout': {
          const title = block.title.length ? inlineToLatex(block.title, state) : escapeLatex(block.kind.charAt(0).toUpperCase() + block.kind.slice(1));
          return `\\begin{quote}\n\\textbf{${title}.} ${blocksToLatex(block.children, state)}\n\\end{quote}`;
        }
        case 'env': {
          state.theorems.add(block.name);
          const title = block.title ? `[${inlineToLatex(block.title, state)}]` : '';
          const label = block.label ? `\\label{${block.label}}\n` : '';
          return `\\begin{${block.name}}${title}\n${label}${blocksToLatex(block.children, state)}\n\\end{${block.name}}`;
        }
        case 'list': {
          const env = block.ordered ? 'enumerate' : 'itemize';
          const items = block.items.map((item) => {
            const marker = item.checked === null ? '\\item ' : item.checked ? '\\item[$\\boxtimes$] ' : '\\item[$\\square$] ';
            if (item.checked !== null) state.packages.add('amssymb');
            return `${marker}${blocksToLatex(item.children, state).trim()}`;
          });
          return `\\begin{${env}}\n${items.join('\n')}\n\\end{${env}}`;
        }
        case 'table':
          return tableToLatex(block, state);
        case 'hr':
          return '\\noindent\\rule{\\linewidth}{0.4pt}';
        case 'defs':
          state.definitions.push(block.value);
          return '';
        case 'footnoteDef':
          return '';
        default:
          return '';
      }
    })
    .filter((part) => part.trim())
    .join('\n\n');
}

export function markdownToLatex(markdown: string, options: MarkdownToLatexOptions = {}): string {
  const blocks = parseMarkdown(markdown);
  const rtl = (detectDirection(markdown.slice(0, 20_000)) ?? 'ltr') === 'rtl';
  const state: ExportState = {
    rtl,
    persian: rtl && hasPersianLetters(markdown),
    footnotes: new Map(blocks.filter((b): b is Extract<Block, { type: 'footnoteDef' }> => b.type === 'footnoteDef').map((b) => [b.id, b.children])),
    packages: new Set(['amsmath', 'amssymb', 'amsthm', 'graphicx', 'hyperref']),
    theorems: new Set(),
    definitions: [],
    resolveImage: options.resolveImage,
  };
  let title = options.title ?? '';
  let content = blocks;
  if (blocks[0]?.type === 'heading' && blocks[0].level === 1) {
    title = inlineToLatex(blocks[0].children, state);
    content = blocks.slice(1);
  } else if (title) {
    title = textToLatex(title, state);
  }
  const body = blocksToLatex(content, state, Boolean(title));
  const order = ['amsmath', 'amssymb', 'amsthm', 'graphicx', 'xcolor', 'hyperref'];
  const packages = order.filter((name) => state.packages.has(name)).map((name) => `\\usepackage{${name}}`);
  if (state.packages.has('ulem')) packages.push('\\IfFileExists{ulem.sty}{\\usepackage[normalem]{ulem}}{}', '\\providecommand{\\sout}[1]{#1}');
  if (state.packages.has('mhchem')) packages.push('\\IfFileExists{mhchem.sty}{\\usepackage[version=4]{mhchem}}{}', '\\providecommand{\\ce}[1]{\\mathrm{#1}}');
  if (state.packages.has('highlight')) packages.push('\\providecommand{\\hl}[1]{\\colorbox{yellow!40}{#1}}');
  const theoremLines = Array.from(state.theorems).map((name) => {
    const label = ENV_LABELS[name] ?? { en: name, fa: name, numbered: false };
    const text = state.persian ? label.fa : label.en;
    if (name === 'proof') return null;
    return label.numbered ? `\\newtheorem{${name}}{${text}}` : `\\newtheorem*{${name}}{${text}}`;
  });
  const preamble = [
    '\\documentclass[11pt]{article}',
    ...packages,
    ...theoremLines.filter((line): line is string => line !== null),
    ...(state.theorems.has('proof') && state.persian ? ['\\renewcommand{\\proofname}{اثبات}'] : []),
    ...state.definitions,
    ...(rtl
      ? [
          '\\usepackage{fontspec}',
          '\\IfFileExists{xepersian.sty}{\\usepackage{xepersian}\\IfFontExistsTF{Vazirmatn}{\\settextfont{Vazirmatn}}{}}{\\IfFontExistsTF{Vazirmatn}{\\setmainfont{Vazirmatn}[Script=Arabic]}{\\IfFontExistsTF{Noto Sans Arabic}{\\setmainfont{Noto Sans Arabic}[Script=Arabic]}{\\IfFontExistsTF{DejaVu Sans}{\\setmainfont{DejaVu Sans}[Script=Arabic]}{}}}\\usepackage{bidi}\\setRTL}',
          '\\providecommand{\\lr}[1]{\\LR{#1}}',
          '\\providecommand{\\rl}[1]{\\RL{#1}}',
        ]
      : []),
  ];
  const head = title ? [`\\title{${title}}`, `\\author{${options.author ? textToLatex(options.author, state) : ''}}`, '\\date{\\today}'] : [];
  return [
    ...preamble,
    ...head,
    '',
    '\\begin{document}',
    ...(title ? ['\\maketitle', ''] : []),
    body,
    '',
    '\\end{document}',
    '',
  ].join('\n');
}
