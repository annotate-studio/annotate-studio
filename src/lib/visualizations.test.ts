import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisualization, visualizationToText } from './visualizations.ts';
import { extractJson } from './ai.ts';

test('parses every supported visualization type', () => {
  assert.deepEqual(parseVisualization({ visualization_type: 'text', content: '  A summary. ' }), {
    type: 'text',
    content: 'A summary.',
  });
  assert.deepEqual(parseVisualization({ visualization_type: 'bullet_list', title: 'Key Notes', items: ['a', ' b ', '', 3] }), {
    type: 'bullet_list',
    title: 'Key Notes',
    items: ['a', 'b'],
  });
  assert.deepEqual(
    parseVisualization({
      visualization_type: 'venn_diagram',
      subjectA: 'Cats',
      subjectB: 'Dogs',
      uniqueA: ['Retractable claws.'],
      uniqueB: [],
      overlap: ['Domesticated.'],
    }),
    {
      type: 'venn_diagram',
      subjectA: 'Cats',
      subjectB: 'Dogs',
      uniqueA: ['Retractable claws.'],
      uniqueB: [],
      overlap: ['Domesticated.'],
    },
  );
  assert.deepEqual(
    parseVisualization({ visualization_type: 'timeline', events: [{ date: '1945', title: 'War ends', description: 'WW2.' }, { title: 'No date' }] }),
    {
      type: 'timeline',
      events: [
        { date: '1945', title: 'War ends', description: 'WW2.' },
        { date: '', title: 'No date' },
      ],
    },
  );
  assert.deepEqual(
    parseVisualization({ visualization_type: 'mindmap', root: 'Topic', branches: [{ name: 'Branch', children: ['Sub'] }] }),
    { type: 'mindmap', root: 'Topic', branches: [{ name: 'Branch', children: ['Sub'] }] },
  );
  assert.deepEqual(
    parseVisualization({ visualization_type: 'qa_grid', why_questions: ['Why?'], how_questions: [] }),
    { type: 'qa_grid', why_questions: ['Why?'], how_questions: [] },
  );
  assert.deepEqual(
    parseVisualization({
      visualization_type: 'cheat_sheet',
      title: 'Topic',
      core: 'E = mc^2',
      facts: ['Fact.'],
      terms: [{ term: 'Mass', definition: 'Amount of matter.' }],
      example: 'An example.',
    }),
    {
      type: 'cheat_sheet',
      title: 'Topic',
      core: 'E = mc^2',
      facts: ['Fact.'],
      terms: [{ term: 'Mass', definition: 'Amount of matter.' }],
      example: 'An example.',
    },
  );
  assert.deepEqual(
    parseVisualization({ visualization_type: 'fallacy_list', fallacies: [{ claim: 'C', fallacy_type: 'Straw Man', explanation: 'E' }] }),
    { type: 'fallacy_list', fallacies: [{ claim: 'C', fallacy_type: 'Straw Man', explanation: 'E' }] },
  );
});

test('keeps an empty fallacy list when nothing contradicts', () => {
  assert.deepEqual(parseVisualization({ visualization_type: 'fallacy_list', fallacies: [] }), {
    type: 'fallacy_list',
    fallacies: [],
  });
});

test('accepts the stored shape that uses "type" instead of "visualization_type"', () => {
  assert.deepEqual(parseVisualization({ type: 'text', content: 'Stored.' }), { type: 'text', content: 'Stored.' });
});

test('rejects unknown or incomplete payloads', () => {
  assert.equal(parseVisualization(null), null);
  assert.equal(parseVisualization('{"visualization_type":"text"}'), null);
  assert.equal(parseVisualization({ visualization_type: 'pie_chart', content: 'x' }), null);
  assert.equal(parseVisualization({ visualization_type: 'text' }), null);
  assert.equal(parseVisualization({ visualization_type: 'bullet_list', items: [] }), null);
  assert.equal(parseVisualization({ visualization_type: 'venn_diagram', subjectA: 'A', subjectB: 'B' }), null);
  assert.equal(parseVisualization({ visualization_type: 'timeline', events: [] }), null);
  assert.equal(parseVisualization({ visualization_type: 'mindmap', root: 'Topic' }), null);
  assert.equal(parseVisualization({ visualization_type: 'qa_grid' }), null);
  assert.equal(parseVisualization({ visualization_type: 'cheat_sheet', title: 'Only a title' }), null);
  assert.equal(parseVisualization({ visualization_type: 'fallacy_list' }), null);
});

test('parses a fenced and noisy model response end to end', () => {
  const raw = 'Sure!\n```json\n{"visualization_type":"bullet_list","items":["Point one."],}\n```';
  assert.deepEqual(parseVisualization(extractJson(raw)), { type: 'bullet_list', items: ['Point one.'] });
  assert.equal(parseVisualization(extractJson('no json at all')), null);
});

test('serializes visualizations to copyable text', () => {
  assert.equal(visualizationToText({ type: 'text', content: 'Summary here.' }), 'Summary here.');
  assert.equal(visualizationToText({ type: 'bullet_list', title: 'Key Notes', items: ['One.', 'Two.'] }), 'Key Notes\n- One.\n- Two.');
  assert.equal(
    visualizationToText({ type: 'timeline', events: [{ date: '1963', title: 'Speech', description: 'In Berlin.' }] }),
    '- 1963: Speech — In Berlin.',
  );
  assert.equal(
    visualizationToText({ type: 'mindmap', root: 'Topic', branches: [{ name: 'Branch', children: ['Sub'] }] }),
    'Topic\n- Branch\n  - Sub',
  );
  assert.equal(visualizationToText({ type: 'fallacy_list', fallacies: [] }), 'No contradictions found.');
  assert.ok(visualizationToText({ type: 'cheat_sheet', title: 'Algebra', core: 'x = -b/2a', facts: ['F1'], terms: [], example: 'E' }).includes('Core: x = -b/2a'));
  assert.ok(visualizationToText({ type: 'qa_grid', why_questions: ['Why?'], how_questions: ['How?'] }).includes('- How?'));
  assert.ok(visualizationToText({ type: 'venn_diagram', subjectA: 'A', subjectB: 'B', uniqueA: ['u'], uniqueB: [], overlap: ['s'] }).includes('Shared:'));
  assert.ok(
    visualizationToText({
      type: 'fallacy_list',
      fallacies: [{ claim: 'Claim', fallacy_type: 'Ad Hominem', explanation: 'Why.' }],
    }).includes('[Ad Hominem] Claim'),
  );
});
