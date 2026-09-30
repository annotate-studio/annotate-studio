import { create } from 'zustand';
import { uid } from '@/lib/utils';

export interface ConfirmRequest {
  id: string;
  kind: 'confirm';
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (value: boolean) => void;
}

export interface PromptRequest {
  id: string;
  kind: 'prompt';
  title: string;
  message?: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  selectBaseName?: boolean;
  validate?: (value: string) => string | null;
  resolve: (value: string | null) => void;
}

export type DialogRequest = ConfirmRequest | PromptRequest;

interface DialogStore {
  queue: DialogRequest[];
  open: (request: DialogRequest) => void;
  close: () => void;
}

export const useDialogs = create<DialogStore>((set) => ({
  queue: [],
  open: (request) => set((state) => ({ queue: [...state.queue, request] })),
  close: () => set((state) => ({ queue: state.queue.slice(1) })),
}));

export function confirmDialog(options: Omit<ConfirmRequest, 'id' | 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useDialogs.getState().open({ ...options, id: uid(), kind: 'confirm', resolve }));
}

export function promptDialog(options: Omit<PromptRequest, 'id' | 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => useDialogs.getState().open({ ...options, id: uid(), kind: 'prompt', resolve }));
}
