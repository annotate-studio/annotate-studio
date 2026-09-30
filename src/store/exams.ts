import { create } from 'zustand';
import { loadExams, saveExams } from '@/lib/tauri-commands';
import { createSaver } from '@/lib/persist';
import { uid } from '@/lib/utils';

export type QuestionType = 'multiple-choice' | 'verbal';

export interface ExamQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  userAnswer?: string;
  verdict?: 'correct' | 'incorrect';
  feedback?: string;
}

export type ExamStatus = 'draft' | 'in-progress' | 'completed';

export interface ExamAttempt {
  completedAt: string;
  score: number;
  total: number;
  percentage: number;
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  description: string;
  questions: ExamQuestion[];
  timeLimit: number;
  showAnswersImmediately: boolean;
  createdAt: string;
  status: ExamStatus;
  startedAt?: string;
  deadline?: number;
  score?: number;
  total?: number;
  percentage?: number;
  completedAt?: string;
  attempts?: ExamAttempt[];
}

interface ExamStore {
  hydrated: boolean;
  exams: Exam[];
  hydrate: () => Promise<void>;
  addExam: (exam: Exam) => void;
  updateExam: (id: string, patch: Partial<Exam>) => void;
  updateQuestion: (examId: string, questionId: string, patch: Partial<ExamQuestion>) => void;
  gradeQuestion: (examId: string, questionId: string, patch: Pick<ExamQuestion, 'verdict' | 'feedback'>) => void;
  deleteExam: (id: string) => void;
}

export function isAnswerCorrect(question: ExamQuestion): boolean {
  if (question.verdict) return question.verdict === 'correct';
  const answer = question.userAnswer?.trim();
  if (!answer) return false;
  if (question.type === 'multiple-choice') return answer === question.correctAnswer.trim();
  return normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer);
}

function normalizeAnswer(value: string): string {
  return value.toLowerCase().replace(/[\s.,;:!?'"()-]+/g, ' ').trim();
}

export function gradeExam(questions: ExamQuestion[]) {
  const total = questions.length;
  const score = questions.filter(isAnswerCorrect).length;
  return { score, total, percentage: total === 0 ? 0 : Math.round((score / total) * 100) };
}

export function blankQuestion(type: QuestionType): ExamQuestion {
  return {
    id: uid(),
    type,
    question: '',
    options: type === 'multiple-choice' ? ['', '', '', ''] : [],
    correctAnswer: '',
  };
}

function migrateQuestion(raw: unknown): ExamQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const type: QuestionType = data.type === 'verbal' ? 'verbal' : 'multiple-choice';
  const options = Array.isArray(data.options) ? data.options.filter((o): o is string => typeof o === 'string') : [];
  return {
    id: typeof data.id === 'string' && data.id ? data.id : uid(),
    type,
    question: typeof data.question === 'string' ? data.question : '',
    options,
    correctAnswer: typeof data.correctAnswer === 'string' ? data.correctAnswer : '',
    explanation: typeof data.explanation === 'string' ? data.explanation : undefined,
    userAnswer: typeof data.userAnswer === 'string' ? data.userAnswer : undefined,
    verdict: data.verdict === 'correct' || data.verdict === 'incorrect' ? data.verdict : undefined,
    feedback: typeof data.feedback === 'string' ? data.feedback : undefined,
  };
}

function migrateExam(raw: unknown): Exam | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.id !== 'string') return null;
  const questions = Array.isArray(data.questions)
    ? data.questions.map(migrateQuestion).filter((q): q is ExamQuestion => q !== null)
    : [];
  const status: ExamStatus = data.status === 'completed' || data.status === 'in-progress' ? data.status : 'draft';
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
  return {
    id: data.id,
    title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Untitled exam',
    subject: typeof data.subject === 'string' ? data.subject : '',
    description: typeof data.description === 'string' ? data.description : '',
    questions,
    timeLimit: num(data.timeLimit) ?? 0,
    showAnswersImmediately: data.showAnswersImmediately === true,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    status,
    startedAt: typeof data.startedAt === 'string' ? data.startedAt : undefined,
    deadline: num(data.deadline),
    score: num(data.score),
    total: num(data.total),
    percentage: num(data.percentage),
    completedAt: typeof data.completedAt === 'string' ? data.completedAt : undefined,
    attempts: Array.isArray(data.attempts) ? (data.attempts as ExamAttempt[]) : undefined,
  };
}

const saver = createSaver<Exam[]>((exams) => saveExams(exams), 400);

export const useExams = create<ExamStore>((set, get) => ({
  hydrated: false,
  exams: [],
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await loadExams();
      const exams = raw.map(migrateExam).filter((e): e is Exam => e !== null);
      set({ exams, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  addExam: (exam) => set((state) => ({ exams: [exam, ...state.exams] })),
  updateExam: (id, patch) => set((state) => ({ exams: state.exams.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  updateQuestion: (examId, questionId, patch) =>
    set((state) => ({
      exams: state.exams.map((e) =>
        e.id === examId ? { ...e, questions: e.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)) } : e,
      ),
    })),
  gradeQuestion: (examId, questionId, patch) =>
    set((state) => ({
      exams: state.exams.map((exam) => {
        if (exam.id !== examId) return exam;
        const questions = exam.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q));
        const graded = gradeExam(questions);
        const attempts = exam.attempts?.length
          ? [...exam.attempts.slice(0, -1), { ...exam.attempts[exam.attempts.length - 1], ...graded }]
          : exam.attempts;
        return { ...exam, questions, ...graded, attempts };
      }),
    })),
  deleteExam: (id) => set((state) => ({ exams: state.exams.filter((e) => e.id !== id) })),
}));

useExams.subscribe((state, previous) => {
  if (!state.hydrated || !previous.hydrated || state.exams === previous.exams) return;
  saver.schedule(state.exams);
});
