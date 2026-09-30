import type { ChatMessagePayload } from './tauri-commands';

export const STUDY_ASSISTANT_PROMPT = `You are the study assistant inside Annotate Studio, a desktop study workspace.
Help the learner understand, remember and apply what they are studying.
- Be accurate, clear and concise. Prefer short paragraphs, lists and tables over long walls of text.
- Use Markdown for structure and LaTeX for math ($inline$ and $$display$$).
- When study materials are attached, ground the answer in them, quote key lines when useful and say clearly when the material does not cover the question.
- Never invent sources, numbers or quotes.
- Reply in the language the learner writes in.`;

export const EXPLAINER_PROMPT = `You are a patient, adaptive tutor. Teach the requested topic as a short step-by-step lesson.
Format the lesson in Markdown using exactly these level-2 headings:
## Overview
One or two sentences on what the topic is and why it matters.
## Step 1: <title>
Explain one idea. Start with a concrete example, then connect it to the precise terminology.
## Step 2: <title>
(continue with 3 to 6 steps in total, one idea per step)
## Summary
A short bulleted recap and one suggestion for what to study next.
Rules: simplify the language, not the truth; keep conditions, units and caveats; label analogies as analogies; use LaTeX for math; reply in the language of the request.`;

export const SUMMARY_PROMPT = `You are a study assistant. Summarize the provided document for a student.
Structure the summary in Markdown:
## In one sentence
## Key ideas
A bulleted list of the most important concepts, each with a one-line explanation.
## Details worth remembering
Definitions, formulas (in LaTeX), dates or numbers that matter.
## Questions to test yourself
Three short self-check questions.
Stay faithful to the document and reply in the document's language.`;

export function trimHistory(messages: ChatMessagePayload[], maxMessages = 16, maxChars = 24_000): ChatMessagePayload[] {
  const recent = messages.slice(-maxMessages);
  let total = 0;
  const kept: ChatMessagePayload[] = [];
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const message = recent[i];
    total += message.content.length;
    if (total > maxChars && kept.length > 0) break;
    kept.unshift(message);
  }
  return kept;
}

export function wantsFlashcards(text: string): boolean {
  const lower = text.toLowerCase();
  const english = /\bflash\s?cards?\b/.test(lower) && /\b(make|create|generate|build|add|turn|write|give)\b/.test(lower);
  const persian = /فلش\s?کارت/.test(text) && /(بساز|درست کن|ایجاد|بنویس|تولید)/.test(text);
  return english || persian;
}

export function splitLesson(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const sections: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^##\s+/.test(line) && current.join('').trim()) {
      sections.push(current.join('\n').trim());
      current = [];
    }
    current.push(line);
  }
  if (current.join('').trim()) sections.push(current.join('\n').trim());
  return sections.length > 0 ? sections : [markdown.trim()];
}

const LATEX_COMMANDS = new Set([
  'nabla', 'ne', 'neq', 'neg', 'nu', 'not', 'notin', 'ni', 'nmid', 'nleq', 'ngeq', 'nless', 'ngtr', 'nexists',
  'newline', 'natural', 'nearrow', 'nwarrow', 'nsubseteq', 'nsupseteq', 'nparallel', 'nrightarrow', 'nleftarrow',
  'rho', 'right', 'rightarrow', 'rightleftharpoons', 'rightharpoonup', 'rangle', 'rceil', 'rfloor', 'rbrace',
  'rbrack', 'rvert', 'rVert', 'rm', 'rtimes', 'times', 'theta', 'tan', 'tanh', 'tau', 'text', 'textbf', 'textit',
  'textrm', 'texttt', 'textsf', 'textstyle', 'tfrac', 'tbinom', 'tilde', 'to', 'top', 'triangle', 'triangleq',
  'therefore', 'tiny',
]);

function isLatexEscape(text: string, index: number): boolean {
  const name = /^[A-Za-z]+/.exec(text.slice(index + 1, index + 32))?.[0] ?? '';
  const escape = name[0];
  if (escape === 'b' || escape === 'f') return name.length > 1;
  if (escape === 'n' || escape === 'r' || escape === 't') return LATEX_COMMANDS.has(name);
  return false;
}

function nextNonSpace(text: string, index: number): string {
  for (let i = index; i < text.length; i += 1) {
    if (!/\s/.test(text[i])) return text[i];
  }
  return '';
}

export function repairJson(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (!inString) {
      if (char === '"') inString = true;
      else if (char === ',' && '}]'.includes(nextNonSpace(text, i + 1) || 'x')) continue;
      out += char;
      continue;
    }
    if (char === '"') {
      inString = false;
      out += char;
    } else if (char === '\n') {
      out += '\\n';
    } else if (char === '\t') {
      out += '\\t';
    } else if (char === '\r') {
      continue;
    } else if (char !== '\\') {
      out += char;
    } else {
      const next = text[i + 1] ?? '';
      if (next === '\\' || next === '"' || next === '/') {
        out += char + next;
        i += 1;
      } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
        out += char;
      } else if (next && 'bfnrt'.includes(next) && !isLatexEscape(text, i)) {
        out += char + next;
        i += 1;
      } else {
        out += '\\\\';
      }
    }
  }
  return out;
}

function balancedEnd(text: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let j = start; j < text.length; j += 1) {
    const char = text[j];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      if (stack.pop() !== (char === '}' ? '{' : '[')) return -1;
      if (stack.length === 0) return j;
    }
  }
  return -1;
}

function balancedBlocks(text: string): string[] {
  const blocks: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{' && text[i] !== '[') continue;
    const end = balancedEnd(text, i);
    if (end > i) blocks.push(text.slice(i, end + 1));
  }
  return blocks;
}

function parseLoose(candidate: string): unknown {
  for (const attempt of [repairJson(candidate), candidate]) {
    try {
      return JSON.parse(attempt);
    } catch {
      continue;
    }
  }
  return undefined;
}

function cleanModelOutput(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

export function extractJson<T = unknown>(text: string): T | null {
  const cleaned = cleanModelOutput(text);
  const direct = parseLoose(cleaned);
  if (direct !== undefined) return direct as T;
  const candidates = balancedBlocks(cleaned).sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    const parsed = parseLoose(candidate);
    if (parsed !== undefined) return parsed as T;
  }
  return null;
}

export function extractJsonObjects(text: string): Record<string, unknown>[] {
  const cleaned = cleanModelOutput(text);
  const found: Record<string, unknown>[] = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    if (cleaned[i] !== '{') continue;
    const end = balancedEnd(cleaned, i);
    if (end < 0) continue;
    const parsed = parseLoose(cleaned.slice(i, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      found.push(parsed as Record<string, unknown>);
      i = end;
    }
  }
  return found;
}

export function attachmentBlock(name: string, text: string, note?: string): string {
  const header = `<document name="${name.replace(/"/g, "'")}"${note ? ` note="${note}"` : ''}>`;
  return `${header}\n${text.trim()}\n</document>`;
}
