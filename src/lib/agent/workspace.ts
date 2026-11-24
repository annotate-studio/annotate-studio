import { indexStatus, type StudyFile } from '@/lib/tauri-commands';
import { extensionOf } from '@/lib/utils';
import { LATEX_EXTENSIONS } from '@/lib/workspace-actions';
import { useSettings } from '@/store/settings';
import { libraryFiles } from './documents';
import type { ToolUndo } from './tools';

const undoRegistry = new Map<string, ToolUndo>();

export function rememberUndo(stepId: string, undo: ToolUndo) {
  undoRegistry.set(stepId, undo);
  if (undoRegistry.size > 200) {
    const oldest = undoRegistry.keys().next().value;
    if (oldest !== undefined) undoRegistry.delete(oldest);
  }
}

export function takeUndo(stepId: string): ToolUndo | undefined {
  const undo = undoRegistry.get(stepId);
  undoRegistry.delete(stepId);
  return undo;
}

export function hasUndo(stepId: string): boolean {
  return undoRegistry.has(stepId);
}

function kind(file: StudyFile): string {
  const ext = extensionOf(file.name);
  if (file.file_type === 'Pdf') return 'PDF';
  if (file.file_type === 'Image') return 'image';
  if (file.file_type === 'Document') return 'Word/ODT';
  if (LATEX_EXTENSIONS.includes(ext)) return 'LaTeX';
  if (ext === 'lean') return 'Lean';
  return file.file_type === 'Markdown' ? 'note' : 'text';
}

export async function workspaceManifest(focus: string[], limit = 50): Promise<string> {
  const files = await libraryFiles();
  if (files.length === 0) return 'The workspace is empty.';
  const index = await indexStatus().catch(() => []);
  const info = new Map(index.map((entry) => [entry.path, entry]));
  const recent = useSettings.getState().recentFiles;
  const focusSet = new Set(focus);
  const sorted = [...files].sort((a, b) => {
    const fa = focusSet.has(a.path) ? 1 : 0;
    const fb = focusSet.has(b.path) ? 1 : 0;
    if (fa !== fb) return fb - fa;
    const ra = recent[a.path] ?? 0;
    const rb = recent[b.path] ?? 0;
    if (ra !== rb) return rb - ra;
    return b.modified_at.localeCompare(a.modified_at);
  });
  const lines = sorted.slice(0, limit).map((file) => {
    const entry = info.get(file.path);
    const details = [kind(file)];
    if (entry?.pages) details.push(`${entry.pages} pages`);
    if (entry && entry.emptyPages.length > 0) details.push(entry.emptyPages.length === entry.pages ? 'scanned' : `${entry.emptyPages.length} scanned pages`);
    if (!entry?.pages && file.size > 0 && file.file_type !== 'Pdf') details.push(`${Math.max(1, Math.round(file.size / 1024))} KB`);
    return `- ${file.path} (${details.join(', ')})${focusSet.has(file.path) ? ' ← attached by the learner' : ''}`;
  });
  const more = files.length > limit ? `\n… and ${files.length - limit} more files (use list_files).` : '';
  return `${files.length} files:\n${lines.join('\n')}${more}`;
}
