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
      console.error("Failed to check for updates:", err)
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

      const filePath = await openPdfDialog()
      if (!filePath) {
        setLoading(false)
        return
      }

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
        if (!canvasRef?.current) return
        const canvas = canvasRef.current
        const imageData = canvas.toDataURL("image/png")
        const width = pagesMeta.length > 0 ? pagesMeta[0].width : canvas.width
        const height = pagesMeta.length > 0 ? pagesMeta[0].height : canvas.height
        await exportToPdf(currentProjectPath, [{ image_data: imageData, width, height }])
      } else {
        const strokesJson = JSON.stringify(strokes)
        await saveProject(currentProjectPath, pdfPath, strokesJson)
      }
    } catch (err) {
      console.error("Save failed:", err)
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
        if (!canvasRef?.current) return
        const canvas = canvasRef.current
        const imageData = canvas.toDataURL("image/png")
        const width = pagesMeta.length > 0 ? pagesMeta[0].width : canvas.width
        const height = pagesMeta.length > 0 ? pagesMeta[0].height : canvas.height
        await exportToPdf(filePath, [{ image_data: imageData, width, height }])
      } else {
        const strokesJson = JSON.stringify(strokes)
        await saveProject(filePath, pdfPath, strokesJson)
      }
      setCurrentProjectPath(filePath)
    } catch (err) {
      console.error("Save As failed:", err)
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
              Professional-grade PDF annotation suite with real-time collaboration capabilities.
              Precision drawing tools, mathematical symbols, shape primitives, and seamless export workflows.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">Next.js 16</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">React 19</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Tauri 2.0</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">Tailwind CSS</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">shadcn/ui</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Rust WASM</span>
              <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Zustand</span>
            </div>
            <div className="pt-2 border-t border-border/50 w-full">
              <p className="text-xs text-muted-foreground">
                Crafted with ❤️ by <span className="font-semibold text-foreground">CluvexStudio</span> & <span className="font-semibold text-foreground">ParsaDostifam</span>
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
    </>
  )
}

export const Header = memo(HeaderComponent)
