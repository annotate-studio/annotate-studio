export type VisualizationType =
  | 'text'
  | 'bullet_list'
  | 'venn_diagram'
  | 'timeline'
  | 'mindmap'
  | 'qa_grid'
  | 'cheat_sheet'
  | 'fallacy_list';

export interface TextVisualization {
  type: 'text';
  content: string;
}

export interface BulletListVisualization {
  type: 'bullet_list';
  title?: string;
  items: string[];
}

export interface VennDiagramVisualization {
  type: 'venn_diagram';
  subjectA: string;
  subjectB: string;
  uniqueA: string[];
  uniqueB: string[];
  overlap: string[];
}

export interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
}

export interface TimelineVisualization {
  type: 'timeline';
  events: TimelineEvent[];
}

export interface MindMapBranch {
  name: string;
  children: string[];
}

export interface MindMapVisualization {
  type: 'mindmap';
  root: string;
  branches: MindMapBranch[];
}

export interface QaGridVisualization {
  type: 'qa_grid';
  why_questions: string[];
  how_questions: string[];
}

export interface CheatSheetTerm {
  term: string;
  definition: string;
}

export interface CheatSheetVisualization {
  type: 'cheat_sheet';
  title: string;
  core: string;
  facts: string[];
  terms: CheatSheetTerm[];
  example: string;
}

export interface Fallacy {
  claim: string;
  fallacy_type: string;
  explanation: string;
}

export interface FallacyListVisualization {
  type: 'fallacy_list';
  fallacies: Fallacy[];
}

export type Visualization =
  | TextVisualization
  | BulletListVisualization
  | VennDiagramVisualization
  | TimelineVisualization
  | MindMapVisualization
  | QaGridVisualization
  | CheatSheetVisualization
  | FallacyListVisualization;

export const VISUALIZATION_TYPES: readonly VisualizationType[] = [
  'text',
  'bullet_list',
  'venn_diagram',
  'timeline',
  'mindmap',
  'qa_grid',
  'cheat_sheet',
  'fallacy_list',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function line(value: unknown): string | null {
  const text = str(value);
  return text ? text.replace(/\s+/g, ' ') : null;
}

function lines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = line(item);
    if (text) out.push(text);
  }
  return out;
}

function pick(data: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null) return data[key];
  }
  return undefined;
}

function parseTerms(value: unknown): CheatSheetTerm[] {
  if (!Array.isArray(value)) return [];
  const terms: CheatSheetTerm[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const term = line(pick(record, ['term', 'name', 'word']));
    const definition = line(pick(record, ['definition', 'meaning', 'description']));
    if (term && definition) terms.push({ term, definition });
  }
  return terms;
}

function parseFallacies(value: unknown): Fallacy[] {
  if (!Array.isArray(value)) return [];
  const fallacies: Fallacy[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const claim = line(pick(record, ['claim', 'argument', 'statement'])) ?? '';
    const fallacyType = line(pick(record, ['fallacy_type', 'fallacy', 'type', 'name'])) ?? '';
    const explanation = line(pick(record, ['explanation', 'why', 'reason', 'flaw'])) ?? '';
    if (claim || fallacyType) fallacies.push({ claim, fallacy_type: fallacyType, explanation });
  }
  return fallacies;
}

/**
 * Validates and normalizes the JSON returned by a prompt preset into a
 * `Visualization` the UI can render. Returns null when the payload is unusable.
 */
export function parseVisualization(raw: unknown): Visualization | null {
  const data = asRecord(raw);
  if (!data) return null;
  const type = line(pick(data, ['visualization_type', 'type']));
  if (!type || !(VISUALIZATION_TYPES as readonly string[]).includes(type)) return null;

  switch (type as VisualizationType) {
    case 'text': {
      const content = str(pick(data, ['content', 'summary', 'text']));
      return content ? { type: 'text', content } : null;
    }
    case 'bullet_list': {
      const items = lines(pick(data, ['items', 'points', 'bullets']));
      if (items.length === 0) return null;
      const title = line(pick(data, ['title', 'heading']));
      return title ? { type: 'bullet_list', title, items } : { type: 'bullet_list', items };
    }
    case 'venn_diagram': {
      const subjectA = line(pick(data, ['subjectA', 'subject_a', 'subject1', 'a']));
      const subjectB = line(pick(data, ['subjectB', 'subject_b', 'subject2', 'b']));
      const uniqueA = lines(pick(data, ['uniqueA', 'unique_a', 'onlyA']));
      const uniqueB = lines(pick(data, ['uniqueB', 'unique_b', 'onlyB']));
      const overlap = lines(pick(data, ['overlap', 'shared', 'both']));
      if (!subjectA || !subjectB) return null;
      if (uniqueA.length === 0 && uniqueB.length === 0 && overlap.length === 0) return null;
      return { type: 'venn_diagram', subjectA, subjectB, uniqueA, uniqueB, overlap };
    }
    case 'timeline': {
      const events: TimelineEvent[] = [];
      const source = pick(data, ['events', 'items', 'timeline']);
      if (Array.isArray(source)) {
        for (const item of source) {
          const record = asRecord(item);
          if (!record) continue;
          const title = line(pick(record, ['title', 'event', 'name']));
          if (!title) continue;
          const date = line(pick(record, ['date', 'year', 'time', 'period'])) ?? '';
          const description = line(pick(record, ['description', 'detail', 'summary']));
          events.push(description ? { date, title, description } : { date, title });
        }
      }
      return events.length > 0 ? { type: 'timeline', events } : null;
    }
    case 'mindmap': {
      const root = line(pick(data, ['root', 'central', 'topic', 'title']));
      const branches: MindMapBranch[] = [];
      const source = pick(data, ['branches', 'children', 'nodes']);
      if (Array.isArray(source)) {
        for (const item of source) {
          const record = asRecord(item);
          if (!record) continue;
          const name = line(pick(record, ['name', 'label', 'title', 'branch']));
          if (!name) continue;
          branches.push({ name, children: lines(pick(record, ['children', 'subtopics', 'items'])) });
        }
      }
      if (!root || branches.length === 0) return null;
      return { type: 'mindmap', root, branches };
    }
    case 'qa_grid': {
      const whyQuestions = lines(pick(data, ['why_questions', 'why', 'whyQuestions']));
      const howQuestions = lines(pick(data, ['how_questions', 'how', 'howQuestions']));
      if (whyQuestions.length === 0 && howQuestions.length === 0) return null;
      return { type: 'qa_grid', why_questions: whyQuestions, how_questions: howQuestions };
    }
    case 'cheat_sheet': {
      const core = str(pick(data, ['core', 'definition', 'formula'])) ?? '';
      const facts = lines(pick(data, ['facts', 'points', 'items']));
      const terms = parseTerms(pick(data, ['terms', 'definitions']));
      const example = str(pick(data, ['example', 'application'])) ?? '';
      if (!core && facts.length === 0 && terms.length === 0 && !example) return null;
      return {
        type: 'cheat_sheet',
        title: line(pick(data, ['title', 'topic'])) ?? '',
        core,
        facts,
        terms,
        example,
      };
    }
    case 'fallacy_list': {
      const source = pick(data, ['fallacies', 'items', 'contradictions']);
      if (!Array.isArray(source)) return null;
      return { type: 'fallacy_list', fallacies: parseFallacies(source) };
    }
    default:
      return null;
  }
}

/**
 * Serializes a visualization into plain text so it can be copied to the
 * clipboard and kept as the readable transcript of the message.
 */
export function visualizationToText(data: Visualization): string {
  switch (data.type) {
    case 'text':
      return data.content;
    case 'bullet_list':
      return [data.title ? `${data.title}` : '', ...data.items.map((item) => `- ${item}`)].filter(Boolean).join('\n');
    case 'venn_diagram':
      return [
        `${data.subjectA} vs ${data.subjectB}`,
        '',
        `Only ${data.subjectA}:`,
        ...data.uniqueA.map((item) => `- ${item}`),
        '',
        `Only ${data.subjectB}:`,
        ...data.uniqueB.map((item) => `- ${item}`),
        '',
        'Shared:',
        ...data.overlap.map((item) => `- ${item}`),
      ].join('\n');
    case 'timeline':
      return data.events.map((event) => `- ${event.date ? `${event.date}: ` : ''}${event.title}${event.description ? ` — ${event.description}` : ''}`).join('\n');
    case 'mindmap':
      return [
        data.root,
        ...data.branches.flatMap((branch) => [
          `- ${branch.name}`,
          ...branch.children.map((child) => `  - ${child}`),
        ]),
      ].join('\n');
    case 'qa_grid':
      return [
        'Why?',
        ...data.why_questions.map((question) => `- ${question}`),
        '',
        'How?',
        ...data.how_questions.map((question) => `- ${question}`),
      ].join('\n');
    case 'cheat_sheet':
      return [
        data.title,
        data.core ? `\nCore: ${data.core}` : '',
        data.facts.length ? `\nFacts:\n${data.facts.map((fact) => `- ${fact}`).join('\n')}` : '',
        data.terms.length ? `\nTerms:\n${data.terms.map((term) => `- ${term.term}: ${term.definition}`).join('\n')}` : '',
        data.example ? `\nExample: ${data.example}` : '',
      ]
        .filter((part) => part.trim())
        .join('\n');
    case 'fallacy_list':
      if (data.fallacies.length === 0) return 'No contradictions found.';
      return data.fallacies
        .map((fallacy, index) => `${index + 1}. [${fallacy.fallacy_type || 'Fallacy'}] ${fallacy.claim}\n   ${fallacy.explanation}`)
        .join('\n');
    default:
      return '';
  }
}
