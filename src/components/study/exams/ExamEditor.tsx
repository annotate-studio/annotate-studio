'use client';

import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Circle, ListChecks, PenLine, Plus, Trash2 } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { blankQuestion, type Exam, type ExamQuestion, type QuestionType } from '@/store/exams';
import { cn, uid } from '@/lib/utils';

interface ExamEditorProps {
  open: boolean;
  exam: Exam | null;
  onClose: () => void;
  onSave: (exam: Exam) => void;
}

function validate(title: string, questions: ExamQuestion[]): string | null {
  if (!title.trim()) return 'Give the exam a title.';
  if (questions.length === 0) return 'Add at least one question.';
  for (const [index, question] of questions.entries()) {
    const label = `Question ${index + 1}`;
    if (!question.question.trim()) return `${label} has no text.`;
    if (question.type === 'multiple-choice') {
      const filled = question.options.filter((option) => option.trim());
      if (filled.length < 2) return `${label} needs at least two options.`;
      if (!question.correctAnswer.trim() || !filled.includes(question.correctAnswer)) return `${label} needs a correct option.`;
    } else if (!question.correctAnswer.trim()) {
      return `${label} needs a model answer.`;
    }
  }
  return null;
}

export default function ExamEditor({ open, exam, onClose, onSave }: ExamEditorProps) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState(0);
  const [instantFeedback, setInstantFeedback] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(exam?.title ?? '');
    setSubject(exam?.subject ?? '');
    setDescription(exam?.description ?? '');
    setTimeLimit(exam?.timeLimit ?? 0);
    setInstantFeedback(exam?.showAnswersImmediately ?? false);
    setQuestions(exam ? exam.questions.map((q) => ({ ...q, options: [...q.options] })) : [blankQuestion('multiple-choice')]);
    setError(null);
  }, [open, exam]);

  const update = (id: string, patch: Partial<ExamQuestion>) => setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const setType = (question: ExamQuestion, type: QuestionType) => {
    if (question.type === type) return;
    update(question.id, {
      type,
      options: type === 'multiple-choice' ? (question.options.length ? question.options : ['', '', '', '']) : [],
      correctAnswer: '',
    });
  };

  const setOption = (question: ExamQuestion, index: number, value: string) => {
    const options = [...question.options];
    const wasCorrect = question.correctAnswer === options[index] && options[index] !== '';
    options[index] = value;
    update(question.id, { options, correctAnswer: wasCorrect ? value : question.correctAnswer });
  };

  const move = (index: number, delta: number) =>
    setQuestions((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = () => {
    const cleaned = questions.map((q) =>
      q.type === 'multiple-choice' ? { ...q, options: q.options.map((o) => o.trim()).filter(Boolean), correctAnswer: q.correctAnswer.trim() } : q,
    );
    const problem = validate(title, cleaned);
    if (problem) {
      setError(problem);
      return;
    }
    const base: Exam = exam ?? {
      id: uid(),
      title: '',
      subject: '',
      description: '',
      questions: [],
      timeLimit: 0,
      showAnswersImmediately: false,
      createdAt: new Date().toISOString(),
      status: 'draft',
    };
    const questionsChanged = JSON.stringify(cleaned.map((q) => [q.type, q.question, q.options, q.correctAnswer])) !==
      JSON.stringify(base.questions.map((q) => [q.type, q.question, q.options, q.correctAnswer]));
    onSave({
      ...base,
      title: title.trim(),
      subject: subject.trim(),
      description: description.trim(),
      timeLimit: Math.max(0, Math.round(timeLimit)),
      showAnswersImmediately: instantFeedback,
      questions: questionsChanged ? cleaned.map(({ userAnswer, verdict, feedback, ...rest }) => rest) : cleaned,
      status: questionsChanged && base.status !== 'draft' ? 'draft' : base.status,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={exam ? 'Edit exam' : 'New exam'}
      width={760}
      className="dialog-tall"
      footer={
        <>
          {error && <span className="field-error">{error}</span>}
          <div className="dialog-footer-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save exam
          </button>
        </>
      }
    >
      <div className="form-grid form-grid-2">
        <label className="field field-wide">
          <span className="field-label">Title</span>
          <input className="input" value={title} dir="auto" onChange={(event) => setTitle(event.target.value)} placeholder="Midterm practice — Chapter 3" />
        </label>
        <label className="field">
          <span className="field-label">Subject</span>
          <input className="input" value={subject} dir="auto" onChange={(event) => setSubject(event.target.value)} placeholder="Biology" />
        </label>
        <label className="field">
          <span className="field-label">Time limit (minutes, 0 = none)</span>
          <input
            className="input"
            type="number"
            min={0}
            max={600}
            value={timeLimit}
            onChange={(event) => setTimeLimit(Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
        <label className="field field-wide">
          <span className="field-label">Description</span>
          <input className="input" value={description} dir="auto" onChange={(event) => setDescription(event.target.value)} placeholder="Optional" />
        </label>
        <label className="checkbox-row field-wide">
          <input type="checkbox" checked={instantFeedback} onChange={(event) => setInstantFeedback(event.target.checked)} />
          Show whether each multiple-choice answer is correct right away
        </label>
      </div>

      <div className="question-list">
        {questions.map((question, index) => (
          <div key={question.id} className="question-editor">
            <div className="question-editor-head">
              <strong>Q{index + 1}</strong>
              <div className="segmented segmented-sm">
                <button type="button" className={cn(question.type === 'multiple-choice' && 'active')} onClick={() => setType(question, 'multiple-choice')}>
                  <ListChecks size={13} /> Choice
                </button>
                <button type="button" className={cn(question.type === 'verbal' && 'active')} onClick={() => setType(question, 'verbal')}>
                  <PenLine size={13} /> Written
                </button>
              </div>
              <div className="question-editor-tools">
                <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(index, -1)} disabled={index === 0} title="Move up">
                  <ArrowUp size={13} />
                </button>
                <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(index, 1)} disabled={index === questions.length - 1} title="Move down">
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm icon-btn-danger"
                  onClick={() => setQuestions((list) => list.filter((q) => q.id !== question.id))}
                  title="Remove question"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <textarea
              className="input textarea"
              rows={2}
              value={question.question}
              dir="auto"
              placeholder="Question"
              onChange={(event) => update(question.id, { question: event.target.value })}
            />
            {question.type === 'multiple-choice' ? (
              <div className="option-list">
                {question.options.map((option, optionIndex) => {
                  const correct = option !== '' && question.correctAnswer === option;
                  return (
                    <div key={optionIndex} className={cn('option-editor', correct && 'option-editor-correct')}>
                      <button
                        type="button"
                        className="icon-btn icon-btn-sm"
                        onClick={() => option.trim() && update(question.id, { correctAnswer: option })}
                        title="Mark as correct"
                      >
                        {correct ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                      </button>
                      <input
                        className="input input-sm"
                        value={option}
                        dir="auto"
                        placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                        onChange={(event) => setOption(question, optionIndex, event.target.value)}
                      />
                      {question.options.length > 2 && (
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm"
                          onClick={() =>
                            update(question.id, {
                              options: question.options.filter((_, i) => i !== optionIndex),
                              correctAnswer: correct ? '' : question.correctAnswer,
                            })
                          }
                          title="Remove option"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {question.options.length < 6 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => update(question.id, { options: [...question.options, ''] })}>
                    <Plus size={13} /> Option
                  </button>
                )}
              </div>
            ) : (
              <textarea
                className="input textarea"
                rows={2}
                value={question.correctAnswer}
                dir="auto"
                placeholder="Model answer"
                onChange={(event) => update(question.id, { correctAnswer: event.target.value })}
              />
            )}
            <input
              className="input input-sm"
              value={question.explanation ?? ''}
              dir="auto"
              placeholder="Explanation shown after answering (optional)"
              onChange={(event) => update(question.id, { explanation: event.target.value || undefined })}
            />
          </div>
        ))}
        <div className="question-add">
          <button type="button" className="btn btn-secondary" onClick={() => setQuestions((list) => [...list, blankQuestion('multiple-choice')])}>
            <Plus size={14} /> Multiple choice
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setQuestions((list) => [...list, blankQuestion('verbal')])}>
            <Plus size={14} /> Written
          </button>
        </div>
      </div>
    </Dialog>
  );
}
