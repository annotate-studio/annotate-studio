export type WindowKeyHandler = (event: KeyboardEvent, inContent: boolean) => boolean;

const handlers = new Map<string, WindowKeyHandler>();
let contentWindowId: string | null = null;

export function registerWindowKeyHandler(windowId: string, handler: WindowKeyHandler): () => void {
  handlers.set(windowId, handler);
  return () => {
    if (handlers.get(windowId) === handler) handlers.delete(windowId);
  };
}

export function setContentWindow(windowId: string | null): void {
  contentWindowId = windowId;
}

export function isContentWindow(windowId: string | null): boolean {
  return windowId !== null && windowId === contentWindowId;
}

export function dispatchWindowKey(windowId: string | null, event: KeyboardEvent, inContent: boolean): boolean {
  if (!windowId) return false;
  const handler = handlers.get(windowId);
  return handler ? handler(event, inContent) : false;
}
