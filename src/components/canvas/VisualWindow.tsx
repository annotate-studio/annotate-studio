'use client';

import React, { memo, useState } from 'react';
import { Check, Copy, NotebookPen, Sparkles } from 'lucide-react';
import VisualizationView from '@/components/chatbot/VisualizationView';
import { visualizationToText, type Visualization } from '@/lib/visualizations';
import { createNewNote } from '@/lib/workspace-actions';
import { copyText } from '@/lib/utils';
import { toast } from '@/store/toast';

const KIND_LABELS: Record<Visualization['type'], string> = {
  timeline: 'Timeline',
  mindmap: 'Mind Map',
  venn_diagram: 'Comparison',
  cheat_sheet: 'Cheat Sheet',
  bullet_list: 'Key Notes',
  qa_grid: 'Why & How',
  fallacy_list: 'Critical Analysis',
  text: 'Summary',
};

function VisualWindow({
  resourceId,
  title,
  visualization,
}: {
  resourceId: string;
  title: string;
  visualization: Visualization;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyText(visualizationToText(visualization));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const toNote = async () => {
    const content = `# ${title}\n\n${visualizationToText(visualization)}\n`;
    const file = await createNewNote({ title, content, near: resourceId });
    if (file) toast.success('Saved as note', file.name);
  };

  return (
    <div className="visual-window">
      <div className="visual-toolbar" data-no-drag>
        <span className="visual-kind-badge">
          <Sparkles size={12} /> {KIND_LABELS[visualization.type] ?? 'Visual'}
        </span>
        <div className="visual-toolbar-spacer" />
        <button type="button" className="tool-btn" onClick={() => void copy()} title="Copy text">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button type="button" className="tool-btn" onClick={() => void toNote()} title="Save as Markdown note">
          <NotebookPen size={13} />
        </button>
      </div>
      <div className="visual-body content-selectable">
        <VisualizationView data={visualization} />
      </div>
    </div>
  );
}

export default memo(VisualWindow);
