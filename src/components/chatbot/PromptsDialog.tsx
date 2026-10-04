'use client';

import React from 'react';
import { AlignLeft, ClipboardList, Clock, GitCompare, HelpCircle, ListChecks, Network, Scale } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { PROMPT_PRESETS, type PromptId } from '@/lib/promptPresets';

const ICONS: Record<PromptId, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  summary: AlignLeft,
  'key-notes': ListChecks,
  compare: GitCompare,
  timeline: Clock,
  mindmap: Network,
  'why-how': HelpCircle,
  'cheat-sheet': ClipboardList,
  contradictions: Scale,
};

interface PromptsDialogProps {
  open: boolean;
  onClose: () => void;
  onPick: (id: PromptId) => void;
  hint?: string;
}

export default function PromptsDialog({ open, onClose, onPick, hint }: PromptsDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Prompts"
      width={600}
      footer={
        <>
          <div className="dialog-footer-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      {hint && <p className="prompts-hint">{hint}</p>}
      <div className="prompt-grid">
        {PROMPT_PRESETS.map((preset, index) => {
          const Icon = ICONS[preset.id];
          return (
            <button
              key={preset.id}
              type="button"
              className="prompt-card"
              onClick={() => onPick(preset.id)}
              title={preset.instruction}
              data-autofocus={index === 0 ? '' : undefined}
            >
              <span className="prompt-card-icon">
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <span className="prompt-card-body">
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
