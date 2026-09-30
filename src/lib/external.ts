import { isTauri } from './tauri-commands';
import { isSafeUrl } from './markdown';

export async function openExternal(href: string): Promise<void> {
  if (!isSafeUrl(href)) return;
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(href);
      return;
    } catch {
      return;
    }
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}
