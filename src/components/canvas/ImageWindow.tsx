'use client';

import React, { memo, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { readFileBytes } from '@/lib/tauri-commands';
import { cn, extensionOf } from '@/lib/utils';

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

function ImageWindow({ path, title }: { path: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualSize, setActualSize] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    readFileBytes(path)
      .then((bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[extensionOf(path)] ?? 'application/octet-stream' }));
        setUrl(objectUrl);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (error) {
    return (
      <div className="cw-state cw-state-error">
        <AlertTriangle size={20} />
        <div>{error}</div>
      </div>
    );
  }
  if (!url) {
    return (
      <div className="cw-state">
        <Loader2 size={18} className="spin" />
      </div>
    );
  }
  return (
    <div
      className={cn('image-window', actualSize && 'image-window-actual')}
      onDoubleClick={() => setActualSize((v) => !v)}
      title={actualSize ? 'Double-click to fit' : 'Double-click for actual size'}
    >
      <img src={url} alt={title} draggable={false} />
    </div>
  );
}

export default memo(ImageWindow);
