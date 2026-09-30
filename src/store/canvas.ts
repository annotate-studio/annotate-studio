import { create } from 'zustand';
import { loadCanvasState, saveCanvasState } from '@/lib/tauri-commands';
import { createSaver } from '@/lib/persist';
import { clamp, uid } from '@/lib/utils';

export type ResourceType = 'pdf' | 'note' | 'image';

export interface CanvasView {
  x: number;
  y: number;
  zoom: number;
}

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  filePath?: string;
  content?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  resources: Resource[];
  view: CanvasView;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ArrangeLayout = 'columns' | 'rows' | 'grid';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 3;
export const MIN_WINDOW_WIDTH = 280;
export const MIN_WINDOW_HEIGHT = 180;
const HISTORY_LIMIT = 100;
const DEFAULT_VIEW: CanvasView = { x: 0, y: 0, zoom: 1 };

export const DEFAULT_SIZES: Record<ResourceType, { width: number; height: number }> = {
  pdf: { width: 760, height: 880 },
  note: { width: 680, height: 560 },
  image: { width: 560, height: 440 },
};

export interface OpenResourceInput {
  type: ResourceType;
  title: string;
  filePath?: string;
  content?: string;
  width?: number;
  height?: number;
}

export interface OpenOptions {
  at?: { x: number; y: number };
  center?: { x: number; y: number };
  focusExisting?: boolean;
  near?: string;
}

export interface CanvasStore {
  hydrated: boolean;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  selectedId: string | null;
  locked: boolean;
  viewport: { width: number; height: number };
  past: Resource[][];
  future: Resource[][];
  hydrate: () => Promise<void>;
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  setView: (view: CanvasView) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (zoom: number, anchor?: { x: number; y: number }) => void;
  resetZoom: () => void;
  fitToContent: (ids?: string[]) => void;
  focusResource: (id: string) => void;
  setViewport: (size: { width: number; height: number }) => void;
  setLocked: (locked: boolean) => void;
  openResource: (input: OpenResourceInput, options?: OpenOptions) => string;
  updateResource: (id: string, patch: Partial<Resource>, record?: boolean) => void;
  patchResourceIn: (workspaceId: string, id: string, patch: Partial<Resource>) => void;
  setResourceRect: (id: string, rect: Partial<Rect>) => void;
  bringToFront: (id: string) => void;
  select: (id: string | null) => void;
  closeResource: (id: string) => void;
  toggleMinimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  exitMaximize: () => void;
  minimizeAll: () => void;
  arrange: (layout: ArrangeLayout) => void;
  replaceFilePath: (oldPath: string, newPath: string, title?: string) => void;
  closeByFilePath: (path: string) => void;
  undo: () => void;
  redo: () => void;
}

export function activeWorkspace(state: Pick<CanvasStore, 'workspaces' | 'activeWorkspaceId'>): Workspace {
  return state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? state.workspaces[0];
}

function newWorkspace(name: string, id: string = uid()): Workspace {
  return { id, name, resources: [], view: { ...DEFAULT_VIEW } };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function toWorkspaceRelative(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const marker = '/annotate-studio/';
  const index = normalized.lastIndexOf(marker);
  if (index >= 0 && (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized))) {
    return normalized.slice(index + marker.length);
  }
  return normalized.replace(/^\.\//, '');
}

function isResourceType(value: unknown): value is ResourceType {
  return value === 'pdf' || value === 'note' || value === 'image';
}

function migrateResource(raw: unknown, index: number): Resource | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const type = data.type === 'sticky' ? 'note' : data.type;
  if (!isResourceType(type)) return null;
  const position = (data.position ?? {}) as Record<string, unknown>;
  const size = (data.size ?? {}) as Record<string, unknown>;
  const previous = (data.previousBounds ?? null) as Record<string, unknown> | null;
  const defaults = DEFAULT_SIZES[type];
  const wasFullscreen = data.isFullscreen === true;
  const baseX = wasFullscreen && previous ? previous.x : data.x ?? position.x;
  const baseY = wasFullscreen && previous ? previous.y : data.y ?? position.y;
  const baseW = wasFullscreen && previous ? previous.width : data.width ?? size.width;
  const baseH = wasFullscreen && previous ? previous.height : data.height ?? size.height;
  const filePath = typeof data.filePath === 'string' && data.filePath.trim() ? toWorkspaceRelative(data.filePath.trim()) : undefined;
  const content = typeof data.content === 'string' ? data.content : undefined;
  return {
    id: typeof data.id === 'string' && data.id ? data.id : uid(),
    type,
    title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Untitled',
    filePath,
    content: type === 'note' ? content : undefined,
    x: finiteOr(baseX, 80 + index * 32),
    y: finiteOr(baseY, 80 + index * 32),
    width: Math.max(MIN_WINDOW_WIDTH, finiteOr(baseW, defaults.width)),
    height: Math.max(MIN_WINDOW_HEIGHT, finiteOr(baseH, defaults.height)),
    z: index + 1,
    minimized: data.minimized === true || data.state === 'minimized',
    maximized: data.maximized === true || wasFullscreen,
  };
}

function normalizeZ(resources: Resource[], rawOrder: unknown[]): Resource[] {
  const order = rawOrder.map((raw, index) => {
    const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return finiteOr(data.z ?? data.zIndex, index);
  });
  const ranked = resources
    .map((resource, index) => ({ resource, rank: order[index] ?? index, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const zById = new Map(ranked.map((entry, position) => [entry.resource.id, position + 1]));
  return resources.map((resource) => ({ ...resource, z: zById.get(resource.id) ?? resource.z }));
}

function migrateView(raw: unknown): CanvasView {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    x: finiteOr(data.x, 0),
    y: finiteOr(data.y, 0),
    zoom: clamp(finiteOr(data.zoom, 1), ZOOM_MIN, ZOOM_MAX),
  };
}

function migrateResources(rawList: unknown): Resource[] {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set<string>();
  const kept: Resource[] = [];
  const keptRaw: unknown[] = [];
  rawList.forEach((raw, index) => {
    const resource = migrateResource(raw, index);
    if (!resource || seen.has(resource.id)) return;
    seen.add(resource.id);
    kept.push(resource);
    keptRaw.push(raw);
  });
  const normalized = normalizeZ(kept, keptRaw);
  const topMaximized = normalized.filter((r) => r.maximized).sort((a, b) => b.z - a.z)[0]?.id;
  return normalized.map((r) => (r.maximized && r.id !== topMaximized ? { ...r, maximized: false } : r));
}

export function migrateCanvasState(raw: unknown): { workspaces: Workspace[]; activeWorkspaceId: string } {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let workspaces: Workspace[] = [];
  if (Array.isArray(data.workspaces)) {
    workspaces = data.workspaces
      .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
      .map((w, index) => ({
        id: typeof w.id === 'string' && w.id ? w.id : uid(),
        name: typeof w.name === 'string' && w.name.trim() ? w.name : `Workspace ${index + 1}`,
        resources: migrateResources(w.resources),
        view: migrateView(w.view ?? w.canvasView),
      }));
  } else if (Array.isArray(data.resources)) {
    workspaces = [{ id: 'default', name: 'Default Workspace', resources: migrateResources(data.resources), view: migrateView(data.view) }];
  }
  const unique = new Map<string, Workspace>();
  for (const workspace of workspaces) if (!unique.has(workspace.id)) unique.set(workspace.id, workspace);
  workspaces = Array.from(unique.values());
  if (workspaces.length === 0) workspaces = [newWorkspace('Default Workspace', 'default')];
  const requested = typeof data.activeWorkspaceId === 'string' ? data.activeWorkspaceId : '';
  const activeWorkspaceId = workspaces.some((w) => w.id === requested) ? requested : workspaces[0].id;
  return { workspaces, activeWorkspaceId };
}

function topZ(resources: Resource[]): number {
  return resources.reduce((max, r) => Math.max(max, r.z), 0);
}

function withFrontZ(resources: Resource[], id: string): Resource[] {
  const target = resources.find((r) => r.id === id);
  if (!target) return resources;
  const max = topZ(resources);
  if (target.z === max && resources.filter((r) => r.z === max).length === 1) return resources;
  if (max + 1 > 1_000_000) {
    const ordered = [...resources].sort((a, b) => a.z - b.z).filter((r) => r.id !== id);
    const zById = new Map(ordered.map((r, index) => [r.id, index + 1]));
    zById.set(id, ordered.length + 1);
    return resources.map((r) => ({ ...r, z: zById.get(r.id) ?? r.z }));
  }
  return resources.map((r) => (r.id === id ? { ...r, z: max + 1 } : r));
}

export function screenToWorld(view: CanvasView, point: { x: number; y: number }) {
  return { x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom };
}

export function visibleWorldRect(view: CanvasView, viewport: { width: number; height: number }): Rect {
  return {
    x: -view.x / view.zoom,
    y: -view.y / view.zoom,
    width: viewport.width / view.zoom,
    height: viewport.height / view.zoom,
  };
}

function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function placeWindow(
  resources: Resource[],
  center: { x: number; y: number },
  size: { width: number; height: number },
  view: Rect,
): { x: number; y: number } {
  const visible = resources.filter((r) => !r.minimized);
  const gap = 24;
  const free = (x: number, y: number) =>
    !visible.some((r) => intersects(r, { x: x - gap / 2, y: y - gap / 2, width: size.width + gap, height: size.height + gap }));
  const inView = (x: number, y: number) =>
    x >= view.x && y >= view.y && x + size.width <= view.x + view.width && y + size.height <= view.y + view.height;
  const candidates: { x: number; y: number }[] = [{ x: center.x - size.width / 2, y: center.y - size.height / 2 }];
  for (const r of visible) {
    candidates.push(
      { x: r.x + r.width + gap, y: r.y },
      { x: r.x - size.width - gap, y: r.y },
      { x: r.x, y: r.y + r.height + gap },
      { x: r.x, y: r.y - size.height - gap },
    );
  }
  const distance = (c: { x: number; y: number }) => Math.hypot(c.x + size.width / 2 - center.x, c.y + size.height / 2 - center.y);
  const ordered = candidates.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })).sort((a, b) => distance(a) - distance(b));
  const best = ordered.find((c) => free(c.x, c.y) && inView(c.x, c.y)) ?? ordered.find((c) => free(c.x, c.y) && inView(c.x, c.y + size.height - 120));
  if (best) return best;
  let x = Math.round(center.x - size.width / 2);
  let y = Math.round(center.y - size.height / 2);
  for (let attempt = 0; attempt < 12 && visible.some((r) => Math.abs(r.x - x) < 24 && Math.abs(r.y - y) < 24); attempt += 1) {
    x += 36;
    y += 36;
  }
  return { x, y };
}

const saver = createSaver<{ workspaces: Workspace[]; activeWorkspaceId: string }>(
  (value) => saveCanvasState({ version: 2, ...value }),
  500,
);

export const useCanvas = create<CanvasStore>((set, get) => {
  const active = () => activeWorkspace(get());

  const updateActive = (updater: (workspace: Workspace) => Workspace) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === state.activeWorkspaceId ? updater(w) : w)),
    }));

  const commitResources = (next: Resource[], record = true) => {
    const current = active().resources;
    if (next === current) return;
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === state.activeWorkspaceId ? { ...w, resources: next } : w)),
      past: record ? [...state.past.slice(-(HISTORY_LIMIT - 1)), current] : state.past,
      future: record ? [] : state.future,
    }));
  };

  const setViewInternal = (view: CanvasView) => {
    const next = { x: view.x, y: view.y, zoom: clamp(view.zoom, ZOOM_MIN, ZOOM_MAX) };
    const current = active().view;
    if (current.x === next.x && current.y === next.y && current.zoom === next.zoom) return;
    updateActive((w) => ({ ...w, view: next }));
  };

  return {
    hydrated: false,
    workspaces: [newWorkspace('Default Workspace', 'default')],
    activeWorkspaceId: 'default',
    selectedId: null,
    locked: false,
    viewport: { width: 1200, height: 800 },
    past: [],
    future: [],

    hydrate: async () => {
      if (get().hydrated) return;
      let migrated = migrateCanvasState(null);
      try {
        migrated = migrateCanvasState(await loadCanvasState());
      } catch {
        migrated = migrateCanvasState(null);
      }
      set({ ...migrated, hydrated: true, past: [], future: [], selectedId: null });
    },

    switchWorkspace: (id) => {
      if (id === get().activeWorkspaceId || !get().workspaces.some((w) => w.id === id)) return;
      set({ activeWorkspaceId: id, selectedId: null, past: [], future: [] });
    },
    createWorkspace: (name) => {
      const workspace = newWorkspace(name.trim() || 'Untitled Workspace');
      set((state) => ({
        workspaces: [...state.workspaces, workspace],
        activeWorkspaceId: workspace.id,
        selectedId: null,
        past: [],
        future: [],
      }));
    },
    renameWorkspace: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      set((state) => ({ workspaces: state.workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w)) }));
    },
    deleteWorkspace: (id) => {
      const { workspaces, activeWorkspaceId } = get();
      if (workspaces.length <= 1) return;
      const remaining = workspaces.filter((w) => w.id !== id);
      const nextActive = activeWorkspaceId === id ? remaining[0].id : activeWorkspaceId;
      set({
        workspaces: remaining,
        activeWorkspaceId: nextActive,
        selectedId: activeWorkspaceId === id ? null : get().selectedId,
        past: activeWorkspaceId === id ? [] : get().past,
        future: activeWorkspaceId === id ? [] : get().future,
      });
    },

    setView: (view) => setViewInternal(view),
    panBy: (dx, dy) => {
      const view = active().view;
      setViewInternal({ ...view, x: view.x + dx, y: view.y + dy });
    },
    zoomAt: (zoom, anchor) => {
      const view = active().view;
      const nextZoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
      const { width, height } = get().viewport;
      const point = anchor ?? { x: width / 2, y: height / 2 };
      const ratio = nextZoom / view.zoom;
      setViewInternal({
        x: point.x - (point.x - view.x) * ratio,
        y: point.y - (point.y - view.y) * ratio,
        zoom: nextZoom,
      });
    },
    resetZoom: () => get().zoomAt(1),
    fitToContent: (ids) => {
      const { viewport } = get();
      const candidates = active().resources.filter((r) => !r.minimized && (!ids || ids.includes(r.id)));
      if (candidates.length === 0) {
        if (!ids) setViewInternal({ ...DEFAULT_VIEW });
        return;
      }
      const minX = Math.min(...candidates.map((r) => r.x));
      const minY = Math.min(...candidates.map((r) => r.y));
      const maxX = Math.max(...candidates.map((r) => r.x + r.width));
      const maxY = Math.max(...candidates.map((r) => r.y + r.height));
      const padding = 48;
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      const zoom = clamp(
        Math.min((viewport.width - padding * 2) / width, (viewport.height - padding * 2) / height, 1),
        ZOOM_MIN,
        ZOOM_MAX,
      );
      setViewInternal({
        x: viewport.width / 2 - (minX + width / 2) * zoom,
        y: viewport.height / 2 - (minY + height / 2) * zoom,
        zoom,
      });
    },
    focusResource: (id) => {
      const resources = active().resources;
      const resource = resources.find((r) => r.id === id);
      if (!resource) return;
      if (resource.minimized || resources.some((r) => r.maximized && r.id !== id)) {
        commitResources(
          resources.map((r) => (r.id === id ? { ...r, minimized: false } : r.maximized ? { ...r, maximized: false } : r)),
          resource.minimized,
        );
      }
      const { viewport } = get();
      const view = active().view;
      const rect = visibleWorldRect(view, viewport);
      const fullyVisible =
        resource.x >= rect.x && resource.y >= rect.y &&
        resource.x + resource.width <= rect.x + rect.width && resource.y + resource.height <= rect.y + rect.height;
      if (!fullyVisible) {
        const zoom = clamp(Math.min(view.zoom, (viewport.width - 64) / resource.width, (viewport.height - 64) / resource.height), ZOOM_MIN, ZOOM_MAX);
        setViewInternal({
          x: viewport.width / 2 - (resource.x + resource.width / 2) * zoom,
          y: viewport.height / 2 - (resource.y + resource.height / 2) * zoom,
          zoom,
        });
      }
      get().bringToFront(id);
      set({ selectedId: id });
    },
    setViewport: (size) => {
      const current = get().viewport;
      if (current.width === size.width && current.height === size.height) return;
      set({ viewport: size });
    },
    setLocked: (locked) => set({ locked }),

    openResource: (input, options = {}) => {
      const resources = active().resources;
      if (options.focusExisting !== false && input.filePath) {
        const existing = resources.find((r) => r.filePath === input.filePath);
        if (existing) {
          get().focusResource(existing.id);
          return existing.id;
        }
      }
      const defaults = DEFAULT_SIZES[input.type];
      const view = active().view;
      const { viewport } = get();
      const visible = visibleWorldRect(view, viewport);
      const margin = 32 / view.zoom;
      const size = {
        width: Math.max(MIN_WINDOW_WIDTH, Math.round(input.width ?? Math.min(defaults.width, visible.width - margin * 2))),
        height: Math.max(MIN_WINDOW_HEIGHT, Math.round(input.height ?? Math.min(defaults.height, visible.height - margin * 2))),
      };
      let center = options.center ?? screenToWorld(view, { x: viewport.width / 2, y: viewport.height / 2 });
      const anchor = options.near ? resources.find((r) => r.id === options.near) : undefined;
      if (anchor && !options.center) {
        center = { x: anchor.x + anchor.width + 32 + size.width / 2, y: anchor.y + size.height / 2 };
      }
      const placed = options.at
        ? { x: Math.round(options.at.x), y: Math.round(options.at.y) }
        : options.center
          ? { x: Math.round(center.x - size.width / 2), y: Math.round(center.y - size.height / 2) }
          : placeWindow(resources, center, size, visible);
      const keep = 140 / view.zoom;
      const position = {
        x: Math.round(clamp(placed.x, visible.x - size.width + keep, visible.x + visible.width - keep)),
        y: Math.round(clamp(placed.y, visible.y + 12 / view.zoom, Math.max(visible.y + 12 / view.zoom, visible.y + visible.height - 90 / view.zoom))),
      };
      const id = uid();
      const resource: Resource = {
        id,
        type: input.type,
        title: input.title,
        filePath: input.filePath,
        content: input.content,
        ...position,
        ...size,
        z: topZ(resources) + 1,
        minimized: false,
        maximized: false,
      };
      commitResources([...resources.map((r) => (r.maximized ? { ...r, maximized: false } : r)), resource]);
      set({ selectedId: id });
      return id;
    },
    updateResource: (id, patch, record = false) => {
      const resources = active().resources;
      if (!resources.some((r) => r.id === id)) return;
      commitResources(resources.map((r) => (r.id === id ? { ...r, ...patch } : r)), record);
    },
    patchResourceIn: (workspaceId, id, patch) => {
      set((state) => ({
        workspaces: state.workspaces.map((w) =>
          w.id === workspaceId ? { ...w, resources: w.resources.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : w,
        ),
      }));
    },
    setResourceRect: (id, rect) => {
      const resources = active().resources;
      const target = resources.find((r) => r.id === id);
      if (!target) return;
      const next = {
        x: Math.round(rect.x ?? target.x),
        y: Math.round(rect.y ?? target.y),
        width: Math.max(MIN_WINDOW_WIDTH, Math.round(rect.width ?? target.width)),
        height: Math.max(MIN_WINDOW_HEIGHT, Math.round(rect.height ?? target.height)),
      };
      if (next.x === target.x && next.y === target.y && next.width === target.width && next.height === target.height) return;
      commitResources(resources.map((r) => (r.id === id ? { ...r, ...next } : r)));
    },
    bringToFront: (id) => {
      const resources = active().resources;
      const next = withFrontZ(resources, id);
      if (next !== resources) commitResources(next, false);
    },
    select: (id) => {
      if (get().selectedId !== id) set({ selectedId: id });
    },
    closeResource: (id) => {
      const resources = active().resources;
      if (!resources.some((r) => r.id === id)) return;
      commitResources(resources.filter((r) => r.id !== id));
      if (get().selectedId === id) set({ selectedId: null });
    },
    toggleMinimize: (id) => {
      const resources = active().resources;
      const target = resources.find((r) => r.id === id);
      if (!target) return;
      const minimized = !target.minimized;
      let next = resources.map((r) =>
        r.id === id ? { ...r, minimized, maximized: minimized ? false : r.maximized } : !minimized && r.maximized ? { ...r, maximized: false } : r,
      );
      if (!minimized) next = withFrontZ(next, id);
      commitResources(next);
      set({ selectedId: minimized ? (get().selectedId === id ? null : get().selectedId) : id });
    },
    toggleMaximize: (id) => {
      const resources = active().resources;
      const target = resources.find((r) => r.id === id);
      if (!target) return;
      const maximized = !target.maximized;
      commitResources(
        resources.map((r) =>
          r.id === id ? { ...r, maximized, minimized: false } : maximized && r.maximized ? { ...r, maximized: false } : r,
        ),
        false,
      );
      set({ selectedId: id });
    },
    exitMaximize: () => {
      const resources = active().resources;
      if (!resources.some((r) => r.maximized)) return;
      commitResources(resources.map((r) => (r.maximized ? { ...r, maximized: false } : r)), false);
    },
    minimizeAll: () => {
      const resources = active().resources;
      if (resources.every((r) => r.minimized)) return;
      commitResources(resources.map((r) => ({ ...r, minimized: true, maximized: false })));
      set({ selectedId: null });
    },
    arrange: (layout) => {
      const resources = active().resources;
      const visible = resources.filter((r) => !r.minimized).sort((a, b) => a.x - b.x || a.y - b.y);
      if (visible.length === 0) return;
      const { viewport } = get();
      const view = active().view;
      const origin = screenToWorld(view, { x: 0, y: 0 });
      const gap = 12;
      const count = visible.length;
      const columns = layout === 'columns' ? count : layout === 'rows' ? 1 : Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / columns);
      const cellWidth = Math.max(MIN_WINDOW_WIDTH, Math.floor((viewport.width - gap * (columns + 1)) / columns));
      const cellHeight = Math.max(MIN_WINDOW_HEIGHT, Math.floor((viewport.height - gap * (rows + 1)) / rows));
      const layoutById = new Map<string, Rect>();
      visible.forEach((resource, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        layoutById.set(resource.id, {
          x: Math.round(origin.x + gap + column * (cellWidth + gap)),
          y: Math.round(origin.y + gap + row * (cellHeight + gap)),
          width: cellWidth,
          height: cellHeight,
        });
      });
      commitResources(resources.map((r) => {
        const rect = layoutById.get(r.id);
        return rect ? { ...r, ...rect, maximized: false } : r;
      }));
      setViewInternal({ x: -origin.x, y: -origin.y, zoom: 1 });
    },
    replaceFilePath: (oldPath, newPath, title) => {
      const rename = (resources: Resource[]) =>
        resources.some((r) => r.filePath === oldPath)
          ? resources.map((r) => (r.filePath === oldPath ? { ...r, filePath: newPath, title: title ?? r.title } : r))
          : resources;
      set((state) => ({
        workspaces: state.workspaces.map((w) => {
          const resources = rename(w.resources);
          return resources === w.resources ? w : { ...w, resources };
        }),
        past: state.past.map(rename),
        future: state.future.map(rename),
      }));
    },
    closeByFilePath: (path) => {
      set((state) => {
        const workspaces = state.workspaces.map((w) =>
          w.resources.some((r) => r.filePath === path) ? { ...w, resources: w.resources.filter((r) => r.filePath !== path) } : w,
        );
        const selectedExists = activeWorkspace({ workspaces, activeWorkspaceId: state.activeWorkspaceId }).resources.some(
          (r) => r.id === state.selectedId,
        );
        return { workspaces, past: [], future: [], selectedId: selectedExists ? state.selectedId : null };
      });
    },

    undo: () => {
      const { past, future, selectedId } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const current = active().resources;
      updateActive((w) => ({ ...w, resources: previous }));
      set({
        past: past.slice(0, -1),
        future: [...future, current],
        selectedId: previous.some((r) => r.id === selectedId && !r.minimized) ? selectedId : null,
      });
    },
    redo: () => {
      const { past, future, selectedId } = get();
      if (future.length === 0) return;
      const next = future[future.length - 1];
      const current = active().resources;
      updateActive((w) => ({ ...w, resources: next }));
      set({
        future: future.slice(0, -1),
        past: [...past, current],
        selectedId: next.some((r) => r.id === selectedId && !r.minimized) ? selectedId : null,
      });
    },
  };
});

useCanvas.subscribe((state, previous) => {
  if (!state.hydrated || !previous.hydrated) return;
  if (state.workspaces === previous.workspaces && state.activeWorkspaceId === previous.activeWorkspaceId) return;
  saver.schedule({ workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId });
});

export function useActiveWorkspace(): Workspace {
  return useCanvas((state) => activeWorkspace(state));
}
