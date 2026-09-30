'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, Flag, X } from 'lucide-react';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import { useExams, type Exam } from '@/store/exams';
import { confirmDialog } from '@/store/dialogs';
import { cn, formatDuration, isEditableTarget } from '@/lib/utils';

interface TakeExamProps {
  exam: Exam;
  onExit: () => void;
  onSubmit: () => void;
}

export default function TakeExam({ exam, onExit, onSubmit }: TakeExamProps) {
  const updateQuestion = useExams((state) => state.updateQuestion);
  const [index, setIndex] = useState(() => Math.max(0, exam.questions.findIndex((q) => !q.userAnswer?.trim())));
  const [now, setNow] = useState(() => Date.now());
  const question = exam.questions[index];
  const total = exam.questions.length;
  const remaining = exam.deadline ? Math.max(0, Math.ceil((exam.deadline - now) / 1000)) : null;
  const answeredCount = exam.questions.filter((q) => q.userAnswer?.trim()).length;
  const answered = Boolean(question?.userAnswer?.trim());
  const revealed = exam.showAnswersImmediately && question?.type === 'multiple-choice' && answered;

  useEffect(() => {
    if (!exam.deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [exam.deadline]);

  useEffect(() => {
    if (remaining === 0) onSubmit();
  }, [remaining, onSubmit]);

  const submit = useCallback(async () => {
    const unanswered = total - answeredCount;
    if (unanswered > 0) {
      const ok = await confirmDialog({
        title: 'Submit the exam?',
        message: `${unanswered} question${unanswered === 1 ? ' is' : 's are'} still unanswered.`,
        confirmLabel: 'Submit',
      });
      if (!ok) return;
    }
    onSubmit();
  }, [total, answeredCount, onSubmit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
      else if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (question?.type === 'multiple-choice' && !revealed) {
        const choice = event.key.toUpperCase().charCodeAt(0) - 65;
        const numeric = Number(event.key) - 1;
        const pick = /^[a-f]$/i.test(event.key) ? choice : /^[1-6]$/.test(event.key) ? numeric : -1;
        if (pick >= 0 && question.options[pick]) updateQuestion(exam.id, question.id, { userAnswer: question.options[pick] });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total, question, revealed, updateQuestion, exam.id]);

  if (!question) return null;

  return (
    <div className="exam-take">
      <div className="exam-take-top">
        <button type="button" className="btn btn-ghost" onClick={onExit} title="Leave — your answers are kept">
          <ArrowLeft size={15} /> Exams
        </button>
        <div className="exam-take-title" dir="auto">
          {exam.title}
        </div>
        {remaining !== null && (
          <div className={cn('exam-timer', remaining < 60 && 'exam-timer-urgent')}>
            <Clock size={14} /> {formatDuration(remaining)}
          </div>
        )}
        <button type="button" className="btn btn-primary" onClick={() => void submit()}>
          <Flag size={14} /> Submit
        </button>
      </div>
      <div className="exam-dots">
        {exam.questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            className={cn('exam-dot', i === index && 'exam-dot-current', q.userAnswer?.trim() && 'exam-dot-answered')}
            onClick={() => setIndex(i)}
            aria-label={`Question ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="exam-question">
        <div className="exam-question-kind">
          Question {index + 1} of {total} · {question.type === 'multiple-choice' ? 'Multiple choice' : 'Written answer'}
        </div>
        <div className="exam-question-text content-selectable">
          <MarkdownRenderer content={question.question} />
        </div>
        {question.type === 'multiple-choice' ? (
          <div className="exam-options">
            {question.options.map((option, optionIndex) => {
              const selected = question.userAnswer === option;
              const correct = option === question.correctAnswer;
              return (
                <button
                  key={optionIndex}
                  type="button"
                  className={cn(
                    'exam-option',
                    selected && 'exam-option-selected',
                    revealed && correct && 'exam-option-correct',
                    revealed && selected && !correct && 'exam-option-wrong',
                  )}
                  disabled={revealed}
                  onClick={() => updateQuestion(exam.id, question.id, { userAnswer: option })}
                >
                  <span className="exam-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                  <span className="exam-option-text">
                    <MarkdownRenderer content={option} />
                  </span>
                  {revealed && correct && <Check size={16} />}
                  {revealed && selected && !correct && <X size={16} />}
                </button>
              );
            })}
          </div>
        ) : (
          <textarea
            className="input textarea exam-written"
            rows={7}
            dir="auto"
            value={question.userAnswer ?? ''}
            placeholder="Write your answer…"
            onChange={(event) => updateQuestion(exam.id, question.id, { userAnswer: event.target.value })}
          />
        )}
        {revealed && question.explanation && (
          <div className={cn('alert', question.userAnswer === question.correctAnswer ? 'alert-success' : 'alert-error')}>
            <MarkdownRenderer content={question.explanation} />
          </div>
        )}
      </div>
      <div className="exam-nav">
        <button type="button" className="btn btn-ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          <ArrowLeft size={15} /> Previous
        </button>
        <span className="exam-nav-status">
          {answeredCount} of {total} answered
        </span>
        {index < total - 1 ? (
          <button type="button" className="btn btn-secondary" onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>
            Next <ArrowRight size={15} />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => void submit()}>
            <Flag size={14} /> Submit exam
          </button>
        )}
      </div>
    </div>
  );
}
