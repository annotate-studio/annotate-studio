import { aiChat } from '@/lib/tauri-commands';
import { extractJson, extractJsonObjects } from '@/lib/ai';
import { resolveAnswer, stripLetterPrefixes } from '@/lib/answers';
import { ensureProviders, modelFor } from '@/lib/agent/models';
import { uid } from '@/lib/utils';
import type { Exam, ExamQuestion } from '@/store/exams';

export interface GenerateExamOptions {
  topic: string;
  material?: string;
  materialName?: string;
  multipleChoice: number;
  written: number;
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit: number;
  model?: string;
}

interface RawQuestion {
  type?: string;
  question?: string;
  options?: unknown;
  answer?: unknown;
  correctAnswer?: unknown;
  explanation?: unknown;
}

interface RawExam {
  title?: string;
  subject?: string;
  description?: string;
  questions?: RawQuestion[];
}

function normalizeQuestion(raw: RawQuestion): ExamQuestion | null {
  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!question) return null;
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : undefined;
  const options = Array.isArray(raw.options)
    ? stripLetterPrefixes(
        raw.options
          .filter((option): option is string | number => typeof option === 'string' || typeof option === 'number')
          .map((option) => String(option).trim())
          .filter(Boolean),
      )
    : [];
  const isMultiple = raw.type !== 'written' && raw.type !== 'verbal' && options.length >= 2;
  if (isMultiple) {
    const correct = resolveAnswer(options, raw.answer ?? raw.correctAnswer);
    if (!correct) return null;
    return { id: uid(), type: 'multiple-choice', question, options: options.slice(0, 6), correctAnswer: correct, explanation };
  }
  const answer = raw.answer ?? raw.correctAnswer;
  if (typeof answer !== 'string' || !answer.trim()) return null;
  return { id: uid(), type: 'verbal', question, options: [], correctAnswer: answer.trim(), explanation };
}

export async function generateExam(options: GenerateExamOptions): Promise<Exam> {
  const system = `You are an expert exam writer. Create a practice exam and reply with JSON only — no prose and no code fences — using this shape:
{"title": string, "subject": string, "description": string, "questions": [
 {"type": "multiple-choice", "question": string, "options": [string, string, string, string], "answer": string, "explanation": string},
 {"type": "written", "question": string, "answer": string, "explanation": string}
]}
Rules:
- Exactly ${options.multipleChoice} multiple-choice and ${options.written} written questions.
- Difficulty: ${options.difficulty}. Test understanding and application, not trivia.
- Multiple-choice: four options, exactly one correct, plausible distractors; "answer" must repeat the correct option text exactly.
- Written: "answer" is a concise model answer covering the key points.
- "explanation" briefly says why the answer is correct.
- Use LaTeX between $ signs for math. Write in the language of the topic and material.`;
  const material = options.material?.trim()
    ? `\n\nBase the questions on this material${options.materialName ? ` from "${options.materialName}"` : ''}:\n<material>\n${options.material.trim()}\n</material>`
    : '';
  const response = await aiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: `Topic: ${options.topic.trim() || options.materialName || 'the provided material'}${material}` },
    ],
    { model: options.model, temperature: 0.4, maxTokens: 8000 },
  );
  const parsed = extractJson<RawExam | RawQuestion[]>(response.content);
  const raw: RawExam = Array.isArray(parsed) ? { questions: parsed } : parsed && typeof parsed === 'object' ? parsed : {};
  const normalize = (list: unknown[]) =>
    list
      .filter((item): item is RawQuestion => !!item && typeof item === 'object')
      .map(normalizeQuestion)
      .filter((q): q is ExamQuestion => q !== null);
  let questions = Array.isArray(raw.questions) ? normalize(raw.questions) : [];
  if (questions.length === 0) {
    questions = normalize(extractJsonObjects(response.content).filter((item) => typeof item.question === 'string'));
  }
  if (questions.length === 0) {
    throw new Error('The AI response did not contain usable questions. Try again or choose another model.');
  }
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `${options.topic.trim() || 'Practice'} exam`;
  return {
    id: uid(),
    title,
    subject: typeof raw.subject === 'string' ? raw.subject.trim() : '',
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    questions,
    timeLimit: options.timeLimit,
    showAnswersImmediately: false,
    createdAt: new Date().toISOString(),
    status: 'draft',
  };
}

export interface WrittenGradeResult {
  verdict: 'correct' | 'partial' | 'incorrect';
  score: number;
  feedback: string;
}

function parseVerdict(raw: Record<string, unknown>, rawText: string): { verdict: 'correct' | 'partial' | 'incorrect'; score: number } | null {
  const numeric = typeof raw.score === 'number' ? raw.score : typeof raw.score === 'string' ? Number(raw.score) : NaN;
  const clampedScore = Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : null;

  const v = raw.verdict ?? raw.result ?? raw.grade ?? raw.correct;
  if (typeof v === 'boolean') {
    return { verdict: v ? 'correct' : 'incorrect', score: clampedScore ?? (v ? 100 : 0) };
  }
  if (typeof v === 'string') {
    const lower = v.trim().toLowerCase();
    if (lower === 'correct' || lower === 'pass' || lower === 'passed' || lower === 'right' || lower === 'true' || lower === 'yes') {
      return { verdict: 'correct', score: clampedScore ?? 100 };
    }
    if (lower.includes('partial')) {
      return { verdict: 'partial', score: clampedScore ?? 50 };
    }
    if (lower === 'incorrect' || lower === 'wrong' || lower === 'fail' || lower === 'failed' || lower === 'false' || lower === 'no') {
      return { verdict: 'incorrect', score: clampedScore ?? 0 };
    }
  }
  if (clampedScore !== null) {
    const verdict = clampedScore >= 75 ? 'correct' : clampedScore >= 35 ? 'partial' : 'incorrect';
    return { verdict, score: clampedScore };
  }
  const loweredText = rawText.toLowerCase();
  if (/\bpartially\s+correct\b|\bpartial\s+credit\b/.test(loweredText)) return { verdict: 'partial', score: 50 };
  if (/\bincorrect\b|\bwrong\b/.test(loweredText)) return { verdict: 'incorrect', score: 0 };
  if (/\bcorrect\b/.test(loweredText)) return { verdict: 'correct', score: 100 };
  return null;
}

export async function gradeWrittenAnswer(
  question: ExamQuestion,
  model?: string,
): Promise<WrittenGradeResult> {
  await ensureProviders();
  const chosenModel = model || modelFor('reasoning')?.id || modelFor('assistant')?.id;
  const response = await aiChat(
    [
      {
        role: 'system',
        content: `You are a fair, thorough academic exam grader evaluating a descriptive student answer.
Compare the student's answer against the question and model answer on conceptual accuracy, completeness, and reasoning.
Accept equivalent wording, alternative valid proofs/explanations, or answers in another language.
Reply with JSON only — no markdown fences or extra text:
{"verdict": "correct" | "partial" | "incorrect", "score": 0-100, "feedback": string}
Rules:
- "correct": score >= 75, captures all core concepts accurately.
- "partial": score 35-74, captures some key ideas but misses important details or has minor errors.
- "incorrect": score < 35, fundamentally wrong or off-topic.
- "feedback": 2-4 clear sentences in the language of the student's answer explaining what was right and what was missing or wrong.`,
      },
      {
        role: 'user',
        content: `Question:\n${question.question}\n\nModel answer:\n${question.correctAnswer}${question.explanation ? `\n\nRubric / Explanation:\n${question.explanation}` : ''}\n\nStudent answer:\n${question.userAnswer ?? ''}`,
      },
    ],
    { model: chosenModel, temperature: 0, maxTokens: 1024 },
  );
  const parsed = extractJson<Record<string, unknown>>(response.content) ?? extractJsonObjects(response.content)[0] ?? {};
  const result = parseVerdict(parsed, response.content);
  if (!result) {
    throw new Error('The AI grader returned an unexpected response. Try again or pick another model.');
  }
  const feedback =
    typeof parsed.feedback === 'string' && parsed.feedback.trim()
      ? parsed.feedback.trim()
      : typeof parsed.explanation === 'string' && parsed.explanation.trim()
        ? parsed.explanation.trim()
        : response.content.replace(/```[\s\S]*?```/g, '').trim().slice(0, 600);
  return { verdict: result.verdict, score: result.score, feedback };
}
