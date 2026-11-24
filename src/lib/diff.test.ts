import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDiff } from './diff.ts';

test('returns identical for equal strings', () => {
  const diff = computeDiff('a\nb\nc\n', 'a\nb\nc\n');
  assert.equal(diff.identical, true);
  assert.equal(diff.additions, 0);
  assert.equal(diff.deletions, 0);
  assert.equal(diff.hunks.length, 0);
});

test('computes additions, deletions and context hunks', () => {
  const before = ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'].join('\n');
  const after = ['line 1', 'line 2', 'line 3 edited', 'line 4', 'line 5', 'line 6'].join('\n');
  const diff = computeDiff(before, after, 1);
  assert.equal(diff.identical, false);
  assert.equal(diff.additions, 2);
  assert.equal(diff.deletions, 1);
  assert.ok(diff.hunks.length >= 1);
  const allLines = diff.hunks.flatMap((h) => h.lines);
  assert.ok(allLines.some((l) => l.kind === 'del' && l.text === 'line 3'));
  assert.ok(allLines.some((l) => l.kind === 'add' && l.text === 'line 3 edited'));
  assert.ok(allLines.some((l) => l.kind === 'add' && l.text === 'line 6'));
});

test('handles brand new files cleanly', () => {
  const diff = computeDiff('', '# Title\nHello world\n');
  assert.equal(diff.identical, false);
  assert.equal(diff.additions, 2);
  assert.equal(diff.deletions, 0);
});
