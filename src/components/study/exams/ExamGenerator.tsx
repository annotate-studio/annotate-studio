'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import ModelPicker from '@/components/ui/ModelPicker';
import { readDocumentText } from '@/lib/workspace-actions';
import { hasReadableText } from '@/lib/pdf-engine';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';
import type { Exam } from '@/store/exams';
import { generateExam } from './examAi';

interface ExamGeneratorProps {
  open: boolean;
  onClose: () => void;
  onCreated: (exam: Exam) => void;
}

export default function ExamGenerator({ open, onClose, onCreated }: ExamGeneratorProps) {
  const files = useLibrary((state) => state.files);
  const documents = useMemo(() => files.filter((file) => file.file_type !== 'Image'), [files]);
  const [topic, setTopic] = useState('');
  const [path, setPath] = useState('');
  const [multipleChoice, setMultipleChoice] = useState(8);
  const [written, setWritten] = useState(2);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [timeLimit, setTimeLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void useLibrary.getState().refresh();
  }, [open]);

  const abandon = () => {
    runRef.current += 1;
    setBusy(false);
    setStatus('');
    onClose();
  };

  const generate = async () => {
    if ((!topic.trim() && !path) || busy) return;
    const run = ++runRef.current;
    setBusy(true);
    setError(null);
    try {
      let material = '';
      let materialName: string | undefined;
      if (path) {
        setStatus('Reading the document…');
        const document = await readDocumentText(path, 30_000);
        if (!hasReadableText(document.text)) throw new Error('No readable text was found in the selected document.');
        material = document.text;
        materialName = document.name;
      }
      setStatus('Writing questions…');
      const exam = await generateExam({
        topic,
        material,
        materialName,
        multipleChoice,
        written,
        difficulty,
        timeLimit,
        model: useSettings.getState().selectedModel || undefined,
      });
      if (run !== runRef.current) return;
      onCreated(exam);
      setTopic('');
      setPath('');
    } catch (err) {
      if (run !== runRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (run === runRef.current) {
        setBusy(false);
        setStatus('');
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Generate an exam with AI"
      width={580}
      dismissable={!busy}
      footer={
        <>
          <ModelPicker align="start" />
          <div className="dialog-footer-spacer" />
          <button type="button" className="btn btn-ghost" onClick={busy ? abandon : onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={busy || (!topic.trim() && !path)}>
            {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            {busy ? status || 'Generating…' : 'Generate exam'}
          </button>
        </>
      }
    >
      <div className="form-grid form-grid-2">
        <label className="field field-wide">
          <span className="field-label">Topic or instructions</span>
          <textarea
            className="input textarea"
            rows={3}
            value={topic}
            dir="auto"
            data-autofocus
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Cell respiration: glycolysis, Krebs cycle and the electron transport chain"
            disabled={busy}
          />
        </label>
        <label className="field field-wide">
          <span className="field-label">Base it on a document (optional)</span>
          <select className="select" value={path} onChange={(event) => setPath(event.target.value)} disabled={busy}>
            <option value="">No document</option>
            {documents.map((file) => (
              <option key={file.path} value={file.path}>
                {file.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Multiple-choice questions</span>
          <input className="input" type="number" min={0} max={30} value={multipleChoice} onChange={(event) => setMultipleChoice(Math.min(30, Math.max(0, Number(event.target.value) || 0)))} disabled={busy} />
        </label>
        <label className="field">
          <span className="field-label">Written questions</span>
          <input className="input" type="number" min={0} max={10} value={written} onChange={(event) => setWritten(Math.min(10, Math.max(0, Number(event.target.value) || 0)))} disabled={busy} />
        </label>
        <label className="field">
          <span className="field-label">Difficulty</span>
          <select className="select" value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)} disabled={busy}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Time limit (minutes)</span>
          <input className="input" type="number" min={0} max={600} value={timeLimit} onChange={(event) => setTimeLimit(Math.max(0, Number(event.target.value) || 0))} disabled={busy} />
        </label>
        {multipleChoice + written === 0 && <div className="alert alert-warning field-wide">Ask for at least one question.</div>}
        {error && <div className="alert alert-error field-wide">{error}</div>}
      </div>
    </Dialog>
  );
}
