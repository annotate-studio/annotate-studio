'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF, useDocumentState } from '@embedpdf/core/react';
import { DocumentManagerPluginPackage, useActiveDocument, useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { Scroller, ScrollPluginPackage, useScroll } from '@embedpdf/plugin-scroll/react';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { InteractionManagerPluginPackage, PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { SelectionLayer, SelectionPluginPackage, useSelectionCapability } from '@embedpdf/plugin-selection/react';
import { AnnotationLayer, AnnotationPluginPackage, useAnnotation, useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { LockModeType } from '@embedpdf/plugin-annotation';
import { HistoryPluginPackage, useHistoryCapability } from '@embedpdf/plugin-history/react';
import { useZoom, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react';
import { ZoomMode } from '@embedpdf/plugin-zoom';
import { ExportPluginPackage, useExport } from '@embedpdf/plugin-export/react';
import {
  PdfAnnotationSubtype,
  restorePosition,
  transformSize,
  type PdfAnnotationObject,
  type Position,
  type Rotation,
} from '@embedpdf/models';
import {
  AlertTriangle,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  Eraser,
  Highlighter,
  Loader2,
  MessageSquareText,
  MousePointer2,
  MoveUpRight,
  Pen,
  PenLine,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import Popover from '@/components/ui/Popover';
import ColorSwatches from '@/components/ui/ColorSwatches';
import { getPdfEngine, type SharedPdfEngine } from '@/lib/pdf-engine';
import { isTauri, readFileBytes, writeFileBytes } from '@/lib/tauri-commands';
import { registerFlusher } from '@/lib/persist';
import { registerPdfSaver, trackPdfSave, waitForPdfSaves } from '@/lib/pdf-saves';
import { openExternal } from '@/lib/external';
import { registerWindowKeyHandler } from '@/lib/window-keys';
import { copyText, cn, isEditableTarget, stripExtension } from '@/lib/utils';
import { activeWorkspace, useCanvas } from '@/store/canvas';
import { useApp } from '@/store/app';
import { useLibrary } from '@/store/library';
import { toast } from '@/store/toast';

type Tool = 'select' | 'highlight' | 'pen' | 'marker' | 'text' | 'rectangle' | 'circle' | 'arrow' | 'eraser';

const TOOL_IDS: Record<Tool, string | null> = {
  select: null,
  highlight: 'highlight',
  pen: 'ink',
  marker: 'inkHighlighter',
  text: 'freeText',
  rectangle: 'square',
  circle: 'circle',
  arrow: 'lineArrow',
  eraser: null,
};

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; key: string }[] = [
  { id: 'select', label: 'Select (V)', icon: <MousePointer2 size={14} />, key: 'v' },
  { id: 'highlight', label: 'Highlight text (H)', icon: <Highlighter size={14} />, key: 'h' },
  { id: 'pen', label: 'Pen (P)', icon: <Pen size={14} />, key: 'p' },
  { id: 'marker', label: 'Marker (M)', icon: <PenLine size={14} />, key: 'm' },
  { id: 'text', label: 'Text (T)', icon: <Type size={14} />, key: 't' },
  { id: 'rectangle', label: 'Rectangle (R)', icon: <Square size={14} />, key: 'r' },
  { id: 'circle', label: 'Ellipse (O)', icon: <Circle size={14} />, key: 'o' },
  { id: 'arrow', label: 'Arrow (A)', icon: <MoveUpRight size={14} />, key: 'a' },
  { id: 'eraser', label: 'Eraser (E)', icon: <Eraser size={14} />, key: 'e' },
];

const STROKE_WIDTHS = [1, 2, 3, 5, 8, 12];

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface PdfWindowProps {
  resourceId: string;
  path: string;
  title: string;
  active: boolean;
}

function usePdfPlugins() {
  return useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, { maxDocuments: 1 }),
      createPluginRegistration(ViewportPluginPackage, { viewportGap: 16 }),
      createPluginRegistration(ScrollPluginPackage, { defaultPageGap: 14 }),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(HistoryPluginPackage),
      createPluginRegistration(AnnotationPluginPackage, {
        annotationAuthor: 'Annotate Studio',
        selectAfterCreate: false,
        autoOpenLinks: false,
        locked: { type: LockModeType.Include, categories: ['link'] },
        tools: [
          { id: 'freeText', behavior: { editAfterCreate: true, selectAfterCreate: true } },
          { id: 'link', categories: ['link'] },
        ],
      }),
      createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: ZoomMode.FitWidth, minZoom: 0.2, maxZoom: 6 }),
      createPluginRegistration(ExportPluginPackage, { defaultFileName: 'annotated.pdf' }),
    ],
    [],
  );
}

function PdfWindow({ resourceId, path, title, active }: PdfWindowProps) {
  const [engine, setEngine] = useState<SharedPdfEngine | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plugins = usePdfPlugins();

  useEffect(() => {
    let cancelled = false;
    getPdfEngine()
      .then((instance) => !cancelled && setEngine(instance))
      .catch((err) => !cancelled && setError(`The PDF engine could not start: ${err instanceof Error ? err.message : String(err)}`));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBytes(null);
    setError(null);
    waitForPdfSaves(path)
      .then(() => readFileBytes(path))
      .then((data) => {
        if (cancelled) return;
        setBytes(data.slice().buffer as ArrayBuffer);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (error) {
    return (
      <div className="cw-state cw-state-error">
        <AlertTriangle size={22} />
        <div>{error}</div>
      </div>
    );
  }
  if (!engine || !bytes) {
    return (
      <div className="cw-state">
        <Loader2 size={20} className="spin" />
        <div>Opening {title}…</div>
      </div>
    );
  }
  return (
    <EmbedPDF engine={engine} plugins={plugins} autoMountDomElements={false}>
      <PdfDocument resourceId={resourceId} path={path} title={title} active={active} bytes={bytes} />
    </EmbedPDF>
  );
}

function PdfDocument({ resourceId, path, title, active, bytes }: PdfWindowProps & { bytes: ArrayBuffer }) {
  const { provides: manager } = useDocumentManagerCapability();
  const { activeDocumentId } = useActiveDocument();
  const [loadError, setLoadError] = useState<string | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!manager || openedRef.current) return;
    openedRef.current = true;
    const task = manager.openDocumentBuffer({ buffer: bytes, name: stripExtension(title), autoActivate: true });
    task.wait(
      (result) =>
        result.task.wait(
          () => undefined,
          (failure) => setLoadError(failure.reason?.message ?? 'This PDF could not be opened. It may be damaged or password protected.'),
        ),
      (failure) => setLoadError(failure.reason?.message ?? 'This PDF could not be opened.'),
    );
  }, [manager, bytes, title]);

  if (loadError) {
    return (
      <div className="cw-state cw-state-error">
        <AlertTriangle size={22} />
        <div>{loadError}</div>
      </div>
    );
  }
  if (!activeDocumentId) {
    return (
      <div className="cw-state">
        <Loader2 size={20} className="spin" />
        <div>Loading pages…</div>
      </div>
    );
  }
  return <PdfWorkspace documentId={activeDocumentId} resourceId={resourceId} path={path} title={title} active={active} />;
}

function useAutosave(documentId: string, path: string) {
  const { provides: exporter } = useExport(documentId);
  const { provides: annotations } = useAnnotation(documentId);
  const [state, setState] = useState<SaveState>('idle');
  const dirty = useRef(false);
  const discarded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saving = useRef<Promise<void> | null>(null);
  const exporterRef = useRef(exporter);
  exporterRef.current = exporter;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    if (saving.current) await saving.current.catch(() => undefined);
    if (discarded.current || !dirty.current || !exporterRef.current) return;
    dirty.current = false;
    setState('saving');
    const job = (async () => {
      try {
        await annotationsRef.current?.commit().toPromise();
        const buffer = await exporterRef.current!.saveAsCopy().toPromise();
        if (discarded.current) return;
        const file = await writeFileBytes({ path }, buffer);
        useLibrary.getState().upsert(file);
        setState('saved');
      } catch (error) {
        dirty.current = true;
        setState('error');
        toast.error('Could not save annotations', error);
      }
    })();
    saving.current = job;
    trackPdfSave(path, job);
    await job;
    saving.current = null;
  }, [path]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    setState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1500);
  }, [save]);

  useEffect(() => {
    if (!annotations) return;
    return annotations.onAnnotationEvent((event) => {
      if (event.type !== 'loaded' && event.committed) markDirty();
    });
  }, [annotations, markDirty]);

  useEffect(() => registerFlusher(save), [save]);
  useEffect(
    () =>
      registerPdfSaver(path, {
        flush: save,
        discard: () => {
          discarded.current = true;
          dirty.current = false;
          if (timer.current) clearTimeout(timer.current);
          timer.current = undefined;
        },
      }),
    [path, save],
  );
  useEffect(
    () => () => {
      if (dirty.current) void save();
    },
    [save],
  );

  return { state, save };
}

function useCanvasZoom(): number {
  const zoom = useCanvas((state) => activeWorkspace(state).view.zoom);
  const [settled, setSettled] = useState(zoom);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(zoom), 350);
    return () => clearTimeout(timer);
  }, [zoom]);
  return settled;
}

function ScaledPage({
  documentId,
  pageIndex,
  children,
  dpr,
}: {
  documentId: string;
  pageIndex: number;
  children: React.ReactNode;
  dpr: number;
}) {
  const documentState = useDocumentState(documentId);
  const page = documentState?.document?.pages?.[pageIndex];
  const scale = documentState?.scale ?? 1;
  const rotation = (((page?.rotation ?? 0) + (documentState?.rotation ?? 0)) % 4) as Rotation;
  const natural = page?.size ?? { width: 0, height: 0 };

  const convert = useCallback(
    (event: PointerEvent, element: HTMLElement): Position => {
      const rect = element.getBoundingClientRect();
      const cssScaleX = element.offsetWidth ? rect.width / element.offsetWidth : 1;
      const cssScaleY = element.offsetHeight ? rect.height / element.offsetHeight : 1;
      const point = {
        x: (event.clientX - rect.left) / (cssScaleX || 1),
        y: (event.clientY - rect.top) / (cssScaleY || 1),
      };
      const display = transformSize(natural, 0, scale);
      return restorePosition(transformSize(display, rotation, 1), point, rotation, scale);
    },
    [natural, rotation, scale],
  );

  return (
    <PagePointerProvider documentId={documentId} pageIndex={pageIndex} convertEventToPoint={convert} className="pdf-page">
      <RenderLayer documentId={documentId} pageIndex={pageIndex} dpr={dpr} style={{ pointerEvents: 'none' }} />
      {children}
    </PagePointerProvider>
  );
}

function PdfWorkspace({ documentId, resourceId, path, title, active }: Omit<PdfWindowProps, 'bytes'> & { documentId: string }) {
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#E44234');
  const [highlightColor, setHighlightColor] = useState('#FFCD45');
  const [width, setWidth] = useState(3);
  const [colorOpen, setColorOpen] = useState(false);
  const colorAnchor = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const { provides: annotationScope, state: annotationState } = useAnnotation(documentId);
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: selection } = useSelectionCapability();
  const { provides: history } = useHistoryCapability();
  const { provides: zoom, state: zoomState } = useZoom(documentId);
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const documentState = useDocumentState(documentId);
  const { provides: exporter } = useExport(documentId);
  const { state: saveState, save } = useAutosave(documentId, path);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const maximized = useCanvas((state) => activeWorkspace(state).resources.find((r) => r.id === resourceId)?.maximized ?? false);
  const canvasZoom = useCanvasZoom();
  const [pageInput, setPageInput] = useState('');

  const baseDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const dpr = maximized ? baseDpr : Math.min(4, Math.round(baseDpr * Math.max(1, canvasZoom) * 2) / 2);

  const selectedUids = useMemo(() => annotationState?.selectedUids ?? [], [annotationState?.selectedUids]);
  const layerZoom = maximized ? 1 : canvasZoom;
  const layerScale = (documentState?.scale ?? 1) * layerZoom;

  useEffect(() => {
    annotationScope?.setActiveTool(TOOL_IDS[tool]);
  }, [annotationScope, tool]);

  useEffect(() => {
    if (!annotationCapability) return;
    for (const id of ['ink', 'square', 'circle', 'lineArrow', 'line']) {
      annotationCapability.setToolDefaults(id, { strokeColor: color, color: id === 'ink' ? color : 'transparent', strokeWidth: width } as never);
    }
    annotationCapability.setToolDefaults('inkHighlighter', { strokeColor: highlightColor, color: highlightColor, strokeWidth: Math.max(8, width * 4) } as never);
    annotationCapability.setToolDefaults('highlight', { strokeColor: highlightColor, color: highlightColor } as never);
    annotationCapability.setToolDefaults('freeText', { fontColor: color, fontSize: Math.max(10, Math.round(8 + width * 2)) } as never);
  }, [annotationCapability, color, highlightColor, width]);

  useEffect(() => {
    if (tool !== 'eraser' || !annotationScope || selectedUids.length === 0) return;
    const targets = selectedUids
      .map((uid) => annotationScope.getAnnotationById(uid))
      .filter((tracked): tracked is NonNullable<typeof tracked> => tracked !== null)
      .map((tracked) => ({ pageIndex: tracked.object.pageIndex, id: tracked.object.id }));
    if (targets.length) annotationScope.deleteAnnotations(targets);
  }, [tool, selectedUids, annotationScope]);

  useEffect(() => {
    if (!annotationCapability) return;
    return annotationCapability.onNavigate((event) => {
      if (event.documentId === documentId && event.result.outcome === 'uri') void openExternal(event.result.uri);
    });
  }, [annotationCapability, documentId]);

  useEffect(() => {
    if (!history) return;
    const scope = history.forDocument(documentId);
    const refresh = () => setHistoryState({ canUndo: scope.canUndo(), canRedo: scope.canRedo() });
    refresh();
    return scope.onHistoryChange(refresh);
  }, [history, documentId]);

  const applyToSelection = useCallback(
    (patch: (annotation: PdfAnnotationObject) => Partial<PdfAnnotationObject> | null) => {
      if (!annotationScope || selectedUids.length === 0) return;
      const patches = selectedUids
        .map((uid) => annotationScope.getAnnotationById(uid))
        .filter((tracked): tracked is NonNullable<typeof tracked> => tracked !== null)
        .map((tracked) => ({ pageIndex: tracked.object.pageIndex, id: tracked.object.id, patch: patch(tracked.object) }))
        .filter((entry): entry is { pageIndex: number; id: string; patch: Partial<PdfAnnotationObject> } => entry.patch !== null);
      if (patches.length) annotationScope.updateAnnotations(patches);
    },
    [annotationScope, selectedUids],
  );

  const changeColor = (next: string) => {
    const isHighlightTool = tool === 'highlight' || tool === 'marker';
    if (isHighlightTool) setHighlightColor(next);
    else setColor(next);
    applyToSelection((annotation) => {
      switch (annotation.type) {
        case PdfAnnotationSubtype.HIGHLIGHT:
        case PdfAnnotationSubtype.UNDERLINE:
        case PdfAnnotationSubtype.STRIKEOUT:
        case PdfAnnotationSubtype.SQUIGGLY:
          return { strokeColor: next, color: next } as Partial<PdfAnnotationObject>;
        case PdfAnnotationSubtype.FREETEXT:
          return { fontColor: next } as Partial<PdfAnnotationObject>;
        case PdfAnnotationSubtype.INK:
          return { strokeColor: next, color: next } as Partial<PdfAnnotationObject>;
        default:
          return { strokeColor: next } as Partial<PdfAnnotationObject>;
      }
    });
  };

  const changeWidth = (next: number) => {
    setWidth(next);
    applyToSelection((annotation) =>
      annotation.type === PdfAnnotationSubtype.INK ||
      annotation.type === PdfAnnotationSubtype.SQUARE ||
      annotation.type === PdfAnnotationSubtype.CIRCLE ||
      annotation.type === PdfAnnotationSubtype.LINE
        ? ({ strokeWidth: next } as Partial<PdfAnnotationObject>)
        : null,
    );
  };

  const deleteSelected = useCallback(() => {
    if (!annotationScope || selectedUids.length === 0) return false;
    const targets = selectedUids
      .map((uid) => annotationScope.getAnnotationById(uid))
      .filter((tracked): tracked is NonNullable<typeof tracked> => tracked !== null)
      .map((tracked) => ({ pageIndex: tracked.object.pageIndex, id: tracked.object.id }));
    annotationScope.deleteAnnotations(targets);
    return true;
  }, [annotationScope, selectedUids]);

  const undo = useCallback(() => history?.forDocument(documentId).undo(), [history, documentId]);
  const redo = useCallback(() => history?.forDocument(documentId).redo(), [history, documentId]);

  const selectedText = useCallback(async () => {
    if (!selection) return '';
    const parts = await selection.getSelectedText(documentId).toPromise();
    return parts.join('\n').trim();
  }, [selection, documentId]);

  const clearSelection = useCallback(() => selection?.clear(documentId), [selection, documentId]);

  const markupSelection = useCallback(
    (subtype: PdfAnnotationSubtype.HIGHLIGHT | PdfAnnotationSubtype.UNDERLINE) => {
      if (!selection || !annotationScope) return;
      const formatted = selection.getFormattedSelection(documentId);
      for (const item of formatted) {
        annotationScope.createAnnotation(item.pageIndex, {
          id: crypto.randomUUID(),
          type: subtype,
          pageIndex: item.pageIndex,
          rect: item.rect,
          segmentRects: item.segmentRects,
          strokeColor: subtype === PdfAnnotationSubtype.HIGHLIGHT ? highlightColor : color,
          color: subtype === PdfAnnotationSubtype.HIGHLIGHT ? highlightColor : color,
          opacity: 1,
          author: 'Annotate Studio',
        } as never);
      }
      clearSelection();
    },
    [selection, annotationScope, documentId, highlightColor, color, clearSelection],
  );

  const sendToAi = useCallback(
    async (mode: 'ask' | 'explain' | 'flashcards') => {
      const text = await selectedText();
      if (!text) return;
      clearSelection();
      const app = useApp.getState();
      if (mode === 'ask') app.requestChat({ kind: 'draft', text: `> ${text.replace(/\n+/g, ' ')}\n\n` });
      else if (mode === 'explain') app.requestChat({ kind: 'explain', topic: text.length > 120 ? `${text.slice(0, 120)}…` : text, context: text });
      else app.requestChat({ kind: 'flashcards', title, text });
    },
    [selectedText, clearSelection, title],
  );

  const exportCopy = useCallback(async () => {
    if (!exporter) return;
    try {
      await annotationScope?.commit().toPromise();
      const buffer = await exporter.saveAsCopy().toPromise();
      if (!isTauri()) return;
      const { save: saveDialog } = await import('@tauri-apps/plugin-dialog');
      const target = await saveDialog({
        defaultPath: `${stripExtension(title)} (annotated).pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!target) return;
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(target, new Uint8Array(buffer));
      toast.success('PDF exported', target);
    } catch (error) {
      toast.error('Export failed', error);
    }
  }, [exporter, annotationScope, title]);

  useEffect(() => {
    return registerWindowKeyHandler(resourceId, (event, inContent) => {
      if (isEditableTarget(event.target)) return false;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && !inContent) return false;
      if (mod && key === 'z' && !event.shiftKey) {
        undo();
        return true;
      }
      if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
        redo();
        return true;
      }
      if (mod && (key === '=' || key === '+')) {
        zoom?.zoomIn();
        return true;
      }
      if (mod && key === '-') {
        zoom?.zoomOut();
        return true;
      }
      if (mod && key === '0') {
        zoom?.requestZoom(ZoomMode.FitWidth);
        return true;
      }
      if (mod && key === 's') {
        void save();
        return true;
      }
      if (mod && key === 'c') {
        void selectedText().then((text) => {
          if (text) void copyText(text);
        });
        return false;
      }
      if ((key === 'delete' || key === 'backspace') && !mod) return deleteSelected();
      if (key === 'escape' && selectedUids.length > 0) {
        annotationScope?.deselectAnnotation();
        return true;
      }
      if (key === 'escape' && tool !== 'select') {
        setTool('select');
        return true;
      }
      if (!mod && !event.altKey) {
        if (key === 'pagedown' || key === 'arrowright') {
          if (key === 'arrowright' && selectedUids.length) return false;
          scroll?.scrollToNextPage();
          return true;
        }
        if (key === 'pageup' || key === 'arrowleft') {
          if (key === 'arrowleft' && selectedUids.length) return false;
          scroll?.scrollToPreviousPage();
          return true;
        }
        const match = TOOLS.find((entry) => entry.key === key);
        if (match && !event.shiftKey) {
          setTool(match.id);
          return true;
        }
      }
      return false;
    });
  }, [resourceId, undo, redo, zoom, save, selectedText, deleteSelected, tool, scroll, selectedUids.length, annotationScope]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const windowElement = element.closest('[data-window-id]');
      if (!maximized && windowElement?.getAttribute('data-active') !== 'true') return;
      event.preventDefault();
      event.stopPropagation();
      if (!zoom) return;
      const rect = element.getBoundingClientRect();
      const cssScale = element.offsetWidth ? rect.width / element.offsetWidth : 1;
      const delta = -event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0025);
      zoom.requestZoomBy(Math.max(-0.5, Math.min(0.5, delta)), {
        vx: (event.clientX - rect.left) / cssScale,
        vy: (event.clientY - rect.top) / cssScale,
      } as never);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoom, maximized]);

  const renderSelectionMenu = useCallback(
    ({ menuWrapperProps, placement }: { menuWrapperProps: React.HTMLAttributes<HTMLDivElement>; placement: { suggestTop?: boolean } }) => (
      <div {...menuWrapperProps}>
        <div className={cn('pdf-float-menu', placement.suggestTop ? 'pdf-float-menu-top' : 'pdf-float-menu-bottom')}>
          <button type="button" onClick={() =>
              void selectedText().then(async (text) => {
                if (!text) return;
                await copyText(text);
                clearSelection();
              })
            } title="Copy">
            <Copy size={13} /> Copy
          </button>
          <button type="button" onClick={() => markupSelection(PdfAnnotationSubtype.HIGHLIGHT)} title="Highlight">
            <Highlighter size={13} /> Highlight
          </button>
          <button type="button" onClick={() => markupSelection(PdfAnnotationSubtype.UNDERLINE)} title="Underline">
            <PenLine size={13} /> Underline
          </button>
          <span className="pdf-float-divider" />
          <button type="button" onClick={() => void sendToAi('ask')} title="Ask the AI about this text">
            <MessageSquareText size={13} /> Ask AI
          </button>
          <button type="button" onClick={() => void sendToAi('explain')} title="Explain step by step">
            <BookOpenCheck size={13} /> Explain
          </button>
          <button type="button" onClick={() => void sendToAi('flashcards')} title="Create flashcards from the selection">
            Flashcards
          </button>
        </div>
      </div>
    ),
    [selectedText, clearSelection, markupSelection, sendToAi],
  );

  const renderAnnotationMenu = useCallback(
    ({
      menuWrapperProps,
      placement,
      selected,
      context,
    }: {
      menuWrapperProps: React.HTMLAttributes<HTMLDivElement>;
      placement: { suggestTop?: boolean };
      selected: boolean;
      context?: { type: string; pageIndex?: number; annotation?: { object: { id: string; pageIndex: number } }; structurallyLocked?: boolean };
    }) => {
      const target = context?.type === 'annotation' ? context.annotation?.object : undefined;
      if (!selected || !target || context?.structurallyLocked) return null;
      return (
        <div {...menuWrapperProps}>
          <div className={cn('pdf-float-menu', placement.suggestTop ? 'pdf-float-menu-top' : 'pdf-float-menu-bottom')}>
            <button type="button" onClick={() => annotationScope?.deleteAnnotation(target.pageIndex, target.id)} className="danger" title="Delete (Del)">
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      );
    },
    [annotationScope],
  );

  const drawingTool = tool !== 'select' && tool !== 'eraser' && tool !== 'highlight' && tool !== 'text';

  const renderPage = useCallback(
    (page: { pageIndex: number; width: number; height: number }) => (
      <ScaledPage key={page.pageIndex} documentId={documentId} pageIndex={page.pageIndex} dpr={dpr}>
        <div
          className={cn('pdf-layers', drawingTool && 'pdf-layers-locked')}
          style={
            layerZoom === 1
              ? undefined
              : {
                  right: 'auto',
                  bottom: 'auto',
                  width: `${layerZoom * 100}%`,
                  height: `${layerZoom * 100}%`,
                  transform: `scale(${1 / layerZoom})`,
                  transformOrigin: '0 0',
                }
          }
        >
          <SelectionLayer documentId={documentId} pageIndex={page.pageIndex} scale={layerScale} selectionMenu={renderSelectionMenu as never} />
          <AnnotationLayer
            documentId={documentId}
            pageIndex={page.pageIndex}
            scale={layerScale}
            selectionOutline={{ color: 'var(--primary)' } as never}
            selectionMenu={renderAnnotationMenu as never}
          />
        </div>
      </ScaledPage>
    ),
    [documentId, dpr, drawingTool, renderSelectionMenu, renderAnnotationMenu, layerZoom, layerScale],
  );

  const currentPage = scrollState?.currentPage ?? 1;
  const totalPages = documentState?.document?.pageCount ?? scrollState?.totalPages ?? 0;
  const zoomPercent = Math.round((zoomState?.currentZoomLevel ?? 1) * 100);
  const showColor = tool !== 'select' && tool !== 'eraser';
  const activeColor = tool === 'highlight' || tool === 'marker' ? highlightColor : color;

  return (
    <div className="pdf-window">
      <div className="pdf-toolbar" data-no-drag>
        <div className="pdf-tool-group">
          {TOOLS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={cn('tool-btn', tool === entry.id && 'tool-btn-active')}
              onClick={() => setTool(entry.id)}
              title={entry.label}
            >
              {entry.icon}
            </button>
          ))}
        </div>
        {showColor && (
          <div className="pdf-tool-group">
            <button
              ref={colorAnchor}
              type="button"
              className="color-dot"
              style={{ background: activeColor }}
              onClick={() => setColorOpen((v) => !v)}
              title="Color"
            />
            <Popover anchorRef={colorAnchor} open={colorOpen} onClose={() => setColorOpen(false)} width={236}>
              <ColorSwatches
                value={activeColor}
                onChange={(next) => {
                  changeColor(next);
                  setColorOpen(false);
                }}
              />
            </Popover>
            {tool !== 'highlight' && (
              <select
                className="select select-sm"
                value={width}
                onChange={(event) => changeWidth(Number(event.target.value))}
                title="Stroke width"
              >
                {STROKE_WIDTHS.map((value) => (
                  <option key={value} value={value}>
                    {value}px
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div className="pdf-tool-group">
          <button type="button" className="tool-btn" onClick={undo} disabled={!historyState.canUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={14} />
          </button>
          <button type="button" className="tool-btn" onClick={redo} disabled={!historyState.canRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={14} />
          </button>
        </div>
        <div className="pdf-tool-group">
          <button type="button" className="tool-btn" onClick={() => scroll?.scrollToPreviousPage()} disabled={currentPage <= 1} title="Previous page">
            <ChevronLeft size={14} />
          </button>
          <input
            className="page-input"
            value={pageInput || String(currentPage)}
            onFocus={(event) => {
              setPageInput(String(currentPage));
              event.currentTarget.select();
            }}
            onChange={(event) => setPageInput(event.target.value.replace(/[^\d]/g, ''))}
            onBlur={() => setPageInput('')}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              const target = Math.min(Math.max(1, parseInt(pageInput || '1', 10)), totalPages || 1);
              scroll?.scrollToPage({ pageNumber: target });
              setPageInput('');
              event.currentTarget.blur();
            }}
            aria-label="Page number"
          />
          <span className="page-total">/ {totalPages || '–'}</span>
          <button
            type="button"
            className="tool-btn"
            onClick={() => scroll?.scrollToNextPage()}
            disabled={totalPages === 0 || currentPage >= totalPages}
            title="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="pdf-tool-group">
          <button type="button" className="tool-btn" onClick={() => zoom?.zoomOut()} title="Zoom out (Ctrl+-)">
            <ZoomOut size={14} />
          </button>
          <button type="button" className="zoom-label" onClick={() => zoom?.requestZoom(ZoomMode.FitWidth)} title="Fit width (Ctrl+0)">
            {zoomPercent}%
          </button>
          <button type="button" className="tool-btn" onClick={() => zoom?.zoomIn()} title="Zoom in (Ctrl+=)">
            <ZoomIn size={14} />
          </button>
        </div>
        <div className="pdf-toolbar-spacer" />
        <span className={cn('save-state', `save-state-${saveState}`)}>
          {saveState === 'pending' || saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : ''}
        </span>
        <button type="button" className="tool-btn" onClick={() => void exportCopy()} title="Export a copy">
          <Download size={14} />
        </button>
      </div>
      <div ref={viewportRef} className={cn('pdf-viewport', `pdf-tool-${tool}`)}>
        <Viewport documentId={documentId} className="pdf-viewport-inner">
          <Scroller documentId={documentId} renderPage={renderPage} />
        </Viewport>
      </div>
    </div>
  );
}

export default memo(PdfWindow);
