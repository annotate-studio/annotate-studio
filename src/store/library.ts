import { create } from 'zustand';
import { listWorkspaceFiles, type StudyFile } from '@/lib/tauri-commands';

interface LibraryStore {
  files: StudyFile[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<StudyFile[]>;
  upsert: (file: StudyFile) => void;
  remove: (path: string) => void;
  replace: (oldPath: string, file: StudyFile) => void;
}

let inflight: Promise<StudyFile[]> | null = null;

function sortFiles(files: StudyFile[]): StudyFile[] {
  return [...files].sort((a, b) => b.modified_at.localeCompare(a.modified_at));
}

export const useLibrary = create<LibraryStore>((set) => ({
  files: [],
  loading: false,
  loaded: false,
  error: null,
  refresh: () => {
    if (inflight) return inflight;
    set({ loading: true });
    inflight = listWorkspaceFiles()
      .then((files) => {
        set({ files: sortFiles(files), loading: false, loaded: true, error: null });
        return files;
      })
      .catch((error: unknown) => {
        set({ loading: false, loaded: true, error: error instanceof Error ? error.message : String(error) });
        return [] as StudyFile[];
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
  upsert: (file) =>
    set((state) => ({ files: sortFiles([file, ...state.files.filter((existing) => existing.path !== file.path)]) })),
  remove: (path) => set((state) => ({ files: state.files.filter((file) => file.path !== path) })),
  replace: (oldPath, file) =>
    set((state) => ({
      files: sortFiles([file, ...state.files.filter((existing) => existing.path !== oldPath && existing.path !== file.path)]),
    })),
}));

const LINK_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'docx', 'odt']);

function stripKnownExtension(value: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(value);
  return match && LINK_EXTENSIONS.has(match[1].toLowerCase()) ? value.slice(0, -match[0].length) : value;
}

function sanitizeLinkName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim();
}

export function normalizeLinkTarget(value: string): string {
  return stripKnownExtension(value.trim().split('|')[0].split('#')[0].trim()).toLowerCase();
}

export function resolveWikiLink(files: StudyFile[], target: string): StudyFile | undefined {
  const wanted = normalizeLinkTarget(target);
  if (!wanted) return undefined;
  const exact = files.find((file) => file.name.toLowerCase() === target.trim().toLowerCase());
  if (exact) return exact;
  const names = new Set([wanted, sanitizeLinkName(wanted)]);
  const byStem = files.filter((file) => names.has(stripKnownExtension(file.name).toLowerCase()));
  return byStem.find((file) => file.file_type === 'Markdown') ?? byStem[0];
}
