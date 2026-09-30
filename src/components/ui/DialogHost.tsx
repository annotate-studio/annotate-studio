'use client';

import React, { useEffect, useRef, useState } from 'react';
import Dialog from './Dialog';
import { useDialogs, type ConfirmRequest, type PromptRequest } from '@/store/dialogs';

function ConfirmBody({ request, done }: { request: ConfirmRequest; done: () => void }) {
  const finish = (value: boolean) => {
    request.resolve(value);
    done();
  };
  return (
    <Dialog
      open
      onClose={() => finish(false)}
      title={request.title}
      width={400}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => finish(false)}>
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            data-autofocus
            className={request.danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => finish(true)}
          >
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </>
      }
    >
      {request.message && <p className="dialog-message">{request.message}</p>}
    </Dialog>
  );
}

function PromptBody({ request, done }: { request: PromptRequest; done: () => void }) {
  const [value, setValue] = useState(request.initialValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    requestAnimationFrame(() => {
      input.focus();
      if (request.selectBaseName) {
        const dot = input.value.lastIndexOf('.');
        input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
      } else {
        input.select();
      }
    });
  }, [request.selectBaseName]);

  const finish = (result: string | null) => {
    request.resolve(result);
    done();
  };

  const submit = () => {
    const trimmed = value.trim();
    const problem = request.validate?.(trimmed) ?? (trimmed ? null : 'Please enter a value');
    if (problem) {
      setError(problem);
      return;
    }
    finish(trimmed);
  };

  return (
    <Dialog
      open
      onClose={() => finish(null)}
      title={request.title}
      width={420}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => finish(null)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            {request.confirmLabel ?? 'Save'}
          </button>
        </>
      }
    >
      {request.message && <p className="dialog-message">{request.message}</p>}
      <label className="field">
        {request.label && <span className="field-label">{request.label}</span>}
        <input
          ref={inputRef}
          className="input"
          value={value}
          placeholder={request.placeholder}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          dir="auto"
        />
      </label>
      {error && <p className="field-error">{error}</p>}
    </Dialog>
  );
}

export default function DialogHost() {
  const request = useDialogs((state) => state.queue[0]);
  const close = useDialogs((state) => state.close);
  if (!request) return null;
  if (request.kind === 'confirm') return <ConfirmBody key={request.id} request={request} done={close} />;
  return <PromptBody key={request.id} request={request} done={close} />;
}
