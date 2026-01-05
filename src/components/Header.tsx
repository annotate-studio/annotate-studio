"use client"

import { useState, memo, useCallback, useEffect } from "react"
import { Download, Keyboard, Info, FilePlus, FolderOpen, Save, Undo2, Redo2, Scissors, Copy, ClipboardPaste, ZoomIn, ZoomOut, Maximize, Expand, GithubIcon, ExternalLink, Loader2, RefreshCw, Bell, Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCanvasStore, usePdfStore } from "@/lib/store"
import { openPdfDialog, openPdf, saveProjectDialog, saveProject, exportDialog, exportCanvas, exportToPdf } from "@/lib/tauri"
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import useThemeToggle from "@/hooks/useThemeToggle"

const shortcuts = [
  {
    category: "File", items: [
      { key: "Ctrl+N", action: "New File" },
      { key: "Ctrl+O", action: "Open PDF" },
      { key: "Ctrl+S", action: "Save" },
      { key: "Ctrl+Shift+S", action: "Save As" },
    ]
  },
  {
    category: "Edit", items: [
      { key: "Ctrl+Z", action: "Undo" },
      { key: "Ctrl+Y", action: "Redo" },
      { key: "Ctrl+Shift+Z", action: "Redo" },
      { key: "Ctrl+X", action: "Cut" },
      { key: "Ctrl+C", action: "Copy" },
      { key: "Ctrl+V", action: "Paste" },
      { key: "Ctrl+D", action: "Duplicate" },
      { key: "Delete", action: "Delete Selected" },
      { key: "Ctrl+A", action: "Select All" },
    ]
  },
  {
    category: "Tools", items: [
      { key: "V", action: "Select Tool" },
      { key: "H", action: "Pan / Hand Tool" },
      { key: "P", action: "Pen Tool" },
      { key: "M", action: "Highlighter" },
      { key: "E", action: "Eraser" },
      { key: "T", action: "Text Tool" },
    ]
  },
  {
    category: "Shapes", items: [
      { key: "R", action: "Rectangle" },
      { key: "C", action: "Circle / Ellipse" },
      { key: "L", action: "Line" },
      { key: "A", action: "Arrow" },
    ]
  },
  {
    category: "View", items: [
      { key: "Ctrl++", action: "Zoom In" },
      { key: "Ctrl+-", action: "Zoom Out" },
      { key: "Ctrl+0", action: "Reset Zoom" },
      { key: "Ctrl+Scroll", action: "Zoom In/Out" },
      { key: "F11", action: "Full Screen" },
    ]
  },
  {
    category: "Selection", items: [
      { key: "Click + Drag", action: "Rubber Band Select" },
      { key: "Shift+Click", action: "Add to Selection" },
      { key: "Corner Drag", action: "Resize Selected" },
    ]
  },
]

interface HeaderProps {
  onNewFile?: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onResetZoom?: () => void
  onFullScreen?: () => void
  onPdfLoaded?: () => void
  currentPage?: number
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
}

const APP_VERSION = "1.0.0"
const GITHUB_REPO = "annotate-studio/annotate-studio"
const CHECK_INTERVAL = 10 * 60 * 1000

interface GitHubRelease {
  tag_name: string
  html_url: string
  name: string
  published_at: string
}

function HeaderComponent({ onNewFile, onZoomIn, onZoomOut, onResetZoom, onFullScreen, onPdfLoaded, currentPage = 1, canvasRef }: HeaderProps) {
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState<GitHubRelease | null>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)

  const checkForUpdates = useCallback(async (showNoUpdate = false) => {
    try {
      setIsCheckingUpdate(true)
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
      if (!response.ok) return

      const release: GitHubRelease = await response.json()
      const latestVersion = release.tag_name.replace(/^v/, "")

      if (latestVersion !== APP_VERSION) {
        setUpdateAvailable(release)
        setShowUpdate(true)
      } else if (showNoUpdate) {
        setUpdateAvailable(null)
      }
    } catch (err) {
      
    } finally {
      setIsCheckingUpdate(false)
    }
  }, [])

  useEffect(() => {
    checkForUpdates()
    const interval = setInterval(() => checkForUpdates(), CHECK_INTERVAL)
    return () => clearInterval(interval)
  }, [checkForUpdates])

  const undo = useCanvasStore(s => s.undo)
  const redo = useCanvasStore(s => s.redo)
  const canUndo = useCanvasStore(s => s.canUndo)
  const canRedo = useCanvasStore(s => s.canRedo)
  const copySelected = useCanvasStore(s => s.copySelected)
  const cutSelected = useCanvasStore(s => s.cutSelected)
  const paste = useCanvasStore(s => s.paste)
  const selectedStrokeIds = useCanvasStore(s => s.selectedStrokeIds)
  const clipboard = useCanvasStore(s => s.clipboard)
  const strokes = useCanvasStore(s => s.strokes)

  const setPdfPath = usePdfStore(s => s.setPdfPath)
  const pdfPath = usePdfStore(s => s.pdfPath)
  const pagesMeta = usePdfStore(s => s.pagesMeta)
  const setPagesMeta = usePdfStore(s => s.setPagesMeta)
  const setLoading = usePdfStore(s => s.setLoading)
  const setError = usePdfStore(s => s.setError)
  const isLoading = usePdfStore(s => s.isLoading)
  const clearPdf = usePdfStore(s => s.clearPdf)

  const handleOpenPdf = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      clearPdf()

      const { open } = await import("@tauri-apps/plugin-dialog")
      
      const filePath = await open({
        multiple: false,
        filters: [
          { name: "PDF Files", extensions: ["pdf"] },
          { name: "Annotate Studio Project", extensions: ["asp"] },
        ],
      })

      if (!filePath || typeof filePath !== "string") {
        setLoading(false)
        return
      }

      if (filePath.toLowerCase().endsWith(".asp")) {
        const { loadProject } = await import("@/lib/tauri")
        const projectData = await loadProject(filePath)
        
        if (projectData && projectData.pdf_path) {
          const pdfInfo = await openPdf(projectData.pdf_path)
          
          if (pdfInfo) {
            setPdfPath(pdfInfo.path)
            setPagesMeta(
              pdfInfo.pages_meta.map((p) => ({
                pageNumber: p.page_number,
                width: p.width,
                height: p.height,
              }))
            )
            
            const loadedStrokes = JSON.parse(projectData.strokes)
            useCanvasStore.setState({ strokes: loadedStrokes })
            
            setCurrentProjectPath(filePath)
            onPdfLoaded?.()
          }
        }
      } else {
        const pdfInfo = await openPdf(filePath)

        if (pdfInfo) {
          setPdfPath(pdfInfo.path)
          setPagesMeta(
            pdfInfo.pages_meta.map((p) => ({
              pageNumber: p.page_number,
              width: p.width,
              height: p.height,
            }))
          )
          onPdfLoaded?.()
        }
      }
    } catch (err) {
      console.error("[Frontend] Error:", err)
      setError(err instanceof Error ? err.message : "Failed to open PDF")
    } finally {
      setLoading(false)
    }
  }, [setLoading, setError, clearPdf, setPdfPath, setPagesMeta, onPdfLoaded])

  const handleFullScreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!currentProjectPath) {
      handleSaveAs()
      return
    }

    try {
      setIsSaving(true)

      if (currentProjectPath.toLowerCase().endsWith(".pdf")) {
        if (!pdfPath || !canvasRef?.current) {
          setIsSaving(false)
          return
        }
        
        setExportProgress({ current: 0, total: pagesMeta.length })
        
        const allPages: any[] = []
        const { renderPdfPage } = await import("@/lib/tauri")
        const BATCH_SIZE = 5
        
        for (let batchStart = 0; batchStart < pagesMeta.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, pagesMeta.length)
          const batchPromises = []
          
          for (let i = batchStart; i < batchEnd; i++) {
            const pageMeta = pagesMeta[i]
            
            batchPromises.push((async () => {
              const offscreenCanvas = document.createElement('canvas')
              offscreenCanvas.width = pageMeta.width
              offscreenCanvas.height = pageMeta.height
              const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: false })
              
              if (ctx) {
                const pdfPageData = await renderPdfPage(pdfPath, pageMeta.pageNumber, 2400)
                
                if (pdfPageData) {
                  const img = new Image()
                  await new Promise((resolve) => {
                    img.onload = resolve
                    img.src = pdfPageData.image_data
                  })
                  ctx.drawImage(img, 0, 0, pageMeta.width, pageMeta.height)
                }
                
                const pageStrokes = strokes.filter(s => s.pageId === pageMeta.pageNumber)
                
                for (const stroke of pageStrokes) {
                  ctx.strokeStyle = stroke.color
                  ctx.lineWidth = stroke.thickness
                  ctx.globalAlpha = stroke.opacity / 100
                  ctx.lineCap = 'round'
                  ctx.lineJoin = 'round'
                  
                  if (stroke.tool === 'pen' || stroke.tool === 'highlighter') {
                    if (stroke.points.length > 1) {
                      ctx.beginPath()
                      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
                      for (let j = 1; j < stroke.points.length; j++) {
                        ctx.lineTo(stroke.points[j].x, stroke.points[j].y)
                      }
                      ctx.stroke()
                    }
                  } else if (stroke.tool.startsWith('shape-')) {
                    if (stroke.points.length >= 2) {
                      const [p1, p2] = stroke.points
                      const shapeType = stroke.tool.replace('shape-', '')
                      
                      ctx.strokeStyle = stroke.color
                      if (stroke.backgroundColor && stroke.backgroundColor !== 'transparent') {
                        ctx.fillStyle = stroke.backgroundColor
                      }
                      
                      if (shapeType === 'rectangle') {
                        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
                        if (stroke.backgroundColor && stroke.backgroundColor !== 'transparent') {
                          ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
                        }
                      } else if (shapeType === 'circle') {
                        const rx = Math.abs(p2.x - p1.x) / 2
                        const ry = Math.abs(p2.y - p1.y) / 2
                        const cx = (p1.x + p2.x) / 2
                        const cy = (p1.y + p2.y) / 2
                        ctx.beginPath()
                        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
                        ctx.stroke()
                        if (stroke.backgroundColor && stroke.backgroundColor !== 'transparent') {
                          ctx.fill()
                        }
                      } else if (shapeType === 'line') {
                        ctx.beginPath()
                        ctx.moveTo(p1.x, p1.y)
                        ctx.lineTo(p2.x, p2.y)
                        ctx.stroke()
                      } else if (shapeType === 'arrow') {
                        ctx.beginPath()
                        ctx.moveTo(p1.x, p1.y)
                        ctx.lineTo(p2.x, p2.y)
                        ctx.stroke()
                        
                        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
                        const arrowLength = 15
                        ctx.beginPath()
                        ctx.moveTo(p2.x, p2.y)
                        ctx.lineTo(p2.x - arrowLength * Math.cos(angle - Math.PI / 6), p2.y - arrowLength * Math.sin(angle - Math.PI / 6))
                        ctx.moveTo(p2.x, p2.y)
                        ctx.lineTo(p2.x - arrowLength * Math.cos(angle + Math.PI / 6), p2.y - arrowLength * Math.sin(angle + Math.PI / 6))
                        ctx.stroke()
                      }
                    }
                  } else if (stroke.tool.startsWith('text:')) {
                    const text = stroke.tool.replace('text:', '')
                    const fontSize = Math.max(14, stroke.thickness * 4)
                    ctx.font = `${fontSize}px Arial`
                    ctx.fillStyle = stroke.color
                    ctx.fillText(text, stroke.points[0].x, stroke.points[0].y)
                  }
                  
                  ctx.globalAlpha = 1
                }
                
                const imageData = offscreenCanvas.toDataURL('image/png', 0.95)
                
                offscreenCanvas.width = 0
                offscreenCanvas.height = 0
                
                return {
                  index: i,
                  data: {
                    image_data: imageData,
                    width: pageMeta.width,
                    height: pageMeta.height,
                  }
                }
              }
              return null
            })())
          }
          
          const batchResults = await Promise.all(batchPromises)
          
          for (const result of batchResults) {
            if (result) {
              allPages[result.index] = result.data
              setExportProgress({ current: result.index + 1, total: pagesMeta.length })
            }
          }
          
          if (batchEnd < pagesMeta.length) {
            await new Promise(resolve => setTimeout(resolve, 10))
          }
        }
        
        await exportToPdf(currentProjectPath, allPages.filter(p => p))
        setExportProgress(null)
      } else {
        const strokesJson = JSON.stringify(strokes)
        await saveProject(currentProjectPath, pdfPath, strokesJson)
      }
    } catch (err) {
      console.error("Save failed:", err)
      setExportProgress(null)
    } finally {
      setIsSaving(false)
    }
  }, [currentProjectPath, strokes, pdfPath, canvasRef, pagesMeta])

  const handleSaveAs = useCallback(async () => {
    try {
      setIsSaving(true)
      const filePath = await saveProjectDialog()
      if (!filePath) {
        setIsSaving(false)
        return
      }

      if (filePath.toLowerCase().endsWith(".pdf")) {
        if (!pdfPath || !canvasRef?.current) {
          setIsSaving(false)
          return
        }
        
        setExportProgress({ current: 0, total: pagesMeta.length })
        
        const allPages: any[] = []
        const { renderPdfPage } = await import("@/lib/tauri")
        const BATCH_SIZE = 5
        
        for (let batchStart = 0; batchStart < pagesMeta.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, pagesMeta.length)
          const batchPromises = []
          
          for (let i = batchStart; i < batchEnd; i++) {
            const pageMeta = pagesMeta[i]
            
            batchPromises.push((async () => {
              const offscreenCanvas = document.createElement('canvas')
              offscreenCanvas.width = pageMeta.width
              offscreenCanvas.height = pageMeta.height
              const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: false })
              
              if (ctx) {
                const pdfPageData = await renderPdfPage(pdfPath, pageMeta.pageNumber, 2400)
                
                if (pdfPageData) {
                  const img = new Image()
                  await new Promise((resolve) => {
                    img.onload = resolve
                    img.src = pdfPageData.image_data
                  })
                  ctx.drawImage(img, 0, 0, pageMeta.width, pageMeta.height)
                }
                
                const pageStrokes = strokes.filter(s => s.pageId === pageMeta.pageNumber)
                
                for (const stroke of pageStrokes) {
                  ctx.strokeStyle = stroke.color
                  ctx.lineWidth = stroke.thickness
                  ctx.globalAlpha = stroke.opacity / 100
                  ctx.lineCap = 'round'
                  ctx.lineJoin = 'round'
                  
                  if (stroke.tool === 'pen' || stroke.tool === 'highlighter') {
                    if (stroke.points.length > 1) {
                      ctx.beginPath()
                      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
                      for (let j = 1; j < stroke.points.length; j++) {
                        ctx.lineTo(stroke.points[j].x, stroke.points[j].y)
                      }
                      ctx.stroke()
                    }
                  } else if (stroke.tool.startsWith('shape-')) {
                    if (stroke.points.length >= 2) {
                      const [p1, p2] = stroke.points
                      const shapeType = stroke.tool.replace('shape-', '')
                      
                      ctx.strokeStyle = stroke.color
                      if (stroke.backgroundColor && stroke.backgroundColor !== 'transparent') {
                        ctx.fillStyle = stroke.backgroundColor
                      }
                      
                      if (shapeType === 'rectangle') {
                        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
                        if (stroke.backgroundColor && stroke.backgroundColor !== 'transparent') {
                          ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
                        }
                      } else if (shapeType === 'circle') {
                        const rx = Math.abs(p2.x - p1.x) / 2
                        const ry = Math.abs(p2.y - p1.y) / 2
                        const cx = (p1.x + p2.x) / 2
                        const cy = (p1.y + p2.y) / 2
                        ctx.beginPath()
                        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
                        ctx.stroke()
                        if (stroke.backgroundColor && stroke.backgroundColor !== 'transparent') {
                          ctx.fill()
                        }
                      } else if (shapeType === 'line') {
                        ctx.beginPath()
                        ctx.moveTo(p1.x, p1.y)
                        ctx.lineTo(p2.x, p2.y)
                        ctx.stroke()
                      } else if (shapeType === 'arrow') {
                        ctx.beginPath()
                        ctx.moveTo(p1.x, p1.y)
                        ctx.lineTo(p2.x, p2.y)
                        ctx.stroke()
                        
                        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
                        const arrowLength = 15
                        ctx.beginPath()
                        ctx.moveTo(p2.x, p2.y)
                        ctx.lineTo(p2.x - arrowLength * Math.cos(angle - Math.PI / 6), p2.y - arrowLength * Math.sin(angle - Math.PI / 6))
                        ctx.moveTo(p2.x, p2.y)
                        ctx.lineTo(p2.x - arrowLength * Math.cos(angle + Math.PI / 6), p2.y - arrowLength * Math.sin(angle + Math.PI / 6))
                        ctx.stroke()
                      }
                    }
                  } else if (stroke.tool.startsWith('text:')) {
                    const text = stroke.tool.replace('text:', '')
                    const fontSize = Math.max(14, stroke.thickness * 4)
                    ctx.font = `${fontSize}px Arial`
                    ctx.fillStyle = stroke.color
                    ctx.fillText(text, stroke.points[0].x, stroke.points[0].y)
                  }
                  
                  ctx.globalAlpha = 1
                }
                
                const imageData = offscreenCanvas.toDataURL('image/png', 0.95)
                
                offscreenCanvas.width = 0
                offscreenCanvas.height = 0
                
                return {
                  index: i,
                  data: {
                    image_data: imageData,
                    width: pageMeta.width,
                    height: pageMeta.height,
                  }
                }
              }
              return null
            })())
          }
          
          const batchResults = await Promise.all(batchPromises)
          
          for (const result of batchResults) {
            if (result) {
              allPages[result.index] = result.data
              setExportProgress({ current: result.index + 1, total: pagesMeta.length })
            }
          }
          
          if (batchEnd < pagesMeta.length) {
            await new Promise(resolve => setTimeout(resolve, 10))
          }
        }
        
        await exportToPdf(filePath, allPages.filter(p => p))
        setExportProgress(null)
      } else {
        const strokesJson = JSON.stringify(strokes)
        await saveProject(filePath, pdfPath, strokesJson)
      }
      setCurrentProjectPath(filePath)
    } catch (err) {
      console.error("Save As failed:", err)
      setExportProgress(null)
    } finally {
      setIsSaving(false)
    }
  }, [strokes, pdfPath, canvasRef, pagesMeta])

  const handleExport = useCallback(async () => {
    if (!canvasRef?.current) return

    try {
      const filePath = await exportDialog("annotation.pdf")
      if (!filePath) return

      const isPdf = filePath.toLowerCase().endsWith(".pdf")

      if (isPdf) {
        const canvas = canvasRef.current
        const imageData = canvas.toDataURL("image/png")
        const width = pagesMeta.length > 0 ? pagesMeta[0].width : canvas.width
        const height = pagesMeta.length > 0 ? pagesMeta[0].height : canvas.height

        await exportToPdf(filePath, [{
          image_data: imageData,
          width,
          height,
        }])
      } else {
        const imageData = canvasRef.current.toDataURL("image/png")
        await exportCanvas(filePath, imageData)
      }
    } catch (err) {
      console.error("Export failed:", err)
    }
  }, [canvasRef, pagesMeta])

  const { theme, toggle: ToggleTheme } = useThemeToggle()

  return (
    <>
      <header className="flex h-10 items-center justify-between border-b border-border/50 bg-background/95 px-2 backdrop-blur-md gpu-accelerated">
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1.5 pr-2 mr-1 border-r border-border/30">
            <img src="/icon.png" alt="Annotate Studio" className="h-5 w-5 rounded" />
            <span className="text-xs font-medium text-foreground/80">Annotate Studio</span>
          </div>

          <Menubar className="h-auto border-none bg-transparent p-0 shadow-none">
            <MenubarMenu>
              <MenubarTrigger className="h-6 px-2 py-0.5 text-xs font-normal text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50 data-[state=open]:bg-accent/50 data-[state=open]:text-foreground rounded">
                File
              </MenubarTrigger>
              <MenubarContent className="min-w-[180px] rounded-lg border-border/50 bg-background/95 backdrop-blur-xl shadow-lg p-1">
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={onNewFile}>
                  <FilePlus className="h-3.5 w-3.5 text-muted-foreground" />
                  New <MenubarShortcut className="text-[10px] opacity-60">Ctrl+N</MenubarShortcut>
                </MenubarItem>
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={handleOpenPdf} disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />}
                  Open PDF <MenubarShortcut className="text-[10px] opacity-60">Ctrl+O</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator className="my-1 bg-border/30" />
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 text-muted-foreground" />}
                  Save <MenubarShortcut className="text-[10px] opacity-60">Ctrl+S</MenubarShortcut>
                </MenubarItem>
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={handleSaveAs} disabled={isSaving}>
                  <Save className="h-3.5 w-3.5 text-muted-foreground" />
                  Save As <MenubarShortcut className="text-[10px] opacity-60">Ctrl+Shift+S</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator className="my-1 bg-border/30" />
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  Export
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger className="h-6 px-2 py-0.5 text-xs font-normal text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50 data-[state=open]:bg-accent/50 data-[state=open]:text-foreground rounded">
                Edit
              </MenubarTrigger>
              <MenubarContent className="min-w-[180px] rounded-lg border-border/50 bg-background/95 backdrop-blur-xl shadow-lg p-1">
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={() => undo()} disabled={!canUndo()}>
                  <Undo2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Undo <MenubarShortcut className="text-[10px] opacity-60">Ctrl+Z</MenubarShortcut>
                </MenubarItem>
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={() => redo()} disabled={!canRedo()}>
                  <Redo2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Redo <MenubarShortcut className="text-[10px] opacity-60">Ctrl+Y</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator className="my-1 bg-border/30" />
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={() => cutSelected()} disabled={selectedStrokeIds.length === 0}>
                  <Scissors className="h-3.5 w-3.5 text-muted-foreground" />
                  Cut <MenubarShortcut className="text-[10px] opacity-60">Ctrl+X</MenubarShortcut>
                </MenubarItem>
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={() => copySelected()} disabled={selectedStrokeIds.length === 0}>
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  Copy <MenubarShortcut className="text-[10px] opacity-60">Ctrl+C</MenubarShortcut>
                </MenubarItem>
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={() => paste(currentPage)} disabled={clipboard.length === 0}>
                  <ClipboardPaste className="h-3.5 w-3.5 text-muted-foreground" />
                  Paste <MenubarShortcut className="text-[10px] opacity-60">Ctrl+V</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger className="h-6 px-2 py-0.5 text-xs font-normal text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50 data-[state=open]:bg-accent/50 data-[state=open]:text-foreground rounded">
                View
              </MenubarTrigger>
              <MenubarContent className="min-w-[180px] rounded-lg border-border/50 bg-background/95 backdrop-blur-xl shadow-lg p-1">
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={onZoomIn}>
                  <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
                  Zoom In <MenubarShortcut className="text-[10px] opacity-60">Ctrl++</MenubarShortcut>
                </MenubarItem>
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={onZoomOut}>
                  <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
                  Zoom Out <MenubarShortcut className="text-[10px] opacity-60">Ctrl+-</MenubarShortcut>
                </MenubarItem>
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={onResetZoom}>
                  <Maximize className="h-3.5 w-3.5 text-muted-foreground" />
                  Reset Zoom <MenubarShortcut className="text-[10px] opacity-60">Ctrl+0</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator className="my-1 bg-border/30" />
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={handleFullScreen}>
                  <Expand className="h-3.5 w-3.5 text-muted-foreground" />
                  Full Screen <MenubarShortcut className="text-[10px] opacity-60">F11</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger className="h-6 px-2 py-0.5 text-xs font-normal text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50 data-[state=open]:bg-accent/50 data-[state=open]:text-foreground rounded">
                Preferences
              </MenubarTrigger>
              <MenubarContent className="min-w-[180px] rounded-lg border-border/50 bg-background/95 backdrop-blur-xl shadow-lg p-1">
                <MenubarItem
                  className="gap-2 text-xs rounded-md h-7 px-2 cursor-pointer"
                  onClick={ToggleTheme}
                >
                  {theme === "light" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  Toggle Theme
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger className="h-6 px-2 py-0.5 text-xs font-normal text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50 data-[state=open]:bg-accent/50 data-[state=open]:text-foreground rounded relative">
                Help
                {updateAvailable && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-green-500" />}
              </MenubarTrigger>
              <MenubarContent className="min-w-[180px] rounded-lg border-border/50 bg-background/95 backdrop-blur-xl shadow-lg p-1">
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={() => window.open(`https://github.com/${GITHUB_REPO}#readme`, "_blank")}>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  Documentation
                </MenubarItem>
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={() => setShowShortcuts(true)}>
                  <Keyboard className="h-3.5 w-3.5 text-muted-foreground" />
                  Shortcuts
                </MenubarItem>
                <MenubarSeparator className="my-1 bg-border/30" />
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={() => checkForUpdates(true)} disabled={isCheckingUpdate}>
                  {isCheckingUpdate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />}
                  Check Updates
                  {updateAvailable && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-500" />}
                </MenubarItem>
                <MenubarSeparator className="my-1 bg-border/30" />
                <MenubarItem className="gap-2 text-xs rounded-md h-7 px-2" onClick={() => setShowAbout(true)}>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  About
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>

        <div className="flex items-center gap-1.5">
          {updateAvailable && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2.5 text-xs gap-1.5 rounded-md border-green-500/50 text-green-600 dark:text-green-400 hover:bg-green-500/10"
              onClick={() => window.open(updateAvailable.html_url, "_blank")}
            >
              <Download className="h-3 w-3" />
              Update Available
            </Button>
          )}
          <Button
            size="sm"
            className="h-6 px-2.5 text-xs gap-1.5 rounded-md"
            onClick={handleExport}
          >
            <Download className="h-3 w-3" />
            Export
          </Button>
        </div>
      </header>

      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-h-[80vh] max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-violet-500" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              {shortcuts.map((group) => (
                <div key={group.category}>
                  <h4 className="mb-2 text-sm font-semibold text-muted-foreground">{group.category}</h4>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <div key={item.key} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                        <span className="text-sm">{item.action}</span>
                        <kbd className="rounded-md bg-background px-2 py-1 text-xs font-mono shadow-sm border">
                          {item.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={showAbout} onOpenChange={setShowAbout}>
        <DialogContent className="max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>About Annotate Studio</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <div className="relative">
              <img
                src="/icon.png"
                alt="Annotate Studio"
                className="h-20 w-20 rounded-2xl shadow-xl"
              />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Annotate Studio</h2>
              <p className="text-sm text-muted-foreground mt-1">Version {APP_VERSION}</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              High-performance PDF annotation engine built with WebGL rendering, 
              spatial indexing, and vector-based drawing primitives for professional workflows.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">Next.js</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">React</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Tauri</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Rust</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">WebAssembly</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">TypeScript</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">WebGL</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Zustand</span>
            </div>
            <div className="pt-2 border-t border-border/50 w-full">
              <p className="text-xs text-muted-foreground">
                Developed by <span className="font-semibold text-foreground">CluvexStudio</span> & <span className="font-semibold text-foreground">ParsaDostifam</span>
              </p>
            </div>
            <a
              href={`https://github.com/${GITHUB_REPO}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-800 dark:from-zinc-800 dark:to-zinc-700 px-5 py-2.5 text-sm font-medium text-white transition-all hover:shadow-lg hover:scale-105"
            >
              <GithubIcon className="h-4 w-4" />
              View on GitHub
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showUpdate} onOpenChange={setShowUpdate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-green-500" />
              Update Available
            </DialogTitle>
          </DialogHeader>
          {updateAvailable && (
            <div className="flex flex-col gap-4 py-2">
              <div className="text-center">
                <p className="text-lg font-semibold">{updateAvailable.name || updateAvailable.tag_name}</p>
                <p className="text-sm text-muted-foreground">
                  Current: v{APP_VERSION} → New: {updateAvailable.tag_name}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowUpdate(false)}>
                  Later
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={() => window.open(updateAvailable.html_url, "_blank")}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={exportProgress !== null} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
              Exporting PDF
            </DialogTitle>
          </DialogHeader>
          {exportProgress && (
            <div className="flex flex-col gap-4 py-4">
              <div className="text-center">
                <p className="text-2xl font-bold tabular-nums">
                  {exportProgress.current} / {exportProgress.total}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Rendering pages with annotations...
                </p>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300"
                  style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {Math.round((exportProgress.current / exportProgress.total) * 100)}% complete
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export const Header = memo(HeaderComponent)
