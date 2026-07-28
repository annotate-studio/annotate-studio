'use client';

import React, {
  useState, useEffect, useRef, forwardRef,
  useImperativeHandle, useCallback, useMemo,
} from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';

import { DocumentManagerPluginPackage, useDocumentManagerCapability, useActiveDocument } from '@embedpdf/plugin-document-manager/react';
import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/react';
import { ScrollPluginPackage, Scroller } from '@embedpdf/plugin-scroll/react';
import { RenderPluginPackage, RenderLayer } from '@embedpdf/plugin-render/react';
import { AnnotationPluginPackage, AnnotationLayer, useAnnotation, useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype, PdfAnnotationLineEnding } from '@embedpdf/models';
import { ZoomPluginPackage, useZoom } from '@embedpdf/plugin-zoom/react';
import { ExportPluginPackage, useExport } from '@embedpdf/plugin-export/react';
import { SelectionPluginPackage, SelectionLayer, useSelectionCapability } from '@embedpdf/plugin-selection/react';
import { InteractionManagerPluginPackage, PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react';

import {
  Pen, Highlighter, Eraser, MousePointer2,
  Square, Circle, ArrowUp, Download, Type,
  ZoomIn, ZoomOut, RotateCcw, Sparkles, Sliders, Trash2, RotateCw, Palette,
} from 'lucide-react';
import ColorPickerDialog from '@/components/ui/ColorPickerDialog';
import Select from '@/components/ui/Select';

export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'rectangle' | 'circle' | 'arrow' | 'text';

export interface PdfViewerHandle {
  exportPdf: () => Promise<Uint8Array | null>;
}

interface PdfViewerProps {
  blobUrl: string;
  resourceId: string;
  onAskAi: (text?: string) => void;
  tool?: Tool;
  onToolChange?: (t: Tool) => void;
  penColor?: string;
  onPenColorChange?: (c: string) => void;
  lineWidth?: number;
  onLineWidthChange?: (w: number) => void;
  filled?: boolean;
  onFilledChange?: (v: boolean) => void;
}

const toolToEmbedId: Record<string, string | null> = {
  select: null,
  pen: 'ink',
  highlighter: 'inkHighlighter',
  rectangle: 'square',
  circle: 'circle',
  arrow: 'lineArrow',
  text: 'freeText',
  eraser: null,
};

const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer(props, ref) {
  const { engine, isLoading, error } = usePdfiumEngine({
    wasmUrl: '/pdfium.wasm',
    worker: false,
  });

  const plugins = useMemo(() => [
    createPluginRegistration(DocumentManagerPluginPackage),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage, { defaultPageGap: 8 }),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(SelectionPluginPackage),
    createPluginRegistration(AnnotationPluginPackage, { annotationAuthor: 'User', selectAfterCreate: false }),
    createPluginRegistration(ZoomPluginPackage),
    createPluginRegistration(ExportPluginPackage, { defaultFileName: 'annotated.pdf' }),
  ], []);

  if (isLoading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', color: 'var(--text-muted)', fontSize: 13 }}>
      Loading PDF Engine...
    </div>
  );

  if (error || !engine) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', color: 'var(--danger)', fontSize: 13 }}>
      Failed to load PDF Engine: {error?.message}
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <EmbedPDF engine={engine} plugins={plugins} autoMountDomElements={false}>
        <PdfViewerInner ref={ref} {...props} />
      </EmbedPDF>
    </div>
  );
});

const PdfViewerInner = React.memo(forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewerInner({
  blobUrl, resourceId, onAskAi,
  tool: externalTool, onToolChange,
  penColor: externalPenColor, onPenColorChange,
  lineWidth: externalLineWidth, onLineWidthChange,
  filled: externalFilled, onFilledChange,
}, ref) {
  const [internalTool, setInternalTool] = useState<Tool>('select');
  const [internalPenColor, setInternalPenColor] = useState('#1a1a1a');
  const [internalLineWidth, setInternalLineWidth] = useState(2);
  const [internalHighlighterWidth, setInternalHighlighterWidth] = useState(12);
  const [internalFilled, setInternalFilled] = useState(true);
  
  const tool = externalTool ?? internalTool;
  const setTool = onToolChange ?? setInternalTool;
  const penColor = externalPenColor ?? internalPenColor;
  const setPenColor = onPenColorChange ?? setInternalPenColor;
  const lineWidth = externalLineWidth ?? internalLineWidth;
  const setLineWidth = onLineWidthChange ?? setInternalLineWidth;
  const highlighterWidth = internalHighlighterWidth;
  const setHighlighterWidth = setInternalHighlighterWidth;
  const filled = externalFilled ?? internalFilled;
  const setFilled = onFilledChange ?? setInternalFilled;

  const safeId = useMemo(() => {
    const raw = resourceId || 'default';
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  }, [resourceId]);

  const docManagerCap = useDocumentManagerCapability();
  const { activeDocumentId } = useActiveDocument();
  
  const exportFnRef = useRef<(() => Promise<Uint8Array | null>) | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    exportPdf: async () => {
      if (exportFnRef.current) return exportFnRef.current();
      return null;
    },
  }));

  useEffect(() => {
    if (!blobUrl || !docManagerCap.provides) return;
    const provides = docManagerCap.provides;
    let cancelled = false;

    (async () => {
      try {
        const resp = await fetch(blobUrl);
        const arrayBuffer = await resp.arrayBuffer();
        if (cancelled) return;

        provides.openDocumentBuffer({
          buffer: arrayBuffer,
          name: safeId,
          autoActivate: true,
        });
      } catch (err) {
        if (!cancelled) console.error('[PdfViewer] load error:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [blobUrl, docManagerCap.provides, safeId]);

  return (
    <>
      {activeDocumentId ? (
        <ActiveToolbar
          documentId={activeDocumentId}
          tool={tool}
          setTool={setTool}
          penColor={penColor}
          setPenColor={setPenColor}
          lineWidth={lineWidth}
          setLineWidth={setLineWidth}
          highlighterWidth={highlighterWidth}
          setHighlighterWidth={setHighlighterWidth}
          filled={filled}
          setFilled={setFilled}
          safeId={safeId}
          exportFnRef={exportFnRef}
        />
      ) : (
        <div style={{ padding: '8px 16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', minHeight: 36 }} />
      )}

      <div ref={viewerRef} style={{
          flex: 1, overflow: 'auto', position: 'relative', background: 'var(--bg-app)',
          cursor: tool === 'select' ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair',
      }}>
        {activeDocumentId ? (
          <DocumentCanvas
            documentId={activeDocumentId}
            tool={tool}
            penColor={penColor}
            lineWidth={lineWidth}
            highlighterWidth={highlighterWidth}
            filled={filled}
            safeId={safeId}
            onAskAi={onAskAi}
            exportFnRef={exportFnRef}
            viewerRef={viewerRef}
          />
        ) : (
          <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
            Initializing Active Document...
          </div>
        )}
      </div>
    </>
  );
}));

function isLightColor(hex: string) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ── Isolated Active Toolbar to safely scope the zoom hook ──
function ActiveToolbar({
  documentId, tool, setTool, penColor, setPenColor, lineWidth, setLineWidth,
  highlighterWidth, setHighlighterWidth, filled, setFilled, safeId, exportFnRef
}: {
  documentId: string;
  tool: Tool; setTool: (t: Tool) => void;
  penColor: string; setPenColor: (c: string) => void;
  lineWidth: number; setLineWidth: (w: number) => void;
  highlighterWidth: number; setHighlighterWidth: (w: number) => void;
  filled: boolean; setFilled: (v: boolean) => void;
  safeId: string;
  exportFnRef: React.MutableRefObject<(() => Promise<Uint8Array | null>) | null>;
}) {
  const { provides: zoomProvides, state: zoomState } = useZoom(documentId);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  return (
    <div style={{
      padding: '4px 10px', display: 'flex', gap: 3, alignItems: 'center',
      borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
      flexShrink: 0, minHeight: 36, position: 'relative', zIndex: 10,
    }}>
      {TOOL_ENTRIES.map(({ id, Icon, label }) => (
        <button key={id} onClick={() => setTool(id)}
          style={{
            padding: '4px 7px', fontSize: 10, borderRadius: 'var(--radius-sm)',
            border: tool === id ? '1px solid var(--primary)' : '1px solid transparent',
            background: tool === id ? 'var(--primary-light)' : 'transparent',
            color: tool === id ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
          }}
          title={label}>
          <Icon size={11} /> {label}
        </button>
      ))}
      
      {tool !== 'select' && tool !== 'eraser' && (
        <>
          <button
            onClick={() => setColorPickerOpen(true)}
            style={{
              width: 20, height: 20, padding: 0, border: 'none', cursor: 'pointer',
              borderRadius: 'var(--radius-xs)', flexShrink: 0,
              background: penColor, position: 'relative',
            }}
            title="Stroke Color"
          >
            <Palette size={10} style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              color: isLightColor(penColor) ? '#333' : '#fff',
              pointerEvents: 'none', opacity: 0.6,
            }} />
          </button>
          <ColorPickerDialog
            open={colorPickerOpen}
            onClose={() => setColorPickerOpen(false)}
            value={penColor}
            onChange={setPenColor}
          />
          {(tool === 'rectangle' || tool === 'circle') && (
            <button
              onClick={() => setFilled(!filled)}
              title={filled ? 'Switch to outline' : 'Switch to filled'}
              style={{
                padding: '2px 5px', fontSize: 10, borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border)', cursor: 'pointer',
                background: filled ? 'var(--primary-light)' : 'transparent',
                color: filled ? 'var(--primary)' : 'var(--text-muted)',
                fontFamily: 'inherit', lineHeight: 1.5,
              }}
            >
              {filled ? 'Fill' : 'Outline'}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
            <Sliders size={11} style={{ color: 'var(--text-muted)' }} />
            {tool === 'highlighter' ? (
              <Select
                value={highlighterWidth}
                onChange={(v) => setHighlighterWidth(Number(v))}
                options={[
                  { value: 4, label: '4px' },
                  { value: 8, label: '8px' },
                  { value: 12, label: '12px' },
                  { value: 18, label: '18px' },
                  { value: 26, label: '26px' },
                ]}
                title="Highlighter Width"
              />
            ) : (
              <Select
                value={lineWidth}
                onChange={(v) => setLineWidth(Number(v))}
                options={[
                  { value: 1, label: '1px' },
                  { value: 2, label: '2px' },
                  { value: 4, label: '4px' },
                  { value: 6, label: '6px' },
                  { value: 10, label: '10px' },
                ]}
                title="Stroke Width"
              />
            )}
          </div>
        </>
      )}
      
      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button onClick={() => zoomProvides?.zoomOut()} disabled={!zoomProvides} style={{ padding: '3px 6px', fontSize: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <ZoomOut size={11} />
        </button>
        <span style={{ fontSize: 10, color: 'var(--text-primary)', width: 34, textAlign: 'center', userSelect: 'none', fontWeight: 500 }}>
          {Math.round((zoomState?.currentZoomLevel || 1) * 100)}%
        </span>
        <button onClick={() => zoomProvides?.zoomIn()} disabled={!zoomProvides} style={{ padding: '3px 6px', fontSize: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <ZoomIn size={11} />
        </button>
        {zoomState?.currentZoomLevel !== 1 && (
          <button onClick={() => zoomProvides?.requestZoom(1)} style={{ padding: '3px 5px', fontSize: 9, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
            <RotateCcw size={10} />
          </button>
        )}
      </div>
      
      <div style={{ flex: 1 }} />
      
      <button onClick={async () => {
        const fn = exportFnRef.current;
        if (!fn) return;
        const data = await fn();
        if (!data) return;
        
        const blob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeId}-annotated.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }}
        style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Download size={11} /> Export
      </button>
    </div>
  );
}

const TOOL_ENTRIES: { id: Tool; Icon: any; label: string }[] = [
  { id: 'select', Icon: MousePointer2, label: 'Select' },
  { id: 'text', Icon: Type, label: 'Text' },
  { id: 'pen', Icon: Pen, label: 'Pen' },
  { id: 'highlighter', Icon: Highlighter, label: 'HL' },
  { id: 'eraser', Icon: Eraser, label: 'Eraser' },
  { id: 'rectangle', Icon: Square, label: 'Rect' },
  { id: 'circle', Icon: Circle, label: 'Circle' },
  { id: 'arrow', Icon: ArrowUp, label: 'Arrow' },
];

// ── Document Canvas & Plugins ──
function DocumentCanvas({
  documentId, tool, penColor, lineWidth, highlighterWidth, filled, safeId, onAskAi, exportFnRef, viewerRef
}: {
  documentId: string;
  tool: Tool;
  penColor: string;
  lineWidth: number;
  highlighterWidth: number;
  filled: boolean;
  safeId: string;
  onAskAi: (t?: string) => void;
  exportFnRef: React.MutableRefObject<(() => Promise<Uint8Array | null>) | null>;
  viewerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { provides: annotationProvides, state: annotationState } = useAnnotation(documentId);
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: exportProvides } = useExport(documentId);
  const { provides: zoomProvides } = useZoom(documentId);
  const { provides: selectionProvides } = useSelectionCapability();

  // Stabilise refs so effects never have unstable provides in their dep arrays
  const annotationProvidesRef = useRef(annotationProvides);
  annotationProvidesRef.current = annotationProvides;
  const annotationCapabilityRef = useRef(annotationCapability);
  annotationCapabilityRef.current = annotationCapability;
  const exportProvidesRef = useRef(exportProvides);
  exportProvidesRef.current = exportProvides;
  const selectionProvidesRef = useRef(selectionProvides);
  selectionProvidesRef.current = selectionProvides;
  const zoomProvidesRef = useRef(zoomProvides);
  zoomProvidesRef.current = zoomProvides;
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync the selected tool to the EmbedPDF annotation provider.
  // Deselect any selected annotation first so switching tools feels clean.
  useEffect(() => {
    const ap = annotationProvidesRef.current;
    if (!ap) return;
    ap.deselectAnnotation();
    ap.setActiveTool(toolToEmbedId[tool] ?? null);
  }, [tool]);

  // Click on the grey viewer background (outside any page) → deselect
  // Skip when clicking on floating menus (Remove / Rotate / context menu)
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const handler = (e: PointerEvent) => {
      const ap = annotationProvidesRef.current;
      if (!ap || !annotationState.selectedUids?.length) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      // Don't deselect when interacting with floating menus or context menus
      if (target.closest('[data-keep-selection]')) return;
      // Walk up from the click target to the viewer — if we hit a page
      // (white background) let the AnnotationLayer handle it.
      let node: Element | null = target;
      while (node && node !== el) {
        const bg = (node as HTMLElement).style?.background;
        if (bg === '#fff' || bg === 'white' || bg === '#ffffff') return;
        node = node.parentElement;
      }
      // Click landed on the grey zone → force deselection
      ap.deselectAnnotation();
    };
    el.addEventListener('pointerdown', handler);
    return () => el.removeEventListener('pointerdown', handler);
  }, [viewerRef, annotationState.selectedUids]);

  const selectedUids = annotationState.selectedUids ?? [];
  const selectedUidsRef = useRef<string[]>([]);
  selectedUidsRef.current = selectedUids;

  // One-time overrides:
  //   - Disable highlighter smart-line-recognition (auto-correction)
  //   - Disable pen commitDelay so each stroke is its own annotation
  useEffect(() => {
    const ac = annotationCapabilityRef.current;
    if (!ac) return;
    ac.addTool({
      id: 'inkHighlighter',
      name: 'Highlighter',
      interaction: { cursor: 'crosshair' },
      matchScore: () => 0,
      defaults: { type: PdfAnnotationSubtype.INK, intent: 'FreeHandHighlight', opacity: 0.4 },
      behavior: { smartLineRecognition: false },
    } as any);
    ac.addTool({
      id: 'ink',
      name: 'Pen',
      interaction: { cursor: 'crosshair' },
      matchScore: () => 0,
      defaults: { type: PdfAnnotationSubtype.INK },
      behavior: { commitDelay: 0 },
    } as any);
    ac.addTool({
      id: 'square',
      name: 'Rectangle',
      interaction: { cursor: 'crosshair' },
      matchScore: () => 0,
      defaults: { type: PdfAnnotationSubtype.SQUARE },
    } as any);
    ac.addTool({
      id: 'circle',
      name: 'Circle',
      interaction: { cursor: 'crosshair' },
      matchScore: () => 0,
      defaults: { type: PdfAnnotationSubtype.CIRCLE },
    } as any);
    ac.addTool({
      id: 'lineArrow',
      name: 'Arrow',
      interaction: { cursor: 'crosshair' },
      matchScore: () => 0,
      defaults: {
        type: PdfAnnotationSubtype.LINE,
        intent: 'LineArrow',
        lineEndings: { start: PdfAnnotationLineEnding.None, end: PdfAnnotationLineEnding.ClosedArrow },
      },
    } as any);
    ac.addTool({
      id: 'freeText',
      name: 'Text',
      interaction: { cursor: 'crosshair' },
      matchScore: () => 0,
      defaults: { type: PdfAnnotationSubtype.FREETEXT },
      behavior: { editAfterCreate: true, selectAfterCreate: true },
    } as any);
  }, []);

  // When penColor / lineWidth / filled changes:
  //   1. Push new defaults so future strokes use them
  //   2. Repaint any currently selected annotations
  useEffect(() => {
    const ac = annotationCapabilityRef.current;
    const ap = annotationProvidesRef.current;
    if (!ac || !ap) return;
    const drawingTools = ['ink', 'square', 'circle', 'lineArrow'];
    for (const toolId of drawingTools) {
      ac.setToolDefaults(toolId, {
        strokeColor: penColor,
        strokeWidth: lineWidth,
      } as any);
    }
    ac.setToolDefaults('inkHighlighter', {
      strokeColor: penColor,
      strokeWidth: highlighterWidth,
      opacity: 0.4,
    } as any);
    const fillColor = filled ? penColor : '#00000000';
    ac.setToolDefaults('square', { color: fillColor } as any);
    ac.setToolDefaults('circle', { color: fillColor } as any);
    ac.setToolDefaults('freeText', {
      fontColor: penColor,
      fontSize: Math.max(8, Math.round(lineWidth * 6)),
    } as any);
    for (const uid of selectedUidsRef.current) {
      const tracked = ap.getAnnotationById(uid);
      if (!tracked) continue;
      if (tracked.object.type === PdfAnnotationSubtype.FREETEXT) {
        ap.updateAnnotation(tracked.object.pageIndex, uid, {
          fontColor: penColor,
          fontSize: Math.max(8, Math.round(lineWidth * 6)),
        } as any);
      } else if (tracked.object.type === PdfAnnotationSubtype.SQUARE || tracked.object.type === PdfAnnotationSubtype.CIRCLE) {
        ap.updateAnnotation(tracked.object.pageIndex, uid, {
          strokeColor: penColor,
          strokeWidth: lineWidth,
          color: fillColor,
        } as any);
      } else if ((tracked.object as any).intent === 'FreeHandHighlight' || (tracked.object as any).intent === 'InkHighlight') {
        ap.updateAnnotation(tracked.object.pageIndex, uid, {
          strokeColor: penColor,
          strokeWidth: highlighterWidth,
          opacity: 0.4,
        } as any);
      } else if (tracked.object.type === PdfAnnotationSubtype.LINE) {
        ap.updateAnnotation(tracked.object.pageIndex, uid, {
          strokeColor: penColor,
          strokeWidth: lineWidth,
          lineEndings: { start: PdfAnnotationLineEnding.None, end: PdfAnnotationLineEnding.ClosedArrow },
        } as any);
      } else {
        ap.updateAnnotation(tracked.object.pageIndex, uid, {
          strokeColor: penColor,
          strokeWidth: lineWidth,
        } as any);
      }
    }
  }, [penColor, lineWidth, highlighterWidth, filled]);

  // Eraser mode: delete all selected annotations immediately
  useEffect(() => {
    if (tool !== 'eraser') return;
    const ap = annotationProvidesRef.current;
    if (!ap) return;
    const uids = selectedUidsRef.current;
    if (uids.length === 0) return;
    for (const uid of uids) {
      const tracked = ap.getAnnotationById(uid);
      if (tracked) {
        ap.deleteAnnotation(tracked.object.pageIndex, uid);
      }
    }
  }, [tool, selectedUids]);

  useEffect(() => {
    const ep = exportProvidesRef.current;
    if (!ep) return;
    exportFnRef.current = async () => {
      try {
        const task = ep.saveAsCopy();
        const arrayBuffer = typeof (task as any).toPromise === 'function' ? await (task as any).toPromise() : await task;
        return new Uint8Array(arrayBuffer as ArrayBuffer);
      } catch (err) {
        console.error('[PdfViewer] Export failed:', err);
        return null;
      }
    };
    return () => { exportFnRef.current = null; };
  }, [exportFnRef]);

  useEffect(() => {
    const sp = selectionProvidesRef.current;
    if (!sp) return;

    const onEnd = sp.onEndSelection((event: any) => {
      if (event.documentId !== documentId || tool !== 'select') return;
      setTimeout(async () => {
        try {
          const task = sp.getSelectedText(documentId);
          const rawTexts = typeof (task as any).toPromise === 'function' ? await (task as any).toPromise() : await task;
          const texts = Array.isArray(rawTexts) ? rawTexts : [String(rawTexts || '')];
          const text = texts.join('\n').trim();
          if (!text) return;

          const rects = sp.getHighlightRects(documentId);
          const pageRects = Object.values(rects || {})[0] as any[];
          
          if (pageRects && pageRects.length > 0) {
            const first = pageRects[0];
            setContextMenu({ x: first.x || 0, y: (first.y || 0) + (first.height || 0) + 4, text });
          } else {
            setContextMenu({ x: 0, y: 0, text });
          }
        } catch { console.warn('[PdfViewer] selection error'); }
      }, 50);
    });

    const onChange = sp.onSelectionChange((event: any) => {
      if (event.documentId !== documentId) return;
      if (!event.selection) setContextMenu(null);
    });

    return () => { onEnd(); onChange(); };
  }, [documentId, tool]);

  // Ctrl+MouseWheel zoom
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const zp = zoomProvidesRef.current;
      if (!zp) return;
      if (e.deltaY < 0) zp.zoomIn();
      else zp.zoomOut();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [viewerRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAskAi = useCallback(() => {
    if (!contextMenu) return;
    onAskAi(contextMenu.text);
    setContextMenu(null);
    selectionProvides?.clear(documentId);
  }, [contextMenu, onAskAi, selectionProvides, documentId]);

  return (
    <>
      <Viewport documentId={documentId}>
        <Scroller 
          documentId={documentId} 
          renderPage={(page: { pageIndex: number; width: number; height: number }) => (
            <PagePointerProvider key={page.pageIndex} documentId={documentId} pageIndex={page.pageIndex}>
              <div style={{
                position: 'relative', width: page.width, height: page.height,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)', margin: '0 auto', background: '#fff',
              }}>
                <RenderLayer documentId={documentId} pageIndex={page.pageIndex} style={{ pointerEvents: 'none' }} />
                <div style={{ pointerEvents: tool === 'select' ? undefined : 'none' }}>
                  <SelectionLayer documentId={documentId} pageIndex={page.pageIndex} />
                  <AnnotationLayer documentId={documentId} pageIndex={page.pageIndex} selectionOutlineColor="#2563EB" />
                </div>
              </div>
            </PagePointerProvider>
          )} 
        />
      </Viewport>

      {/* Floating Action Menu for Selected Annotations */}
      {selectedUids.length > 0 && (
        <div data-keep-selection style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1100,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '6px 12px', display: 'flex', gap: 8,
          alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', color: 'var(--text-inverse)', fontSize: 11,
        }}>
          <span style={{ fontWeight: 500, marginRight: 4, color: 'var(--text-secondary)' }}>
            {selectedUids.length} selected
          </span>
          <button
            onClick={() => {
              const ap = annotationProvidesRef.current;
              if (!ap) return;
              for (const uid of selectedUidsRef.current) {
                const tracked = ap.getAnnotationById(uid);
                if (!tracked) continue;
                const cur = (tracked.object as any).rotation ?? 0;
                ap.updateAnnotation(tracked.object.pageIndex, uid, { rotation: cur + 90 } as any);
              }
            }}
            style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
              padding: '4px 8px', color: 'var(--text-inverse)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
            }}
            title="Rotate 90°"
          >
            <RotateCw size={12} /> Rotate
          </button>
          <button
            onClick={() => {
              const ap = annotationProvidesRef.current;
              if (!ap) return;
              for (const uid of selectedUidsRef.current) {
                const tracked = ap.getAnnotationById(uid);
                if (!tracked) continue;
                ap.deleteAnnotation(tracked.object.pageIndex, uid);
              }
            }}
            style={{
              background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-xs)',
              padding: '4px 8px', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
            }}
            title="Remove Annotation"
          >
            <Trash2 size={12} /> Remove
          </button>
        </div>
      )}

      {contextMenu && (
        <div ref={menuRef} data-keep-selection style={{
          position: 'absolute', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: 4, minWidth: 140,
          boxShadow: '0 4px 16px var(--bg-overlay)',
        }}>
          <button onClick={handleAskAi}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              padding: '6px 12px', fontSize: 12, border: 'none',
              borderRadius: 'var(--radius-sm)', background: 'transparent',
              color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit',
            }}>
            <Sparkles size={13} /> Ask AI
          </button>
          <button onClick={() => { setContextMenu(null); selectionProvides?.clear(documentId); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              padding: '6px 12px', fontSize: 12, border: 'none',
              borderRadius: 'var(--radius-sm)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit',
            }}>
            Clear Selection
          </button>
        </div>
      )}
    </>
  );
}

export default PdfViewer;