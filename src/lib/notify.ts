import { isTauri } from './tauri-commands';
import { useSettings } from '@/store/settings';

let permission: boolean | null = null;

async function ensurePermission(): Promise<boolean> {
  if (permission !== null) return permission;
  try {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
    permission = (await isPermissionGranted()) || (await requestPermission()) === 'granted';
  } catch {
    permission = false;
  }
  return permission;
}

export async function notify(title: string, body?: string): Promise<void> {
  if (!useSettings.getState().notificationsEnabled) return;
  if (isTauri()) {
    try {
      if (!(await ensurePermission())) return;
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      sendNotification({ title, body });
      return;
    } catch {
      return;
    }
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') new Notification(title, { body });
}
