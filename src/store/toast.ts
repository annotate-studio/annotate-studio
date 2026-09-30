import { create } from 'zustand';
import { errorMessage } from '@/lib/tauri-commands';
import { uid } from '@/lib/utils';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  action?: { label: string; run: () => void };
  duration: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = uid();
    const duration = toast.duration ?? (toast.kind === 'error' ? 7000 : 3500);
    set((state) => ({ toasts: [...state.toasts.slice(-4), { ...toast, id, duration }] }));
    if (duration > 0) setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export const toast = {
  info: (title: string, description?: string) => useToasts.getState().push({ kind: 'info', title, description }),
  success: (title: string, description?: string) => useToasts.getState().push({ kind: 'success', title, description }),
  warning: (title: string, description?: string) => useToasts.getState().push({ kind: 'warning', title, description }),
  error: (title: string, error?: unknown) =>
    useToasts.getState().push({ kind: 'error', title, description: error === undefined ? undefined : errorMessage(error) }),
};
