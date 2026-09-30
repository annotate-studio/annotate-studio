'use client';

import React, { useState } from 'react';
import { ArrowLeft, Check, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import { gradeExam, isAnswerCorrect, useExams, type Exam, type ExamQuestion } from '@/store/exams';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';
import { cn } from '@/lib/utils';
import { gradeWrittenAnswer } from './examAi';

interface ExamResultsProps {
  exam: Exam;
  onBack: () => void;
  onRetake: () => void;
}

function WrittenGrading({ exam, question }: { exam: Exam; question: ExamQuestion }) {
  const gradeQuestion = useExams((state) => state.gradeQuestion);
  const [busy, setBusy] = useState(false);

  const askAi = async () => {
    if (!question.userAnswer?.trim()) return;
    const attempt = exam.completedAt;
    const answer = question.userAnswer;
    setBusy(true);
    try {
      const result = await gradeWrittenAnswer(question, useSettings.getState().selectedModel || undefined);
      const current = useExams.getState().exams.find((e) => e.id === exam.id);
      const currentQuestion = current?.questions.find((q) => q.id === question.id);
      if (!current || current.status !== 'completed' || current.completedAt !== attempt || currentQuestion?.userAnswer !== answer) return;
      gradeQuestion(exam.id, question.id, { verdict: result.verdict, feedback: result.feedback });
    } catch (error) {
      toast.error('AI grading failed', error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grading-row">
      <span>Your grade:</span>
      <button type="button" className={cn('btn btn-sm', question.verdict === 'correct' ? 'btn-success' : 'btn-ghost')} onClick={() => gradeQuestion(exam.id, question.id, { verdict: 'correct' })}>
        <Check size={13} /> Correct
      </button>
      <button type="button" className={cn('btn btn-sm', question.verdict === 'incorrect' ? 'btn-danger' : 'btn-ghost')} onClick={() => gradeQuestion(exam.id, question.id, { verdict: 'incorrect' })}>
        <X size={13} /> Incorrect
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void askAi()} disabled={busy || !question.userAnswer?.trim()}>
        {busy ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} Grade with AI
      </button>
    </div>
  );
}

export default function ExamResults({ exam, onBack, onRetake }: ExamResultsProps) {
  const { score, total, percentage } = gradeExam(exam.questions);
  const passed = percentage >= 60;
  const attempts = exam.attempts ?? [];

  return (
    <div className="page page-narrow">
      <div className="results-top">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={15} /> Exams
        </button>
        <button type="button" className="btn btn-secondary" onClick={onRetake}>
          <RotateCcw size={14} /> Retake
        </button>
      </div>
      <div className={cn('score-card', passed ? 'score-card-pass' : 'score-card-fail')}>
        <div className="score-ring" style={{ '--score': `${percentage}` } as React.CSSProperties}>
          <span>{percentage}%</span>
        </div>
        <div>
          <h1 dir="auto">{exam.title}</h1>
          <p>
            {score} of {total} correct · {passed ? 'Passed' : 'Keep practising'}
            {exam.completedAt ? ` · ${new Date(exam.completedAt).toLocaleString()}` : ''}
          </p>
          {attempts.length > 1 && (
            <p className="muted">
              Previous attempts: {attempts.slice(0, -1).slice(-5).map((a) => `${a.percentage}%`).join(' · ')}
            </p>
          )}
        </div>
      </div>
      <div className="review-list">
        {exam.questions.map((question, index) => {
          const correct = isAnswerCorrect(question);
          const unanswered = !question.userAnswer?.trim();
          const ungraded = question.type === 'verbal' && !question.verdict && !unanswered && !correct;
          return (
            <div key={question.id} className={cn('review-item', correct ? 'review-item-correct' : unanswered ? 'review-item-skipped' : ungraded ? 'review-item-pending' : 'review-item-wrong')}>
              <div className="review-item-head">
                <span>Q{index + 1}</span>
                <span className="review-item-status">{correct ? 'Correct' : unanswered ? 'Not answered' : ungraded ? 'Needs grading' : 'Incorrect'}</span>
              </div>
              <div className="content-selectable">
                <MarkdownRenderer content={question.question} />
              </div>
              {question.type === 'multiple-choice' ? (
                <ul className="review-options">
                  {question.options.map((option, optionIndex) => (
                    <li
                      key={optionIndex}
                      className={cn(option === question.correctAnswer && 'is-correct', option === question.userAnswer && option !== question.correctAnswer && 'is-wrong')}
                    >
                      <b>{String.fromCharCode(65 + optionIndex)}.</b> <MarkdownRenderer content={option} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="review-written">
                  <div>
                    <small>Your answer</small>
                    <p dir="auto">{question.userAnswer?.trim() || '—'}</p>
                  </div>
                  <div>
                    <small>Model answer</small>
                    <MarkdownRenderer content={question.correctAnswer} />
                  </div>
                  {question.feedback && (
                    <div className="alert alert-info">
                      <MarkdownRenderer content={question.feedback} />
                    </div>
                  )}
                  {!unanswered && <WrittenGrading exam={exam} question={question} />}
                </div>
              )}
              {question.explanation && (
                <div className="review-explanation">
                  <MarkdownRenderer content={question.explanation} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
