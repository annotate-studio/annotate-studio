"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface PdfPageMeta {
  pageNumber: number
  width: number
  height: number
}

interface PdfPageRendered {
  pageNumber: number
  width: number
  height: number
  imageData: string
}

interface PdfStore {
  pdfPath: string | null
  pagesMeta: PdfPageMeta[]
  renderedPages: Map<number, string>
  totalPages: number
  isLoading: boolean
  loadingPage: number | null
  error: string | null
  setPdfPath: (path: string | null) => void
  setPagesMeta: (pages: PdfPageMeta[]) => void
  setRenderedPage: (pageNumber: number, imageData: string) => void
  getRenderedPage: (pageNumber: number) => string | undefined
  setTotalPages: (count: number) => void
  setLoading: (loading: boolean) => void
  setLoadingPage: (page: number | null) => void
  setError: (error: string | null) => void
  clearPdf: () => void
}

export const usePdfStore = create<PdfStore>()((set, get) => ({
  pdfPath: null,
  pagesMeta: [],
  renderedPages: new Map(),
  totalPages: 0,
  isLoading: false,
  loadingPage: null,
  error: null,
  setPdfPath: (path) => set({ pdfPath: path }),
  setPagesMeta: (pages) => set({ pagesMeta: pages, totalPages: pages.length }),
  setRenderedPage: (pageNumber, imageData) => {
    const newMap = new Map(get().renderedPages)
    newMap.set(pageNumber, imageData)
    set({ renderedPages: newMap })
  },
  getRenderedPage: (pageNumber) => get().renderedPages.get(pageNumber),
  setTotalPages: (count) => set({ totalPages: count }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLoadingPage: (page) => set({ loadingPage: page }),
  setError: (error) => set({ error }),
  clearPdf: () => set({ pdfPath: null, pagesMeta: [], renderedPages: new Map(), totalPages: 0, error: null }),
}))

interface ColorStore {
  customColors: string[]
  addCustomColor: (color: string) => void
  removeCustomColor: (color: string) => void
  recentColors: string[]
  addRecentColor: (color: string) => void
}

export const useColorStore = create<ColorStore>()(
  persist(
    (set, get) => ({
      customColors: [],
      addCustomColor: (color: string) => {
        const colors = get().customColors
        if (!colors.includes(color) && colors.length < 16) {
          set({ customColors: [...colors, color] })
        }
      },
      removeCustomColor: (color: string) => {
        set({ customColors: get().customColors.filter((c) => c !== color) })
      },
      recentColors: [],
      addRecentColor: (color: string) => {
        const recent = get().recentColors.filter((c) => c !== color)
        set({ recentColors: [color, ...recent].slice(0, 8) })
      },
    }),
    {
      name: "annotate-studio-colors",
    }
  )
)

interface SettingsStore {
  sidebarCollapsed: boolean
  inspectorCollapsed: boolean
  symbolRecognitionEnabled: boolean
  symbolRecognitionSensitivity: number
  
  targetFps: number
  detectedRefreshRate: number
  antialiasing: boolean
  showFpsCounter: boolean
  
  autoSave: boolean
  autoSaveInterval: number
  
  gridEnabled: boolean
  gridSize: number
  snapToGrid: boolean
  
  pressureSensitivity: boolean
  smoothing: number
  
  setSidebarCollapsed: (collapsed: boolean) => void
  setInspectorCollapsed: (collapsed: boolean) => void
  setSymbolRecognitionEnabled: (enabled: boolean) => void
  setSymbolRecognitionSensitivity: (sensitivity: number) => void
  
  setTargetFps: (fps: number) => void
  setDetectedRefreshRate: (rate: number) => void
  setAntialiasing: (enabled: boolean) => void
  setShowFpsCounter: (show: boolean) => void
  
  setAutoSave: (enabled: boolean) => void
  setAutoSaveInterval: (interval: number) => void
  
  setGridEnabled: (enabled: boolean) => void
  setGridSize: (size: number) => void
  setSnapToGrid: (enabled: boolean) => void
  
  setPressureSensitivity: (enabled: boolean) => void
  setSmoothing: (value: number) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      inspectorCollapsed: false,
      symbolRecognitionEnabled: false,
      symbolRecognitionSensitivity: 0.7,
      
      targetFps: 60,
      detectedRefreshRate: 60,
      antialiasing: true,
      showFpsCounter: true,
      
      autoSave: true,
      autoSaveInterval: 30,
      
      gridEnabled: false,
      gridSize: 20,
      snapToGrid: false,
      
      pressureSensitivity: true,
      smoothing: 50,
      
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setInspectorCollapsed: (collapsed) => set({ inspectorCollapsed: collapsed }),
      setSymbolRecognitionEnabled: (enabled) => set({ symbolRecognitionEnabled: enabled }),
      setSymbolRecognitionSensitivity: (sensitivity) => set({ symbolRecognitionSensitivity: sensitivity }),
      
      setTargetFps: (fps) => set({ targetFps: fps }),
      setDetectedRefreshRate: (rate) => set({ detectedRefreshRate: rate }),
      setAntialiasing: (enabled) => set({ antialiasing: enabled }),
      setShowFpsCounter: (show) => set({ showFpsCounter: show }),
      
      setAutoSave: (enabled) => set({ autoSave: enabled }),
      setAutoSaveInterval: (interval) => set({ autoSaveInterval: interval }),
      
      setGridEnabled: (enabled) => set({ gridEnabled: enabled }),
      setGridSize: (size) => set({ gridSize: size }),
      setSnapToGrid: (enabled) => set({ snapToGrid: enabled }),
      
      setPressureSensitivity: (enabled) => set({ pressureSensitivity: enabled }),
      setSmoothing: (value) => set({ smoothing: value }),
    }),
    {
      name: "annotate-studio-settings",
    }
  )
)

interface Point {
  x: number
  y: number
}

interface Stroke {
  id: string
  points: Point[]
  color: string
  thickness: number
  opacity: number
  tool: string
  pageId: number
  timestamp: number
  fillColor?: string
  backgroundColor?: string
}

interface CanvasStore {
  strokes: Stroke[]
  undoStack: Stroke[][]
  redoStack: Stroke[][]
  currentPageId: number
  selectedStrokeId: string | null
  selectedStrokeIds: string[]
  clipboard: Stroke[]
  
  addStroke: (stroke: Omit<Stroke, "id" | "timestamp">) => void
  updateStroke: (id: string, updates: Partial<Pick<Stroke, "points" | "thickness" | "color" | "fillColor" | "backgroundColor">>) => void
  deleteStroke: (id: string) => void
  deleteSelectedStrokes: () => void
  selectStroke: (id: string | null) => void
  selectStrokes: (ids: string[]) => void
  addToSelection: (id: string) => void
  removeFromSelection: (id: string) => void
  clearSelection: () => void
  getStrokeById: (id: string) => Stroke | undefined
  undo: () => boolean
  redo: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean
  getPageStrokes: (pageId: number) => Stroke[]
  clearPage: (pageId: number) => void
  setCurrentPage: (pageId: number) => void
  copySelected: () => void
  cutSelected: () => void
  paste: (pageId: number, offset?: Point) => void
  duplicateSelected: (pageId: number) => void
}

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  strokes: [],
  undoStack: [],
  redoStack: [],
  currentPageId: 1,
  selectedStrokeId: null,
  selectedStrokeIds: [],
  clipboard: [],

  addStroke: (strokeData) => {
    const newStroke: Stroke = {
      ...strokeData,
      id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    }
    
    set((state) => ({
      strokes: [...state.strokes, newStroke],
      undoStack: [...state.undoStack, state.strokes],
      redoStack: [],
    }))
  },

  updateStroke: (id, updates) => {
    set((state) => ({
      strokes: state.strokes.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
      undoStack: [...state.undoStack, state.strokes],
      redoStack: [],
    }))
  },

  deleteStroke: (id) => {
    set((state) => ({
      strokes: state.strokes.filter((s) => s.id !== id),
      undoStack: [...state.undoStack, state.strokes],
      redoStack: [],
      selectedStrokeId: state.selectedStrokeId === id ? null : state.selectedStrokeId,
      selectedStrokeIds: state.selectedStrokeIds.filter((sid) => sid !== id),
    }))
  },

  deleteSelectedStrokes: () => {
    const { selectedStrokeIds, strokes } = get()
    if (selectedStrokeIds.length === 0) return
    
    set((state) => ({
      strokes: state.strokes.filter((s) => !selectedStrokeIds.includes(s.id)),
      undoStack: [...state.undoStack, strokes],
      redoStack: [],
      selectedStrokeId: null,
      selectedStrokeIds: [],
    }))
  },

  selectStroke: (id) => set({ 
    selectedStrokeId: id,
    selectedStrokeIds: id ? [id] : [],
  }),

  selectStrokes: (ids) => set({
    selectedStrokeId: ids.length > 0 ? ids[0] : null,
    selectedStrokeIds: ids,
  }),

  addToSelection: (id) => {
    const { selectedStrokeIds } = get()
    if (!selectedStrokeIds.includes(id)) {
      set({
        selectedStrokeIds: [...selectedStrokeIds, id],
        selectedStrokeId: id,
      })
    }
  },

  removeFromSelection: (id) => {
    const { selectedStrokeIds } = get()
    const newIds = selectedStrokeIds.filter((sid) => sid !== id)
    set({
      selectedStrokeIds: newIds,
      selectedStrokeId: newIds.length > 0 ? newIds[0] : null,
    })
  },

  clearSelection: () => set({
    selectedStrokeId: null,
    selectedStrokeIds: [],
  }),

  getStrokeById: (id) => get().strokes.find((s) => s.id === id),

  undo: () => {
    const { undoStack, strokes } = get()
    if (undoStack.length === 0) return false

    const previousState = undoStack[undoStack.length - 1]
    set({
      strokes: previousState,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, strokes],
    })
    return true
  },

  redo: () => {
    const { redoStack, strokes } = get()
    if (redoStack.length === 0) return false

    const nextState = redoStack[redoStack.length - 1]
    set({
      strokes: nextState,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, strokes],
    })
    return true
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  getPageStrokes: (pageId) => get().strokes.filter((s) => s.pageId === pageId),

  clearPage: (pageId) => {
    set((state) => ({
      strokes: state.strokes.filter((s) => s.pageId !== pageId),
      undoStack: [...state.undoStack, state.strokes],
      redoStack: [],
    }))
  },

  setCurrentPage: (pageId) => set({ currentPageId: pageId }),

  copySelected: () => {
    const { selectedStrokeIds, strokes } = get()
    if (selectedStrokeIds.length === 0) return
    
    const selectedStrokes = strokes.filter((s) => selectedStrokeIds.includes(s.id))
    set({ clipboard: [...selectedStrokes] })
  },

  cutSelected: () => {
    const { selectedStrokeIds, strokes } = get()
    if (selectedStrokeIds.length === 0) return
    
    const selectedStrokes = strokes.filter((s) => selectedStrokeIds.includes(s.id))
    set((state) => ({
      clipboard: selectedStrokes,
      strokes: state.strokes.filter((s) => !selectedStrokeIds.includes(s.id)),
      undoStack: [...state.undoStack, strokes],
      redoStack: [],
      selectedStrokeId: null,
      selectedStrokeIds: [],
    }))
  },

  paste: (pageId, offset = { x: 20, y: 20 }) => {
    const { clipboard, strokes } = get()
    if (clipboard.length === 0) return
    
    const newStrokes: Stroke[] = clipboard.map((s) => ({
      ...s,
      id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      pageId,
      points: s.points.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y })),
    }))
    
    set((state) => ({
      strokes: [...state.strokes, ...newStrokes],
      undoStack: [...state.undoStack, strokes],
      redoStack: [],
      selectedStrokeIds: newStrokes.map((s) => s.id),
      selectedStrokeId: newStrokes[0]?.id || null,
    }))
  },

  duplicateSelected: (pageId) => {
    const { selectedStrokeIds, strokes } = get()
    if (selectedStrokeIds.length === 0) return
    
    const selectedStrokes = strokes.filter((s) => selectedStrokeIds.includes(s.id))
    const newStrokes: Stroke[] = selectedStrokes.map((s) => ({
      ...s,
      id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      pageId,
      points: s.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })),
    }))
    
    set((state) => ({
      strokes: [...state.strokes, ...newStrokes],
      undoStack: [...state.undoStack, strokes],
      redoStack: [],
      selectedStrokeIds: newStrokes.map((s) => s.id),
      selectedStrokeId: newStrokes[0]?.id || null,
    }))
  },
}))
