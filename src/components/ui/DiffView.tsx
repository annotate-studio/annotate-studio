'use client';

import React, { memo, useMemo, useState } from 'react';
import { ChevronRight, FileDiff as FileDiffIcon } from 'lucide-react';
import { computeDiff } from '@/lib/diff';
import { baseName, cn } from '@/lib/utils';

interface DiffViewProps {
  path?: string;
  label?: string;
  before: string;
  after: string;
  defaultOpen?: boolean;
  compact?: boolean;
  actions?: React.ReactNode;
}

const DiffView = memo(function DiffView({
  path,
  label,
  before,
  after,
  defaultOpen = false,
  compact = false,
  actions,
}: DiffViewProps) {
  const [open, setOpen] = useState(defaultOpen);
  const diff = useMemo(() => computeDiff(before, after, compact ? 2 : 3), [before, after, compact]);
  const title = label ?? (path ? baseName(path) : 'Changes');

  if (diff.identical) {
    return (
      <div className={cn('diff-card diff-card-empty', compact && 'diff-card-compact')}>
        <FileDiffIcon size={13} />
        <span>No differences</span>
      </div>
    );
  }

  return (
    <div className={cn('diff-card', open && 'diff-card-open', compact && 'diff-card-compact')}>
      <div className="diff-head">
        <button type="button" className="diff-toggle" onClick={() => setOpen((v) => !v)}>
          <ChevronRight size={13} className="diff-chevron" />
          <FileDiffIcon size={13} />
          <span className="diff-title" dir="auto" title={path ?? title}>
            {title}
          </span>
          <span className="diff-stats">
            {diff.additions > 0 && <span className="diff-stat-add">+{diff.additions}</span>}
            {diff.deletions > 0 && <span className="diff-stat-del">-{diff.deletions}</span>}
          </span>
        </button>
        {actions && <div className="diff-actions">{actions}</div>}
      </div>
      {open && (
        <div className="diff-body" dir="ltr">
          {diff.hunks.map((hunk, hunkIdx) => (
            <div key={hunkIdx} className="diff-hunk">
              <div className="diff-hunk-head">
                @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
              </div>
              {hunk.lines.map((line, lineIdx) => (
                <div key={lineIdx} className={cn('diff-line', `diff-line-${line.kind}`)}>
                  <span className="diff-num">{line.oldLine ?? ''}</span>
                  <span className="diff-num">{line.newLine ?? ''}</span>
                  <span className="diff-sign">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}</span>
                  <span className="diff-code">{line.text || ' '}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default DiffView;
