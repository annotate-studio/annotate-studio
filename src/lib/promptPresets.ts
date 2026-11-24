import type { VisualizationType } from './visualizations';

export type PromptId =
  | 'summary'
  | 'key-notes'
  | 'compare'
  | 'timeline'
  | 'mindmap'
  | 'why-how'
  | 'cheat-sheet'
  | 'contradictions'
  | 'feynman'
  | 'analogy'
  | 'exam-traps'
  | 'practice'
  | 'synthesize';

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
Answer in user prompt's language.`;

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'summary',
    label: 'Summary',
    description: 'Core thesis, key mechanisms, and essential takeaways in one crisp synthesis.',
    visualization: 'text',
    temperature: 0.25,
    instruction:
      'Synthesize the provided material into a high-density executive summary (120-180 words). Capture the central thesis, the key reasoning or mechanism, and the main conclusion or implication. Omit filler. Respond with {"visualization_type":"text","content":"String containing the summary."}',
  },
  {
    id: 'key-notes',
    label: 'Extract key notes',
    description: 'High-yield facts, definitions, formulas, and conceptual takeaways.',
    visualization: 'bullet_list',
    temperature: 0.25,
    instruction:
      'Extract the highest-yield concepts a student must master from the text: core definitions, laws, causal relationships, and conclusions. Return 6-12 self-contained, exam-ready sentences in logical order. Respond with {"visualization_type":"bullet_list","title":"Key Notes","items":["Point 1 sentence.","Point 2 sentence."]}.',
  },
  {
    id: 'compare',
    label: 'Compare and contrast',
    description: 'Deep conceptual comparison of two subjects as a Venn diagram.',
    visualization: 'venn_diagram',
    temperature: 0.35,
    instruction:
      'Identify the two primary concepts, theories, or subjects compared in the text. Extract their sharpest distinguishing characteristics (uniqueA, uniqueB) and genuine shared principles (overlap). Aim for 4-5 substantive items per category. Respond with {"visualization_type":"venn_diagram","subjectA":"Subject Name","subjectB":"Contrasting Subject Name","uniqueA":["Unique attribute 1."],"uniqueB":["Unique attribute 1."],"overlap":["Shared attribute 1."]}.',
  },
  {
    id: 'timeline',
    label: 'Build a timeline',
    description: 'Chronological events or process stages, ordered with dates and significance.',
    visualization: 'timeline',
    temperature: 0.25,
    instruction:
      'Extract all chronological events, historical milestones, or sequential process stages from the text, sorted from earliest to latest. Each item must include a crisp date or stage marker, a concise title, and a 1-2 sentence explanation of its cause or significance. Respond with {"visualization_type":"timeline","events":[{"date":"1945","title":"Event Title","description":"Brief significance."}]}.',
  },
  {
    id: 'mindmap',
    label: 'Create a mind map',
    description: 'Hierarchical concept map with central topic, main pillars, and sub-concepts.',
    visualization: 'mindmap',
    temperature: 0.35,
    instruction:
      'Organize the material into a structured conceptual mind map for deep retention. Choose the core topic as root, 4-6 distinct major branches, and 3-5 crisp sub-topics (2-6 words each) per branch capturing mechanisms, examples, or sub-concepts. Respond with {"visualization_type":"mindmap","root":"Central Topic","branches":[{"name":"Branch 1","children":["Sub-topic 1.1","Sub-topic 1.2"]}]}.',
  },
  {
    id: 'why-how',
    label: '"Why" and "How" questions',
    description: 'Deep Socratic "Why" (causal) and "How" (mechanistic) study questions.',
    visualization: 'qa_grid',
    temperature: 0.45,
    instruction:
      'Generate 4 deep "Why" questions probing underlying causes, assumptions, or trade-offs, and 4 deep "How" questions probing step-by-step mechanisms, derivations, or real-world application. Avoid surface-level recall questions. Respond with {"visualization_type":"qa_grid","why_questions":["Why does X occur?"],"how_questions":["How does X function?"]}.',
  },
  {
    id: 'cheat-sheet',
    label: 'Create a cheat sheet',
    description: 'Exam-ready reference: core law, key facts, glossary, and worked example.',
    visualization: 'cheat_sheet',
    temperature: 0.25,
    instruction:
      'Distill the material into a high-yield exam cheat sheet: 1) Core principle, law, or definition, 2) 6-8 essential facts/rules, 3) 4-6 key terms with crisp definitions, 4) 1 concrete worked example or practical application. Respond with {"visualization_type":"cheat_sheet","title":"Topic Name","core":"The single most important principle or definition.","facts":["Fact 1."],"terms":[{"term":"Term 1","definition":"Definition."}],"example":"Concrete worked example or application."}.',
  },
  {
    id: 'contradictions',
    label: 'Find contradictions',
    description: 'Critical audit of hidden assumptions, logical fallacies, and weak claims.',
    visualization: 'fallacy_list',
    temperature: 0.35,
    instruction:
      'Critically audit the material for logical inconsistencies, hidden assumptions, unsupported leaps, or contradictions. Identify up to 5 concrete weaknesses with the exact claim, fallacy/flaw category, and a clear explanation. If the reasoning is fully sound, return an empty array. Respond with {"visualization_type":"fallacy_list","fallacies":[{"claim":"The claim made in the text.","fallacy_type":"Hidden Assumption","explanation":"Why this is flawed."}]}.',
  },
  {
    id: 'feynman',
    label: 'Feynman check',
    description: 'Audit your explanation for clarity, missing steps, and misconceptions.',
    visualization: 'cheat_sheet',
    temperature: 0.3,
    instruction:
      'Evaluate the student explanation using the Feynman Technique. Respond with {"visualization_type":"cheat_sheet","title":"Feynman Review","core":"One-sentence clarity verdict and what the student understood well.","facts":["Missing step or gap 1.","Misconception to fix 1."],"terms":[{"term":"Shaky concept","definition":"Simple plain-language explanation."}],"example":"A crystal-clear 2-3 sentence model explanation in simple terms."}.',
  },
  {
    id: 'analogy',
    label: 'Analogy & intuition',
    description: 'Everyday analogy, mental picture, and where the analogy breaks down.',
    visualization: 'cheat_sheet',
    temperature: 0.5,
    instruction:
      'Build deep intuition for the core concept in the material. Respond with {"visualization_type":"cheat_sheet","title":"Intuition & Analogy","core":"A vivid everyday real-world analogy for the concept.","facts":["How the analogy maps onto the real mechanism.","Visual or geometric mental picture."],"terms":[{"term":"Analogy element","definition":"What it corresponds to in the real concept."}],"example":"Where this analogy breaks down (crucial boundary so the student avoids misconceptions)."}.',
  },
  {
    id: 'exam-traps',
    label: 'Exam traps & mistakes',
    description: 'Edge cases, trick variations, and common pitfalls that cost exam points.',
    visualization: 'fallacy_list',
    temperature: 0.35,
    instruction:
      'Identify up to 6 classic exam traps, tricky edge cases, and common student mistakes for this topic. For each, put the tempting wrong instinct in "claim", the trap category (e.g. Sign Error, Forgotten Condition, Edge Case) in "fallacy_type", and the exact fix in "explanation". Respond with {"visualization_type":"fallacy_list","fallacies":[{"claim":"What students mistakenly do or assume.","fallacy_type":"Forgotten Condition","explanation":"How professors test this and how to avoid the trap."}]}.',
  },
  {
    id: 'practice',
    label: 'Practice problems',
    description: 'Fresh conceptual and worked problems inspired by your material.',
    visualization: 'qa_grid',
    temperature: 0.55,
    instruction:
      'Generate fresh exam-style practice problems based on the material (using new numbers or scenarios, not copying verbatim). Put 4 conceptual check problems in "why_questions" and 4 step-by-step calculation/application problems with brief final answers in parentheses in "how_questions". Respond with {"visualization_type":"qa_grid","why_questions":["Conceptual problem 1..."],"how_questions":["Applied problem 1... (Hint/Answer: ...)"]}.',
  },
  {
    id: 'synthesize',
    label: 'Connect files',
    description: 'Cross-document synthesis of overlaps, gaps, and differing emphases.',
    visualization: 'venn_diagram',
    temperature: 0.35,
    instruction:
      'Synthesize across the attached documents or sections. Identify the two primary sources or viewpoints, list what each emphasizes uniquely (including notation differences or skipped details) in uniqueA and uniqueB, and list the core principles both agree on in overlap. Respond with {"visualization_type":"venn_diagram","subjectA":"Source / Perspective A","subjectB":"Source / Perspective B","uniqueA":["Unique point or emphasis in A."],"uniqueB":["Unique point or emphasis in B."],"overlap":["Shared core idea."]}',
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
