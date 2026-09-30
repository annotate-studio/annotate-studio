import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnswer, stripLetterPrefixes } from './answers.ts';

const cells = ['A cell wall', 'A nucleus', 'A cell membrane', 'A ribosome'];

test('matches answers by text before trying letters', () => {
  assert.equal(resolveAnswer(cells, 'A cell membrane.'), 'A cell membrane');
  assert.equal(resolveAnswer(cells, '"a nucleus"'), 'A nucleus');
  assert.equal(resolveAnswer(cells, 'C) A cell membrane'), 'A cell membrane');
  assert.equal(resolveAnswer(cells, 'A cell wall, because plants need support'), 'A cell wall');
});

test('accepts letters and indexes', () => {
  const options = ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi'];
  assert.equal(resolveAnswer(options, 'B'), 'Mitochondria');
  assert.equal(resolveAnswer(options, '(c)'), 'Ribosome');
  assert.equal(resolveAnswer(options, 'Answer: D'), 'Golgi');
  assert.equal(resolveAnswer(options, 'B.'), 'Mitochondria');
  assert.equal(resolveAnswer(options, 1), 'Mitochondria');
  assert.equal(resolveAnswer(options, 9), null);
  assert.equal(resolveAnswer(options, 'Chloroplast'), null);
});

test('keeps option text that only looks like a letter prefix', () => {
  const species = ['E. coli', 'B. subtilis', 'S. aureus', 'C. difficile'];
  assert.deepEqual(stripLetterPrefixes(species), species);
  assert.equal(resolveAnswer(species, 'B. subtilis'), 'B. subtilis');
  assert.deepEqual(stripLetterPrefixes(['A) One', 'B) Two', 'C) Three']), ['One', 'Two', 'Three']);
  assert.equal(resolveAnswer(['A', 'B', 'AB', 'O'], 'A'), 'A');
  assert.equal(resolveAnswer(['A', 'B', 'AB', 'O'], 'Type O blood'), 'O');
});
