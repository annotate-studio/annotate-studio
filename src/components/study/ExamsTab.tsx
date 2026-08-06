'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Play, RotateCcw, Clock, Check, X, ChevronLeft, ChevronRight, Trash2, Pencil, FileText, BarChart3, Sparkles, Upload } from 'lucide-react';
import { useStore, type Exam, type ExamQuestion } from '@/lib/store';
import { saveExamData, loadExamsData, deleteExamData } from '@/lib/tauri-commands';
import Dialog from '@/components/ui/Dialog';

/* ─── helpers ─────────────────────────────────────────────── */

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function gradeExam(questions: ExamQuestion[]) {
  let correct = 0;
  questions.forEach((q) => {
    if (!q.userAnswer) return;
    if (q.type === 'multiple-choice') {
      if (q.userAnswer === q.correctAnswer) correct++;
    } else {
      if (q.userAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()) correct++;
    }
  });
  return { score: correct, total: questions.length, percentage: Math.round((correct / questions.length) * 100) };
}

/* ─── main component ─────────────────────────────────────── */

export default function ExamsTab() {
  const { exams, addExam, updateExam, deleteExam } = useStore();

  const persistExams = useCallback(async () => {
    for (const exam of useStore.getState().exams) {
      try { await saveExamData(exam as unknown as Record<string, unknown>); } catch {}
    }
  }, []);

  // Load exams from backend on mount
  useEffect(() => {
    loadExamsData().then((data) => {
      for (const raw of data) {
        const exam = raw as unknown as Exam;
        const exists = useStore.getState().exams.some((e: Exam) => e.id === exam.id);
        if (!exists) addExam(exam);
      }
    }).catch(() => {});
  }, []);

  // Persist exams on change (debounced)
  useEffect(() => {
    if (exams.length === 0) return;
    const timer = setTimeout(() => persistExams(), 500);
    return () => clearTimeout(timer);
  }, [exams, persistExams]);

  // navigation
  const [view, setView] = useState<'list' | 'taking' | 'reviewing'>('list');
  const [activeExamId, setActiveExamId] = useState<string | null>(null);

  // dialogs
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // taking state
  const [qIndex, setQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeExam = exams.find((e) => e.id === activeExamId) || null;
  const qCount = activeExam?.questions.length || 0;
  const isMcq = activeExam?.questions[qIndex]?.type === 'multiple-choice';
  const answered = activeExam?.questions[qIndex]?.userAnswer !== undefined;

  // timer
  useEffect(() => {
    if (view !== 'taking' || !activeExam || activeExam.timeLimit <= 0) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current!); timerRef.current = null; autoSubmit(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [view, activeExamId, activeExam?.timeLimit]);

  const autoSubmit = useCallback(() => {
    if (!activeExamId) return;
    const exam = useStore.getState().exams.find((e) => e.id === activeExamId);
    if (!exam) return;
    const { score, total, percentage } = gradeExam(exam.questions);
    updateExam(activeExamId, { status: 'completed', score, total, percentage, completedAt: new Date().toISOString() });
    setView('reviewing');
  }, [activeExamId, updateExam]);

  const startExam = (id: string) => {
    const exam = useStore.getState().exams.find((e) => e.id === id);
    if (!exam) return;
    setActiveExamId(id);
    setQIndex(0);
    setSubmitting(false);
    setTimeLeft(exam.timeLimit * 60);
    updateExam(id, { status: 'in-progress' });
    setView('taking');
  };

  const handleAnswer = (answer: string) => {
    if (!activeExamId || !activeExam) return;
    const questions = activeExam.questions.map((q, i) => i === qIndex ? { ...q, userAnswer: answer } : q);
    updateExam(activeExamId, { questions });
    if (activeExam.showAnswersImmediately && activeExam.questions[qIndex].type === 'multiple-choice') {
      setTimeout(() => {
        if (qIndex < qCount - 1) setQIndex((i) => i + 1);
      }, 1200);
    }
  };

  const handleSubmit = () => {
    if (!activeExamId) return;
    setSubmitting(true);
    const exam = useStore.getState().exams.find((e) => e.id === activeExamId);
    if (!exam) return;
    const { score, total, percentage } = gradeExam(exam.questions);
    updateExam(activeExamId, { status: 'completed', score, total, percentage, completedAt: new Date().toISOString() });
    setView('reviewing');
  };

  const reviewExam = (id: string) => {
    setActiveExamId(id);
    setQIndex(0);
    setView('reviewing');
  };

  const resetView = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setView('list');
    setActiveExamId(null);
    setQIndex(0);
  };

  const stats = {
    total: exams.length,
    completed: exams.filter((e) => e.status === 'completed').length,
    avgPercentage: exams.filter((e) => e.status === 'completed' && e.percentage !== undefined).reduce((a, e) => a + (e.percentage || 0), 0) / Math.max(exams.filter((e) => e.status === 'completed').length, 1),
  };

  /* ─── views ────────────────────────────────────────────── */

  if (view === 'taking' && activeExam) {
    const q = activeExam.questions[qIndex];
    const needsSubmit = qIndex === qCount - 1;

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost" onClick={resetView} style={{ padding: '4px 8px', fontSize: 12 }}>
              <ChevronLeft size={14} /> Exit
            </button>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{activeExam.title}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{qIndex + 1}</span> / {qCount}
            </div>
            {activeExam.timeLimit > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                color: timeLeft < 60 ? 'var(--danger)' : 'var(--text-secondary)',
              }}>
                <Clock size={14} />
                {formatTime(timeLeft)}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'var(--border)', flexShrink: 0 }}>
          <div style={{
            height: '100%', width: `${((qIndex + 1) / qCount) * 100}%`,
            background: 'var(--primary)', transition: 'width 0.3s',
          }} />
        </div>

        {/* Question area */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, overflow: 'auto',
        }}>
          <div style={{ width: '100%', maxWidth: 640 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>
              {q.type === 'multiple-choice' ? 'MULTIPLE CHOICE' : 'VERBAL / WRITTEN'}
            </div>
            <h2 className="content-selectable" style={{
              fontSize: 20, fontWeight: 600, color: 'var(--text-primary)',
              marginBottom: 24, lineHeight: 1.5,
            }}>
              {q.question}
            </h2>

            {/* Options */}
            {q.type === 'multiple-choice' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {q.options.map((opt, i) => {
                  const selected = q.userAnswer === opt;
                  const isCorrect = opt === q.correctAnswer;
                  const showResult = activeExam.showAnswersImmediately && answered;
                  let bg = 'var(--bg-card)';
                  let border = 'var(--border)';
                  let textColor = 'var(--text-primary)';
                  if (showResult) {
                    if (isCorrect) { bg = '#ECFDF5'; border = '#10B981'; textColor = '#065F46'; }
                    else if (selected && !isCorrect) { bg = '#FEF2F2'; border = '#EF4444'; textColor = '#991B1B'; }
                    else { border = 'var(--border)'; }
                  } else if (selected) { bg = 'var(--primary-light)'; border = 'var(--primary)'; textColor = 'var(--primary)'; }
                  return (
                    <button
                      key={i}
                      onClick={() => { if (!answered || !activeExam.showAnswersImmediately) handleAnswer(opt); }}
                      disabled={activeExam.showAnswersImmediately && answered}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '14px 18px', borderRadius: 'var(--radius-md)',
                        border: `1.5px solid ${border}`, background: bg,
                        cursor: (activeExam.showAnswersImmediately && answered) ? 'default' : 'pointer',
                        textAlign: 'left', fontSize: 15, color: textColor,
                        transition: 'all 0.15s', fontWeight: selected ? 600 : 400,
                      }}
                    >
                      <span style={{
                        width: 24, height: 24, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                        background: selected ? 'var(--primary)' : 'var(--bg-surface)',
                        color: selected ? '#fff' : 'var(--text-muted)',
                      }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="content-selectable" style={{ flex: 1 }}>{opt}</span>
                      {showResult && isCorrect && <Check size={16} style={{ color: '#10B981', flexShrink: 0 }} />}
                      {showResult && selected && !isCorrect && <X size={16} style={{ color: '#EF4444', flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <textarea
                value={q.userAnswer || ''}
                onChange={(e) => {
                  const questions = activeExam.questions.map((qq, i) => i === qIndex ? { ...qq, userAnswer: e.target.value } : qq);
                  updateExam(activeExamId!, { questions });
                }}
                placeholder="Type your answer..."
                className="input"
                style={{
                  width: '100%', minHeight: 140, padding: 14, fontSize: 15,
                  lineHeight: 1.7, resize: 'vertical',
                  borderColor: q.userAnswer ? 'var(--primary)' : 'var(--border)',
                }}
              />
            )}

            {/* Immediate feedback */}
            {activeExam.showAnswersImmediately && answered && q.type === 'multiple-choice' && (
              <div style={{
                marginTop: 16, padding: '12px 16px', borderRadius: 'var(--radius-md)',
                background: q.userAnswer === q.correctAnswer ? '#ECFDF5' : '#FEF2F2',
                border: `1px solid ${q.userAnswer === q.correctAnswer ? '#10B981' : '#EF4444'}`,
                fontSize: 13, lineHeight: 1.5,
                color: q.userAnswer === q.correctAnswer ? '#065F46' : '#991B1B',
              }}>
                {q.userAnswer === q.correctAnswer
                  ? 'Correct!'
                  : `Incorrect. The correct answer is: ${q.correctAnswer}`}
              </div>
            )}
          </div>
        </div>

        {/* Bottom navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 24px', borderTop: '1px solid var(--border)',
          background: 'var(--bg-card)', flexShrink: 0,
        }}>
          <div />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={() => setQIndex((i) => Math.max(0, i - 1))}
              disabled={qIndex === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 14px' }}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            {needsSubmit ? (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 14px' }}
              >
                Submit Exam
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setQIndex((i) => Math.min(qCount - 1, i + 1))}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 14px' }}
              >
                Next <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'reviewing' && activeExam) {
    const { score, total, percentage } = gradeExam(activeExam.questions);
    const isPassed = percentage >= 60;

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 24, overflow: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              {activeExam.title}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {activeExam.subject && `${activeExam.subject} · `}Completed {activeExam.completedAt ? new Date(activeExam.completedAt).toLocaleDateString() : ''}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={resetView} style={{ fontSize: 12 }}>
            Back to Exams
          </button>
        </div>

        {/* Score card */}
        <div className="card" style={{
          padding: 24, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24,
          flexShrink: 0,
          borderLeft: `4px solid ${isPassed ? '#10B981' : '#EF4444'}`,
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isPassed ? '#ECFDF5' : '#FEF2F2',
            fontSize: 28, fontWeight: 700,
            color: isPassed ? '#065F46' : '#991B1B',
          }}>
            {percentage}%
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
              {score} / {total} correct
            </div>
            <div style={{ fontSize: 13, color: isPassed ? '#10B981' : '#EF4444', fontWeight: 500, marginTop: 2 }}>
              {isPassed ? 'Passed' : 'Failed'}
            </div>
          </div>
        </div>

        {/* Question review */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            Review Answers
          </h3>
          {activeExam.questions.map((q, i) => {
            const isCorrect = q.type === 'multiple-choice'
              ? q.userAnswer === q.correctAnswer
              : q.userAnswer?.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
            const isUnanswered = !q.userAnswer;
            return (
              <div key={q.id} className="card" style={{
                padding: '12px 16px',
                borderLeft: `3px solid ${isUnanswered ? 'var(--border)' : isCorrect ? '#10B981' : '#EF4444'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, fontWeight: 600 }}>
                      Q{i + 1} · {q.type === 'multiple-choice' ? 'Multiple Choice' : 'Verbal'}
                    </div>
                    <div className="content-selectable" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                      {q.question}
                    </div>
                    {/* Show options for MC */}
                    {q.type === 'multiple-choice' && q.options.map((opt, oi) => {
                      const isOptSelected = q.userAnswer === opt;
                      const isOptCorrect = opt === q.correctAnswer;
                      let color = 'var(--text-secondary)';
                      let bg = 'transparent';
                      if (isOptCorrect) { color = '#065F46'; bg = '#ECFDF5'; }
                      if (isOptSelected && !isOptCorrect) { color = '#991B1B'; bg = '#FEF2F2'; }
                      return (
                        <div key={oi} className="content-selectable" style={{ fontSize: 13, padding: '2px 0', color, background: bg, borderRadius: 4, paddingLeft: 8 }}>
                          {String.fromCharCode(65 + oi)}. {opt}
                          {isOptCorrect && <Check size={12} style={{ marginLeft: 8, color: '#10B981', display: 'inline' }} />}
                          {isOptSelected && !isOptCorrect && <X size={12} style={{ marginLeft: 8, color: '#EF4444', display: 'inline' }} />}
                        </div>
                      );
                    })}
                    {/* Show answer for verbal */}
                    {q.type === 'verbal' && (
                      <div className="content-selectable" style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Your answer: <span style={{ color: q.userAnswer ? 'var(--text-secondary)' : '#EF4444', fontWeight: 500 }}>{q.userAnswer || '(unanswered)'}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#065F46', marginTop: 2 }}>
                          Correct answer: <span style={{ fontWeight: 500 }}>{q.correctAnswer}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {isCorrect && <Check size={18} style={{ color: '#10B981' }} />}
                    {!isCorrect && !isUnanswered && <X size={18} style={{ color: '#EF4444' }} />}
                    {isUnanswered && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ─── List view ─────────────────────────────────────────── */

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ padding: '24px 28px', flex: 1 }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16, flexShrink: 0,
        }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
              Exams
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {stats.total > 0 ? `${stats.total} exam${stats.total > 1 ? 's' : ''} · ${stats.completed} completed` : 'Create practice exams and test your knowledge'}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setChoiceOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 14px' }}>
            <Plus size={14} /> New Exam
          </button>
        </div>

        {/* Stats */}
        {stats.completed > 0 && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', flexShrink: 0 }}>
            {[
              { label: 'Total', value: stats.total, color: 'var(--primary)' },
              { label: 'Completed', value: stats.completed, color: '#10B981' },
              { label: 'Avg Score', value: stats.total > 0 ? `${Math.round(stats.avgPercentage)}%` : '—', color: '#8B5CF6' },
            ].map((s) => (
              <div key={s.label} className="card" style={{
                padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
                border: '1px solid var(--border)',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {exams.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '80px 20px', color: 'var(--text-muted)',
          }}>
            <FileText size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              No exams yet
            </div>
            <div style={{ fontSize: 12, marginBottom: 20 }}>
              Create your first exam to start practicing
            </div>
            <button className="btn btn-primary" onClick={() => setChoiceOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 14px' }}>
              <Plus size={14} /> Create Exam
            </button>
          </div>
        )}

        {/* Exam list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {exams.map((exam) => {
            const result = exam.status === 'completed' && exam.percentage !== undefined ? exam.percentage : null;
            const isPassed = result !== null && result >= 60;
            return (
              <div key={exam.id} className="card" style={{
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16,
                borderLeft: result !== null ? `3px solid ${isPassed ? '#10B981' : '#EF4444'}` : '3px solid var(--border)',
                cursor: 'default',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-md)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: result !== null ? (isPassed ? '#ECFDF5' : '#FEF2F2') : 'var(--bg-surface)',
                  fontSize: 14, fontWeight: 700,
                  color: result !== null ? (isPassed ? '#065F46' : '#991B1B') : 'var(--text-muted)',
                }}>
                  {result !== null ? `${result}%` : <FileText size={18} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {exam.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                    <span>{exam.questions.length} question{exam.questions.length > 1 ? 's' : ''}</span>
                    {exam.timeLimit > 0 && <span>{exam.timeLimit} min</span>}
                    <span>{exam.showAnswersImmediately ? 'Instant feedback' : 'Review at end'}</span>
                    {exam.subject && <span>{exam.subject}</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {exam.status === 'draft' && (
                    <>
                      <button className="btn btn-primary" onClick={() => startExam(exam.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '5px 12px' }}>
                        <Play size={12} /> Take
                      </button>
                      <button className="btn btn-ghost" onClick={() => { setEditingId(exam.id); setEditorOpen(true); }}
                        style={{ padding: '5px 8px', fontSize: 11 }}>
                        <Pencil size={12} />
                      </button>
                    </>
                  )}
                  {exam.status === 'in-progress' && (
                    <button className="btn btn-primary" onClick={() => startExam(exam.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '5px 12px' }}>
                      <Play size={12} /> Resume
                    </button>
                  )}
                  {exam.status === 'completed' && (
                    <>
                      <button className="btn btn-ghost" onClick={() => reviewExam(exam.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '5px 12px' }}>
                        <BarChart3 size={12} /> Results
                      </button>
                      <button className="btn btn-ghost" onClick={() => startExam(exam.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '5px 12px' }}>
                        <RotateCcw size={12} /> Retake
                      </button>
                    </>
                  )}
                  <button className="btn btn-ghost" onClick={() => deleteExam(exam.id)}
                    style={{ padding: '5px 8px', fontSize: 11, color: 'var(--text-muted)' }}
                    title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Choice: AI or Manual ────────────────────────────── */}
      <Dialog open={choiceOpen} onClose={() => setChoiceOpen(false)} title="Create Exam" width={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={() => { setChoiceOpen(false); setAiOpen(true); }}
            className="card"
            style={{
              padding: 20, border: '1px solid var(--border)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left',
              borderRadius: 'var(--radius-md)',
              transition: 'all 0.15s', width: '100%',
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--primary-light)', flexShrink: 0,
            }}>
              <Sparkles size={20} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                Generate with AI
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Describe your topic and AI creates a custom exam with questions tailored to your needs
              </div>
            </div>
          </button>
          <button
            onClick={() => { setChoiceOpen(false); setEditingId(null); setEditorOpen(true); }}
            className="card"
            style={{
              padding: 20, border: '1px solid var(--border)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left',
              borderRadius: 'var(--radius-md)',
              transition: 'all 0.15s', width: '100%',
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-surface)', flexShrink: 0,
            }}>
              <Pencil size={20} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                Create Manually
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Build your exam from scratch — write questions, set options, and configure every detail
              </div>
            </div>
          </button>
        </div>
      </Dialog>

      {/* ─── AI Exam Generator ───────────────────────────────── */}
      <AiExamGenerator
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        addExam={addExam}
      />

      {/* ─── Create/Edit Exam Dialog ─────────────────────────── */}
      <ExamEditor
        open={editorOpen}
        editingId={editingId}
        exams={exams}
        addExam={addExam}
        updateExam={updateExam}
        onClose={() => { setEditorOpen(false); setEditingId(null); }}
      />
    </div>
  );
}

/* ─── Exam Editor Dialog ────────────────────────────────── */

function ExamEditor({
  open, editingId, exams, addExam, updateExam, onClose,
}: {
  open: boolean;
  editingId: string | null;
  exams: Exam[];
  addExam: (e: Exam) => void;
  updateExam: (id: string, u: Partial<Exam>) => void;
  onClose: () => void;
}) {
  const existing = editingId ? exams.find((e) => e.id === editingId) : null;

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState(0);
  const [showAnswersImmediately, setShowAnswersImmediately] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      if (existing) {
        setTitle(existing.title);
        setSubject(existing.subject);
        setDescription(existing.description);
        setTimeLimit(existing.timeLimit);
        setShowAnswersImmediately(existing.showAnswersImmediately);
        setQuestions(existing.questions.map((q) => ({ ...q })));
      } else {
        setTitle('');
        setSubject('');
        setDescription('');
        setTimeLimit(0);
        setShowAnswersImmediately(false);
        setQuestions([]);
      }
      setError('');
    }
  }, [open, existing]);

  const addQuestion = (type: 'multiple-choice' | 'verbal') => {
    const q: ExamQuestion = {
      id: crypto.randomUUID(),
      type,
      question: '',
      options: type === 'multiple-choice' ? ['', ''] : [],
      correctAnswer: '',
    };
    setQuestions([...questions, q]);
  };

  const updateQuestion = (id: string, updates: Partial<ExamQuestion>) => {
    setQuestions(questions.map((q) => q.id === id ? { ...q, ...updates } : q));
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const handleSave = () => {
    if (!title.trim()) { setError('Title is required'); return; }
    const valid = questions.filter((q) => q.question.trim());
    if (valid.length === 0) { setError('Add at least one question'); return; }
    for (const q of valid) {
      if (!q.correctAnswer.trim()) { setError('All questions need a correct answer'); return; }
      if (q.type === 'multiple-choice' && q.options.filter((o) => o.trim()).length < 2) {
        setError('Multiple-choice questions need at least 2 options');
        return;
      }
      if (q.type === 'multiple-choice' && !q.options.includes(q.correctAnswer)) {
        setError(`Correct answer must match one of the options for: "${q.question.slice(0, 30)}..."`);
        return;
      }
    }

    const exam: Exam = {
      id: editingId || crypto.randomUUID(),
      title: title.trim(),
      subject: subject.trim(),
      description: description.trim(),
      questions: valid.map((q) => ({ ...q, options: q.type === 'multiple-choice' ? q.options.filter((o) => o.trim()) : [] })),
      timeLimit,
      showAnswersImmediately,
      createdAt: existing?.createdAt || new Date().toISOString(),
      status: existing?.status || 'draft',
    };

    if (editingId) {
      updateExam(editingId, exam);
    } else {
      addExam(exam);
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={editingId ? 'Edit Exam' : 'New Exam'} width={600}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflow: 'auto' }}>
        {/* Basic info */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Exam title"
          className="input"
          style={{ width: '100%', fontSize: 14, padding: '8px 10px' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (optional)"
            className="input"
            style={{ flex: 1, fontSize: 13, padding: '8px 10px' }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Clock size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="number"
              value={timeLimit || ''}
              onChange={(e) => setTimeLimit(Math.max(0, Number(e.target.value)))}
              placeholder="Min"
              className="input"
              style={{ width: 60, fontSize: 13, padding: '8px 6px', textAlign: 'center' }}
              title="Time limit in minutes (0 = no limit)"
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>min</span>
          </div>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description / instructions (optional)"
          className="input"
          style={{ width: '100%', fontSize: 13, padding: '8px 10px', minHeight: 50, resize: 'vertical' }}
        />

        {/* Show answers toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}>
          <Check size={16} style={{ color: showAnswersImmediately ? 'var(--primary)' : 'var(--text-muted)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              Show correct answer immediately
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              When off, results will be shown after the exam ends
            </div>
          </div>
          <button
            onClick={() => setShowAnswersImmediately(!showAnswersImmediately)}
            style={{
              width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: showAnswersImmediately ? 'var(--primary)' : 'var(--border)',
              padding: 0, position: 'relative', transition: 'background 0.15s',
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 2,
              left: showAnswersImmediately ? 18 : 2,
              transition: 'left 0.15s',
            }} />
          </button>
        </div>

        {/* Questions */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.03em' }}>
              QUESTIONS ({questions.length})
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-ghost" onClick={() => addQuestion('multiple-choice')}
                style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={12} /> Multiple Choice
              </button>
              <button className="btn btn-ghost" onClick={() => addQuestion('verbal')}
                style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={12} /> Verbal
              </button>
            </div>
          </div>

          {questions.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
              No questions yet. Add a multiple choice or verbal question above.
            </div>
          )}

          {questions.map((q, i) => (
            <div key={q.id} className="card" style={{
              padding: 12, marginBottom: 8,
              borderLeft: `3px solid ${q.type === 'multiple-choice' ? 'var(--primary)' : '#8B5CF6'}`,
            }}>
              {/* Question header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  background: q.type === 'multiple-choice' ? 'var(--primary-light)' : '#EDE9FE',
                  color: q.type === 'multiple-choice' ? 'var(--primary)' : '#7C3AED',
                }}>
                  {q.type === 'multiple-choice' ? 'MC' : 'VERBAL'} · Q{i + 1}
                </span>
                <button onClick={() => removeQuestion(q.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}>
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Question text */}
              <textarea
                value={q.question}
                onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                placeholder="Enter your question..."
                className="input"
                style={{ width: '100%', fontSize: 13, padding: '6px 8px', minHeight: 36, resize: 'vertical', marginBottom: 8 }}
              />

              {/* Options for MC */}
              {q.type === 'multiple-choice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {q.options.map((opt, oi) => (
                    <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                        background: q.correctAnswer === opt ? 'var(--primary)' : 'var(--bg-surface)',
                        color: q.correctAnswer === opt ? '#fff' : 'var(--text-muted)',
                      }}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <input
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...q.options];
                          newOpts[oi] = e.target.value;
                          updateQuestion(q.id, { options: newOpts });
                        }}
                        placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                        className="input"
                        style={{ flex: 1, fontSize: 12, padding: '4px 6px' }}
                      />
                      <button
                        onClick={() => updateQuestion(q.id, { correctAnswer: opt })}
                        style={{
                          padding: '2px 6px', fontSize: 10, fontWeight: 600,
                          background: q.correctAnswer === opt ? 'var(--primary)' : 'transparent',
                          color: q.correctAnswer === opt ? '#fff' : 'var(--text-muted)',
                          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer', flexShrink: 0,
                        }}
                        title="Mark as correct answer"
                      >
                        {q.correctAnswer === opt ? 'Correct' : 'Set'}
                      </button>
                      {q.options.length > 2 && (
                        <button onClick={() => {
                          const newOpts = q.options.filter((_, j) => j !== oi);
                          const newCorrect = q.correctAnswer === opt ? '' : q.correctAnswer;
                          updateQuestion(q.id, { options: newOpts, correctAnswer: newCorrect });
                        }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {q.options.length < 6 && (
                    <button onClick={() => updateQuestion(q.id, { options: [...q.options, ''] })}
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '3px 8px', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Plus size={12} /> Add option
                    </button>
                  )}
                </div>
              )}

              {/* Correct answer for verbal */}
              {q.type === 'verbal' && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Correct answer</div>
                  <input
                    value={q.correctAnswer}
                    onChange={(e) => updateQuestion(q.id, { correctAnswer: e.target.value })}
                    placeholder="Expected correct answer"
                    className="input"
                    style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--danger)', padding: '6px 10px', background: '#FEF2F2', borderRadius: 'var(--radius-sm)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 12, padding: '6px 14px' }}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} style={{ fontSize: 12, padding: '6px 14px' }}>
            {editingId ? 'Save Changes' : 'Create Exam'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ─── AI Exam Generator Dialog ──────────────────────────── */

function generateExamFromPrompt(prompt: string, fileContent: string): Exam {
  const context = [prompt, fileContent].filter(Boolean).join('\n\n');
  const lower = context.toLowerCase();
  const isMath = /(math|calculus|algebra|geometry|equation|derivative|integral)/i.test(lower);
  const isScience = /(physics|chemistry|biology|science|atom|cell|force|energy|reaction)/i.test(lower);
  const isCS = /(programming|python|javascript|algorithm|data structure|code|function|variable|react|api|database)/i.test(lower);
  const isHistory = /(history|war|revolution|empire|century|ancient|civilization|king|battle)/i.test(lower);
  const isLanguage = /(language|grammar|vocabulary|spanish|french|german|english|latin|translat)/i.test(lower);

  const domain = isMath ? 'Math' : isScience ? 'Science' : isCS ? 'Computer Science' : isHistory ? 'History' : isLanguage ? 'Language' : 'General';

  const templates: { q: string; opts: string[]; correct: string }[] = [];

  if (isMath) {
    templates.push({ q: 'What is the derivative of x²?', opts: ['2x', 'x²', '2', 'x'], correct: '2x' });
    templates.push({ q: 'What is the integral of 2x dx?', opts: ['x² + C', '2x + C', 'x²', '2'], correct: 'x² + C' });
    templates.push({ q: 'What is the value of π (pi) approximately?', opts: ['3.14', '2.71', '1.62', '3.00'], correct: '3.14' });
    templates.push({ q: 'Solve for x: 2x + 5 = 13', opts: ['x = 4', 'x = 6', 'x = 3', 'x = 5'], correct: 'x = 4' });
    templates.push({ q: 'What is the slope of the line y = 3x + 2?', opts: ['3', '2', '3/2', '-3'], correct: '3' });
  } else if (isScience) {
    templates.push({ q: 'What is the chemical symbol for water?', opts: ['H₂O', 'CO₂', 'NaCl', 'O₂'], correct: 'H₂O' });
    templates.push({ q: 'What force keeps planets orbiting the sun?', opts: ['Gravity', 'Magnetism', 'Friction', 'Nuclear force'], correct: 'Gravity' });
    templates.push({ q: 'What is the basic unit of life?', opts: ['Cell', 'Atom', 'Molecule', 'Tissue'], correct: 'Cell' });
    templates.push({ q: 'What gas do plants absorb from the atmosphere?', opts: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'], correct: 'Carbon dioxide' });
    templates.push({ q: 'What is the speed of light approximately?', opts: ['3 × 10⁸ m/s', '3 × 10⁶ m/s', '3 × 10¹⁰ m/s', '3 × 10⁴ m/s'], correct: '3 × 10⁸ m/s' });
  } else if (isCS) {
    templates.push({ q: 'What does "API" stand for?', opts: ['Application Programming Interface', 'Application Process Integration', 'Automated Program Interface', 'Application Protocol Interface'], correct: 'Application Programming Interface' });
    templates.push({ q: 'What is a variable in programming?', opts: ['A named storage for data', 'A mathematical equation', 'A type of loop', 'A debugging tool'], correct: 'A named storage for data' });
    templates.push({ q: 'Which data structure uses FIFO?', opts: ['Queue', 'Stack', 'Array', 'Tree'], correct: 'Queue' });
    templates.push({ q: 'What is the time complexity of binary search?', opts: ['O(log n)', 'O(n)', 'O(n²)', 'O(1)'], correct: 'O(log n)' });
    templates.push({ q: 'What does "HTML" stand for?', opts: ['HyperText Markup Language', 'High Tech Modern Language', 'HyperText Modern Links', 'Home Tool Markup Language'], correct: 'HyperText Markup Language' });
  } else if (isHistory) {
    templates.push({ q: 'In which year did World War II end?', opts: ['1945', '1944', '1946', '1939'], correct: '1945' });
    templates.push({ q: 'Who was the first President of the United States?', opts: ['George Washington', 'Thomas Jefferson', 'Abraham Lincoln', 'John Adams'], correct: 'George Washington' });
    templates.push({ q: 'What ancient civilization built the pyramids?', opts: ['Egyptians', 'Romans', 'Greeks', 'Persians'], correct: 'Egyptians' });
    templates.push({ q: 'What was the Renaissance a revival of?', opts: ['Art and learning', 'Religion', 'Warfare', 'Trade'], correct: 'Art and learning' });
    templates.push({ q: 'Who wrote the Declaration of Independence?', opts: ['Thomas Jefferson', 'George Washington', 'Benjamin Franklin', 'John Hancock'], correct: 'Thomas Jefferson' });
  } else if (isLanguage) {
    templates.push({ q: 'What is the plural of "child" in English?', opts: ['Children', 'Childs', 'Childes', 'Children'], correct: 'Children' });
    templates.push({ q: 'What part of speech describes an action?', opts: ['Verb', 'Noun', 'Adjective', 'Adverb'], correct: 'Verb' });
    templates.push({ q: 'What is a synonym for "happy"?', opts: ['Joyful', 'Sad', 'Angry', 'Tired'], correct: 'Joyful' });
    templates.push({ q: 'Which sentence uses correct grammar?', opts: ['She goes to school every day', 'She go to school every day', 'She going to school every day', 'She to school goes every day'], correct: 'She goes to school every day' });
    templates.push({ q: 'What is the past tense of "run"?', opts: ['Ran', 'Runned', 'Running', 'Runs'], correct: 'Ran' });
  } else {
    templates.push({ q: 'What is the capital of France?', opts: ['Paris', 'London', 'Berlin', 'Madrid'], correct: 'Paris' });
    templates.push({ q: 'Who developed the theory of relativity?', opts: ['Albert Einstein', 'Isaac Newton', 'Galileo Galilei', 'Nikola Tesla'], correct: 'Albert Einstein' });
    templates.push({ q: 'Which planet is known as the Red Planet?', opts: ['Mars', 'Venus', 'Jupiter', 'Saturn'], correct: 'Mars' });
    templates.push({ q: 'What is the largest ocean on Earth?', opts: ['Pacific', 'Atlantic', 'Indian', 'Arctic'], correct: 'Pacific' });
    templates.push({ q: 'In which year did the Titanic sink?', opts: ['1912', '1905', '1915', '1920'], correct: '1912' });
  }

  const count = Math.min(templates.length, 5 + Math.floor(context.length / 200));
  const selected = templates.slice(0, count);
  const questions: ExamQuestion[] = selected.map((t) => ({
    id: crypto.randomUUID(),
    type: 'multiple-choice',
    question: t.q,
    options: t.opts,
    correctAnswer: t.correct,
  }));

  questions.push({
    id: crypto.randomUUID(),
    type: 'verbal',
    question: `Explain the concept of "${domain}" in your own words based on: ${prompt.slice(0, 100)}`,
    options: [],
    correctAnswer: `A clear explanation of ${domain} concepts related to "${prompt.slice(0, 50)}..."`,
  });

  return {
    id: crypto.randomUUID(),
    title: `${domain} Exam: ${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}`,
    subject: domain,
    description: `AI-generated exam based on: ${prompt}`,
    questions,
    timeLimit: 0,
    showAnswersImmediately: false,
    createdAt: new Date().toISOString(),
    status: 'draft',
  };
}

function AiExamGenerator({
  open, onClose, addExam,
}: {
  open: boolean;
  onClose: () => void;
  addExam: (e: Exam) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setPrompt(''); setFile(null); setLoading(false); }
  }, [open]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setFile({ name: f.name, content: text.slice(0, 10000) });
  };

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setTimeout(() => {
      const exam = generateExamFromPrompt(prompt.trim(), file?.content || '');
      addExam(exam);
      setLoading(false);
      onClose();
    }, 600);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Generate Exam with AI" width={540}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            Describe the exam topic
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., A 10-question multiple-choice exam on Python fundamentals covering variables, loops, functions, and data types"
            className="input"
            style={{
              width: '100%', minHeight: 90, padding: 10, fontSize: 13,
              lineHeight: 1.6, resize: 'vertical',
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            Upload reference material (optional)
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => fileRef.current?.click()}
              className="btn btn-ghost"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, padding: '8px 14px',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <Upload size={14} /> {file ? 'Replace file' : 'Choose file'}
            </button>
            {file && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <FileText size={13} /> {file.name}
                <button
                  onClick={() => setFile(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, marginLeft: 4 }}
                >
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Supported: .pdf, .txt, .md
          </div>
        </div>

        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius-md)',
          background: 'var(--primary-light)', fontSize: 12, color: 'var(--primary)',
          lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <Sparkles size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            AI will generate a mixed set of multiple-choice and verbal questions based on your topic and reference material. The exam is created instantly and you can edit it after.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 12, padding: '6px 14px' }}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading}
            style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {loading ? 'Generating...' : 'Generate Exam'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
