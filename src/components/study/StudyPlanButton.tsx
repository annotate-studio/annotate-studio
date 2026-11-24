'use client';

import React, { useMemo, useRef, useState } from 'react';
import { CalendarCheck, FileText, GraduationCap, Layers, Sparkles } from 'lucide-react';
import Popover from '@/components/ui/Popover';
import { useApp } from '@/store/app';
import { useFlashcards, isDue } from '@/store/flashcards';
import { useExams, gradeExam } from '@/store/exams';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';
import { openFileOnCanvas } from '@/lib/workspace-actions';
import { baseName } from '@/lib/utils';

export default function StudyPlanButton() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const setView = useApp((s) => s.setView);
  const cards = useFlashcards((s) => s.cards);
  const exams = useExams((s) => s.exams);
  const files = useLibrary((s) => s.files);
  const recentFiles = useSettings((s) => s.recentFiles);

  const dueCount = useMemo(() => cards.filter((c) => isDue(c)).length, [cards]);

  const focusExams = useMemo(() => {
    return exams
      .filter((exam) => {
        if (exam.status !== 'completed') return true;
        return gradeExam(exam.questions).percentage < 70;
      })
      .slice(0, 3);
  }, [exams]);

  const workspaceRecent = useMemo(() => {
    const withRecent = files
      .filter((f) => typeof recentFiles[f.path] === 'number')
      .sort((a, b) => (recentFiles[b.path] ?? 0) - (recentFiles[a.path] ?? 0))
      .slice(0, 4);
    if (withRecent.length > 0) return withRecent;
    return files.slice(0, 4);
  }, [files, recentFiles]);

  const pendingCount = (dueCount > 0 ? 1 : 0) + focusExams.length;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="study-plan-btn"
        onClick={() => setOpen((v) => !v)}
        title="Today's study plan"
      >
        <CalendarCheck size={12} />
        <span>Study plan</span>
        {pendingCount > 0 && <span className="study-plan-badge">{dueCount > 0 ? dueCount : focusExams.length}</span>}
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} align="end" width={310} className="study-plan-popover">
        <div className="study-plan-head">
          <Sparkles size={14} />
          <strong>Today&apos;s Study Plan</strong>
        </div>

        <div className="study-plan-section">
          <div className="study-plan-label">Flashcards</div>
          {dueCount > 0 ? (
            <button
              type="button"
              className="study-plan-item"
              onClick={() => {
                setView('flashcards');
                setOpen(false);
              }}
            >
              <Layers size={14} />
              <span>
                <strong>{dueCount}</strong> card{dueCount === 1 ? '' : 's'} due for review
              </span>
            </button>
          ) : (
            <div className="study-plan-empty">All flashcards caught up.</div>
          )}
        </div>

        {focusExams.length > 0 && (
          <div className="study-plan-section">
            <div className="study-plan-label">Exams to revisit</div>
            {focusExams.map((exam) => {
              const label =
                exam.status === 'completed'
                  ? `Score ${gradeExam(exam.questions).percentage}% · retake`
                  : exam.status === 'in-progress'
                    ? 'In progress · resume'
                    : 'Not started';
              return (
                <button
                  key={exam.id}
                  type="button"
                  className="study-plan-item"
                  onClick={() => {
                    setView('exams');
                    setOpen(false);
                  }}
                >
                  <GraduationCap size={14} />
                  <div className="study-plan-item-text">
                    <span dir="auto">{exam.title}</span>
                    <small>{label}</small>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {workspaceRecent.length > 0 && (
          <div className="study-plan-section">
            <div className="study-plan-label">Continue reading</div>
            {workspaceRecent.map((file) => (
              <button
                key={file.path}
                type="button"
                className="study-plan-item"
                onClick={() => {
                  setView('canvas');
                  openFileOnCanvas(file);
                  setOpen(false);
                }}
              >
                <FileText size={14} />
                <span className="study-plan-filename" dir="auto">
                  {baseName(file.path)}
                </span>
              </button>
            ))}
          </div>
        )}

        {dueCount === 0 && focusExams.length === 0 && workspaceRecent.length === 0 && (
          <div className="study-plan-empty">Import a file or create flashcards to build your study plan.</div>
        )}
      </Popover>
    </>
  );
}
