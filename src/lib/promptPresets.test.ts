import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPT_PRESETS, buildPromptSystemMessage, getPreset, isPromptId } from './promptPresets.ts';
import { VISUALIZATION_TYPES } from './visualizations.ts';

test('offers every ready-made prompt exactly once', () => {
  const ids = PROMPT_PRESETS.map((preset) => preset.id);
  assert.deepEqual(ids, ['summary', 'key-notes', 'compare', 'timeline', 'mindmap', 'why-how', 'cheat-sheet', 'contradictions']);
  assert.equal(new Set(ids).size, ids.length);
});

test('every preset maps to a renderer the UI supports', () => {
  for (const preset of PROMPT_PRESETS) {
    assert.ok((VISUALIZATION_TYPES as readonly string[]).includes(preset.visualization), preset.id);
    assert.ok(preset.label.trim().length > 0, preset.id);
    assert.ok(preset.description.trim().length > 0, preset.id);
    assert.ok(preset.instruction.includes('visualization_type'), preset.id);
    assert.ok(preset.temperature >= 0 && preset.temperature <= 1, preset.id);
  }
});

test('builds a json-only system message around the preset instruction', () => {
  const preset = getPreset('summary');
  assert.ok(preset);
  const message = buildPromptSystemMessage(preset);
  assert.ok(message.includes('valid JSON only'));
  assert.ok(message.includes(preset.instruction));
  assert.ok(message.startsWith('You are the visual study assistant'));
  assert.equal(getPreset('nope' as never), undefined);
  assert.equal(isPromptId('timeline'), true);
  assert.equal(isPromptId('unknown'), false);
  assert.equal(isPromptId(7), false);
});
