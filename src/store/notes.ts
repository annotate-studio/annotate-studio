import { create } from 'zustand';
import { readNote, writeTextFile } from '@/lib/tauri-commands';
import { registerFlusher } from '@/lib/persist';
import { useLibrary } from './library';

export interface NoteBuffer {
  content: string;
  status: 'loading' | 'ready' | 'error';
  dirty: boolean;
  saving: boolean;
  error: string | null;
  savedAt: number | null;
  editable: boolean;
  lineEnding: '\n' | '\r\n';
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

interface NotesStore {
  buffers: Record<string, NoteBuffer>;
  load: (path: string, fallback?: string) => Promise<void>;
  edit: (path: string, content: string) => void;
  save: (path: string) => Promise<void>;
  move: (oldPath: string, newPath: string) => void;
  drop: (path: string) => void;
  reset: (path: string, content: string) => void;
}

const SAVE_DELAY = 700;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();

export const useNotes = create<NotesStore>((set, get) => {
  const patch = (path: string, change: Partial<NoteBuffer>) =>
    set((state) => {
      const current = state.buffers[path];
      if (!current) return state;
      return { buffers: { ...state.buffers, [path]: { ...current, ...change } } };
    });

  return {
    buffers: {},
    load: async (path, fallback) => {
      const existing = get().buffers[path];
      if (existing && existing.status !== 'error') return;
      set((state) => ({
        buffers: {
          ...state.buffers,
          [path]: {
            content: '',
            status: 'loading',
            dirty: false,
            saving: false,
            error: null,
            savedAt: null,
            editable: true,
            lineEnding: '\n',
          },
        },
      }));
      try {
        const note = await readNote(path);
        const current = get().buffers[path];
        if (!current || current.dirty || current.status !== 'loading') return;
        patch(path, {
          content: normalizeNewlines(note.content),
          lineEnding: note.content.includes('\r\n') ? '\r\n' : '\n',
          editable: note.editable,
          status: 'ready',
          error: null,
        });
      } catch (error) {
        if (fallback !== undefined) {
          patch(path, { content: normalizeNewlines(fallback), status: 'ready', dirty: true, error: null });
          get().save(path).catch(() => {});
          return;
        }
        patch(path, { status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    },
    edit: (path, content) => {
      const current = get().buffers[path];
      if (!current || !current.editable || current.content === content) return;
      patch(path, { content, dirty: true, status: 'ready' });
      const timer = timers.get(path);
      if (timer) clearTimeout(timer);
      timers.set(path, setTimeout(() => void get().save(path), SAVE_DELAY));
    },
    save: async (path) => {
      const timer = timers.get(path);
      if (timer) clearTimeout(timer);
      timers.delete(path);
      const previous = inflight.get(path);
      if (previous) await previous.catch(() => {});
      const buffer = get().buffers[path];
      if (!buffer || !buffer.dirty || !buffer.editable) return;
      const content = buffer.content;
      patch(path, { saving: true });
      const job = writeTextFile(path, buffer.lineEnding === '\r\n' ? content.replace(/\n/g, '\r\n') : content)
        .then((file) => {
          const latest = get().buffers[path];
          patch(path, { saving: false, dirty: latest ? latest.content !== content : false, savedAt: Date.now(), error: null });
          useLibrary.getState().upsert(file);
        })
        .catch((error: unknown) => {
          patch(path, { saving: false, error: error instanceof Error ? error.message : String(error) });
          throw error;
        })
        .finally(() => inflight.delete(path));
      inflight.set(path, job);
      await job;
    },
    move: (oldPath, newPath) => {
      if (oldPath === newPath) return;
      const timer = timers.get(oldPath);
      if (timer) {
        clearTimeout(timer);
        timers.delete(oldPath);
      }
      set((state) => {
        const buffer = state.buffers[oldPath];
        if (!buffer) return state;
        const next = { ...state.buffers };
        delete next[oldPath];
        next[newPath] = buffer;
        return { buffers: next };
      });
      if (get().buffers[newPath]?.dirty) {
        timers.set(newPath, setTimeout(() => void get().save(newPath), SAVE_DELAY));
      }
    },
    reset: (path, content) => {
      const current = get().buffers[path];
      if (!current || current.dirty) return;
      patch(path, { content: normalizeNewlines(content), status: 'ready', error: null });
    },
    drop: (path) => {
      const timer = timers.get(path);
      if (timer) clearTimeout(timer);
      timers.delete(path);
      set((state) => {
        if (!state.buffers[path]) return state;
        const next = { ...state.buffers };
        delete next[path];
        return { buffers: next };
      });
    },
  };
});

registerFlusher(async () => {
  const { buffers, save } = useNotes.getState();
  await Promise.allSettled(
    Object.entries(buffers)
      .filter(([, buffer]) => buffer.dirty)
      .map(([path]) => save(path)),
  );
});
