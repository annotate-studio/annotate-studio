import type { PdfEngine } from '@embedpdf/models';
import { uid } from './utils';

export type SharedPdfEngine = PdfEngine<Blob>;

const PROBE_PDF =
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 72 72]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';

let enginePromise: Promise<SharedPdfEngine> | null = null;

function wasmUrl(): string {
  return new URL('/pdfium.wasm', window.location.href).href;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function probe(engine: SharedPdfEngine): Promise<void> {
  const content = new TextEncoder().encode(PROBE_PDF).buffer as ArrayBuffer;
  const doc = await withTimeout(
    engine.openDocumentBuffer({ id: `probe-${uid()}`, content }).toPromise(),
    15000,
    'The PDF worker did not respond',
  );
  await engine.closeDocument(doc).toPromise().catch(() => undefined);
}

async function createEngine(): Promise<SharedPdfEngine> {
  const url = wasmUrl();
  let workerEngine: SharedPdfEngine | null = null;
  try {
    const { createPdfiumEngine } = await import('@embedpdf/engines/pdfium-worker-engine');
    workerEngine = createPdfiumEngine(url) as unknown as SharedPdfEngine;
    await probe(workerEngine);
    return workerEngine;
  } catch {
    try {
      workerEngine?.destroy?.();
    } catch {
      workerEngine = null;
    }
    const { createPdfiumEngine } = await import('@embedpdf/engines/pdfium-direct-engine');
    return (await createPdfiumEngine(url)) as unknown as SharedPdfEngine;
  }
}

export function getPdfEngine(): Promise<SharedPdfEngine> {
  if (!enginePromise) {
    enginePromise = createEngine();
    enginePromise.catch(() => {
      enginePromise = null;
    });
  }
  return enginePromise;
}

export interface ExtractedPdfText {
  text: string;
  pageCount: number;
  pagesRead: number;
  truncated: boolean;
}

export async function extractPdfText(bytes: Uint8Array, maxChars = 60_000): Promise<ExtractedPdfText> {
  const engine = await getPdfEngine();
  const content = bytes.slice().buffer as ArrayBuffer;
  const doc = await engine.openDocumentBuffer({ id: `extract-${uid()}`, content }).toPromise();
  try {
    const pageCount = doc.pageCount;
    const parts: string[] = [];
    let length = 0;
    let pagesRead = 0;
    const batchSize = 8;
    for (let start = 0; start < pageCount && length < maxChars; start += batchSize) {
      const indexes = Array.from({ length: Math.min(batchSize, pageCount - start) }, (_, i) => start + i);
      const chunk = await engine.extractText(doc, indexes).toPromise();
      const cleaned = chunk.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (cleaned) {
        parts.push(cleaned);
        length += cleaned.length;
      }
      pagesRead = indexes[indexes.length - 1] + 1;
    }
    const joined = parts.join('\n\n');
    const truncated = joined.length > maxChars || pagesRead < pageCount;
    return { text: joined.slice(0, maxChars), pageCount, pagesRead, truncated };
  } finally {
    await engine.closeDocument(doc).toPromise().catch(() => undefined);
  }
}

export function hasReadableText(text: string): boolean {
  const sample = text.trim().slice(0, 4000);
  if (sample.replace(/\s/g, '').length < 20) return false;
  let printable = 0;
  for (const char of sample) {
    if (char === '�') return false;
    if (char === '\n' || char === '\t' || char === '\r' || char >= ' ') printable += 1;
  }
  return printable / sample.length > 0.95;
}
