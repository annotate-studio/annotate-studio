import { aiChat } from '@/lib/tauri-commands';
import { extractJson, extractJsonObjects } from '@/lib/ai';
import { resolveAnswer, stripLetterPrefixes } from '@/lib/answers';
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

export async function gradeWrittenAnswer(question: ExamQuestion, model?: string): Promise<{ verdict: 'correct' | 'incorrect'; feedback: string }> {
  const response = await aiChat(
    [
      {
        role: 'system',
        content:
          'You grade written exam answers fairly. Compare the student answer with the model answer. Accept answers that capture the key ideas even if worded differently or in another language. Reply with JSON only: {"verdict": "correct" | "incorrect", "feedback": string}. Feedback is two or three sentences in the language of the student answer.',
      },
      {
        role: 'user',
        content: `Question: ${question.question}\n\nModel answer: ${question.correctAnswer}\n\nStudent answer: ${question.userAnswer ?? ''}`,
      },
    ],
    { model, temperature: 0 },
  );
  const parsed = extractJson<{ verdict?: unknown; feedback?: unknown }>(response.content);
  const verdict = typeof parsed?.verdict === 'string' ? parsed.verdict.trim().toLowerCase() : '';
  if (verdict !== 'correct' && verdict !== 'incorrect') {
    throw new Error('The AI grader returned an unexpected response.');
  }
  return { verdict, feedback: typeof parsed?.feedback === 'string' ? parsed.feedback : '' };
}
