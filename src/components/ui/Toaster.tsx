'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import Portal from './Portal';
import { useToasts, type ToastKind } from '@/store/toast';

const ICONS: Record<ToastKind, React.ReactNode> = {
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  error: <XCircle size={16} />,
};

export default function Toaster() {
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);
  if (toasts.length === 0) return null;
  return (
    <Portal>
      <div className="toaster" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            <span className="toast-icon">{ICONS[toast.kind]}</span>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              {toast.description && <div className="toast-description">{toast.description}</div>}
              {toast.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    toast.action?.run();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </Portal>
  );
}
