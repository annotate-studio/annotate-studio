import { discardPdfSaves, flushPdfSaves, waitForPdfSaves } from './pdf-saves';
import {
  createNote,
  deleteWorkspaceFile,
  importFiles,
  isTauri,
  readFileBytes,
  readTextFile,
  renameWorkspaceFile,
  writeFileBytes,
  writeTextFile,
  type StudyFile,
} from './tauri-commands';
import { extractPdfText, type ExtractedPdfText } from './pdf-engine';
import { baseName, extensionOf, stripExtension } from './utils';
import { useApp } from '@/store/app';
import { useCanvas, type OpenOptions, type ResourceType } from '@/store/canvas';
import { confirmDialog } from '@/store/dialogs';
import { resolveWikiLink, useLibrary } from '@/store/library';
import { useNotes } from '@/store/notes';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];
export const NOTE_EXTENSIONS = ['md', 'markdown', 'mdx', 'txt', 'text'];
export const DOCUMENT_EXTENSIONS = ['docx', 'odt'];

export function resourceTypeFor(file: Pick<StudyFile, 'file_type' | 'name'>): ResourceType | null {
  switch (file.file_type) {
    case 'Pdf':
      return 'pdf';
    case 'Image':
      return 'image';
    case 'Markdown':
    case 'Text':
      return 'note';
    default: {
      const ext = extensionOf(file.name);
      if (ext === 'pdf') return 'pdf';
      if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
      if (NOTE_EXTENSIONS.includes(ext)) return 'note';
      return null;
    }
  }
}

export function displayTitle(file: Pick<StudyFile, 'name' | 'file_type'>): string {
  return file.file_type === 'Markdown' ? stripExtension(file.name) : file.name;
}

export function openFileOnCanvas(file: StudyFile, options: OpenOptions = {}): string | null {
  const type = resourceTypeFor(file);
  if (!type) {
    toast.warning('This file type cannot be opened on the canvas', file.name);
    return null;
  }
  const id = useCanvas.getState().openResource({ type, title: displayTitle(file), filePath: file.path }, options);
  useSettings.getState().touchRecent(file.path);
  return id;
}

function openImported(files: StudyFile[], at?: { x: number; y: number }) {
  files.forEach((file, index) => {
    const offset = index * 40;
    openFileOnCanvas(file, at ? { at: { x: at.x + offset, y: at.y + offset } } : {});
  });
}

export async function importPaths(paths: string[], at?: { x: number; y: number }): Promise<StudyFile[]> {
  if (paths.length === 0) return [];
  try {
    const files = await importFiles(paths);
    files.forEach((file) => useLibrary.getState().upsert(file));
    openImported(files.filter((file) => resourceTypeFor(file)), at);
    const skipped = paths.length - files.length;
    if (skipped > 0) toast.warning(`${skipped} file${skipped > 1 ? 's were' : ' was'} skipped`, 'Only PDFs, images and text notes are supported.');
    return files;
  } catch (error) {
    toast.error('Import failed', error);
    return [];
  }
}

export async function importBrowserFiles(files: File[], at?: { x: number; y: number }): Promise<StudyFile[]> {
  const imported: StudyFile[] = [];
  for (const file of files) {
    const ext = extensionOf(file.name);
    const isNote = NOTE_EXTENSIONS.includes(ext);
    const supported = ext === 'pdf' || IMAGE_EXTENSIONS.includes(ext) || isNote || file.type.startsWith('image/');
    if (!supported) {
      toast.warning('Unsupported file', file.name);
      continue;
    }
    try {
      const name = file.name || `Pasted ${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      const saved = await writeFileBytes({ dir: isNote ? 'notes' : 'documents', name, unique: true }, await file.arrayBuffer());
      useLibrary.getState().upsert(saved);
      imported.push(saved);
    } catch (error) {
      toast.error(`Could not import ${file.name}`, error);
    }
  }
  openImported(imported, at);
  return imported;
}

export async function pickAndImport(kind: 'pdf' | 'image' | 'note' | 'any', at?: { x: number; y: number }) {
  if (!isTauri()) {
    toast.warning('Importing files requires the desktop app');
    return;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const filters =
    kind === 'pdf'
      ? [{ name: 'PDF', extensions: ['pdf'] }]
      : kind === 'image'
        ? [{ name: 'Images', extensions: IMAGE_EXTENSIONS }]
        : kind === 'note'
          ? [{ name: 'Notes', extensions: NOTE_EXTENSIONS }]
          : [{ name: 'Study files', extensions: ['pdf', ...IMAGE_EXTENSIONS, ...NOTE_EXTENSIONS] }];
  const selection = await open({ multiple: true, filters });
  if (!selection) return;
  const paths = Array.isArray(selection) ? selection : [selection];
  await importPaths(paths, at);
}

export async function createNewNote(options: { at?: { x: number; y: number }; content?: string; title?: string; near?: string } = {}) {
  try {
    const title = options.title?.trim() || 'Untitled';
    const content = options.content ?? `# ${title}\n\n`;
    const file = await createNote(title, content);
    useLibrary.getState().upsert(file);
    useCanvas.getState().openResource(
      { type: 'note', title: displayTitle(file), filePath: file.path },
      { at: options.at, near: options.near, focusExisting: false },
    );
    return file;
  } catch (error) {
    toast.error('Could not create the note', error);
    return null;
  }
}

export async function openWikiLink(target: string, near?: string) {
  const library = useLibrary.getState();
  const files = library.loaded ? library.files : await library.refresh();
  const file = resolveWikiLink(files, target);
  useApp.getState().setView('canvas');
  if (file) {
    openFileOnCanvas(file, near ? { near } : {});
    return;
  }
  const create = await confirmDialog({
    title: `Create “${target}”?`,
    message: 'There is no note with this name yet. Create it now?',
    confirmLabel: 'Create note',
  });
  if (create) await createNewNote({ title: target, near });
}

export async function renameFile(path: string, newName: string): Promise<StudyFile | null> {
  const trimmed = newName.trim();
  if (!trimmed) return null;
  try {
    const notes = useNotes.getState();
    if (notes.buffers[path]?.dirty) await notes.save(path);
    await flushPdfSaves(path);
    const file = await renameWorkspaceFile(path, trimmed);
    if (file.path !== path) {
      discardPdfSaves(path);
      notes.move(path, file.path);
      useLibrary.getState().replace(path, file);
      const settings = useSettings.getState();
      const opened = settings.recentFiles[path];
      settings.forgetRecent(path);
      if (opened) settings.touchRecent(file.path);
    } else {
      useLibrary.getState().upsert(file);
    }
    useCanvas.getState().replaceFilePath(path, file.path, displayTitle(file));
    return file;
  } catch (error) {
    toast.error('Rename failed', error);
    return null;
  }
}

export async function deleteFile(path: string): Promise<boolean> {
  try {
    discardPdfSaves(path);
    await waitForPdfSaves(path);
    await deleteWorkspaceFile(path);
    useCanvas.getState().closeByFilePath(path);
    useLibrary.getState().remove(path);
    useNotes.getState().drop(path);
    useSettings.getState().forgetRecent(path);
    return true;
  } catch (error) {
    toast.error('Delete failed', error);
    return false;
  }
}

export async function migrateInlineNotes(): Promise<void> {
  const { workspaces } = useCanvas.getState();
  for (const workspace of workspaces) {
    for (const resource of workspace.resources) {
      if (resource.type !== 'note' || resource.content === undefined) continue;
      try {
        let path = resource.filePath;
        if (path) {
          const saved = await writeTextFile(path, resource.content);
          useLibrary.getState().upsert(saved);
          useNotes.getState().reset(path, resource.content);
        } else {
          const file = await createNote(stripExtension(resource.title) || 'Untitled', resource.content);
          useLibrary.getState().upsert(file);
          path = file.path;
        }
        useCanvas.getState().patchResourceIn(workspace.id, resource.id, {
          filePath: path,
          content: undefined,
          title: stripExtension(baseName(path)),
        });
      } catch {
        continue;
      }
    }
  }
}

export interface DocumentText {
  name: string;
  text: string;
  pageCount?: number;
  truncated: boolean;
}

export async function readDocumentText(path: string, maxChars = 40_000): Promise<DocumentText> {
  const name = baseName(path);
  const ext = extensionOf(name);
  if (ext === 'pdf') {
    const bytes = await readFileBytes(path);
    const extracted: ExtractedPdfText = await extractPdfText(bytes, maxChars);
    return { name, text: extracted.text, pageCount: extracted.pageCount, truncated: extracted.truncated };
  }
  if (IMAGE_EXTENSIONS.includes(ext)) {
    return { name, text: '', truncated: false };
  }
  const buffer = useNotes.getState().buffers[path];
  const text = buffer && buffer.status === 'ready' ? buffer.content : await readTextFile(path);
  return { name, text: text.slice(0, maxChars), truncated: text.length > maxChars };
}
