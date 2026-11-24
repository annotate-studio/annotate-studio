'use client';

import React, { useState } from 'react';
import { Check, Copy, NotebookPen } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import VisualizationView from './VisualizationView';
import { visualizationToText, type Visualization } from '@/lib/visualizations';
import { createNewNote } from '@/lib/workspace-actions';
import { copyText } from '@/lib/utils';
import { toast } from '@/store/toast';

export function visualizationTitle(data: Visualization): string {
  switch (data.type) {
    case 'timeline':
      return 'Timeline';
    case 'mindmap':
      return data.root || 'Mind Map';
    case 'venn_diagram':
      return `${data.subjectA} vs ${data.subjectB}`;
    case 'cheat_sheet':
      return data.title || 'Cheat Sheet';
    case 'bullet_list':
      return data.title || 'Key Notes';
    case 'qa_grid':
      return 'Why & How Questions';
    case 'fallacy_list':
      return 'Contradictions & Fallacies';
    default:
      return 'Summary';
  }
}

export function visualizationSummary(data: Visualization): string {
  switch (data.type) {
    case 'timeline':
      return `${data.events.length} chronological event${data.events.length === 1 ? '' : 's'}`;
    case 'mindmap': {
      const nodes = data.branches.reduce((sum, b) => sum + b.children.length, 0);
      return `${data.branches.length} branches · ${nodes} sub-topics`;
    }
    case 'venn_diagram':
      return `${data.uniqueA.length} / ${data.overlap.length} shared / ${data.uniqueB.length} points`;
    case 'cheat_sheet':
      return `${data.facts.length} facts · ${data.terms.length} terms`;
    case 'bullet_list':
      return `${data.items.length} key point${data.items.length === 1 ? '' : 's'}`;
    case 'qa_grid':
      return `${data.why_questions.length} Why · ${data.how_questions.length} How questions`;
    case 'fallacy_list':
      return data.fallacies.length === 0
        ? 'No contradictions found'
        : `${data.fallacies.length} issue${data.fallacies.length === 1 ? '' : 's'} identified`;
    default:
      return '';
  }
}

interface VisualizationDialogProps {
  data: Visualization | null;
  onClose: () => void;
}

export default function VisualizationDialog({ data, onClose }: VisualizationDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!data) return null;
  const title = visualizationTitle(data);

  const copy = async () => {
    const ok = await copyText(visualizationToText(data));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const saveAsNote = async () => {
    const file = await createNewNote({ title, content: `# ${title}\n\n${visualizationToText(data)}\n` });
    if (file) toast.success('Saved as note', file.name);
  };

  return (
    <Dialog
      open={Boolean(data)}
      onClose={onClose}
      title={title}
      width={860}
      className="viz-dialog"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy text'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void saveAsNote()}>
            <NotebookPen size={14} /> Save as note
          </button>
          <div className="dialog-footer-spacer" />
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="viz-dialog-body content-selectable">
        <VisualizationView data={data} />
      </div>
    </Dialog>
  );
}
