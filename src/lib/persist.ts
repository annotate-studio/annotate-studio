type Flushable = () => Promise<void>;

const flushers = new Set<Flushable>();

export interface Saver<T> {
  schedule: (value: T) => void;
  flush: () => Promise<void>;
}

export function createSaver<T>(
  write: (value: T) => Promise<void>,
  delay = 400,
  onError?: (error: unknown) => void,
): Saver<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: { value: T } | null = null;
  let chain: Promise<void> = Promise.resolve();

  const drain = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const job = latest;
    latest = null;
    if (job) {
      chain = chain.then(() => write(job.value)).catch((error) => onError?.(error));
    }
    return chain;
  };

  const saver: Saver<T> = {
    schedule(value) {
      latest = { value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(drain, delay);
    },
    flush: drain,
  };
  flushers.add(saver.flush);
  return saver;
}

export function registerFlusher(flush: Flushable): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

export async function flushAll(): Promise<void> {
  await Promise.allSettled(Array.from(flushers, (flush) => flush()));
}
