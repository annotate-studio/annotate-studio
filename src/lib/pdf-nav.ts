type JumpListener = (page: number) => void;

const listeners = new Map<string, Set<JumpListener>>();
const pending = new Map<string, number>();

export function parsePageFragment(target: string): number | null {
  const hashIndex = target.indexOf('#');
  if (hashIndex < 0) return null;
  const fragment = target.slice(hashIndex + 1).trim();
  const match = /^(?:p(?:age)?=?)(\d+)$/i.exec(fragment);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

export function requestPdfPageJump(path: string, page: number) {
  const subs = listeners.get(path);
  if (subs && subs.size > 0) {
    for (const cb of subs) cb(page);
  } else {
    pending.set(path, page);
  }
}

export function subscribePdfPageJump(path: string, cb: JumpListener): () => void {
  let set = listeners.get(path);
  if (!set) {
    set = new Set();
    listeners.set(path, set);
  }
  set.add(cb);
  const queued = pending.get(path);
  if (queued !== undefined) {
    pending.delete(path);
    setTimeout(() => cb(queued), 120);
  }
  return () => {
    set?.delete(cb);
    if (set && set.size === 0) listeners.delete(path);
  };
}
