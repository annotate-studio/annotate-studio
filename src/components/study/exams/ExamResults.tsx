'use client';

import React, { useState } from 'react';
import { ArrowLeft, Check, Layers, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import { gradeExam, isAnswerCorrect, useExams, type Exam, type ExamQuestion } from '@/store/exams';
import { useFlashcards, UNSORTED_ID } from '@/store/flashcards';
import { createFlashcard } from '@/lib/tauri-commands';
import { toast } from '@/store/toast';
import { cn } from '@/lib/utils';
import { gradeWrittenAnswer } from './examAi';

interface ExamResultsProps {
  exam: Exam;
  onBack: () => void;
  onRetake: () => void;
}

function WrittenGrading({ exam, question, externalBusy }: { exam: Exam; question: ExamQuestion; externalBusy?: boolean }) {
  const gradeQuestion = useExams((state) => state.gradeQuestion);
  const [busy, setBusy] = useState(false);
  const working = busy || Boolean(externalBusy);

  const askAi = async () => {
    if (!question.userAnswer?.trim() || working) return;
    const attempt = exam.completedAt;
    const answer = question.userAnswer;
    setBusy(true);
    try {
      const result = await gradeWrittenAnswer(question);
      const current = useExams.getState().exams.find((e) => e.id === exam.id);
      const currentQuestion = current?.questions.find((q) => q.id === question.id);
      if (!current || current.status !== 'completed' || current.completedAt !== attempt || currentQuestion?.userAnswer !== answer) return;
      gradeQuestion(exam.id, question.id, { verdict: result.verdict, aiScore: result.score, feedback: result.feedback });
    } catch (error) {
      toast.error('AI grading failed', error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grading-row">
      <span>Grade:</span>
      <button type="button" className={cn('btn btn-sm', question.verdict === 'correct' ? 'btn-success' : 'btn-ghost')} onClick={() => gradeQuestion(exam.id, question.id, { verdict: 'correct', aiScore: 100 })}>
        <Check size={13} /> Correct
      </button>
      <button type="button" className={cn('btn btn-sm', question.verdict === 'partial' ? 'btn-secondary' : 'btn-ghost')} onClick={() => gradeQuestion(exam.id, question.id, { verdict: 'partial', aiScore: 50 })}>
        Partial
      </button>
      <button type="button" className={cn('btn btn-sm', question.verdict === 'incorrect' ? 'btn-danger' : 'btn-ghost')} onClick={() => gradeQuestion(exam.id, question.id, { verdict: 'incorrect', aiScore: 0 })}>
        <X size={13} /> Incorrect
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void askAi()} disabled={working || !question.userAnswer?.trim()}>
        {working ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} {question.feedback ? 'Re-grade with AI' : 'Grade with AI'}
      </button>
    </div>
  );
}

export default function ExamResults({ exam, onBack, onRetake }: ExamResultsProps) {
  const gradeQuestion = useExams((state) => state.gradeQuestion);
  const [gradingAll, setGradingAll] = useState(false);
  const [savedCards, setSavedCards] = useState<Record<string, boolean>>({});
  const { score, total, percentage } = gradeExam(exam.questions);
  const passed = percentage >= 60;
  const attempts = exam.attempts ?? [];
  const gradeableWritten = exam.questions.filter((q) => q.type === 'verbal' && q.userAnswer?.trim());
  const ungradedWritten = gradeableWritten.filter((q) => !q.verdict);

  const saveQuestionAsCard = async (question: ExamQuestion) => {
    if (savedCards[question.id]) return;
    try {
      const flashcards = useFlashcards.getState();
      if (!flashcards.hydrated) await flashcards.hydrate();
      const { activeCollectionId } = useFlashcards.getState();
      const collectionId = activeCollectionId && activeCollectionId !== UNSORTED_ID ? activeCollectionId : undefined;
      const back = question.explanation
        ? `${question.correctAnswer}\n\n${question.explanation}`
        : question.correctAnswer;
      const card = await createFlashcard(question.question, back, exam.title, collectionId);
      useFlashcards.getState().addCards([card]);
      setSavedCards((prev) => ({ ...prev, [question.id]: true }));
      toast.success('Saved as flashcard', 'Added to your flashcard deck');
    } catch (error) {
      toast.error('Could not save flashcard', error);
    }
  };

  const gradeAllWritten = async () => {
    const targets = ungradedWritten.length > 0 ? ungradedWritten : gradeableWritten;
    if (targets.length === 0 || gradingAll) return;
    const attempt = exam.completedAt;
    setGradingAll(true);
    let gradedCount = 0;
    try {
      for (const question of targets) {
        const answer = question.userAnswer;
        const result = await gradeWrittenAnswer(question);
        const current = useExams.getState().exams.find((e) => e.id === exam.id);
        const currentQuestion = current?.questions.find((q) => q.id === question.id);
        if (!current || current.status !== 'completed' || current.completedAt !== attempt || currentQuestion?.userAnswer !== answer) break;
        gradeQuestion(exam.id, question.id, { verdict: result.verdict, aiScore: result.score, feedback: result.feedback });
        gradedCount += 1;
      }
      if (gradedCount > 0) toast.success('Written answers graded', `${gradedCount} answer${gradedCount === 1 ? '' : 's'} evaluated`);
    } catch (error) {
      toast.error('AI grading failed', error);
    } finally {
      setGradingAll(false);
    }
  };

  return (
    <div className="page page-narrow">
      <div className="results-top">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={15} /> Exams
        </button>
        <div className="page-actions">
          {gradeableWritten.length > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => void gradeAllWritten()} disabled={gradingAll}>
              {gradingAll ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
              {ungradedWritten.length > 0 ? `Grade ${ungradedWritten.length} written with AI` : 'Re-grade written with AI'}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onRetake}>
            <RotateCcw size={14} /> Retake
          </button>
        </div>
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
          const partial = question.verdict === 'partial';
          const unanswered = !question.userAnswer?.trim();
          const ungraded = question.type === 'verbal' && !question.verdict && !unanswered && !correct;
          const statusLabel = correct
            ? typeof question.aiScore === 'number'
              ? `Correct · ${question.aiScore}%`
              : 'Correct'
            : partial
              ? typeof question.aiScore === 'number'
                ? `Partial · ${question.aiScore}%`
                : 'Partial credit'
              : unanswered
                ? 'Not answered'
                : ungraded
                  ? 'Needs grading'
                  : typeof question.aiScore === 'number'
                    ? `Incorrect · ${question.aiScore}%`
                    : 'Incorrect';
          return (
            <div
              key={question.id}
              className={cn(
                'review-item',
                correct
                  ? 'review-item-correct'
                  : partial
                    ? 'review-item-pending'
                    : unanswered
                      ? 'review-item-skipped'
                      : ungraded
                        ? 'review-item-pending'
                        : 'review-item-wrong',
              )}
            >
              <div className="review-item-head">
                <span>Q{index + 1}</span>
                <div className="review-item-head-right">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void saveQuestionAsCard(question)}
                    title="Save this question as a flashcard"
                  >
                    {savedCards[question.id] ? <Check size={12} /> : <Layers size={12} />}
                    {savedCards[question.id] ? 'Saved' : 'Flashcard'}
                  </button>
                  <span className="review-item-status">{statusLabel}</span>
                </div>
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
                  {!unanswered && <WrittenGrading exam={exam} question={question} externalBusy={gradingAll} />}
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
