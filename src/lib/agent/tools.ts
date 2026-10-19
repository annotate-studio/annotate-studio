import {
  aiTurn,
  compileLatex,
  createFlashcard,
  searchWorkspace,
  type ContentPart,
  type ProviderInfo,
  type StudyFile,
  type ToolSpec,
} from '@/lib/tauri-commands';
import { resolveAnswer, stripLetterPrefixes } from '@/lib/answers';
import { markdownToLatex } from '@/lib/latex-convert';
import { resolveWorkspaceImage } from '@/lib/images';
import { baseName, extensionOf, stripExtension, uid } from '@/lib/utils';
import { createNewNote, LATEX_EXTENSIONS, openFileOnCanvas, renameFile } from '@/lib/workspace-actions';
import { normalizeForSearch } from '@/lib/bidi';
import { activeWorkspace, useCanvas, type ArrangeLayout } from '@/store/canvas';
import { useExams, type Exam, type ExamQuestion } from '@/store/exams';
import { UNSORTED_ID, useFlashcards } from '@/store/flashcards';
import { useLibrary } from '@/store/library';
import { useNotes } from '@/store/notes';
import { useApp } from '@/store/app';
import { canSeeImages } from './models';
import {
  ensureIndexed,
  imageFilePart,
  isImage,
  isPdf,
  libraryFiles,
  ocrPages,
  parsePageList,
  pdfOutline,
  pdfPages,
  readText,
  renderPdfPage,
  resolvePath,
  textOutline,
} from './documents';
import { estimateTokens } from './context';
import { PRESETS, REASONER_PROMPT } from './prompts';

export interface ToolContext {
  requestId: string;
  readPaths: Set<string>;
  createdPaths: Set<string>;
  allowWrites: boolean;
  confirmEdits: boolean;
  visionModel?: ProviderInfo;
  reasoningModel?: ProviderInfo;
  reasoningEffort: 'low' | 'medium' | 'high';
  isCancelled: () => boolean;
  onProgress: (text: string) => void;
  confirm: (title: string, message: string) => Promise<boolean>;
  makeBooklet?: (input: { paths: string[]; title: string; instructions?: string }) => Promise<{ path: string; sections: number }>;
  near?: string;
}

export interface ToolUndo {
  path: string;
  previous: string | null;
}

export interface ToolResult {
  text: string;
  images?: ContentPart[];
  summary: string;
  paths?: string[];
  undo?: ToolUndo;
  error?: boolean;
}

export interface AgentTool {
  spec: ToolSpec;
  write?: boolean;
  label: (args: Record<string, unknown>) => string;
  run: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

const READ_LIMIT = 14_000;

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => str(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function fileType(file: StudyFile): string {
  const ext = extensionOf(file.name);
  if (file.file_type === 'Pdf') return 'pdf';
  if (file.file_type === 'Image') return 'image';
  if (file.file_type === 'Document') return 'document';
  if (LATEX_EXTENSIONS.includes(ext)) return 'latex';
  if (ext === 'lean') return 'lean';
  return 'note';
}

async function requireFile(input: unknown): Promise<StudyFile> {
  const value = str(input).trim();
  if (!value) throw new Error('A file path is required.');
  const files = await libraryFiles();
  const file = resolvePath(value, files);
  if (!file) throw new Error(`No file named "${value}" exists. Use list_files or search_workspace to find the right path.`);
  return file;
}

async function loadNote(path: string): Promise<string> {
  const notes = useNotes.getState();
  if (!notes.buffers[path] || notes.buffers[path].status === 'error') await notes.load(path);
  const started = Date.now();
  while (useNotes.getState().buffers[path]?.status === 'loading' && Date.now() - started < 10_000) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const buffer = useNotes.getState().buffers[path];
  if (!buffer || buffer.status !== 'ready') throw new Error(buffer?.error ?? `Could not open ${path}.`);
  if (!buffer.editable) throw new Error(`${path} is not UTF-8 text and cannot be edited safely.`);
  return buffer.content;
}

async function saveNote(path: string, content: string): Promise<void> {
  const notes = useNotes.getState();
  notes.edit(path, content);
  await notes.save(path);
  const saved = useNotes.getState().buffers[path];
  if (saved?.error) throw new Error(saved.error);
}

function editableNote(file: StudyFile): void {
  if (file.file_type === 'Pdf' || file.file_type === 'Image' || file.file_type === 'Document') {
    throw new Error(`${file.name} is not a text note. Only Markdown, LaTeX and text notes can be edited; create a new note instead.`);
  }
}

async function guardWrite(context: ToolContext, title: string, message: string, existing: boolean): Promise<void> {
  if (!context.allowWrites) throw new Error('Writing files is turned off in Settings → Assistant. Describe the change in your reply instead.');
  if (existing && context.confirmEdits && !(await context.confirm(title, message))) throw new Error('The learner declined this change.');
}

export function revertUndo(undo: ToolUndo): Promise<void> {
  if (undo.previous === null) return Promise.resolve();
  return loadNote(undo.path).then(() => saveNote(undo.path, undo.previous ?? ''));
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const listFiles: AgentTool = {
  spec: {
    name: 'list_files',
    description: 'List files in the workspace with their type, size and last change. Optionally filter by type or by words in the name.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['all', 'pdf', 'note', 'latex', 'image', 'document'], description: 'Only list files of this kind.' },
        query: { type: 'string', description: 'Words that must appear in the file name.' },
      },
    },
  },
  label: (args) => (args.query ? `Listed files matching “${str(args.query)}”` : 'Listed workspace files'),
  run: async (args) => {
    const files = await libraryFiles();
    const type = str(args.type, 'all');
    const query = normalizeForSearch(str(args.query));
    const matches = files.filter(
      (file) => (type === 'all' || fileType(file) === type) && (!query || query.split(/\s+/).every((part) => normalizeForSearch(file.name).includes(part))),
    );
    const lines = matches.slice(0, 250).map((file) => `- ${file.path} · ${fileType(file)} · ${sizeLabel(file.size)} · changed ${file.modified_at.slice(0, 10)}`);
    const more = matches.length > 250 ? `\n… and ${matches.length - 250} more.` : '';
    return { text: matches.length ? `${matches.length} file(s):\n${lines.join('\n')}${more}` : 'No matching files.', summary: `${matches.length} file${matches.length === 1 ? '' : 's'}` };
  },
};

const search: AgentTool = {
  spec: {
    name: 'search_workspace',
    description:
      'Full-text search across every document and note in the workspace (Persian and English). Returns the best matching passages with file and page. Use several focused queries with key terms rather than one long sentence.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Key terms to search for.' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Only search these files.' },
        limit: { type: 'number', description: 'Maximum number of passages (1-20, default 8).' },
      },
      required: ['query'],
    },
  },
  label: (args) => `Searched for “${str(args.query)}”`,
  run: async (args, context) => {
    const query = str(args.query).trim();
    if (!query) throw new Error('The query is empty.');
    await ensureIndexed(context.onProgress);
    const files = await libraryFiles();
    const paths = strings(args.paths)
      .map((path) => resolvePath(path, files)?.path)
      .filter((path): path is string => Boolean(path));
    const hits = await searchWorkspace(query, Math.min(20, Math.max(1, num(args.limit, 8))), paths);
    if (hits.length === 0) return { text: `No passages match "${query}". Try other words, synonyms or the other language.`, summary: 'No results' };
    const text = hits
      .map((hit, index) => `[${index + 1}] ${hit.path}${hit.page ? `, page ${hit.page}` : hit.line ? `, line ${hit.line}` : ''}\n${hit.snippet}`)
      .join('\n\n');
    return { text, summary: `${hits.length} passage${hits.length === 1 ? '' : 's'}`, paths: Array.from(new Set(hits.map((hit) => hit.path))) };
  },
};

const readFile: AgentTool = {
  spec: {
    name: 'read_file',
    description:
      'Read a file. For PDFs pass pages like "1-5" or "3, 7, 10" (default: the first pages). Scanned pages are transcribed with OCR when a vision model is available. For notes and text files pass start (character offset) to continue reading. Images are shown to vision models.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace path such as "documents/Book.pdf" or "notes/Lecture.md".' },
        pages: { type: 'string', description: 'PDF pages to read, for example "1-5" or "2, 9".' },
        start: { type: 'number', description: 'Character offset to start from for text files.' },
      },
      required: ['path'],
    },
  },
  label: (args) => `Read ${baseName(str(args.path))}${args.pages ? ` · pages ${str(args.pages)}` : ''}`,
  run: async (args, context) => {
    const file = await requireFile(args.path);
    context.readPaths.add(file.path);
    if (file.file_type === 'Image' || isImage(file.path)) {
      if (!canSeeImages(context.visionModel)) {
        return { text: `${file.name} is an image. No vision model is configured, so its content cannot be read. Ask the learner to choose a vision model in Settings → Assistant.`, summary: 'Image (no vision model)', paths: [file.path] };
      }
      const image = await imageFilePart(file.path);
      return { text: `Image ${file.path} is attached below.`, images: [image], summary: 'Image', paths: [file.path] };
    }
    if (file.file_type === 'Pdf') {
      context.onProgress(`Reading ${file.name}…`);
      const info = await pdfPages(file);
      let pages = parsePageList(str(args.pages), info.pageCount);
      if (pages.length === 0) {
        pages = [];
        let length = 0;
        for (const page of info.pages) {
          if (length > READ_LIMIT && pages.length > 0) break;
          pages.push(page.page);
          length += page.text.length || 1500;
        }
      }
      const empty = pages.filter((page) => info.emptyPages.includes(page) || !(info.pages[page - 1]?.text ?? '').trim());
      const ocrText = new Map<number, string>();
      let ocrNote = '';
      if (empty.length > 0) {
        if (canSeeImages(context.visionModel) && context.visionModel) {
          const batch = empty.slice(0, 8);
          context.onProgress(`OCR ${file.name}: ${batch.length} scanned page${batch.length === 1 ? '' : 's'}…`);
          const result = await ocrPages(file, batch, {
            provider: context.visionModel,
            requestId: context.requestId,
            isCancelled: context.isCancelled,
            onProgress: (done, total) => context.onProgress(`OCR ${file.name}: page ${done}/${total}…`),
          });
          result.forEach((value, page) => ocrText.set(page, value));
          if (empty.length > batch.length) ocrNote = `\n[Pages ${empty.slice(batch.length).join(', ')} are scanned too; request them in another call to OCR them.]`;
        } else {
          ocrNote = `\n[Pages ${empty.join(', ')} are scanned images without a text layer. A vision model is needed to read them (Settings → Assistant).]`;
        }
      }
      let used = 0;
      const parts: string[] = [];
      const shown: number[] = [];
      for (const page of pages) {
        const value = ocrText.get(page) ?? info.pages[page - 1]?.text ?? '';
        if (used > READ_LIMIT * 1.4 && shown.length > 0) break;
        used += value.length;
        shown.push(page);
        parts.push(`[Page ${page}${ocrText.has(page) ? ' · OCR' : ''}]\n${value.trim() || '(no text)'}`);
      }
      const last = shown[shown.length - 1] ?? 0;
      const next = last < info.pageCount ? `\n[Showing pages ${shown[0]}–${last} of ${info.pageCount}. Request pages="${last + 1}-${Math.min(info.pageCount, last + 6)}" to continue.]` : `\n[End of document: ${info.pageCount} pages.]`;
      return {
        text: `${file.path}\n\n${parts.join('\n\n')}${ocrNote}${next}`,
        summary: shown.length ? `Pages ${shown[0]}–${last} of ${info.pageCount}${ocrText.size ? ` · OCR ${ocrText.size}` : ''}` : 'Nothing to read',
        paths: [file.path],
      };
    }
    const content = await readText(file.path);
    const start = Math.max(0, Math.min(content.length, num(args.start, 0)));
    const slice = content.slice(start, start + READ_LIMIT);
    const end = start + slice.length;
    const tail = end < content.length ? `\n[Showing characters ${start}–${end} of ${content.length}. Call read_file with start=${end} to continue.]` : '\n[End of file.]';
    return { text: `${file.path}\n\n${slice}${tail}`, summary: `${Math.round(slice.length / 1000)}k characters`, paths: [file.path] };
  },
};

const viewPage: AgentTool = {
  spec: {
    name: 'view_page',
    description: 'Look at a PDF page or an image file as a picture (figures, diagrams, handwriting, tables). Requires a vision model.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        page: { type: 'number', description: 'PDF page number (1-based).' },
      },
      required: ['path'],
    },
  },
  label: (args) => `Viewed ${baseName(str(args.path))}${args.page ? ` · page ${str(args.page)}` : ''}`,
  run: async (args, context) => {
    const file = await requireFile(args.path);
    if (!canSeeImages(context.visionModel)) throw new Error('No vision model is configured, so pages cannot be viewed as images.');
    context.readPaths.add(file.path);
    const image = file.file_type === 'Pdf' ? await renderPdfPage(file.path, Math.max(1, num(args.page, 1))) : await imageFilePart(file.path);
    return { text: `The requested page of ${file.path} is attached below.`, images: [image], summary: 'Page image', paths: [file.path] };
  },
};

const outline: AgentTool = {
  spec: {
    name: 'get_outline',
    description: 'Get the table of contents of a PDF (bookmarks with pages) or the headings of a note with line numbers. Use it to navigate long documents.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  label: (args) => `Outline of ${baseName(str(args.path))}`,
  run: async (args) => {
    const file = await requireFile(args.path);
    if (file.file_type === 'Pdf') {
      const result = await pdfOutline(file.path);
      if (result.entries.length === 0) return { text: `${file.path} has ${result.pageCount} pages and no bookmarks. Use search_workspace with paths=["${file.path}"] or read the first pages to find its structure.`, summary: `${result.pageCount} pages, no bookmarks`, paths: [file.path] };
      const lines = result.entries.map((entry) => `${'  '.repeat(entry.depth)}- ${entry.title}${entry.page ? ` (p. ${entry.page})` : ''}`);
      return { text: `${file.path} · ${result.pageCount} pages\n${lines.join('\n')}`, summary: `${result.entries.length} entries`, paths: [file.path] };
    }
    if (file.file_type === 'Image') throw new Error('Images have no outline.');
    const content = await readText(file.path);
    const entries = textOutline(content, LATEX_EXTENSIONS.includes(extensionOf(file.path)));
    const lines = entries.map((entry) => `${'  '.repeat(entry.depth)}- ${entry.title} (line ${entry.line})`);
    return { text: entries.length ? `${file.path}\n${lines.join('\n')}` : `${file.path} has no headings (${content.length} characters).`, summary: `${entries.length} headings`, paths: [file.path] };
  },
};

const createNote: AgentTool = {
  write: true,
  spec: {
    name: 'create_note',
    description:
      'Create a new note in the notes folder and open it on the canvas. Use Markdown (default) with LaTeX math, or format "latex" for a full LaTeX document. The content can be long.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'File name without extension.' },
        content: { type: 'string', description: 'Full content of the note.' },
        format: { type: 'string', enum: ['markdown', 'latex'], description: 'markdown (default) or latex.' },
        open: { type: 'boolean', description: 'Open the note on the canvas (default true).' },
      },
      required: ['title', 'content'],
    },
  },
  label: (args) => `Created “${str(args.title)}”`,
  run: async (args, context) => {
    await guardWrite(context, '', '', false);
    const title = str(args.title).trim() || 'Untitled';
    const content = str(args.content);
    const latex = str(args.format) === 'latex';
    const shouldOpen = args.open !== false;
    const file = await createNewNote({ title, content, extension: latex ? 'tex' : undefined, near: context.near });
    if (!file) throw new Error('The note could not be created.');
    if (!shouldOpen) {
      const resource = activeWorkspace(useCanvas.getState()).resources.find((r) => r.filePath === file.path);
      if (resource) useCanvas.getState().closeResource(resource.id);
    }
    context.createdPaths.add(file.path);
    context.readPaths.add(file.path);
    return { text: `Created ${file.path} (${content.length} characters).`, summary: file.name, paths: [file.path], undo: { path: file.path, previous: null } };
  },
};

const appendToNote: AgentTool = {
  write: true,
  spec: {
    name: 'append_to_note',
    description: 'Append text to the end of a note, or after the section with the given heading.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        after_heading: { type: 'string', description: 'Insert at the end of the section with this heading instead of the end of the note.' },
      },
      required: ['path', 'content'],
    },
  },
  label: (args) => `Added to ${baseName(str(args.path))}`,
  run: async (args, context) => {
    const file = await requireFile(args.path);
    editableNote(file);
    const addition = str(args.content);
    await guardWrite(context, `Add to ${file.name}?`, addition.slice(0, 400), !context.createdPaths.has(file.path));
    const previous = await loadNote(file.path);
    let next: string;
    const heading = str(args.after_heading).trim();
    if (heading) {
      const lines = previous.split('\n');
      const index = lines.findIndex((line) => /^#{1,6}\s/.test(line) && normalizeForSearch(line.replace(/^#+\s*/, '')).includes(normalizeForSearch(heading)));
      if (index < 0) throw new Error(`No heading "${heading}" in ${file.name}.`);
      const level = /^(#+)/.exec(lines[index])![1].length;
      let end = lines.length;
      for (let i = index + 1; i < lines.length; i += 1) {
        const match = /^(#{1,6})\s/.exec(lines[i]);
        if (match && match[1].length <= level) {
          end = i;
          break;
        }
      }
      lines.splice(end, 0, '', addition.trim(), '');
      next = lines.join('\n').replace(/\n{4,}/g, '\n\n\n');
    } else {
      next = `${previous.replace(/\s+$/, '')}\n\n${addition.trim()}\n`;
    }
    await saveNote(file.path, next);
    return { text: `Added ${addition.length} characters to ${file.path}.`, summary: file.name, paths: [file.path], undo: { path: file.path, previous } };
  },
};

const replaceInNote: AgentTool = {
  write: true,
  spec: {
    name: 'replace_in_note',
    description: 'Replace exact text in a note. "find" must match the note text exactly (copy it from read_file). Use for corrections and targeted edits.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        find: { type: 'string' },
        replace: { type: 'string' },
        all: { type: 'boolean', description: 'Replace every occurrence (default: only the first).' },
      },
      required: ['path', 'find', 'replace'],
    },
  },
  label: (args) => `Edited ${baseName(str(args.path))}`,
  run: async (args, context) => {
    const file = await requireFile(args.path);
    editableNote(file);
    const find = str(args.find);
    if (!find) throw new Error('"find" is empty.');
    const previous = await loadNote(file.path);
    const count = previous.split(find).length - 1;
    if (count === 0) {
      const probe = find.trim().split('\n')[0].slice(0, 40);
      const near = probe ? previous.indexOf(probe) : -1;
      throw new Error(`The text to replace was not found in ${file.name}.${near >= 0 ? ` A similar line exists near character ${near}; read that part again and copy it exactly.` : ' Read the note again and copy the exact text.'}`);
    }
    await guardWrite(context, `Edit ${file.name}?`, `${find.slice(0, 200)}\n→\n${str(args.replace).slice(0, 200)}`, !context.createdPaths.has(file.path));
    const next = args.all === true ? previous.split(find).join(str(args.replace)) : previous.replace(find, () => str(args.replace));
    await saveNote(file.path, next);
    return { text: `Replaced ${args.all === true ? count : 1} occurrence(s) in ${file.path}.`, summary: file.name, paths: [file.path], undo: { path: file.path, previous } };
  },
};

const writeNote: AgentTool = {
  write: true,
  spec: {
    name: 'write_note',
    description: 'Replace the entire content of an existing note. Read the note first. Prefer replace_in_note or append_to_note for small changes.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  },
  label: (args) => `Rewrote ${baseName(str(args.path))}`,
  run: async (args, context) => {
    const file = await requireFile(args.path);
    editableNote(file);
    if (!context.readPaths.has(file.path)) throw new Error(`Read ${file.path} with read_file before rewriting it.`);
    await guardWrite(context, `Rewrite ${file.name}?`, 'The whole note will be replaced. You can undo it from the chat.', !context.createdPaths.has(file.path));
    const previous = await loadNote(file.path);
    await saveNote(file.path, str(args.content));
    return { text: `Rewrote ${file.path}.`, summary: file.name, paths: [file.path], undo: { path: file.path, previous } };
  },
};

const rename: AgentTool = {
  write: true,
  spec: {
    name: 'rename_file',
    description: 'Rename a file in the workspace (the extension is kept).',
    parameters: { type: 'object', properties: { path: { type: 'string' }, new_name: { type: 'string' } }, required: ['path', 'new_name'] },
  },
  label: (args) => `Renamed ${baseName(str(args.path))}`,
  run: async (args, context) => {
    const file = await requireFile(args.path);
    await guardWrite(context, `Rename ${file.name}?`, `New name: ${str(args.new_name)}`, true);
    const renamed = await renameFile(file.path, str(args.new_name));
    if (!renamed) throw new Error('The file could not be renamed.');
    return { text: `Renamed to ${renamed.path}.`, summary: renamed.name, paths: [renamed.path] };
  },
};

const flashcards: AgentTool = {
  write: true,
  spec: {
    name: 'create_flashcards',
    description: 'Add spaced-repetition flashcards. Each card has a focused question (front) and a concise answer (back); use LaTeX for math.',
    parameters: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          items: { type: 'object', properties: { front: { type: 'string' }, back: { type: 'string' } }, required: ['front', 'back'] },
        },
        collection: { type: 'string', description: 'Collection name; created when it does not exist.' },
        source: { type: 'string', description: 'Path of the source file, if any.' },
      },
      required: ['cards'],
    },
  },
  label: (args) => `Created ${Array.isArray(args.cards) ? args.cards.length : 0} flashcards`,
  run: async (args, context) => {
    await guardWrite(context, '', '', false);
    const raw = Array.isArray(args.cards) ? args.cards : [];
    const cards = raw
      .map((card) => (card && typeof card === 'object' ? (card as Record<string, unknown>) : {}))
      .map((card) => ({ front: str(card.front).trim(), back: str(card.back).trim() }))
      .filter((card) => card.front && card.back)
      .slice(0, 200);
    if (cards.length === 0) throw new Error('No valid cards were given.');
    const store = useFlashcards.getState();
    if (!store.hydrated) await store.hydrate();
    const name = str(args.collection).trim();
    let collectionId: string | null = null;
    if (name) {
      const existing = useFlashcards.getState().collections.find((c) => normalizeForSearch(c.name) === normalizeForSearch(name));
      collectionId = existing ? existing.id : useFlashcards.getState().addCollection(name).id;
    }
    const source = str(args.source).trim() || undefined;
    const created = [];
    for (const card of cards) created.push(await createFlashcard(card.front, card.back, collectionId === UNSORTED_ID ? null : collectionId, source));
    useFlashcards.getState().addCards(created);
    return { text: `Created ${created.length} flashcards${name ? ` in "${name}"` : ''}.`, summary: `${created.length} cards${name ? ` · ${name}` : ''}` };
  },
};

const exam: AgentTool = {
  write: true,
  spec: {
    name: 'create_exam',
    description: 'Create a practice exam the learner can take in the Exams tab. Multiple-choice questions need 3-6 options and the correct option text as answer.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        subject: { type: 'string' },
        time_limit_minutes: { type: 'number' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['multiple-choice', 'written'] },
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
              answer: { type: 'string' },
              explanation: { type: 'string' },
            },
            required: ['question', 'answer'],
          },
        },
      },
      required: ['title', 'questions'],
    },
  },
  label: (args) => `Created exam “${str(args.title)}”`,
  run: async (args, context) => {
    await guardWrite(context, '', '', false);
    const raw = Array.isArray(args.questions) ? args.questions : [];
    const questions: ExamQuestion[] = [];
    for (const item of raw) {
      const data = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const question = str(data.question).trim();
      const answer = str(data.answer).trim();
      if (!question || !answer) continue;
      const options = stripLetterPrefixes(strings(data.options));
      if (str(data.type) !== 'written' && options.length >= 2) {
        const correct = resolveAnswer(options, answer);
        if (!correct) continue;
        questions.push({ id: uid(), type: 'multiple-choice', question, options: options.slice(0, 6), correctAnswer: correct, explanation: str(data.explanation) || undefined });
      } else {
        questions.push({ id: uid(), type: 'verbal', question, options: [], correctAnswer: answer, explanation: str(data.explanation) || undefined });
      }
    }
    if (questions.length === 0) throw new Error('No valid questions were given.');
    const store = useExams.getState();
    if (!store.hydrated) await store.hydrate();
    const created: Exam = {
      id: uid(),
      title: str(args.title).trim() || 'Practice exam',
      subject: str(args.subject).trim(),
      description: '',
      questions,
      timeLimit: Math.max(0, Math.round(num(args.time_limit_minutes, 0))),
      showAnswersImmediately: false,
      createdAt: new Date().toISOString(),
      status: 'draft',
    };
    useExams.getState().addExam(created);
    return { text: `Created the exam "${created.title}" with ${questions.length} questions. The learner can take it in the Exams tab.`, summary: `${questions.length} questions` };
  },
};

const openFiles: AgentTool = {
  spec: {
    name: 'open_files',
    description: 'Open files as windows on the canvas, optionally in a new or named workspace, and arrange them.',
    parameters: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } },
        workspace: { type: 'string', description: 'Workspace (canvas) name; created when it does not exist.' },
        layout: { type: 'string', enum: ['columns', 'rows', 'grid'] },
      },
      required: ['paths'],
    },
  },
  label: (args) => `Opened ${strings(args.paths).length} file(s)`,
  run: async (args, context) => {
    const files = await libraryFiles();
    const resolved = strings(args.paths)
      .map((path) => resolvePath(path, files))
      .filter((file): file is StudyFile => Boolean(file));
    if (resolved.length === 0) throw new Error('None of these files exist.');
    const canvas = useCanvas.getState();
    const workspaceName = str(args.workspace).trim();
    if (workspaceName) {
      const existing = canvas.workspaces.find((w) => normalizeForSearch(w.name) === normalizeForSearch(workspaceName));
      if (existing) canvas.switchWorkspace(existing.id);
      else canvas.createWorkspace(workspaceName);
    }
    useApp.getState().setView('canvas');
    for (const file of resolved) openFileOnCanvas(file, { near: context.near });
    const layout = str(args.layout) as ArrangeLayout;
    if (['columns', 'rows', 'grid'].includes(layout)) useCanvas.getState().arrange(layout);
    return { text: `Opened ${resolved.map((file) => file.path).join(', ')}${workspaceName ? ` in workspace "${workspaceName}"` : ''}.`, summary: `${resolved.length} window(s)`, paths: resolved.map((file) => file.path) };
  },
};

const exportNote: AgentTool = {
  write: true,
  spec: {
    name: 'export_note',
    description: 'Export a Markdown note to a LaTeX file (format "latex"), or compile a LaTeX note to PDF (format "pdf", needs a TeX installation).',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, format: { type: 'string', enum: ['latex', 'pdf'] } },
      required: ['path', 'format'],
    },
  },
  label: (args) => `Exported ${baseName(str(args.path))} to ${str(args.format)}`,
  run: async (args, context) => {
    const resolveImage = (target: string) => resolveWorkspaceImage(target, useLibrary.getState().files);
    const file = await requireFile(args.path);
    await guardWrite(context, '', '', false);
    const latexFile = LATEX_EXTENSIONS.includes(extensionOf(file.name));
    if (str(args.format) === 'pdf') {
      let source = file;
      if (!latexFile) {
        const content = await readText(file.path);
        const created = await createNewNote({ title: stripExtension(file.name), content: markdownToLatex(content, { title: stripExtension(file.name), resolveImage }), extension: 'tex', near: context.near });
        if (!created) throw new Error('Could not create the LaTeX file.');
        source = created;
      }
      context.onProgress(`Compiling ${source.name}…`);
      const result = await compileLatex(source.path);
      if (!result.success || !result.pdf) throw new Error(`LaTeX failed (${result.engine}): ${result.issues.map((issue) => `${issue.line ? `line ${issue.line}: ` : ''}${issue.message}`).slice(0, 5).join('; ') || result.log.slice(-400)}`);
      useLibrary.getState().upsert(result.pdf);
      useLibrary.getState().bumpRevision(result.pdf.path);
      openFileOnCanvas(result.pdf, { near: context.near });
      return { text: `Compiled ${source.path} to ${result.pdf.path} with ${result.engine}.`, summary: result.pdf.name, paths: [source.path, result.pdf.path] };
    }
    if (latexFile) throw new Error(`${file.name} is already a LaTeX file.`);
    const content = await readText(file.path);
    const created = await createNewNote({ title: stripExtension(file.name), content: markdownToLatex(content, { title: stripExtension(file.name), resolveImage }), extension: 'tex', near: context.near });
    if (!created) throw new Error('Could not create the LaTeX file.');
    context.createdPaths.add(created.path);
    return { text: `Exported ${file.path} to ${created.path}.`, summary: created.name, paths: [created.path] };
  },
};

const reasoner: AgentTool = {
  spec: {
    name: 'ask_reasoner',
    description:
      'Delegate a demanding reasoning task to the stronger reasoning model: proofs, derivations, checking arguments, Lean proofs to natural-language proofs, paraphrasing papers. Give the full task and all material it needs (or file paths to include). Returns its answer.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Exactly what to do, including output language and format.' },
        material: { type: 'string', description: 'Text the reasoner needs (excerpts, a proof, Lean code…).' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Files to include in full (notes, Lean files, short PDFs).' },
        preset: { type: 'string', enum: ['none', 'lean', 'paraphrase', 'critique', 'verify', 'steps'] },
      },
      required: ['task'],
    },
  },
  label: () => 'Asked the reasoning model',
  run: async (args, context) => {
    const provider = context.reasoningModel;
    if (!provider) throw new Error('No reasoning model is configured.');
    const files = await libraryFiles();
    const blocks: string[] = [];
    let budget = 120_000;
    for (const path of strings(args.paths)) {
      const file = resolvePath(path, files);
      if (!file) continue;
      context.readPaths.add(file.path);
      let content = '';
      if (file.file_type === 'Pdf') {
        const info = await pdfPages(file);
        content = info.pages.map((page) => `[Page ${page.page}]\n${page.text}`).join('\n\n');
      } else if (file.file_type !== 'Image') {
        content = await readText(file.path);
      }
      const slice = content.slice(0, budget);
      budget -= slice.length;
      blocks.push(`<file path="${file.path}"${slice.length < content.length ? ' truncated="true"' : ''}>\n${slice}\n</file>`);
      if (budget <= 0) break;
    }
    const preset = PRESETS[str(args.preset)];
    const material = str(args.material);
    const prompt = [preset ? preset.instruction : '', `Task: ${str(args.task)}`, material ? `Material:\n${material}` : '', ...blocks].filter(Boolean).join('\n\n');
    context.onProgress(`Waiting for ${provider.model}…`);
    const response = await aiTurn({
      model: provider.id,
      requestId: context.requestId,
      reasoning: context.reasoningEffort,
      maxTokens: 16_000,
      messages: [
        { role: 'system', content: [{ type: 'text', text: REASONER_PROMPT }] },
        { role: 'user', content: [{ type: 'text', text: prompt }] },
      ],
    });
    const answer = response.content.trim();
    if (!answer) throw new Error('The reasoning model returned an empty answer.');
    return { text: answer, summary: `${provider.model} · ${estimateTokens(answer)} tokens` };
  },
};

const booklet: AgentTool = {
  write: true,
  spec: {
    name: 'make_booklet',
    description:
      'Turn many source files (PDFs including scanned ones, images, notes) into one well-structured study booklet note. Runs a long multi-step job and creates the note. Use it for "make a booklet / جزوه from these files".',
    parameters: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } },
        title: { type: 'string' },
        instructions: { type: 'string', description: 'Focus, depth, language or exam goals.' },
      },
      required: ['paths', 'title'],
    },
  },
  label: (args) => `Booklet “${str(args.title)}”`,
  run: async (args, context) => {
    await guardWrite(context, '', '', false);
    if (!context.makeBooklet) throw new Error('Booklets are not available here.');
    const files = await libraryFiles();
    const paths = strings(args.paths)
      .map((path) => resolvePath(path, files)?.path)
      .filter((path): path is string => Boolean(path));
    if (paths.length === 0) throw new Error('None of the given files exist.');
    const result = await context.makeBooklet({ paths, title: str(args.title).trim() || 'Study booklet', instructions: str(args.instructions) || undefined });
    context.createdPaths.add(result.path);
    return { text: `Created the booklet ${result.path} with ${result.sections} sections from ${paths.length} files.`, summary: baseName(result.path), paths: [result.path] };
  },
};

const ocrTool: AgentTool = {
  write: true,
  spec: {
    name: 'ocr_file',
    description: 'Transcribe a scanned PDF or image into a new Markdown note with LaTeX formulas (uses the vision model). Use pages to limit the range.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, pages: { type: 'string', description: 'For example "1-20". Default: all pages.' } },
      required: ['path'],
    },
  },
  label: (args) => `OCR ${baseName(str(args.path))}`,
  run: async (args, context) => {
    const file = await requireFile(args.path);
    await guardWrite(context, '', '', false);
    if (!canSeeImages(context.visionModel) || !context.visionModel) throw new Error('OCR needs a vision model. Choose one in Settings → Assistant.');
    let pageCount = 1;
    if (file.file_type === 'Pdf') pageCount = (await pdfPages(file)).pageCount;
    else if (file.file_type !== 'Image') throw new Error('Only PDFs and images can be transcribed.');
    const pages = file.file_type === 'Pdf' ? parsePageList(str(args.pages) || `1-${pageCount}`, pageCount) : [1];
    const result = await ocrPages(file, pages, {
      provider: context.visionModel,
      requestId: context.requestId,
      isCancelled: context.isCancelled,
      onProgress: (done, total) => context.onProgress(`OCR ${file.name}: ${done}/${total} pages…`),
    });
    const body = pages.map((page) => (file.file_type === 'Pdf' ? `<!-- page ${page} -->\n\n${result.get(page) ?? ''}` : result.get(page) ?? '')).join('\n\n---\n\n');
    const note = await createNewNote({ title: `${stripExtension(file.name)} (OCR)`, content: `# ${stripExtension(file.name)}\n\n${body}\n`, near: context.near });
    if (!note) throw new Error('Could not save the transcription.');
    context.createdPaths.add(note.path);
    return { text: `Transcribed ${pages.length} page(s) of ${file.path} into ${note.path}.`, summary: `${pages.length} pages → ${note.name}`, paths: [note.path] };
  },
};

export const AGENT_TOOLS: AgentTool[] = [
  listFiles,
  search,
  readFile,
  viewPage,
  outline,
  createNote,
  appendToNote,
  replaceInNote,
  writeNote,
  rename,
  flashcards,
  exam,
  openFiles,
  exportNote,
  reasoner,
  booklet,
  ocrTool,
];

export function toolsFor(options: { allowWrites: boolean; vision: boolean; reasoner: boolean; booklet: boolean }): AgentTool[] {
  return AGENT_TOOLS.filter((tool) => {
    if (tool.write && !options.allowWrites) return false;
    if (tool.spec.name === 'view_page' && !options.vision) return false;
    if (tool.spec.name === 'ocr_file' && !options.vision) return false;
    if (tool.spec.name === 'ask_reasoner' && !options.reasoner) return false;
    if (tool.spec.name === 'make_booklet' && !options.booklet) return false;
    return true;
  });
}
