"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Header } from "@/components/Header"
import { WebGLViewer } from "@/components/WebGLViewer"
import { Dock, type Tool, type ShapeType } from "@/components/Dock"
import { Sidebar } from "@/components/Sidebar"
import { Inspector } from "@/components/Inspector"
import { ThemeProvider } from "@/components/ThemeProvider"
import { useCanvasStore, usePdfStore, useSettingsStore } from "@/lib/store"

interface Page {
  id: number
  name: string
  hasAnnotations: boolean
}

interface ToolSettings {
  color: string
  thickness: number
  opacity: number
  borderColor?: string
  backgroundColor?: string
}

const defaultToolSettings: Record<string, ToolSettings> = {
  pen: { color: "#18181b", thickness: 3, opacity: 100 },
  highlighter: { color: "#eab308", thickness: 20, opacity: 40 },
  eraser: { color: "#ffffff", thickness: 20, opacity: 100 },
  shapes: { color: "#3b82f6", thickness: 2, opacity: 100, borderColor: "#3b82f6", backgroundColor: "transparent" },
  text: { color: "#18181b", thickness: 4, opacity: 100 },
  fill: { color: "#ef4444", thickness: 1, opacity: 100 },
}

export default function Home() {
  const [pages, setPages] = useState<Page[]>([
    { id: 1, name: "Page 1", hasAnnotations: false },
  ])
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [activeTool, setActiveTool] = useState<Tool>("select")
  const [activeShape, setActiveShape] = useState<ShapeType>("rectangle")
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null)
  
  const [toolSettings, setToolSettings] = useState<Record<string, ToolSettings>>(defaultToolSettings)
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  
  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas
    setCanvasElement(canvas)
  }, [])
  
  const currentSettings = toolSettings[activeTool] || toolSettings.pen
  
  const updateCurrentToolSettings = useCallback((updates: Partial<ToolSettings>) => {
    const toolKey = activeTool === "select" || activeTool === "pan" || activeTool === "math" ? "pen" : activeTool
    setToolSettings(prev => ({
      ...prev,
      [toolKey]: { ...prev[toolKey], ...updates }
    }))
  }, [activeTool])

  const clearPdf = usePdfStore(s => s.clearPdf)

  const handleAddPage = useCallback(() => {
    const newId = Math.max(...pages.map(p => p.id)) + 1
    setPages(prev => [...prev, { id: newId, name: `Page ${newId}`, hasAnnotations: false }])
    setCurrentPage(newId)
  }, [pages])

  const handleDeletePage = useCallback((id: number) => {
    if (pages.length <= 1) return
    setPages(prev => prev.filter(p => p.id !== id))
    if (currentPage === id) {
      const remaining = pages.filter(p => p.id !== id)
      setCurrentPage(remaining[0]?.id || 1)
    }
  }, [pages, currentPage])

  const handleNewFile = useCallback(() => {
    clearPdf()
    setPages([{ id: 1, name: "Page 1", hasAnnotations: false }])
    setCurrentPage(1)
  }, [clearPdf])


  const { undo, redo, canUndo, canRedo, strokes } = useCanvasStore()
  const { pagesMeta, pdfPath } = usePdfStore()
  const { autoSave, autoSaveInterval } = useSettingsStore()

  useEffect(() => {
    if (!autoSave) return
    
    const saveData = () => {
      try {
        const data = {
          strokes,
          pages,
          currentPage,
          pdfPath,
          timestamp: Date.now(),
        }
        localStorage.setItem("annotate-studio-autosave", JSON.stringify(data))
        console.log("Auto-saved at", new Date().toLocaleTimeString())
      } catch (e) {
        console.error("Auto-save failed:", e)
      }
    }
    
    const interval = setInterval(saveData, autoSaveInterval * 1000)
    return () => clearInterval(interval)
  }, [autoSave, autoSaveInterval, strokes, pages, currentPage, pdfPath])

  const handlePdfLoaded = useCallback(() => {
    if (pagesMeta && pagesMeta.length > 0) {
      const newPages = pagesMeta.map((p) => ({
        id: p.pageNumber,
        name: `Page ${p.pageNumber}`,
        hasAnnotations: false,
      }))
      setPages(newPages)
      setCurrentPage(1)
    }
  }, [pagesMeta])

  useEffect(() => {
    if (pagesMeta && pagesMeta.length > 0) {
      handlePdfLoaded()
    }
  }, [pagesMeta, handlePdfLoaded])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case "=":
          case "+":
            e.preventDefault()
            setZoom((prev) => Math.min(prev + 25, 400))
            break
          case "-":
            e.preventDefault()
            setZoom((prev) => Math.max(prev - 25, 25))
            break
        }
      } else {
        switch (e.key.toLowerCase()) {
          case "v":
            setActiveTool("select")
            break
          case "h":
            setActiveTool("pan")
            break
          case "p":
            setActiveTool("pen")
            break
          case "m":
            setActiveTool("highlighter")
            break
          case "e":
            setActiveTool("eraser")
            break
          case "t":
            setActiveTool("text")
            break
          case "r":
            setActiveShape("rectangle")
            setActiveTool("shapes")
            break
          case "o":
            setActiveShape("circle")
            setActiveTool("shapes")
            break
          case "l":
            setActiveShape("line")
            setActiveTool("shapes")
            break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <ThemeProvider defaultTheme="light" storageKey="luminapdf-theme">
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <Header
          onNewFile={handleNewFile}
          onZoomIn={() => setZoom(prev => Math.min(prev + 25, 400))}
          onZoomOut={() => setZoom(prev => Math.max(prev - 25, 25))}
          onResetZoom={() => setZoom(100)}
          onPdfLoaded={handlePdfLoaded}
          currentPage={currentPage}
          canvasRef={canvasRef}
        />
        <div className="relative flex flex-1 overflow-hidden">
          <Sidebar
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            pages={pages}
            onAddPage={handleAddPage}
            onDeletePage={handleDeletePage}
          />
          <WebGLViewer
            currentPage={currentPage}
            currentPageIndex={pages.findIndex(p => p.id === currentPage) + 1}
            totalPages={pages.length}
            zoom={zoom}
            onZoomChange={setZoom}
            onPageChange={setCurrentPage}
            onPrevPage={() => {
              const idx = pages.findIndex(p => p.id === currentPage)
              if (idx > 0) setCurrentPage(pages[idx - 1].id)
            }}
            onNextPage={() => {
              const idx = pages.findIndex(p => p.id === currentPage)
              if (idx < pages.length - 1) setCurrentPage(pages[idx + 1].id)
            }}
            activeTool={activeTool}
            activeShape={activeShape}
            toolSettings={toolSettings}
            pendingSymbol={pendingSymbol}
            onSymbolPlaced={() => {
              setPendingSymbol(null)
              setActiveTool("select")
            }}
            onCanvasReady={handleCanvasReady}
          />
          <Inspector
            activeTool={activeTool}
            currentSettings={currentSettings}
            onSettingsChange={updateCurrentToolSettings}
          />
        </div>
        <Dock
          activeTool={activeTool}
          onToolChange={setActiveTool}
          activeShape={activeShape}
          onShapeChange={setActiveShape}
          canUndo={canUndo()}
          canRedo={canRedo()}
          onUndo={undo}
          onRedo={redo}
          onInsertSymbol={(symbol) => {
            setPendingSymbol(symbol)
            setActiveTool("text")
          }}
        />
      </div>
    </ThemeProvider>
  )
}
