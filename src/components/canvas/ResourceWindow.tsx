'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Grip, Maximize2, Minimize2, FileText, Sparkles } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { useStore, type Resource } from '@/lib/store';
import { getAllFiles, readFileBase64 } from '@/lib/tauri-commands';
import WikiInput from './WikiInput';
import MarkdownRenderer from './MarkdownRenderer';
import TrafficLights from '@/components/ui/TrafficLights';
import Button from '@/components/ui/Button';

const PdfViewer = dynamic(() => import('./PdfViewer'), { ssr: false });

const resourceDotColors: Record<string, string> = { pdf: 'var(--danger)', note: 'var(--primary)', image: 'var(--success)' };

function ResourceContent({ resource }: { resource: Resource }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const setChatbotOpen = useStore((s) => s.setChatbotOpen);
  const setSummarizeTarget = useStore((s) => s.setSummarizeTarget);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = blobUrlRef.current;
    if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
    blobUrlRef.current = blobUrl;
    return () => {
      if (blobUrl?.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
      blobUrlRef.current = null;
    };
  }, [blobUrl]);

  useEffect(() => {
    if (resource.type !== 'pdf' && resource.type !== 'image') return;
    const fp = resource.filePath || resource.content;
    if (!fp) return;
    if (resource.type === 'image' && fp.startsWith('data:')) {
      setBlobUrl(fp);
      return;
    }
    let cancelled = false;

    async function loadFile() {
      const filePath = fp as string;
      readFileBase64(filePath).then((b64) => {
        if (cancelled) return;
        if (resource.type === 'pdf') {
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'application/pdf' });
          setBlobUrl(URL.createObjectURL(blob));
        } else {
          const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
          setBlobUrl(`data:${mime};base64,${b64}`);
        }
      }).catch((err) => { console.error('[ResourceContent] readFileBase64 error:', err); });
    }

    loadFile();
    return () => { cancelled = true; };
  }, [resource.type, resource.filePath, resource.content]);

  if (resource.type === 'pdf') {
    if (!blobUrl) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <div style={{ textAlign: 'center' }}>
            <FileText size={32} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
            <div style={{ fontSize: 12 }}>Loading PDF...</div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <PdfViewer blobUrl={blobUrl} resourceId={resource.filePath || resource.id} onAskAi={(text) => { setChatbotOpen(true); setSummarizeTarget({ content: text || resource.filePath || '', title: resource.title }); }} />
      </div>
    );
  }

  if (resource.type === 'image') {
    if (!blobUrl) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12 }}>Loading image...</div></div>
        </div>
      );
    }
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', background: 'var(--bg-app)' }}>
        <img src={blobUrl} alt={resource.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    );
  }

  return null;
}


function resourceEqual(a: Resource, b: Resource) {
  if (a.id !== b.id || a.type !== b.type || a.title !== b.title || a.state !== b.state) return false;
  if (a.zIndex !== b.zIndex || a.isFullscreen !== b.isFullscreen) return false;
  if (a.content !== b.content || a.filePath !== b.filePath) return false;
  if (a.position.x !== b.position.x || a.position.y !== b.position.y) return false;
  if ((a.size?.width ?? 600) !== (b.size?.width ?? 600)) return false;
  if ((a.size?.height ?? 500) !== (b.size?.height ?? 500)) return false;
  return true;
}

export default React.memo(function ResourceWindow({ resource }: { resource: Resource }) {
  const removeResource = useStore((s) => s.removeResource);
  const toggleResourceState = useStore((s) => s.toggleResourceState);
  const updateResourcePosition = useStore((s) => s.updateResourcePosition);
  const updateResourceSize = useStore((s) => s.updateResourceSize);
  const updateResourceContent = useStore((s) => s.updateResourceContent);
  const selectedResourceId = useStore((s) => s.selectedResourceId);
  const setSelectedResource = useStore((s) => s.setSelectedResource);
  const toggleFullscreen = useStore((s) => s.toggleFullscreen);
  const saveCanvasToDisk = useStore((s) => s.saveCanvasToDisk);
  const setChatbotOpen = useStore((s) => s.setChatbotOpen);
  const setSummarizeTarget = useStore((s) => s.setSummarizeTarget);
  const bringToFront = useStore((s) => s.bringToFront);

  const isSelected = selectedResourceId === resource.id;
  const fullscreen = resource.isFullscreen;
  const w = resource.size?.width || 600;
  const h = resource.size?.height || 500;

  const [noteContent, setNoteContent] = useState(resource.content || '');
  const [notesList, setNotesList] = useState<{ id: string; name: string }[]>([]);
  const [showFileTree, setShowFileTree] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (resource.type === 'note') {
      getAllFiles().then((files) => {
        setNotesList(
          files.filter((f) => f.file_type === 'Markdown').map((f) => ({ id: f.id, name: f.name }))
        );
      }).catch(() => { });
    }
  }, [resource.type]);

  useEffect(() => {
    setNoteContent(resource.content || '');
  }, [resource.content]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (resource.type !== 'note') return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateResourceContent(resource.id, noteContent);
      saveCanvasToDisk();
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [noteContent, resource.id, resource.type, updateResourceContent, saveCanvasToDisk]);

  const onDragStop = useCallback((_e: any, d: { x: number; y: number }) => {
    updateResourcePosition(resource.id, { x: d.x, y: d.y });
    saveCanvasToDisk();
  }, [resource.id, updateResourcePosition, saveCanvasToDisk]);

  const onResizeStop = useCallback(
    (_e: any, _dir: any, ref: HTMLElement, _delta: any, position: { x: number; y: number }) => {
      const nw = parseInt(ref.style.width);
      const nh = parseInt(ref.style.height);
      updateResourceSize(resource.id, { width: nw, height: nh });
      updateResourcePosition(resource.id, { x: position.x, y: position.y });
      saveCanvasToDisk();
    },
    [resource.id, updateResourceSize, updateResourcePosition, saveCanvasToDisk],
  );

  const handleSelect = useCallback(() => {
    setSelectedResource(resource.id);
  }, [resource.id, setSelectedResource]);

  const handleSummarize = useCallback(() => {
    setSummarizeTarget({
      content: noteContent || resource.content || resource.filePath || '',
      title: resource.title,
    });
    setChatbotOpen(true);
  }, [noteContent, resource, setChatbotOpen, setSummarizeTarget]);

  const openNoteFile = useCallback(async (name: string) => {
    try {
      const { readFile } = await import('@/lib/tauri-commands');
      const content = await readFile(`notes/${name}`);
      setNoteContent(content);
    } catch { }
  }, []);

  // ── Fullscreen (no Rnd, flats roundedness) ──────────────────────

  if (fullscreen) {
    return (
      <div style={{
        width: '100%', height: '100%',
        borderRadius: 0,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-card)',
      }}>
        {/* Title bar */}
        <div className="window-handle" style={{
          padding: '8px 16px', display: 'flex', alignItems: 'center',
          cursor: 'default', userSelect: 'none', flexShrink: 0,
          gap: 10, minHeight: 40,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {resource.title}
            </span>
          </div>
          {resource.type === 'pdf' && (
            <button onClick={(e) => { e.stopPropagation(); handleSummarize(); }}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sparkles size={12} /> Summarize
            </button>
          )}
          <TrafficLights
            isFullscreen
            showMaximize
            onAction={(action) => {
              if (action === 'minimize') toggleResourceState(resource.id);
              else if (action === 'maximize') toggleFullscreen(resource.id);
              else if (action === 'close') removeResource(resource.id);
            }}
          />
        </div>

        {/* Content */}
        {resource.type === 'note' && <NoteContent noteContent={noteContent} setNoteContent={setNoteContent} showFileTree={showFileTree} setShowFileTree={setShowFileTree} showPreview={showPreview} setShowPreview={setShowPreview} notesList={notesList} openNoteFile={openNoteFile} handleSummarize={handleSummarize} />}
        {(resource.type === 'pdf' || resource.type === 'image') && <ResourceContent resource={resource} />}
      </div>
    );
  }

  // ── Normal (Rnd) ────────────────────────────────────────────────

  return (
    <Rnd
      position={{ x: resource.position.x, y: resource.position.y }}
      size={{ width: w, height: h }}
      onDragStart={() => bringToFront(resource.id)}
      onDragStop={onDragStop}
      onResizeStart={() => bringToFront(resource.id)}
      onResizeStop={onResizeStop}
      onMouseDown={handleSelect}
      dragHandleClassName="window-handle"
      enableResizing={{
        top: false, right: true, bottom: true, left: false,
        topRight: false, bottomRight: true, bottomLeft: false, topLeft: false,
      }}
      resizeHandleStyles={{
        bottomRight: {
          width: 28, height: 28, bottom: 0, right: 0,
          cursor: 'nwse-resize',
        },
        bottom: { height: 12, bottom: 0, cursor: 'ns-resize' },
        right: { width: 12, right: 0, cursor: 'ew-resize' },
      }}
      resizeHandleComponent={{
        bottomRight: (
          <Grip size={14} style={{ position: 'absolute', bottom: 3, right: 3, color: 'var(--text-muted)', opacity: 0.4 }} />
        ),
      }}
      style={{
        background: 'var(--bg-card)',
        borderRadius: resource.isTiled ? 0 : 'var(--radius-lg)',
        border: resource.isTiled ? 'none' : '1px solid var(--border)',
        zIndex: resource.zIndex,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Traffic light title bar — buttons on the right */}
      <div className="window-handle" style={{
        padding: '8px 16px', display: 'flex', alignItems: 'center',
        cursor: 'grab', userSelect: 'none', flexShrink: 0,
        gap: 10, minHeight: 40,
      }}>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
            {resource.title}
          </span>
        </div>
        {resource.type === 'pdf' && (
          <button onClick={(e) => { e.stopPropagation(); handleSummarize(); }}
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={12} /> Summarize
          </button>
        )}
        <TrafficLights
          showMaximize
          onAction={(action) => {
            if (action === 'minimize') toggleResourceState(resource.id);
            else if (action === 'maximize') toggleFullscreen(resource.id);
            else if (action === 'close') removeResource(resource.id);
          }}
        />
      </div>

      {/* Content */}
      {resource.type === 'note' && <NoteContent noteContent={noteContent} setNoteContent={setNoteContent} showFileTree={showFileTree} setShowFileTree={setShowFileTree} showPreview={showPreview} setShowPreview={setShowPreview} notesList={notesList} openNoteFile={openNoteFile} handleSummarize={handleSummarize} />}
      {(resource.type === 'pdf' || resource.type === 'image') && <ResourceContent resource={resource} />}
    </Rnd>
  );
}, (prev, next) => resourceEqual(prev.resource, next.resource)); // ResourceWindow


// ── Extracted NoteContent to avoid duplication ──────────────────────

function NoteContent({
  noteContent, setNoteContent,
  showFileTree, setShowFileTree,
  showPreview, setShowPreview,
  notesList, openNoteFile, handleSummarize,
}: {
  noteContent: string; setNoteContent: (v: string) => void;
  showFileTree: boolean; setShowFileTree: (v: boolean) => void;
  showPreview: boolean; setShowPreview: (v: boolean) => void;
  notesList: { id: string; name: string }[];
  openNoteFile: (name: string) => Promise<void>;
  handleSummarize: () => void;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {showFileTree && (
        <div style={{
          width: 180, borderRight: '1px solid var(--border)', overflow: 'auto', flexShrink: 0,
          padding: '6px 0', background: 'var(--bg-surface)',
        }}>
          <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
            Notes
          </div>
          {notesList.map((n, index) => (
            <div key={`${n.id}-${index}`}
              onClick={() => openNoteFile(n.name)}
              style={{
                padding: '5px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <FileText size={12} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '4px 12px', borderBottom: '1px solid var(--border)',
            display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0,
          }}>
            <button className="btn btn-ghost" onClick={() => setShowFileTree(!showFileTree)}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 'var(--radius-sm)' }}>
              <FileText size={12} /> {showFileTree ? 'Hide Files' : 'Files'}
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost" onClick={() => setShowPreview(!showPreview)}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 'var(--radius-sm)' }}>
              {showPreview ? <Minimize2 size={12} /> : <Maximize2 size={12} />} {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <button className="btn btn-ghost" onClick={handleSummarize}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 'var(--radius-sm)', color: 'var(--warning)' }}>
              <Sparkles size={12} /> Summarize
            </button>
          </div>
          <WikiInput
            value={noteContent}
            onChange={setNoteContent}
            placeholder="Start writing... use [[ to link files, ` for code, $ for LaTeX"
            style={{ padding: 16 }}
          />
        </div>
        {showPreview && (
          <div className="content-selectable" style={{
            width: '50%', borderLeft: '1px solid var(--border)', overflow: 'auto',
            padding: 20, background: 'var(--bg-app)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Preview
            </div>
            <MarkdownRenderer content={noteContent} />
          </div>
        )}
      </div>
    </div>
  );
}