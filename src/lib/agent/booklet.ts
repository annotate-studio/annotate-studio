import { aiTurn, type ProviderInfo, type StudyFile } from '@/lib/tauri-commands';
import { extractJson } from '@/lib/ai';
import { detectDirection, hasPersianLetters } from '@/lib/bidi';
import { baseName, stripExtension } from '@/lib/utils';
import { createNewNote } from '@/lib/workspace-actions';
import { useNotes } from '@/store/notes';
import { canSeeImages } from './models';
import { isImage, libraryFiles, ocrPages, pdfPages, readText, resolvePath } from './documents';
import { BOOKLET_EXTRACT_PROMPT, BOOKLET_OUTLINE_PROMPT, BOOKLET_REVIEW_PROMPT, BOOKLET_SECTION_PROMPT, fill } from './prompts';

export interface BookletOptions {
  paths: string[];
  title: string;
  instructions?: string;
  provider: ProviderInfo;
  visionProvider?: ProviderInfo;
  requestId: string;
  isCancelled: () => boolean;
  onProgress: (text: string) => void;
  near?: string;
}

interface SourceChunk {
  id: number;
  file: string;
  pages: string;
  text: string;
  notes?: string;
}

const CHUNK_CHARS = 9_000;

function cancelled(options: BookletOptions) {
  if (options.isCancelled()) throw new Error('The request was stopped.');
}

async function ask(options: BookletOptions, system: string, user: string, maxTokens: number): Promise<string> {
  cancelled(options);
  const response = await aiTurn({
    model: options.provider.id,
    requestId: options.requestId,
    temperature: 0.3,
    maxTokens,
    contextWindow: options.provider.capabilities?.contextWindow,
    messages: [
      { role: 'system', content: [{ type: 'text', text: system }] },
      { role: 'user', content: [{ type: 'text', text: user }] },
    ],
  });
  return response.content.trim();
}

async function sourceText(file: StudyFile, options: BookletOptions): Promise<{ page: number | null; text: string }[]> {
  if (file.file_type === 'Pdf') {
    options.onProgress(`Reading ${file.name}…`);
    const info = await pdfPages(file);
    const scanned = info.pages.filter((page) => !page.text.trim()).map((page) => page.page);
    const ocr = new Map<number, string>();
    if (scanned.length > 0) {
      if (!canSeeImages(options.visionProvider) || !options.visionProvider) {
        throw new Error(`${file.name} has ${scanned.length} scanned page(s). Choose a vision model in Settings → Assistant so they can be transcribed.`);
      }
      const result = await ocrPages(file, scanned, {
        provider: options.visionProvider,
        requestId: options.requestId,
        isCancelled: options.isCancelled,
        onProgress: (done, total) => options.onProgress(`OCR ${file.name}: ${done}/${total} pages…`),
      });
      result.forEach((value, page) => ocr.set(page, value));
    }
    return info.pages.map((page) => ({ page: page.page, text: page.text.trim() || ocr.get(page.page) || '' }));
  }
  if (file.file_type === 'Image' || isImage(file.path)) {
    if (!canSeeImages(options.visionProvider) || !options.visionProvider) throw new Error(`${file.name} is an image; a vision model is needed to read it.`);
    options.onProgress(`OCR ${file.name}…`);
    const result = await ocrPages(file, [1], { provider: options.visionProvider, requestId: options.requestId, isCancelled: options.isCancelled });
    return [{ page: null, text: result.get(1) ?? '' }];
  }
  options.onProgress(`Reading ${file.name}…`);
  return [{ page: null, text: await readText(file.path) }];
}

function chunkSource(file: StudyFile, parts: { page: number | null; text: string }[], startId: number): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  let buffer = '';
  let first: number | null = null;
  let last: number | null = null;
  const flush = () => {
    if (!buffer.trim()) return;
    chunks.push({
      id: startId + chunks.length,
      file: file.name,
      pages: first !== null ? (first === last ? `p. ${first}` : `pp. ${first}–${last}`) : '',
      text: buffer.trim(),
    });
    buffer = '';
    first = null;
    last = null;
  };
  for (const part of parts) {
    if (!part.text.trim()) continue;
    const pieces = part.text.length > CHUNK_CHARS ? part.text.match(new RegExp(`[\\s\\S]{1,${CHUNK_CHARS}}`, 'g')) ?? [] : [part.text];
    for (const piece of pieces) {
      if (buffer.length + piece.length > CHUNK_CHARS) flush();
      if (part.page !== null) {
        if (first === null) first = part.page;
        last = part.page;
      }
      buffer += `${buffer ? '\n\n' : ''}${part.page !== null ? `[Page ${part.page}]\n` : ''}${piece}`;
    }
  }
  flush();
  return chunks;
}

interface Outline {
  title?: string;
  sections?: { title?: string; sources?: unknown; focus?: string }[];
}

async function appendToNote(path: string, addition: string) {
  const notes = useNotes.getState();
  if (!notes.buffers[path]) await notes.load(path);
  const current = useNotes.getState().buffers[path]?.content ?? '';
  useNotes.getState().edit(path, `${current.replace(/\s+$/, '')}\n\n${addition.trim()}\n`);
  await useNotes.getState().save(path);
}

export async function makeBooklet(options: BookletOptions): Promise<{ path: string; sections: number }> {
  const files = await libraryFiles();
  const sources = options.paths.map((path) => resolvePath(path, files)).filter((file): file is StudyFile => Boolean(file));
  if (sources.length === 0) throw new Error('None of the selected files exist.');

  const chunks: SourceChunk[] = [];
  for (const file of sources) {
    cancelled(options);
    const parts = await sourceText(file, options);
    chunks.push(...chunkSource(file, parts, chunks.length + 1));
  }
  if (chunks.length === 0) throw new Error('The selected files contain no readable text.');

  const sample = chunks.slice(0, 6).map((chunk) => chunk.text.slice(0, 2000)).join('\n');
  const persian = hasPersianLetters(sample) || detectDirection(options.instructions ?? '') === 'rtl';
  const language = persian ? 'Persian, keeping technical terms and formulas as in the sources' : 'the language of the sources';
  const extra = options.instructions?.trim() ? `\n\nLearner's instructions: ${options.instructions.trim()}` : '';

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    options.onProgress(`Extracting notes ${i + 1}/${chunks.length} · ${chunk.file}…`);
    chunk.notes = await ask(
      options,
      fill(BOOKLET_EXTRACT_PROMPT, { language }),
      `Source: ${chunk.file}${chunk.pages ? `, ${chunk.pages}` : ''}${extra}\n\n${chunk.text}`,
      6_000,
    );
  }

  options.onProgress('Planning the booklet…');
  const digest = chunks
    .map((chunk) => {
      const headings = (chunk.notes ?? '')
        .split('\n')
        .filter((line) => /^#{1,4}\s/.test(line))
        .slice(0, 14)
        .join(' | ');
      const preview = (chunk.notes ?? '').replace(/\s+/g, ' ').slice(0, 500);
      return `[${chunk.id}] ${chunk.file}${chunk.pages ? ` ${chunk.pages}` : ''}: ${headings || preview}`;
    })
    .join('\n');
  const outlineText = await ask(options, fill(BOOKLET_OUTLINE_PROMPT, { language }), `Booklet title: ${options.title}${extra}\n\nNote blocks:\n${digest}`, 4_000);
  const parsed = extractJson<Outline>(outlineText) ?? {};
  let sections = (parsed.sections ?? [])
    .map((section) => ({
      title: String(section.title ?? '').trim(),
      focus: String(section.focus ?? '').trim(),
      sources: (Array.isArray(section.sources) ? section.sources : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= chunks.length),
    }))
    .filter((section) => section.title);
  if (sections.length === 0) {
    sections = chunks.map((chunk) => ({ title: `${stripExtension(chunk.file)}${chunk.pages ? ` (${chunk.pages})` : ''}`, focus: '', sources: [chunk.id] }));
  }
  const covered = new Set(sections.flatMap((section) => section.sources));
  const leftovers = chunks.filter((chunk) => !covered.has(chunk.id)).map((chunk) => chunk.id);
  if (leftovers.length && sections.length) sections[sections.length - 1].sources.push(...leftovers);

  const title = options.title.trim() || parsed.title || 'Study booklet';
  const contents = sections.map((section, index) => `${index + 1}. ${section.title}`).join('\n');
  const sourceList = sources.map((file) => `- ${baseName(file.path)}`).join('\n');
  const header = persian
    ? `# ${title}\n\n> [!abstract] فهرست\n${contents.split('\n').map((line) => `> ${line}`).join('\n')}\n\n> [!note]- منابع\n${sourceList.split('\n').map((line) => `> ${line}`).join('\n')}`
    : `# ${title}\n\n> [!abstract] Contents\n${contents.split('\n').map((line) => `> ${line}`).join('\n')}\n\n> [!note]- Sources\n${sourceList.split('\n').map((line) => `> ${line}`).join('\n')}`;
  const note = await createNewNote({ title, content: `${header}\n`, near: options.near });
  if (!note) throw new Error('Could not create the booklet note.');

  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    options.onProgress(`Writing section ${i + 1}/${sections.length}: ${section.title}…`);
    const material = (section.sources.length ? section.sources : chunks.map((chunk) => chunk.id))
      .map((id) => chunks[id - 1])
      .filter(Boolean)
      .map((chunk) => `<notes source="${chunk.file}${chunk.pages ? ` ${chunk.pages}` : ''}">\n${chunk.notes}\n</notes>`)
      .join('\n\n')
      .slice(0, 60_000);
    const body = await ask(
      options,
      fill(BOOKLET_SECTION_PROMPT, { language }),
      `Booklet: ${title}\nSection ${i + 1} of ${sections.length}: ${section.title}\n${section.focus ? `Focus: ${section.focus}\n` : ''}${extra}\n\nSource notes:\n${material}`,
      8_000,
    );
    await appendToNote(note.path, body.startsWith('## ') ? body : `## ${section.title}\n\n${body}`);
  }

  options.onProgress('Writing the summary and self-test…');
  const outlineSummary = sections.map((section) => `- ${section.title}: ${section.focus}`).join('\n');
  const review = await ask(options, fill(BOOKLET_REVIEW_PROMPT, { language }), `Booklet: ${title}\nSections:\n${outlineSummary}\n\nKey notes:\n${chunks.map((chunk) => chunk.notes ?? '').join('\n\n').slice(0, 40_000)}`, 5_000);
  await appendToNote(note.path, review);
  return { path: note.path, sections: sections.length };
}
