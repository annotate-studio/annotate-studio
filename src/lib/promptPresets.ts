import type { VisualizationType } from './visualizations';

export type PromptId =
  | 'summary'
  | 'key-notes'
  | 'compare'
  | 'timeline'
  | 'mindmap'
  | 'why-how'
  | 'cheat-sheet'
  | 'contradictions';

export interface PromptPreset {
  id: PromptId;
  label: string;
  description: string;
  visualization: VisualizationType;
  temperature: number;
  instruction: string;
}

export const PROMPT_SYSTEM_CONTEXT = `You are the visual study assistant inside Annotate Studio, a desktop study workspace.
Always respond with valid JSON only: no Markdown, no code fences, and no text before or after the JSON object.
Every response must include a "visualization_type" field that matches the requested task exactly.
Use plain readable text inside string values; do not use Markdown or LaTeX markup inside the JSON.
Study material is provided inside <document name="..."> blocks. Ground the answer in that material, never invent facts, quotes or numbers that it does not contain.
When no study material is provided, use your general knowledge and keep the answer focused on the requested task.
Reply in the language of the provided material.`;

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'summary',
    label: 'Summary',
    description: 'A short paragraph with the core argument and main points.',
    visualization: 'text',
    temperature: 0.3,
    instruction:
      'Summarize the provided text. Return a concise paragraph (max 150 words) capturing the core argument and main supporting points. Exclude minor examples and tangential details. Respond with {"visualization_type":"text","content":"String containing the summary."}',
  },
  {
    id: 'key-notes',
    label: 'Extract key notes',
    description: 'The essential facts, definitions and conclusions as a flat list.',
    visualization: 'bullet_list',
    temperature: 0.3,
    instruction:
      'Extract the most critical information from the text. Return only the essential facts, definitions, and conclusions. Organize as a flat list of key points. Each point must be a complete, standalone sentence. Max 10 points. Respond with {"visualization_type":"bullet_list","title":"Key Notes","items":["Point 1 sentence.","Point 2 sentence."]}.',
  },
  {
    id: 'compare',
    label: 'Compare and contrast',
    description: 'Two subjects with unique and shared attributes, as a Venn diagram.',
    visualization: 'venn_diagram',
    temperature: 0.4,
    instruction:
      'Identify the two primary subjects being compared in the text. Extract their unique attributes and their shared attributes. Do not add preamble or explanations. Ensure at least 3 items per category when possible. Respond with {"visualization_type":"venn_diagram","subjectA":"Subject Name","subjectB":"Contrasting Subject Name","uniqueA":["Unique attribute 1."],"uniqueB":["Unique attribute 1."],"overlap":["Shared attribute 1."]}.',
  },
  {
    id: 'timeline',
    label: 'Build a timeline',
    description: 'Chronological events, oldest to newest, each with a date marker.',
    visualization: 'timeline',
    temperature: 0.3,
    instruction:
      'Extract all chronological events from the text. Sort them from oldest to newest. Each event must have a specific date or relative time marker. If exact dates are unavailable, use "circa [year]" or "Early [period]". Respond with {"visualization_type":"timeline","events":[{"date":"1945","title":"Event Title","description":"Brief description."}]}.',
  },
  {
    id: 'mindmap',
    label: 'Create a mind map',
    description: 'A central topic with up to 4 branches and short sub-topics.',
    visualization: 'mindmap',
    temperature: 0.4,
    instruction:
      'Organize the text into a hierarchical mind map. The central topic is the root. Create up to 4 main branches. Each branch can have up to 3 sub-branches. Keep node labels short (2-5 words). Respond with {"visualization_type":"mindmap","root":"Central Topic","branches":[{"name":"Branch 1","children":["Sub-topic 1.1","Sub-topic 1.2"]}]}.',
  },
  {
    id: 'why-how',
    label: '"Why" and "How" questions',
    description: 'Three deep "Why" and three "How" reasoning questions.',
    visualization: 'qa_grid',
    temperature: 0.5,
    instruction:
      "Generate deep-reasoning questions based on the text. Generate 3 'Why' questions that probe causes, rationale, or underlying principles. Generate 3 'How' questions that probe processes, mechanisms, or step-by-step execution. Do not ask obvious or surface-level questions. Respond with {\"visualization_type\":\"qa_grid\",\"why_questions\":[\"Why does X occur?\"],\"how_questions\":[\"How does X function?\"]}.",
  },
  {
    id: 'cheat-sheet',
    label: 'Create a cheat sheet',
    description: 'Core idea, key facts, terms and one practical example.',
    visualization: 'cheat_sheet',
    temperature: 0.3,
    instruction:
      'Condense the text into a single-page reference. Extract: 1) Core formula/definition, 2) 5-7 bullet point facts, 3) 3 key terms with definitions, 4) 1 practical example or application. Respond with {"visualization_type":"cheat_sheet","title":"Topic Name","core":"The single most important formula, law, or definition.","facts":["Fact 1."],"terms":[{"term":"Term 1","definition":"Definition."}],"example":"Brief practical application or example."}.',
  },
  {
    id: 'contradictions',
    label: 'Find contradictions',
    description: 'Logical fallacies and unsupported claims, with explanations.',
    visualization: 'fallacy_list',
    temperature: 0.4,
    instruction:
      'Analyze the text for logical inconsistencies, unsupported claims, or contradictions. Identify up to 5 weaknesses. For each, state the claim being made, identify the logical fallacy type (e.g., Ad Hominem, Straw Man, False Dilemma, Hasty Generalization, Circular Reasoning), and explain why it is flawed. If no contradictions exist, return an empty array. Respond with {"visualization_type":"fallacy_list","fallacies":[{"claim":"The original claim or argument made in the text.","fallacy_type":"Ad Hominem","explanation":"Why this is a logical error."}]}.',
  },
];

export function getPreset(id: PromptId): PromptPreset | undefined {
  return PROMPT_PRESETS.find((preset) => preset.id === id);
}

export function isPromptId(value: unknown): value is PromptId {
  return typeof value === 'string' && PROMPT_PRESETS.some((preset) => preset.id === value);
}

export function buildPromptSystemMessage(preset: PromptPreset): string {
  return `${PROMPT_SYSTEM_CONTEXT}\n\nTask (${preset.label}):\n${preset.instruction}`;
}
