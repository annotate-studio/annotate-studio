export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'del'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'math'; value: string; display: boolean }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'wikilink'; target: string; label: string }
  | { type: 'break' };

export type Align = 'left' | 'center' | 'right' | null;

export interface ListItem {
  checked: boolean | null;
  children: Block[];
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'code'; lang: string; value: string }
  | { type: 'math'; value: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; tight: boolean; items: ListItem[] }
  | { type: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { type: 'hr' };

const ESCAPABLE = '\\`*_{}[]()#+-.!|~$<>"\'';
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ ]?(.*)$/;
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/;
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const MATH_OPEN = /^ {0,3}\$\$(.*)$/;

function indentWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    if (char === ' ') width += 1;
    else if (char === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
}

function stripIndent(line: string, amount: number): string {
  let removed = 0;
  let index = 0;
  while (index < line.length && removed < amount) {
    const char = line[index];
    if (char === ' ') removed += 1;
    else if (char === '\t') removed += 4 - (removed % 4);
    else break;
    index += 1;
  }
  return line.slice(index);
}

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === '';
}

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  let inCode = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (char === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (char === '`') inCode = !inCode;
    if (char === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    HR.test(line) ||
    QUOTE.test(line) ||
    MATH_OPEN.test(line) ||
    (LIST_ITEM.test(line) && !/^\s*\d{1,9}[.)]\s*$/.test(line) && LIST_ITEM.exec(line)![4].trim() !== '')
  );
}

function parseList(lines: string[], start: number): { block: Block; next: number } {
  const first = LIST_ITEM.exec(lines[start])!;
  const baseIndent = indentWidth(first[1]);
  const ordered = /\d/.test(first[2]);
  const startNumber = ordered ? parseInt(first[2], 10) : 1;
  const items: ListItem[] = [];
  let tight = true;
  let i = start;

  while (i < lines.length) {
    const match = LIST_ITEM.exec(lines[i]);
    if (!match || indentWidth(match[1]) !== baseIndent || /\d/.test(match[2]) !== ordered) break;
    const contentIndent = baseIndent + match[2].length + Math.max(1, Math.min(match[3].length, 4));
    const content: string[] = [match[4]];
    i += 1;
    let sawBlank = false;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) {
        let lookahead = i + 1;
        while (lookahead < lines.length && isBlank(lines[lookahead])) lookahead += 1;
        if (lookahead < lines.length && indentWidth(lines[lookahead]) >= contentIndent) {
          content.push('');
          sawBlank = true;
          i += 1;
          continue;
        }
        break;
      }
      const indent = indentWidth(line);
      if (indent >= contentIndent) {
        content.push(stripIndent(line, contentIndent));
        i += 1;
        continue;
      }
      if (indent > baseIndent && LIST_ITEM.test(line)) {
        content.push(stripIndent(line, Math.min(indent, contentIndent)));
        i += 1;
        continue;
      }
      if (!sawBlank && !startsBlock(line) && !LIST_ITEM.test(line)) {
        content.push(line.trim());
        i += 1;
        continue;
      }
      break;
    }

    let checked: boolean | null = null;
    const task = /^\[([ xX])\][ \t]+/.exec(content[0]);
    if (task) {
      checked = task[1].toLowerCase() === 'x';
      content[0] = content[0].slice(task[0].length);
    }
    if (sawBlank) tight = false;
    items.push({ checked, children: parseBlocks(content) });

    let lookahead = i;
    while (lookahead < lines.length && isBlank(lines[lookahead])) lookahead += 1;
    const nextMatch = lookahead < lines.length ? LIST_ITEM.exec(lines[lookahead]) : null;
    if (lookahead > i && nextMatch && indentWidth(nextMatch[1]) === baseIndent && /\d/.test(nextMatch[2]) === ordered) {
      tight = false;
      i = lookahead;
    }
  }

  return { block: { type: 'list', ordered, start: startNumber, tight, items }, next: i };
}

export function parseBlocks(input: string[]): Block[] {
  const lines = input.slice();
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence && !(fence[2][0] === '`' && fence[3].includes('`'))) {
      const marker = fence[2];
      const indent = fence[1].length;
      const body: string[] = [];
      i += 1;
      while (i < lines.length) {
        const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[i]);
        if (closing && closing[1][0] === marker[0] && closing[1].length >= marker.length) {
          i += 1;
          break;
        }
        body.push(stripIndent(lines[i], indent));
        i += 1;
      }
      blocks.push({ type: 'code', lang: fence[3].trim().split(/\s+/)[0] ?? '', value: body.join('\n') });
      continue;
    }

    const math = MATH_OPEN.exec(line);
    if (math) {
      const rest = math[1];
      const inlineClose = rest.indexOf('$$');
      if (inlineClose >= 0) {
        blocks.push({ type: 'math', value: rest.slice(0, inlineClose).trim() });
        const after = rest.slice(inlineClose + 2);
        if (after.trim()) lines[i] = after.trim();
        else i += 1;
        continue;
      }
      const body: string[] = rest.trim() ? [rest] : [];
      i += 1;
      while (i < lines.length) {
        const closeAt = lines[i].indexOf('$$');
        if (closeAt >= 0) {
          const before = lines[i].slice(0, closeAt);
          const after = lines[i].slice(closeAt + 2);
          if (before.trim()) body.push(before);
          if (after.trim()) lines[i] = after.trim();
          else i += 1;
          break;
        }
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'math', value: body.join('\n').trim() });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline((heading[2] ?? '').trim()),
      });
      i += 1;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && !isBlank(lines[i])) {
        const quoted = QUOTE.exec(lines[i]);
        if (quoted) inner.push(quoted[1]);
        else if (!startsBlock(lines[i])) inner.push(lines[i]);
        else break;
        i += 1;
      }
      blocks.push({ type: 'quote', children: parseBlocks(inner) });
      continue;
    }

    const listMatch = LIST_ITEM.exec(line);
    if (listMatch && (listMatch[4].trim() !== '' || /^[-*+]$/.test(listMatch[2]))) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]).map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
      });
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
        const cells = splitRow(lines[i]);
        rows.push(header.map((_, index) => parseInline(cells[index] ?? '')));
        i += 1;
      }
      blocks.push({ type: 'table', align: header.map((_, index) => align[index] ?? null), header: header.map((cell) => parseInline(cell)), rows });
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) {
      if (lines[i].includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) break;
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.map((l) => l.replace(/^[ \t]+/, '')).join('\n')) });
  }
  return blocks;
}

function isWhitespace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

function isAlphanumeric(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

function findClosing(src: string, from: number, delimiter: string): number {
  const char = delimiter[0];
  let index = from;
  while (index < src.length) {
    const found = src.indexOf(delimiter, index);
    if (found < 0) return -1;
    let runStart = found;
    while (runStart > from && src[runStart - 1] === char) runStart -= 1;
    let runEnd = found;
    while (src[runEnd] === char) runEnd += 1;
    if (runEnd - runStart === delimiter.length && runStart > from) {
      const before = src[runStart - 1];
      const after = src[runEnd];
      const escaped = before === '\\';
      const validFlank = !isWhitespace(before);
      const underscoreOk = char !== '_' || !isAlphanumeric(after);
      if (!escaped && validFlank && underscoreOk) return runStart;
    }
    index = runEnd;
  }
  return -1;
}

function findBracketEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const char = src[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseDestination(src: string, open: number): { href: string; end: number } | null {
  if (src[open] !== '(') return null;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const char = src[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        const inner = src.slice(open + 1, i).trim();
        const href = inner.replace(/\s+["'(].*["')]$/, '').replace(/^<(.*)>$/, '$1').trim();
        return { href, end: i + 1 };
      }
    }
  }
  return null;
}

const URL_PATTERN = /^(https?:\/\/[^\s<>]+)/i;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) {
      out.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  let i = 0;
  while (i < src.length) {
    const char = src[i];
    const next = src[i + 1];

    if (char === '\\' && next !== undefined) {
      if (next === '\n') {
        flush();
        out.push({ type: 'break' });
        i += 2;
        continue;
      }
      if (ESCAPABLE.includes(next)) {
        buffer += next;
        i += 2;
        continue;
      }
    }

    if (char === '\n') {
      if (buffer.endsWith('  ')) {
        buffer = buffer.replace(/ +$/, '');
        flush();
        out.push({ type: 'break' });
      } else {
        buffer = buffer.replace(/ +$/, '') + ' ';
      }
      i += 1;
      continue;
    }

    if (char === '`') {
      let run = 1;
      while (src[i + run] === '`') run += 1;
      const fence = '`'.repeat(run);
      let search = i + run;
      let close = -1;
      while (search < src.length) {
        const found = src.indexOf(fence, search);
        if (found < 0) break;
        if (src[found + run] !== '`') {
          close = found;
          break;
        }
        search = found + run;
        while (src[search] === '`') search += 1;
      }
      if (close >= 0) {
        flush();
        let value = src.slice(i + run, close).replace(/\n/g, ' ');
        if (value.startsWith(' ') && value.endsWith(' ') && value.trim()) value = value.slice(1, -1);
        out.push({ type: 'code', value });
        i = close + run;
        continue;
      }
      buffer += fence;
      i += run;
      continue;
    }

    if (char === '$') {
      if (next === '$') {
        const close = src.indexOf('$$', i + 2);
        if (close > i + 2) {
          flush();
          out.push({ type: 'math', value: src.slice(i + 2, close).trim(), display: true });
          i = close + 2;
          continue;
        }
      } else if (next !== undefined && !isWhitespace(next)) {
        let close = src.indexOf('$', i + 1);
        while (close > 0 && (src[close - 1] === '\\' || isWhitespace(src[close - 1]) || /\d/.test(src[close + 1] ?? ''))) {
          close = src.indexOf('$', close + 1);
        }
        if (close > i + 1) {
          flush();
          out.push({ type: 'math', value: src.slice(i + 1, close), display: false });
          i = close + 1;
          continue;
        }
      }
    }

    if (char === '!' && next === '[') {
      const end = findBracketEnd(src, i + 1);
      const destination = end > 0 ? parseDestination(src, end + 1) : null;
      if (destination) {
        flush();
        out.push({ type: 'image', alt: src.slice(i + 2, end), src: destination.href });
        i = destination.end;
        continue;
      }
    }

    if (char === '[') {
      if (next === '[') {
        const close = src.indexOf(']]', i + 2);
        const inner = close > 0 ? src.slice(i + 2, close) : '';
        if (close > 0 && inner.trim() && !inner.includes('\n')) {
          flush();
          const [target, label] = inner.split('|');
          out.push({ type: 'wikilink', target: target.trim(), label: (label ?? target).trim() });
          i = close + 2;
          continue;
        }
      } else {
        const end = findBracketEnd(src, i);
        const destination = end > 0 ? parseDestination(src, end + 1) : null;
        if (destination) {
          flush();
          out.push({ type: 'link', href: destination.href, children: parseInline(src.slice(i + 1, end)) });
          i = destination.end;
          continue;
        }
      }
    }

    if (char === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(src.slice(i));
      if (auto) {
        flush();
        out.push({ type: 'link', href: auto[1], children: [{ type: 'text', value: auto[1].replace(/^mailto:/i, '') }] });
        i += auto[0].length;
        continue;
      }
    }

    if ((char === 'h' || char === 'H') && (i === 0 || /[\s(]/.test(src[i - 1]))) {
      const url = URL_PATTERN.exec(src.slice(i));
      if (url) {
        let value = url[1];
        while (/[.,;:!?)\]'"]$/.test(value)) {
          if (value.endsWith(')') && (value.match(/\(/g)?.length ?? 0) >= (value.match(/\)/g)?.length ?? 0)) break;
          value = value.slice(0, -1);
        }
        flush();
        out.push({ type: 'link', href: value, children: [{ type: 'text', value }] });
        i += value.length;
        continue;
      }
    }

    if (char === '~' && next === '~') {
      const close = findClosing(src, i + 2, '~~');
      if (close > 0 && !isWhitespace(src[i + 2])) {
        flush();
        out.push({ type: 'del', children: parseInline(src.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }

    if (char === '*' || char === '_') {
      let run = 1;
      while (src[i + run] === char) run += 1;
      const opensWord = !isWhitespace(src[i + run]);
      const intraword = char === '_' && isAlphanumeric(src[i - 1]);
      if (opensWord && !intraword) {
        const attempts = run >= 3 ? [3, 2, 1] : run === 2 ? [2, 1] : [1];
        let matched = false;
        for (const size of attempts) {
          const delimiter = char.repeat(size);
          const start = i + run;
          const close = findClosing(src, start, delimiter);
          if (close > start) {
            flush();
            const inner = parseInline(src.slice(start, close));
            if (run > size) buffer += char.repeat(run - size);
            flush();
            const node: Inline =
              size === 3
                ? { type: 'strong', children: [{ type: 'em', children: inner }] }
                : size === 2
                  ? { type: 'strong', children: inner }
                  : { type: 'em', children: inner };
            out.push(node);
            i = close + size;
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }
      buffer += char.repeat(run);
      i += run;
      continue;
    }

    buffer += char;
    i += 1;
  }
  flush();
  return out;
}

export function parseMarkdown(markdown: string): Block[] {
  return parseBlocks(markdown.replace(/\r\n?/g, '\n').split('\n'));
}

export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
        case 'math':
          return node.value;
        case 'break':
          return '\n';
        case 'image':
          return node.alt;
        case 'wikilink':
          return node.label;
        default:
          return inlineText(node.children);
      }
    })
    .join('');
}

export function isSafeUrl(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}
