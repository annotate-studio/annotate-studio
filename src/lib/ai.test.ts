import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, extractJsonObjects, splitLesson, trimHistory, wantsFlashcards } from './ai.ts';

test('extracts json from noisy model output', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"questions":[{"q":"x"}]} hope it helps'), { questions: [{ q: 'x' }] });
  assert.deepEqual(extractJson('<think>{ not this }</think>[1,2]'), [1, 2]);
  assert.equal(extractJson('no json here'), null);
});

test('repairs latex escapes, raw newlines and trailing commas', () => {
  assert.deepEqual(extractJson('{"q":"$\\frac{1}{2}$ and $\\alpha$ and $\\theta$","list":[1,2,],}'), {
    q: '$\\frac{1}{2}$ and $\\alpha$ and $\\theta$',
    list: [1, 2],
  });
  assert.deepEqual(extractJson('{"q":"line one\\nline two\\tTabbed"}'), { q: 'line one\nline two\tTabbed' });
  assert.deepEqual(extractJson('{"q":"$\\nabla f \\neq 0$ \\nNext"}'), { q: '$\\nabla f \\neq 0$ \nNext' });
  assert.deepEqual(extractJson('{"q":"already \\\\frac ok"}'), { q: 'already \\frac ok' });
  assert.deepEqual(extractJson('{"q":"multi\nline"}'), { q: 'multi\nline' });
});

test('salvages complete objects from broken output', () => {
  const raw = '{"questions":[{"question":"Q1","answer":"a"},{"question":"Q2 "bad" quote","answer":"b"},{"question":"Q3","answer":"c"}';
  assert.deepEqual(
    extractJsonObjects(raw).map((item) => item.question),
    ['Q1', 'Q3'],
  );
});

test('splits lessons into heading sections', () => {
  const lesson = '## Overview\nIntro\n\n## Step 1: A\nOne\n```\n## not a heading\n```\n## Summary\nDone';
  const steps = splitLesson(lesson);
  assert.equal(steps.length, 3);
  assert.ok(steps[1].includes('## not a heading'));
  assert.ok(steps[2].startsWith('## Summary'));
  assert.deepEqual(splitLesson('Plain answer'), ['Plain answer']);
});

test('detects flashcard requests in english and persian', () => {
  assert.equal(wantsFlashcards('Make 10 flashcards about mitosis'), true);
  assert.equal(wantsFlashcards('what are flashcards?'), false);
  assert.equal(wantsFlashcards('از این متن فلش کارت بساز'), true);
});

test('keeps the most recent history within limits', () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
  const trimmed = trimHistory(messages, 5);
  assert.equal(trimmed.length, 5);
  assert.equal(trimmed[4].content, 'm29');
  const long = [{ role: 'user' as const, content: 'x'.repeat(100) }, { role: 'assistant' as const, content: 'y'.repeat(100) }];
  assert.equal(trimHistory(long, 10, 150).length, 1);
});
