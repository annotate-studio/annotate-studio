import {
  aiTurn,
  indexDocument,
  indexGetDocument,
  indexRefresh,
  ocrCacheGet,
  ocrCachePut,
  readFileBytes,
  readTextFile,
  type ContentPart,
  type ProviderInfo,
  type StudyFile,
} from '@/lib/tauri-commands';
import { getPdfEngine } from '@/lib/pdf-engine';
import { baseName, extensionOf, uid } from '@/lib/utils';
import { IMAGE_EXTENSIONS } from '@/lib/workspace-actions';
import { useLibrary } from '@/store/library';
import { useNotes } from '@/store/notes';
import { activeWorkspace, useCanvas } from '@/store/canvas';
import { OCR_PROMPT } from './prompts';

export interface PageText {
  page: number;
  text: string;
}

export interface PdfInfo {
  pages: PageText[];
  pageCount: number;
  emptyPages: number[];
}

const MEDIA: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

export function isPdf(path: string): boolean {
  return extensionOf(path) === 'pdf';
}

export function isImage(path: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(path));
}

export function fileInfo(path: string): StudyFile | undefined {
  return useLibrary.getState().files.find((file) => file.path === path);
}

export async function libraryFiles(): Promise<StudyFile[]> {
  const library = useLibrary.getState();
  const all = library.loaded ? library.files : await library.refresh();
  const workspace = activeWorkspace(useCanvas.getState());
  const allowed = new Set(workspace.filePaths);
  for (const r of workspace.resources) if (r.filePath) allowed.add(r.filePath);
  if (allowed.size === 0 && !useCanvas.getState().hydrated) return all;
  return all.filter((file) => allowed.has(file.path));
}

export function resolvePath(input: string, files: StudyFile[]): StudyFile | undefined {
  const value = input.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  return (
    files.find((file) => file.path === value) ??
    files.find((file) => file.name === value) ??
    files.find((file) => file.path.toLowerCase() === value.toLowerCase()) ??
    files.find((file) => file.name.toLowerCase() === baseName(value).toLowerCase()) ??
    files.find((file) => file.name.toLowerCase().replace(/\.[^.]+$/, '') === baseName(value).toLowerCase().replace(/\.[^.]+$/, ''))
  );
}

export function parsePageList(spec: string | undefined, pageCount: number): number[] {
  if (!spec || !spec.trim()) return [];
  const pages = new Set<number>();
  for (const part of spec.split(/[,\s]+/).filter(Boolean)) {
    const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
    if (range) {
      const from = Math.max(1, Math.min(Number(range[1]), Number(range[2])));
      const to = Math.min(pageCount, Math.max(Number(range[1]), Number(range[2])));
      for (let page = from; page <= to && pages.size < 500; page += 1) pages.add(page);
    } else if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page >= 1 && page <= pageCount) pages.add(page);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

async function openPdf(path: string) {
  const engine = await getPdfEngine();
  const bytes = await readFileBytes(path);
  const content = bytes.slice().buffer as ArrayBuffer;
  const doc = await engine.openDocumentBuffer({ id: `agent-${uid()}`, content }).toPromise();
  return { engine, doc, close: () => engine.closeDocument(doc).toPromise().catch(() => undefined) };
}

export async function extractPdfPages(path: string, onProgress?: (done: number, total: number) => void): Promise<PdfInfo> {
  const { engine, doc, close } = await openPdf(path);
  try {
    const pages: PageText[] = [];
    const emptyPages: number[] = [];
    for (let index = 0; index < doc.pageCount; index += 1) {
      const raw = await engine.extractText(doc, [index]).toPromise();
      const cleaned = raw.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (cleaned.replace(/\s/g, '').length < 25) emptyPages.push(index + 1);
      pages.push({ page: index + 1, text: cleaned });
      if (onProgress && (index % 10 === 0 || index === doc.pageCount - 1)) onProgress(index + 1, doc.pageCount);
    }
    return { pages, pageCount: doc.pageCount, emptyPages };
  } finally {
    await close();
  }
}

let indexing: Promise<void> | null = null;

export async function ensureIndexed(onProgress?: (text: string) => void): Promise<void> {
  if (indexing) return indexing;
  indexing = (async () => {
    const result = await indexRefresh();
    for (let i = 0; i < result.pendingPdfs.length; i += 1) {
      const file = result.pendingPdfs[i];
      onProgress?.(`Indexing ${file.name} (${i + 1}/${result.pendingPdfs.length})…`);
      try {
        const info = await extractPdfPages(file.path);
        const ocr = await ocrCacheGet(file.path, file.modified_at).catch(() => ({}) as Record<string, string>);
        const segments = info.pages
          .map((page) => ({ page: page.page, text: page.text.trim() || ocr[String(page.page)] || '' }))
          .filter((page) => page.text.trim());
        const stillEmpty = info.emptyPages.filter((page) => !ocr[String(page)]);
        await indexDocument(file.path, file.modified_at, segments, info.pageCount, stillEmpty);
      } catch {
        await indexDocument(file.path, file.modified_at, [], 0, []).catch(() => undefined);
      }
    }
  })().finally(() => {
    indexing = null;
  });
  return indexing;
}

export async function pdfPages(file: StudyFile): Promise<PdfInfo> {
  const indexed = await indexGetDocument(file.path).catch(() => null);
  if (indexed && indexed.modified === file.modified_at && indexed.pages) {
    const byPage = new Map<number, string>();
    for (const segment of indexed.segments) {
      if (!segment.page) continue;
      byPage.set(segment.page, `${byPage.get(segment.page) ?? ''}${byPage.has(segment.page) ? '\n\n' : ''}${segment.text}`);
    }
    const pages = Array.from({ length: indexed.pages }, (_, index) => ({ page: index + 1, text: byPage.get(index + 1) ?? '' }));
    return { pages, pageCount: indexed.pages, emptyPages: indexed.emptyPages };
  }
  const info = await extractPdfPages(file.path);
  const ocr = await ocrCacheGet(file.path, file.modified_at).catch(() => ({}) as Record<string, string>);
  const merged = info.pages.map((page) => ({ page: page.page, text: page.text.trim() ? page.text : ocr[String(page.page)] ?? '' }));
  void indexDocument(
    file.path,
    file.modified_at,
    merged.filter((page) => page.text.trim()).map((page) => ({ page: page.page, text: page.text })),
    info.pageCount,
    info.emptyPages.filter((page) => !ocr[String(page)]),
  ).catch(() => undefined);
  return { pages: merged, pageCount: info.pageCount, emptyPages: info.emptyPages.filter((page) => !ocr[String(page)]) };
}

export async function readText(path: string): Promise<string> {
  const buffer = useNotes.getState().buffers[path];
  if (buffer && buffer.status === 'ready') return buffer.content;
  return readTextFile(path);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.slice(value.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });
}

export async function renderPdfPage(path: string, page: number, maxSide = 1600): Promise<ContentPart> {
  const { engine, doc, close } = await openPdf(path);
  try {
    const target = doc.pages[page - 1];
    if (!target) throw new Error(`Page ${page} does not exist (the document has ${doc.pageCount} pages).`);
    const longest = Math.max(target.size.width, target.size.height) || 800;
    const scaleFactor = Math.min(3, Math.max(0.5, maxSide / longest));
    const blob = (await engine
      .renderPage(doc, target, { scaleFactor, dpr: 1, imageType: 'image/jpeg', imageQuality: 0.86, withAnnotations: true } as never)
      .toPromise()) as unknown as Blob;
    return { type: 'image', mediaType: 'image/jpeg', data: await blobToBase64(blob) };
  } finally {
    await close();
  }
}

export async function imageFilePart(path: string, maxSide = 1800): Promise<ContentPart> {
  const bytes = await readFileBytes(path);
  const type = MEDIA[extensionOf(path)] ?? 'image/png';
  const blob = new Blob([bytes as BlobPart], { type });
  if (type === 'image/svg+xml' || typeof createImageBitmap !== 'function') {
    return { type: 'image', mediaType: type, data: await blobToBase64(blob) };
  }
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale >= 1 && bytes.length < 3_500_000 && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) {
    bitmap.close();
    return { type: 'image', mediaType: type, data: await blobToBase64(blob) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the image');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not encode the image'))), 'image/jpeg', 0.86));
  return { type: 'image', mediaType: 'image/jpeg', data: await blobToBase64(jpeg) };
}

export interface OutlineEntry {
  title: string;
  page?: number;
  line?: number;
  depth: number;
}

function bookmarkPage(target: unknown): number | undefined {
  const value = target as { type?: string; destination?: { pageIndex?: number }; action?: { destination?: { pageIndex?: number } } } | undefined;
  const index = value?.destination?.pageIndex ?? value?.action?.destination?.pageIndex;
  return typeof index === 'number' ? index + 1 : undefined;
}

export async function pdfOutline(path: string): Promise<{ entries: OutlineEntry[]; pageCount: number }> {
  const { engine, doc, close } = await openPdf(path);
  try {
    const result = await engine.getBookmarks(doc).toPromise();
    const entries: OutlineEntry[] = [];
    const walk = (items: { title: string; target?: unknown; children?: unknown[] }[], depth: number) => {
      for (const item of items) {
        if (entries.length >= 400) return;
        entries.push({ title: item.title, page: bookmarkPage(item.target), depth });
        if (item.children?.length) walk(item.children as never, depth + 1);
      }
    };
    walk((result.bookmarks ?? []) as never, 0);
    return { entries, pageCount: doc.pageCount };
  } finally {
    await close();
  }
}

export function textOutline(textValue: string, latex: boolean): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  textValue.split('\n').forEach((line, index) => {
    if (latex) {
      const match = /\\(chapter|section|subsection|subsubsection)\*?\{([^}]*)\}/.exec(line);
      if (match) entries.push({ title: match[2], line: index + 1, depth: ['chapter', 'section', 'subsection', 'subsubsection'].indexOf(match[1]) });
      return;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) entries.push({ title: heading[2], line: index + 1, depth: heading[1].length - 1 });
  });
  return entries;
}

export interface OcrOptions {
  provider: ProviderInfo;
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
  requestId?: string;
}

export async function ocrPages(file: StudyFile, pages: number[], options: OcrOptions): Promise<Map<number, string>> {
  const cache = await ocrCacheGet(file.path, file.modified_at).catch(() => ({}) as Record<string, string>);
  const result = new Map<number, string>();
  const missing = pages.filter((page) => {
    const hit = cache[String(page)];
    if (hit !== undefined) result.set(page, hit);
    return hit === undefined;
  });
  let done = pages.length - missing.length;
  options.onProgress?.(done, pages.length);
  const queue = [...missing];
  const worker = async () => {
    while (queue.length > 0) {
      if (options.isCancelled?.()) return;
      const page = queue.shift()!;
      const image = isPdf(file.path) ? await renderPdfPage(file.path, page) : await imageFilePart(file.path);
      const response = await aiTurn({
        model: options.provider.id,
        requestId: options.requestId,
        maxTokens: 4096,
        temperature: 0,
        messages: [
          { role: 'system', content: [{ type: 'text', text: OCR_PROMPT }] },
          { role: 'user', content: [{ type: 'text', text: `Transcribe page ${page} of "${file.name}".` }, image] },
        ],
      });
      const value = response.content.trim();
      result.set(page, value);
      await ocrCachePut(file.path, file.modified_at, page, value).catch(() => undefined);
      done += 1;
      options.onProgress?.(done, pages.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return result;
}
