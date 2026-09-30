import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineText, parseInline, parseMarkdown, type Block, type Inline } from './markdown.ts';

function first<T extends Block['type']>(blocks: Block[], type: T): Extract<Block, { type: T }> {
  const block = blocks.find((b) => b.type === type);
  assert.ok(block, `expected a ${type} block`);
  return block as Extract<Block, { type: T }>;
}

test('parses headings and paragraphs', () => {
  const blocks = parseMarkdown('# Title\n\nFirst line\nsecond line\n\n### Sub ###');
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], { type: 'heading', level: 1, children: [{ type: 'text', value: 'Title' }] });
  assert.equal(inlineText(first(blocks, 'paragraph').children), 'First line second line');
  assert.equal((blocks[2] as Extract<Block, { type: 'heading' }>).level, 3);
  assert.equal(inlineText((blocks[2] as Extract<Block, { type: 'heading' }>).children), 'Sub');
});

test('parses emphasis, code, strike and links', () => {
  const nodes = parseInline('**bold** and *it* with `code` ~~gone~~ [site](https://example.com) and ***both***');
  const types = nodes.map((n) => n.type);
  assert.deepEqual(types, ['strong', 'text', 'em', 'text', 'code', 'text', 'del', 'text', 'link', 'text', 'strong']);
  const link = nodes.find((n) => n.type === 'link') as Extract<Inline, { type: 'link' }>;
  assert.equal(link.href, 'https://example.com');
  const both = nodes[nodes.length - 1] as Extract<Inline, { type: 'strong' }>;
  assert.equal(both.children[0].type, 'em');
});

test('keeps nested emphasis inside italics', () => {
  const nodes = parseInline('*a **b** c*');
  assert.equal(nodes.length, 1);
  const em = nodes[0] as Extract<Inline, { type: 'em' }>;
  assert.equal(em.type, 'em');
  assert.ok(em.children.some((child) => child.type === 'strong'));
});

test('does not treat snake_case or prices as markup', () => {
  assert.equal(inlineText(parseInline('snake_case_name')), 'snake_case_name');
  assert.deepEqual(parseInline('costs $5 and $6').map((n) => n.type), ['text']);
  assert.equal(parseInline('2 * 3 * 4').length, 1);
});

test('parses inline and block math', () => {
  const inline = parseInline('Energy $E = mc^2$ here');
  assert.deepEqual(inline[1], { type: 'math', value: 'E = mc^2', display: false });
  const blocks = parseMarkdown('$$\n\\int_0^1 x\\,dx\n$$\n\n$$a+b$$');
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0], { type: 'math', value: '\\int_0^1 x\\,dx' });
  assert.deepEqual(blocks[1], { type: 'math', value: 'a+b' });
});

test('parses fenced code blocks verbatim', () => {
  const blocks = parseMarkdown('```python\ndef f():\n    return **x**\n```\ntext');
  assert.deepEqual(blocks[0], { type: 'code', lang: 'python', value: 'def f():\n    return **x**' });
  assert.equal(blocks[1].type, 'paragraph');
});

test('parses tables with header and alignment', () => {
  const blocks = parseMarkdown('| Name | Score |\n| :--- | ---: |\n| Ada | 10 |\n| Bob | 8 |');
  const table = first(blocks, 'table');
  assert.deepEqual(table.align, ['left', 'right']);
  assert.equal(inlineText(table.header[1]), 'Score');
  assert.equal(table.rows.length, 2);
  assert.equal(inlineText(table.rows[1][0]), 'Bob');
});

test('parses nested and task lists', () => {
  const blocks = parseMarkdown('- [x] done\n- [ ] todo\n  - nested one\n  - nested two\n- plain');
  const list = first(blocks, 'list');
  assert.equal(list.items.length, 3);
  assert.equal(list.items[0].checked, true);
  assert.equal(list.items[1].checked, false);
  assert.equal(list.items[2].checked, null);
  const nested = list.items[1].children.find((b) => b.type === 'list') as Extract<Block, { type: 'list' }>;
  assert.ok(nested);
  assert.equal(nested.items.length, 2);
  assert.equal(list.tight, true);
});

test('parses ordered lists with a start number', () => {
  const list = first(parseMarkdown('3. three\n4. four'), 'list');
  assert.equal(list.ordered, true);
  assert.equal(list.start, 3);
  assert.equal(list.items.length, 2);
});

test('parses blockquotes recursively', () => {
  const quote = first(parseMarkdown('> # Quoted\n> body *text*'), 'quote');
  assert.equal(quote.children[0].type, 'heading');
  assert.equal(quote.children[1].type, 'paragraph');
});

test('parses wiki links with labels', () => {
  const nodes = parseInline('See [[Cell Biology|biology notes]] and [[Physics]]');
  assert.deepEqual(nodes[1], { type: 'wikilink', target: 'Cell Biology', label: 'biology notes' });
  assert.deepEqual(nodes[3], { type: 'wikilink', target: 'Physics', label: 'Physics' });
});

test('autolinks bare urls without trailing punctuation', () => {
  const nodes = parseInline('Visit https://example.com/page.');
  const link = nodes[1] as Extract<Inline, { type: 'link' }>;
  assert.equal(link.href, 'https://example.com/page');
  assert.deepEqual(nodes[2], { type: 'text', value: '.' });
});

test('handles hard breaks and escapes', () => {
  const nodes = parseInline('line one  \nline two \\*not italic\\*');
  assert.equal(nodes[1].type, 'break');
  assert.equal(inlineText(nodes), 'line one\nline two *not italic*');
});

test('handles right-to-left text', () => {
  const blocks = parseMarkdown('## سلام دنیا\n\nاین یک **متن** است.');
  assert.equal(inlineText(first(blocks, 'heading').children), 'سلام دنیا');
  const paragraph = first(blocks, 'paragraph');
  assert.ok(paragraph.children.some((n) => n.type === 'strong'));
});

test('horizontal rules are not list items', () => {
  const blocks = parseMarkdown('above\n\n---\n\n* * *\n\nbelow');
  assert.deepEqual(blocks.map((b) => b.type), ['paragraph', 'hr', 'hr', 'paragraph']);
});

test('keeps text that follows display math on the same line', () => {
  const inline = parseMarkdown('$$E=mc^2$$ is famous.');
  assert.deepEqual(inline.map((b) => b.type), ['math', 'paragraph']);
  assert.equal(inlineText(first(inline, 'paragraph').children), 'is famous.');
  const multi = parseMarkdown('para\n$$\na+b\n$$ where a is x');
  assert.deepEqual(multi.map((b) => b.type), ['paragraph', 'math', 'paragraph']);
  assert.equal(first(multi, 'math').value, 'a+b');
  assert.equal(inlineText(multi[2].type === 'paragraph' ? multi[2].children : []), 'where a is x');
});
