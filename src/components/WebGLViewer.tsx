"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize,
  RotateCcw,
} from "lucide-react"
import type { Tool, ShapeType } from "@/components/Dock"
import { useCanvasStore, usePdfStore, useSettingsStore } from "@/lib/store"
import { webglRenderer, type Point } from "@/lib/webgl-renderer"

interface ToolSettings {
  color: string
  thickness: number
  opacity: number
  borderColor?: string
  backgroundColor?: string
}

interface WebGLViewerProps {
  currentPage: number
  currentPageIndex: number
  totalPages: number
  zoom: number
  onZoomChange: (zoom: number) => void
  onPageChange: (page: number) => void
  onPrevPage: () => void
  onNextPage: () => void
  activeTool: Tool
  activeShape: ShapeType
  toolSettings: Record<string, ToolSettings>
  pendingSymbol?: string | null
  onSymbolPlaced?: () => void
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void
}

export function WebGLViewer({
  currentPage,
  currentPageIndex,
  totalPages,
  zoom,
  onZoomChange,
  onPrevPage,
  onNextPage,
  activeTool,
  activeShape,
  toolSettings,
  pendingSymbol,
  onSymbolPlaced,
  onCanvasReady,
}: WebGLViewerProps) {
  const getToolSettings = (tool: string): ToolSettings => {
    return toolSettings[tool] || toolSettings.pen
  }

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [webglReady, setWebglReady] = useState(false)
  const [fps, setFps] = useState(0)
  const [gpuInfo, setGpuInfo] = useState("")

  const [isDrawing, setIsDrawing] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 })
  const [lastPanPoint, setLastPanPoint] = useState<Point>({ x: 0, y: 0 })
  const currentStrokeRef = useRef<Point[]>([])
  const [shapeStart, setShapeStart] = useState<Point | null>(null)
  const [shapeEnd, setShapeEnd] = useState<Point | null>(null)
  const [symbolStart, setSymbolStart] = useState<Point | null>(null)
  const [symbolEnd, setSymbolEnd] = useState<Point | null>(null)
  const [textInput, setTextInput] = useState<{ position: Point; value: string } | null>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [resizeCorner, setResizeCorner] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null)
  const [isZooming, setIsZooming] = useState<'in' | 'out' | null>(null)
  const [rubberBandStart, setRubberBandStart] = useState<Point | null>(null)
  const [rubberBandEnd, setRubberBandEnd] = useState<Point | null>(null)
  const [isRubberBanding, setIsRubberBanding] = useState(false)
  const [currentPressure, setCurrentPressure] = useState(0.5)

  const strokes = useCanvasStore(s => s.strokes)
  const addStroke = useCanvasStore(s => s.addStroke)
  const updateStroke = useCanvasStore(s => s.updateStroke)
  const deleteStroke = useCanvasStore(s => s.deleteStroke)
  const selectStroke = useCanvasStore(s => s.selectStroke)
  const selectStrokes = useCanvasStore(s => s.selectStrokes)
  const addToSelection = useCanvasStore(s => s.addToSelection)
  const clearSelection = useCanvasStore(s => s.clearSelection)
  const selectedStrokeId = useCanvasStore(s => s.selectedStrokeId)
  const selectedStrokeIds = useCanvasStore(s => s.selectedStrokeIds)
  const getStrokeById = useCanvasStore(s => s.getStrokeById)
  const undo = useCanvasStore(s => s.undo)
  const redo = useCanvasStore(s => s.redo)
  const getPageStrokes = useCanvasStore(s => s.getPageStrokes)
  const copySelected = useCanvasStore(s => s.copySelected)
  const cutSelected = useCanvasStore(s => s.cutSelected)
  const paste = useCanvasStore(s => s.paste)
  const deleteSelectedStrokes = useCanvasStore(s => s.deleteSelectedStrokes)
  const duplicateSelected = useCanvasStore(s => s.duplicateSelected)

  const pdfPath = usePdfStore(s => s.pdfPath)
  const pagesMeta = usePdfStore(s => s.pagesMeta)
  const renderedPages = usePdfStore(s => s.renderedPages)
  const setRenderedPage = usePdfStore(s => s.setRenderedPage)

  const targetFps = useSettingsStore(s => s.targetFps)
  const gridEnabled = useSettingsStore(s => s.gridEnabled)
  const gridSize = useSettingsStore(s => s.gridSize)
  const showFpsCounter = useSettingsStore(s => s.showFpsCounter)
  const pressureSensitivity = useSettingsStore(s => s.pressureSensitivity)

  const currentPageMeta = pagesMeta.find((p) => p.pageNumber === currentPage)
  const currentPageImage = renderedPages.get(currentPage)
  const canvasWidth = currentPageMeta ? Math.round(currentPageMeta.width) : 595
  const canvasHeight = currentPageMeta ? Math.round(currentPageMeta.height) : 842
  const scale = zoom / 100

  useEffect(() => {
    onCanvasReady?.(canvasRef.current)
  }, [onCanvasReady])

  useEffect(() => {
    if (!canvasRef.current) return
    
    const success = webglRenderer.init(canvasRef.current, canvasWidth, canvasHeight)
    if (success) {
      setWebglReady(true)
      setGpuInfo(webglRenderer.getGpuInfo())
    }

    const fpsInterval = setInterval(() => {
      setFps(webglRenderer.getFps())
    }, 500)

    return () => {
      clearInterval(fpsInterval)
    }
  }, [])

  useEffect(() => {
    if (webglReady) {
      webglRenderer.resize(canvasWidth, canvasHeight)
    }
  }, [canvasWidth, canvasHeight, webglReady])

  useEffect(() => {
    if (webglReady) {
      webglRenderer.setTargetFps(targetFps)
    }
  }, [webglReady, targetFps])

  useEffect(() => {
    if (webglReady) {
      webglRenderer.setGridEnabled(gridEnabled)
      webglRenderer.setGridSize(gridSize)
    }
  }, [webglReady, gridEnabled, gridSize])

  const pdfLoadingRef = useRef(false)
  const pdfQueueRef = useRef<number[]>([])

  useEffect(() => {
    if (!pdfPath || !currentPageMeta) return
    
    let cancelled = false
    
    const loadPage = async (pageNum: number) => {
      if (cancelled || renderedPages.has(pageNum)) return
      
      try {
        const { renderPdfPage } = await import("@/lib/tauri")
        const result = await renderPdfPage(pdfPath, pageNum, 1200)
        if (result && !cancelled) {
          setRenderedPage(pageNum, result.image_data)
        }
      } catch (err) {
        console.error("Failed to render page:", pageNum, err)
      }
    }
    
    const processQueue = async () => {
      if (pdfLoadingRef.current || pdfQueueRef.current.length === 0 || cancelled) return
      
      pdfLoadingRef.current = true
      const pageNum = pdfQueueRef.current.shift()!
      await loadPage(pageNum)
      pdfLoadingRef.current = false
      
      if (!cancelled && pdfQueueRef.current.length > 0) {
        setTimeout(processQueue, 16)
      }
    }
    
    pdfQueueRef.current = []
    
    if (!renderedPages.has(currentPage)) {
      pdfQueueRef.current.push(currentPage)
    }
    
    const total = pagesMeta.length
    if (currentPage > 1 && !renderedPages.has(currentPage - 1)) {
      pdfQueueRef.current.push(currentPage - 1)
    }
    if (currentPage < total && !renderedPages.has(currentPage + 1)) {
      pdfQueueRef.current.push(currentPage + 1)
    }
    
    processQueue()
    
    return () => { cancelled = true }
  }, [currentPage, pdfPath, currentPageMeta, pagesMeta.length, renderedPages, setRenderedPage])

  useEffect(() => {
    if (webglReady) {
      webglRenderer.setPdfImage(currentPageImage || null)
    }
  }, [currentPageImage, webglReady])

  useEffect(() => {
    if (!webglReady) return
    const pageStrokes = strokes.filter(s => s.pageId === currentPage)
    webglRenderer.setStrokes(pageStrokes)
    webglRenderer.setSelectedIds(selectedStrokeIds)
  }, [webglReady, strokes, currentPage, selectedStrokeIds])

  useEffect(() => {
    if (!webglReady) return
    webglRenderer.setRubberBand(rubberBandStart, rubberBandEnd)
  }, [webglReady, rubberBandStart, rubberBandEnd])

  useEffect(() => {
    if (!webglReady) return
    
    if (shapeStart && shapeEnd && isDrawing && activeTool === "shapes") {
      const settings = getToolSettings("shapes")
      webglRenderer.setShapePreview({
        type: activeShape,
        start: shapeStart,
        end: shapeEnd,
        color: settings.borderColor || settings.color,
        thickness: settings.thickness,
        opacity: settings.opacity,
        fillColor: settings.backgroundColor !== "transparent" ? settings.backgroundColor : undefined,
      })
    } else {
      webglRenderer.setShapePreview(null)
    }
  }, [webglReady, shapeStart, shapeEnd, isDrawing, activeTool, activeShape])

  useEffect(() => {
    if (!webglReady) return
    
    if (symbolStart && symbolEnd && isDrawing && activeTool === "text" && pendingSymbol) {
      const settings = getToolSettings("text")
      const size = Math.max(32, Math.abs(symbolEnd.x - symbolStart.x), Math.abs(symbolEnd.y - symbolStart.y))
      webglRenderer.setSymbolPreview({
        symbol: pendingSymbol,
        position: symbolStart,
        size: size,
        color: settings.color,
        opacity: settings.opacity,
      })
    } else {
      webglRenderer.setSymbolPreview(null)
    }
  }, [webglReady, symbolStart, symbolEnd, isDrawing, activeTool, pendingSymbol])

  const handleTextSubmit = useCallback(() => {
    if (textInput && textInput.value.trim()) {
      const textSettings = getToolSettings("text")
      addStroke({
        points: [textInput.position],
        color: textSettings.color,
        thickness: textSettings.thickness,
        opacity: textSettings.opacity,
        tool: `text:${textInput.value}`,
        pageId: currentPage,
      })
    }
    setTextInput(null)
  }, [textInput, currentPage, addStroke])

  const handleZoomIn = useCallback(() => {
    onZoomChange(Math.min(zoom + 25, 400))
  }, [zoom, onZoomChange])

  const handleZoomOut = useCallback(() => {
    onZoomChange(Math.max(zoom - 25, 25))
  }, [zoom, onZoomChange])

  const handleResetZoom = useCallback(() => {
    onZoomChange(100)
    setPanOffset({ x: 0, y: 0 })
  }, [onZoomChange])

  const getCanvasPoint = useCallback((e: React.PointerEvent | PointerEvent): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    }
  }, [scale])

  const getStrokeBounds = useCallback((stroke: any): { minX: number, minY: number, maxX: number, maxY: number } | null => {
    if (!stroke || stroke.points.length < 1) return null
    
    if (stroke.tool.startsWith("shape-") && stroke.points.length >= 2) {
      return {
        minX: Math.min(stroke.points[0].x, stroke.points[1].x),
        minY: Math.min(stroke.points[0].y, stroke.points[1].y),
        maxX: Math.max(stroke.points[0].x, stroke.points[1].x),
        maxY: Math.max(stroke.points[0].y, stroke.points[1].y),
      }
    } else if (stroke.tool.startsWith("text:")) {
      const text = stroke.tool.replace("text:", "")
      const fontSize = Math.max(14, stroke.thickness * 4)
      const textWidth = Math.max(fontSize * 0.6, text.length * fontSize * 0.55)
      return {
        minX: stroke.points[0].x - 1,
        minY: stroke.points[0].y - fontSize * 0.85,
        maxX: stroke.points[0].x + textWidth - 1,
        maxY: stroke.points[0].y + fontSize * 0.15,
      }
    }
    return null
  }, [])

  const findStrokeAtPoint = useCallback((point: Point, eraserMode: boolean = false): string | null => {
    const pageStrokes = getPageStrokes(currentPage)
    const eraserRadius = eraserMode ? 15 : 10
    
    const idx = webglRenderer.hitTest(point.x, point.y, eraserRadius)
    if (idx >= 0 && idx < pageStrokes.length) {
      return pageStrokes[idx].id
    }
    return null
  }, [getPageStrokes, currentPage])

  const getResizeCorner = useCallback((point: Point, stroke: any): 'tl' | 'tr' | 'bl' | 'br' | null => {
    const bounds = getStrokeBounds(stroke)
    if (!bounds) return null
    
    const padding = 5
    const cornerSize = 14
    const { minX, minY, maxX, maxY } = bounds
    
    const boxMinX = minX - padding
    const boxMinY = minY - padding
    const boxMaxX = maxX + padding
    const boxMaxY = maxY + padding

    if (point.x >= boxMinX - cornerSize/2 && point.x <= boxMinX + cornerSize/2 &&
        point.y >= boxMinY - cornerSize/2 && point.y <= boxMinY + cornerSize/2) return 'tl'
    if (point.x >= boxMaxX - cornerSize/2 && point.x <= boxMaxX + cornerSize/2 &&
        point.y >= boxMinY - cornerSize/2 && point.y <= boxMinY + cornerSize/2) return 'tr'
    if (point.x >= boxMinX - cornerSize/2 && point.x <= boxMinX + cornerSize/2 &&
        point.y >= boxMaxY - cornerSize/2 && point.y <= boxMaxY + cornerSize/2) return 'bl'
    if (point.x >= boxMaxX - cornerSize/2 && point.x <= boxMaxX + cornerSize/2 &&
        point.y >= boxMaxY - cornerSize/2 && point.y <= boxMaxY + cornerSize/2) return 'br'
    
    return null
  }, [getStrokeBounds])

  const findStrokesInRect = useCallback((start: Point, end: Point): string[] => {
    const pageStrokes = getPageStrokes(currentPage)
    const rectMinX = Math.min(start.x, end.x)
    const rectMinY = Math.min(start.y, end.y)
    const rectMaxX = Math.max(start.x, end.x)
    const rectMaxY = Math.max(start.y, end.y)
    
    const result: string[] = []
    
    for (const stroke of pageStrokes) {
      let isInside = false
      
      if (stroke.tool === "pen" || stroke.tool === "highlighter") {
        for (const p of stroke.points) {
          if (p.x >= rectMinX && p.x <= rectMaxX && p.y >= rectMinY && p.y <= rectMaxY) {
            isInside = true
            break
          }
        }
      } else {
        const bounds = getStrokeBounds(stroke)
        if (bounds) {
          const overlapX = bounds.minX <= rectMaxX && bounds.maxX >= rectMinX
          const overlapY = bounds.minY <= rectMaxY && bounds.maxY >= rectMinY
          if (overlapX && overlapY) {
            isInside = true
          }
        }
      }
      
      if (isInside) {
        result.push(stroke.id)
      }
    }
    
    return result
  }, [getPageStrokes, currentPage, getStrokeBounds])

  const startDrawing = useCallback((e: React.PointerEvent) => {
    const point = getCanvasPoint(e)
    const clientX = e.clientX
    const clientY = e.clientY
    const hasShiftKey = e.shiftKey
    
    if (e.pointerType === 'pen') {
      setCurrentPressure(e.pressure || 0.5)
    }

    if (activeTool === "select") {
      if (selectedStrokeId) {
        const stroke = getStrokeById(selectedStrokeId)
        const corner = getResizeCorner(point, stroke)
        if (corner) {
          setIsResizing(true)
          setResizeCorner(corner)
          return
        }
      }
      
      const strokeId = findStrokeAtPoint(point)
      if (strokeId) {
        if (hasShiftKey) {
          addToSelection(strokeId)
        } else {
          selectStroke(strokeId)
        }
        const stroke = getStrokeById(strokeId)
        if (stroke && stroke.points.length > 0) {
          setDragOffset({
            x: point.x - stroke.points[0].x,
            y: point.y - stroke.points[0].y,
          })
          setIsDragging(true)
        }
      } else {
        if (!hasShiftKey) {
          clearSelection()
        }
        setIsRubberBanding(true)
        setRubberBandStart(point)
        setRubberBandEnd(point)
      }
      return
    }

    if (activeTool === "pan") {
      setIsPanning(true)
      setLastPanPoint({ x: clientX, y: clientY })
      return
    }

    if (activeTool === "text") {
      selectStroke(null)
      currentStrokeRef.current = []
      webglRenderer.setCurrentStroke([], null)
      
      if (textInput && textInput.value.trim()) {
        const textSettings = getToolSettings("text")
        addStroke({
          points: [textInput.position],
          color: textSettings.color,
          thickness: textSettings.thickness,
          opacity: textSettings.opacity,
          tool: `text:${textInput.value}`,
          pageId: currentPage,
        })
      }
      setTextInput(null)
      
      if (pendingSymbol) {
        setIsDrawing(true)
        setSymbolStart(point)
        setSymbolEnd(point)
        return
      }
      
      setTextInput({ position: point, value: "" })
      setTimeout(() => textInputRef.current?.focus(), 10)
      return
    }

    selectStroke(null)
    currentStrokeRef.current = []
    webglRenderer.setCurrentStroke([], null)

    if (activeTool === "shapes") {
      setIsDrawing(true)
      setShapeStart(point)
      setShapeEnd(point)
      return
    }

    if (activeTool === "fill") {
      const strokeId = findStrokeAtPoint(point)
      if (strokeId) {
        const stroke = getStrokeById(strokeId)
        if (stroke && stroke.tool.startsWith("shape-")) {
          updateStroke(strokeId, { fillColor: getToolSettings("fill").color })
        }
      }
      return
    }

    if (activeTool !== "pen" && activeTool !== "highlighter" && activeTool !== "eraser") return

    setIsDrawing(true)
    currentStrokeRef.current = [point]
    
    if (webglReady) {
      const settings = getToolSettings(activeTool)
      webglRenderer.setCurrentStroke([point], {
        color: settings.color,
        thickness: settings.thickness,
        opacity: settings.opacity,
      })
    }
  }, [activeTool, getCanvasPoint, findStrokeAtPoint, selectStroke, getStrokeById, getResizeCorner, selectedStrokeId, textInput, pendingSymbol, addStroke, currentPage, addToSelection, clearSelection, updateStroke, webglReady])

  const draw = useCallback((e: React.PointerEvent) => {
    const clientX = e.clientX
    const clientY = e.clientY
    
    if (e.pointerType === 'pen') {
      setCurrentPressure(e.pressure || 0.5)
    }
    
    if (isPanning) {
      const dx = clientX - lastPanPoint.x
      const dy = clientY - lastPanPoint.y
      setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      setLastPanPoint({ x: clientX, y: clientY })
      return
    }

    if (isRubberBanding && rubberBandStart) {
      const point = getCanvasPoint(e)
      setRubberBandEnd(point)
      return
    }

    if (isResizing && selectedStrokeId && resizeCorner) {
      const point = getCanvasPoint(e)
      const stroke = getStrokeById(selectedStrokeId)
      if (!stroke) return

      if (stroke.tool.startsWith("shape-") && stroke.points.length >= 2) {
        let newPoints = [...stroke.points]
        
        if (resizeCorner === 'tl') {
          newPoints[0] = { x: point.x, y: point.y }
        } else if (resizeCorner === 'tr') {
          newPoints[0] = { x: stroke.points[0].x, y: point.y }
          newPoints[1] = { x: point.x, y: stroke.points[1].y }
        } else if (resizeCorner === 'bl') {
          newPoints[0] = { x: point.x, y: stroke.points[0].y }
          newPoints[1] = { x: stroke.points[1].x, y: point.y }
        } else if (resizeCorner === 'br') {
          newPoints[1] = { x: point.x, y: point.y }
        }
        
        updateStroke(selectedStrokeId, { points: newPoints })
      } else if (stroke.tool.startsWith("text:")) {
        const fontSize = Math.max(14, stroke.thickness * 4)
        const baseY = stroke.points[0].y
        const baseX = stroke.points[0].x
        
        let newFontSize = fontSize
        if (resizeCorner === 'br' || resizeCorner === 'tr') {
          newFontSize = Math.max(14, (point.x - baseX) * 1.5)
        } else if (resizeCorner === 'bl' || resizeCorner === 'tl') {
          newFontSize = Math.max(14, (baseY - point.y + fontSize) * 1.2)
        }
        
        const newThickness = Math.max(1, Math.min(100, Math.round(newFontSize / 4)))
        if (newThickness !== stroke.thickness) {
          updateStroke(selectedStrokeId, { thickness: newThickness })
        }
      }
      return
    }

    if (isDragging && selectedStrokeId) {
      const point = getCanvasPoint(e)
      const stroke = getStrokeById(selectedStrokeId)
      if (!stroke) return
      
      const newX = point.x - dragOffset.x
      const newY = point.y - dragOffset.y
      
      if (stroke.tool.startsWith("shape-") && stroke.points.length >= 2) {
        const dx = newX - stroke.points[0].x
        const dy = newY - stroke.points[0].y
        updateStroke(selectedStrokeId, {
          points: [
            { x: stroke.points[0].x + dx, y: stroke.points[0].y + dy },
            { x: stroke.points[1].x + dx, y: stroke.points[1].y + dy },
          ],
        })
      } else {
        updateStroke(selectedStrokeId, {
          points: [{ x: newX, y: newY }],
        })
      }
      return
    }

    if (!isDrawing) return

    const point = getCanvasPoint(e)

    if (activeTool === "shapes") {
      setShapeEnd(point)
      return
    }

    if (activeTool === "text" && pendingSymbol && symbolStart) {
      setSymbolEnd(point)
      return
    }

    if (activeTool === "eraser") {
      const strokeId = findStrokeAtPoint(point, true)
      if (strokeId) {
        deleteStroke(strokeId)
      }
      return
    }

    const lastPoint = currentStrokeRef.current[currentStrokeRef.current.length - 1]
    if (lastPoint) {
      const dist = Math.sqrt((point.x - lastPoint.x) ** 2 + (point.y - lastPoint.y) ** 2)
      if (dist < 1.5) return
    }

    currentStrokeRef.current.push(point)
    
    if (webglReady) {
      const settings = getToolSettings(activeTool)
      webglRenderer.setCurrentStroke(currentStrokeRef.current, {
        color: settings.color,
        thickness: settings.thickness,
        opacity: settings.opacity,
      })
    }
  }, [isDrawing, isPanning, isDragging, isResizing, isRubberBanding, rubberBandStart, resizeCorner, lastPanPoint, getCanvasPoint, activeTool, pendingSymbol, symbolStart, selectedStrokeId, dragOffset, updateStroke, getStrokeById, findStrokeAtPoint, deleteStroke, webglReady])

  const stopDrawing = useCallback(() => {
    if (isRubberBanding) {
      if (rubberBandStart && rubberBandEnd) {
        const width = Math.abs(rubberBandEnd.x - rubberBandStart.x)
        const height = Math.abs(rubberBandEnd.y - rubberBandStart.y)
        if (width > 5 || height > 5) {
          const selectedIds = findStrokesInRect(rubberBandStart, rubberBandEnd)
          if (selectedIds.length > 0) {
            selectStrokes(selectedIds)
          }
        }
      }
      setIsRubberBanding(false)
      setRubberBandStart(null)
      setRubberBandEnd(null)
      return
    }

    if (isResizing) {
      setIsResizing(false)
      setResizeCorner(null)
      return
    }

    if (isDragging) {
      setIsDragging(false)
      return
    }

    if (isPanning) {
      setIsPanning(false)
      return
    }

    if (!isDrawing) return

    if (activeTool === "shapes" && shapeStart && shapeEnd) {
      const width = Math.abs(shapeEnd.x - shapeStart.x)
      const height = Math.abs(shapeEnd.y - shapeStart.y)
      
      let finalStart = shapeStart
      let finalEnd = shapeEnd
      
      if (width < 10 && height < 10) {
        finalEnd = { x: shapeStart.x + 100, y: shapeStart.y + 100 }
      }
      
      const shapeSettings = getToolSettings("shapes")
      addStroke({
        points: [finalStart, finalEnd],
        color: shapeSettings.borderColor || shapeSettings.color,
        thickness: shapeSettings.thickness,
        opacity: shapeSettings.opacity,
        tool: `shape-${activeShape}`,
        pageId: currentPage,
        backgroundColor: shapeSettings.backgroundColor !== "transparent" ? shapeSettings.backgroundColor : undefined,
      })
      setShapeStart(null)
      setShapeEnd(null)
      setIsDrawing(false)
      currentStrokeRef.current = []
      webglRenderer.setCurrentStroke([], null)
      webglRenderer.setShapePreview(null)
      return
    }

    if (activeTool === "text" && pendingSymbol && symbolStart && symbolEnd) {
      const width = Math.abs(symbolEnd.x - symbolStart.x)
      const height = Math.abs(symbolEnd.y - symbolStart.y)
      const size = Math.max(width, height)
      
      const textSettings = getToolSettings("text")
      const thickness = size < 10 ? 8 : Math.max(1, Math.min(20, Math.round(size / 4)))
      
      addStroke({
        points: [symbolStart],
        color: textSettings.color,
        thickness: thickness,
        opacity: textSettings.opacity,
        tool: `text:${pendingSymbol}`,
        pageId: currentPage,
      })
      setSymbolStart(null)
      setSymbolEnd(null)
      setIsDrawing(false)
      currentStrokeRef.current = []
      webglRenderer.setCurrentStroke([], null)
      webglRenderer.setSymbolPreview(null)
      onSymbolPlaced?.()
      return
    }

    if (currentStrokeRef.current.length === 0) {
      setIsDrawing(false)
      return
    }

    if (activeTool === "eraser") {
      currentStrokeRef.current = []
      webglRenderer.setCurrentStroke([], null)
      setIsDrawing(false)
      return
    }

    const currentToolSettings = getToolSettings(activeTool)
    const pressureMultiplier = pressureSensitivity ? (0.5 + currentPressure) : 1
    const finalThickness = Math.round(currentToolSettings.thickness * pressureMultiplier)

    addStroke({
      points: currentStrokeRef.current,
      color: currentToolSettings.color,
      thickness: finalThickness,
      opacity: currentToolSettings.opacity,
      tool: activeTool,
      pageId: currentPage,
    })

    currentStrokeRef.current = []
    webglRenderer.setCurrentStroke([], null)
    setIsDrawing(false)
  }, [isDrawing, isPanning, isDragging, isResizing, activeTool, currentPage, addStroke, shapeStart, shapeEnd, activeShape, pendingSymbol, symbolStart, symbolEnd, onSymbolPlaced, currentPressure, pressureSensitivity, isRubberBanding, rubberBandStart, rubberBandEnd, findStrokesInRect, selectStrokes])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      
      const isCtrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      
      if (isCtrl && key === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (isCtrl && key === "y") {
        e.preventDefault()
        redo()
        return
      }
      if (isCtrl && key === "c") {
        e.preventDefault()
        copySelected()
        return
      }
      if (isCtrl && key === "x") {
        e.preventDefault()
        cutSelected()
        return
      }
      if (isCtrl && key === "v") {
        e.preventDefault()
        paste(currentPage)
        return
      }
      if (isCtrl && key === "d") {
        e.preventDefault()
        duplicateSelected(currentPage)
        return
      }
      if (key === "delete" || key === "backspace") {
        if (selectedStrokeIds.length > 0) {
          e.preventDefault()
          deleteSelectedStrokes()
        }
        return
      }
      if (isCtrl && key === "a" && activeTool === "select") {
        e.preventDefault()
        const pageStrokes = getPageStrokes(currentPage)
        selectStrokes(pageStrokes.map(s => s.id))
        return
      }
      if (key === "escape") {
        clearSelection()
        return
      }
    }
    
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [undo, redo, copySelected, cutSelected, paste, duplicateSelected, deleteSelectedStrokes, currentPage, selectedStrokeIds, activeTool, getPageStrokes, selectStrokes, clearSelection])

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -10 : 10
      setIsZooming(delta > 0 ? 'in' : 'out')
      onZoomChange(Math.min(Math.max(zoom + delta, 25), 400))
      setTimeout(() => setIsZooming(null), 300)
    }
  }, [zoom, onZoomChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [handleWheel])

  const getCursor = useCallback(() => {
    if (isZooming === 'in') return "zoom-in"
    if (isZooming === 'out') return "zoom-out"
    if (isResizing) {
      if (resizeCorner === 'tl' || resizeCorner === 'br') return "nwse-resize"
      if (resizeCorner === 'tr' || resizeCorner === 'bl') return "nesw-resize"
    }
    if (isDragging) return "move"
    switch (activeTool) {
      case "select": return selectedStrokeId ? "move" : "default"
      case "pan": return isPanning ? "grabbing" : "grab"
      case "pen":
      case "highlighter":
      case "shapes": return "crosshair"
      case "eraser": return "cell"
      case "text": return pendingSymbol ? "crosshair" : "text"
      case "fill": return "pointer"
      default: return "default"
    }
  }, [activeTool, isPanning, pendingSymbol, isDragging, selectedStrokeId, isResizing, resizeCorner, isZooming])

  return (
    <TooltipProvider delayDuration={0}>
      <main className="relative flex flex-1 flex-col overflow-hidden bg-zinc-300/70 dark:bg-zinc-900/50">
        <div className="absolute inset-x-0 top-4 z-10 flex justify-center">
          <div className="flex items-center gap-1 rounded-2xl border border-border/50 bg-background/95 px-3 py-2 shadow-xl backdrop-blur-xl dark:bg-zinc-900/95">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom Out</TooltipContent>
            </Tooltip>

            <button onClick={handleResetZoom} className="flex min-w-[56px] items-center justify-center rounded-lg px-2 py-1 text-sm font-medium tabular-nums hover:bg-accent">
              {zoom}%
            </button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom In</TooltipContent>
            </Tooltip>

            <div className="mx-2 h-5 w-px bg-border/50" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg disabled:opacity-40" onClick={onPrevPage} disabled={currentPageIndex <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous Page</TooltipContent>
            </Tooltip>

            <div className="flex items-center gap-1.5 px-1">
              <span className="text-sm font-semibold tabular-nums">{currentPageIndex}</span>
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-sm text-muted-foreground tabular-nums">{totalPages}</span>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg disabled:opacity-40" onClick={onNextPage} disabled={currentPageIndex >= totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next Page</TooltipContent>
            </Tooltip>

            <div className="mx-2 h-5 w-px bg-border/50" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handleResetZoom}>
                  <Maximize className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit to Page</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handleResetZoom}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset View</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div
          ref={containerRef}
          className="flex flex-1 items-center justify-center overflow-hidden touch-none"
          style={{ cursor: getCursor() }}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          onPointerCancel={stopDrawing}
        >
          <div
            className="relative transition-transform duration-100 ease-out"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
              transformOrigin: "center center",
            }}
          >
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="shadow-2xl dark:shadow-black/50"
              style={{ cursor: getCursor() }}
            />

            <div className="pointer-events-none absolute -inset-4 rounded-sm border-2 border-dashed border-violet-500/20" />

            <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-muted-foreground">
              {canvasWidth} × {canvasHeight} px · Page {currentPage}
              {webglReady && showFpsCounter && (
                <span className="ml-2 text-green-500">
                  ⚡ {fps} FPS
                  {gpuInfo && gpuInfo !== "Unknown" && <span className="ml-1 text-violet-500">({gpuInfo.split(" - ")[1]?.split("/")[0] || "GPU"})</span>}
                </span>
              )}
            </div>

            {textInput && (
              <input
                ref={textInputRef}
                type="text"
                value={textInput.value}
                onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === "Enter") handleTextSubmit()
                  if (e.key === "Escape") setTextInput(null)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute border-0 bg-transparent outline-none caret-current"
                style={{
                  left: textInput.position.x,
                  top: textInput.position.y - 8,
                  fontSize: Math.max(16, getToolSettings("text").thickness * 5),
                  color: getToolSettings("text").color,
                  minWidth: 20,
                  width: Math.max(20, textInput.value.length * 12 + 20),
                }}
                autoFocus
              />
            )}
          </div>
        </div>

        {selectedStrokeIds.length > 0 && (
          <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur-xl">
            <div className="flex items-center gap-2">
              {selectedStrokeIds.length > 1 && (
                <span className="px-2 text-xs text-muted-foreground">{selectedStrokeIds.length} selected</span>
              )}

              <div className="flex items-center gap-0.5 rounded-full bg-muted p-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 rounded-full text-xs" onClick={() => copySelected()}>📋</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 rounded-full text-xs" onClick={() => cutSelected()}>✂️</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 rounded-full text-xs" onClick={() => duplicateSelected(currentPage)}>📑</Button>
              </div>

              {selectedStrokeIds.length === 1 && selectedStrokeId && (
                <>
                  <div className="h-6 w-px bg-border" />
                  <div className="flex items-center gap-0.5 rounded-full bg-muted p-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 rounded-full p-0" onClick={() => {
                      const stroke = getStrokeById(selectedStrokeId)
                      if (stroke) {
                        if (stroke.tool.startsWith("shape-") && stroke.points.length >= 2) {
                          updateStroke(selectedStrokeId, { points: [{ x: stroke.points[0].x - 10, y: stroke.points[0].y }, { x: stroke.points[1].x - 10, y: stroke.points[1].y }] })
                        } else {
                          updateStroke(selectedStrokeId, { points: [{ x: stroke.points[0].x - 10, y: stroke.points[0].y }] })
                        }
                      }
                    }}>←</Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 rounded-full p-0" onClick={() => {
                      const stroke = getStrokeById(selectedStrokeId)
                      if (stroke) {
                        if (stroke.tool.startsWith("shape-") && stroke.points.length >= 2) {
                          updateStroke(selectedStrokeId, { points: [{ x: stroke.points[0].x + 10, y: stroke.points[0].y }, { x: stroke.points[1].x + 10, y: stroke.points[1].y }] })
                        } else {
                          updateStroke(selectedStrokeId, { points: [{ x: stroke.points[0].x + 10, y: stroke.points[0].y }] })
                        }
                      }
                    }}>→</Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 rounded-full p-0" onClick={() => {
                      const stroke = getStrokeById(selectedStrokeId)
                      if (stroke) {
                        if (stroke.tool.startsWith("shape-") && stroke.points.length >= 2) {
                          updateStroke(selectedStrokeId, { points: [{ x: stroke.points[0].x, y: stroke.points[0].y - 10 }, { x: stroke.points[1].x, y: stroke.points[1].y - 10 }] })
                        } else {
                          updateStroke(selectedStrokeId, { points: [{ x: stroke.points[0].x, y: stroke.points[0].y - 10 }] })
                        }
                      }
                    }}>↑</Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 rounded-full p-0" onClick={() => {
                      const stroke = getStrokeById(selectedStrokeId)
                      if (stroke) {
                        if (stroke.tool.startsWith("shape-") && stroke.points.length >= 2) {
                          updateStroke(selectedStrokeId, { points: [{ x: stroke.points[0].x, y: stroke.points[0].y + 10 }, { x: stroke.points[1].x, y: stroke.points[1].y + 10 }] })
                        } else {
                          updateStroke(selectedStrokeId, { points: [{ x: stroke.points[0].x, y: stroke.points[0].y + 10 }] })
                        }
                      }
                    }}>↓</Button>
                  </div>
                </>
              )}

              <div className="h-6 w-px bg-border" />
              <Button variant="ghost" size="sm" className="h-7 w-7 rounded-full p-0 text-red-500 hover:bg-red-100 dark:hover:bg-red-900" onClick={() => deleteSelectedStrokes()}>🗑</Button>
              <div className="h-6 w-px bg-border" />
              <Button variant="ghost" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => clearSelection()}>✓</Button>
            </div>
          </div>
        )}
      </main>
    </TooltipProvider>
  )
}
