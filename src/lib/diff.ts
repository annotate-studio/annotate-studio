export interface DiffLine {
  kind: 'context' | 'add' | 'del';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface FileDiff {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  identical: boolean;
}

function splitLines(text: string): string[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function computeRawDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  let prefix = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (prefix < minLen && oldLines[prefix] === newLines[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const out: DiffLine[] = [];
  for (let i = 0; i < prefix; i += 1) {
    out.push({ kind: 'context', text: oldLines[i], oldLine: i + 1, newLine: i + 1 });
  }

  const midOld = oldLines.slice(prefix, oldLines.length - suffix);
  const midNew = newLines.slice(prefix, newLines.length - suffix);
  const n = midOld.length;
  const m = midNew.length;

  if (n === 0 && m === 0) {
    // identical
  } else if (n === 0) {
    for (let j = 0; j < m; j += 1) {
      out.push({ kind: 'add', text: midNew[j], newLine: prefix + j + 1 });
    }
  } else if (m === 0) {
    for (let i = 0; i < n; i += 1) {
      out.push({ kind: 'del', text: midOld[i], oldLine: prefix + i + 1 });
    }
  } else if (n * m > 2_000_000) {
    // Fallback for huge unrelated diffs to avoid quadratic memory
    for (let i = 0; i < n; i += 1) {
      out.push({ kind: 'del', text: midOld[i], oldLine: prefix + i + 1 });
    }
    for (let j = 0; j < m; j += 1) {
      out.push({ kind: 'add', text: midNew[j], newLine: prefix + j + 1 });
    }
  } else {
    const stride = m + 1;
    const dp = new Uint32Array((n + 1) * stride);
    for (let i = n - 1; i >= 0; i -= 1) {
      const row = i * stride;
      const nextRow = (i + 1) * stride;
      const a = midOld[i];
      for (let j = m - 1; j >= 0; j -= 1) {
        if (a === midNew[j]) {
          dp[row + j] = dp[nextRow + j + 1] + 1;
        } else {
          const down = dp[nextRow + j];
          const right = dp[row + j + 1];
          dp[row + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midOld[i] === midNew[j]) {
        out.push({ kind: 'context', text: midOld[i], oldLine: prefix + i + 1, newLine: prefix + j + 1 });
        i += 1;
        j += 1;
      } else if (dp[(i + 1) * stride + j] >= dp[i * stride + j + 1]) {
        out.push({ kind: 'del', text: midOld[i], oldLine: prefix + i + 1 });
        i += 1;
      } else {
        out.push({ kind: 'add', text: midNew[j], newLine: prefix + j + 1 });
        j += 1;
      }
    }
    while (i < n) {
      out.push({ kind: 'del', text: midOld[i], oldLine: prefix + i + 1 });
      i += 1;
    }
    while (j < m) {
      out.push({ kind: 'add', text: midNew[j], newLine: prefix + j + 1 });
      j += 1;
    }
  }

  for (let s = 0; s < suffix; s += 1) {
    const oldIdx = oldLines.length - suffix + s;
    const newIdx = newLines.length - suffix + s;
    out.push({ kind: 'context', text: oldLines[oldIdx], oldLine: oldIdx + 1, newLine: newIdx + 1 });
  }

  return out;
}

export function computeDiff(before: string, after: string, contextLines = 3): FileDiff {
  if (before === after) return { hunks: [], additions: 0, deletions: 0, identical: true };
  const raw = computeRawDiff(splitLines(before), splitLines(after));
  let additions = 0;
  let deletions = 0;
  const changedIndexes: number[] = [];
  raw.forEach((line, idx) => {
    if (line.kind === 'add') {
      additions += 1;
      changedIndexes.push(idx);
    } else if (line.kind === 'del') {
      deletions += 1;
      changedIndexes.push(idx);
    }
  });
  if (changedIndexes.length === 0) return { hunks: [], additions: 0, deletions: 0, identical: true };

  const ranges: { start: number; end: number }[] = [];
  for (const idx of changedIndexes) {
    const start = Math.max(0, idx - contextLines);
    const end = Math.min(raw.length - 1, idx + contextLines);
    const last = ranges[ranges.length - 1];
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
    } else {
      ranges.push({ start, end });
    }
  }

  const hunks: DiffHunk[] = ranges.map(({ start, end }) => {
    const lines = raw.slice(start, end + 1);
    const firstOld = lines.find((l) => l.oldLine !== undefined)?.oldLine ?? 1;
    const firstNew = lines.find((l) => l.newLine !== undefined)?.newLine ?? 1;
    const oldCount = lines.filter((l) => l.kind !== 'add').length;
    const newCount = lines.filter((l) => l.kind !== 'del').length;
    return { oldStart: firstOld, oldCount, newStart: firstNew, newCount, lines };
  });

  return { hunks, additions, deletions, identical: false };
}
