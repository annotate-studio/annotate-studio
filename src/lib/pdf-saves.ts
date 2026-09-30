export interface PdfSaver {
  flush: () => Promise<void>;
  discard: () => void;
}

const savers = new Map<string, Set<PdfSaver>>();
const inFlight = new Map<string, Set<Promise<void>>>();

export function registerPdfSaver(path: string, saver: PdfSaver): () => void {
  const set = savers.get(path) ?? new Set<PdfSaver>();
  set.add(saver);
  savers.set(path, set);
  return () => {
    set.delete(saver);
    if (set.size === 0 && savers.get(path) === set) savers.delete(path);
  };
}

export function trackPdfSave(path: string, job: Promise<void>): void {
  const set = inFlight.get(path) ?? new Set<Promise<void>>();
  set.add(job);
  inFlight.set(path, set);
  const done = () => {
    set.delete(job);
    if (set.size === 0 && inFlight.get(path) === set) inFlight.delete(path);
  };
  job.then(done, done);
}

export async function waitForPdfSaves(path: string): Promise<void> {
  const pending = inFlight.get(path);
  if (!pending || pending.size === 0) return;
  await Promise.allSettled(Array.from(pending));
}

export async function flushPdfSaves(path: string): Promise<void> {
  const set = savers.get(path);
  if (set) await Promise.allSettled(Array.from(set).map((saver) => saver.flush()));
  await waitForPdfSaves(path);
}

export function discardPdfSaves(path: string): void {
  for (const saver of savers.get(path) ?? []) saver.discard();
}
