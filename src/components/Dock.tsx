"use client"

import { useState, memo, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  MousePointer2,
  Hand,
  Pencil,
  Eraser,
  Type,
  Square,
  Circle,
  Triangle,
  Minus,
  ArrowRight,
  Undo2,
  Redo2,
  Settings2,
  Highlighter,
  Star,
  Diamond,
  Heart,
  Pi,
  PaintBucket,
  Gauge,
  Grid3X3,
  Pencil as PenIcon,
  Eye,
  Save,
  Sparkles,
  Monitor,
  Zap,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useSettingsStore } from "@/lib/store"

export type Tool = "select" | "pan" | "pen" | "highlighter" | "eraser" | "text" | "shapes" | "math" | "fill"
export type ShapeType = "rectangle" | "circle" | "triangle" | "line" | "arrow" | "star" | "diamond" | "heart"

const mathSymbols = {
  basic: [
    { symbol: "+", label: "Plus" },
    { symbol: "−", label: "Minus" },
    { symbol: "×", label: "Multiply" },
    { symbol: "÷", label: "Divide" },
    { symbol: "=", label: "Equals" },
    { symbol: "≠", label: "Not Equal" },
    { symbol: "±", label: "Plus Minus" },
    { symbol: "∓", label: "Minus Plus" },
  ],
  comparison: [
    { symbol: "<", label: "Less Than" },
    { symbol: ">", label: "Greater Than" },
    { symbol: "≤", label: "Less or Equal" },
    { symbol: "≥", label: "Greater or Equal" },
    { symbol: "≈", label: "Approximately" },
    { symbol: "≡", label: "Identical" },
    { symbol: "∝", label: "Proportional" },
    { symbol: "≪", label: "Much Less" },
  ],
  algebra: [
    { symbol: "√", label: "Square Root" },
    { symbol: "∛", label: "Cube Root" },
    { symbol: "∜", label: "Fourth Root" },
    { symbol: "ⁿ", label: "Power n" },
    { symbol: "²", label: "Squared" },
    { symbol: "³", label: "Cubed" },
    { symbol: "⁻¹", label: "Inverse" },
    { symbol: "∞", label: "Infinity" },
  ],
  calculus: [
    { symbol: "∫", label: "Integral" },
    { symbol: "∬", label: "Double Integral" },
    { symbol: "∮", label: "Contour Integral" },
    { symbol: "∂", label: "Partial" },
    { symbol: "∇", label: "Nabla" },
    { symbol: "Δ", label: "Delta" },
    { symbol: "∑", label: "Sum" },
    { symbol: "∏", label: "Product" },
  ],
  sets: [
    { symbol: "∈", label: "Element Of" },
    { symbol: "∉", label: "Not Element" },
    { symbol: "⊂", label: "Subset" },
    { symbol: "⊃", label: "Superset" },
    { symbol: "∪", label: "Union" },
    { symbol: "∩", label: "Intersection" },
    { symbol: "∅", label: "Empty Set" },
    { symbol: "ℝ", label: "Real Numbers" },
  ],
  greek: [
    { symbol: "α", label: "Alpha" },
    { symbol: "β", label: "Beta" },
    { symbol: "γ", label: "Gamma" },
    { symbol: "δ", label: "Delta" },
    { symbol: "θ", label: "Theta" },
    { symbol: "λ", label: "Lambda" },
    { symbol: "π", label: "Pi" },
    { symbol: "σ", label: "Sigma" },
    { symbol: "φ", label: "Phi" },
    { symbol: "ω", label: "Omega" },
    { symbol: "ε", label: "Epsilon" },
    { symbol: "μ", label: "Mu" },
  ],
  logic: [
    { symbol: "∧", label: "And" },
    { symbol: "∨", label: "Or" },
    { symbol: "¬", label: "Not" },
    { symbol: "⊕", label: "XOR" },
    { symbol: "→", label: "Implies" },
    { symbol: "↔", label: "If and Only If" },
    { symbol: "∀", label: "For All" },
    { symbol: "∃", label: "Exists" },
  ],
  arrows: [
    { symbol: "←", label: "Left Arrow" },
    { symbol: "→", label: "Right Arrow" },
    { symbol: "↑", label: "Up Arrow" },
    { symbol: "↓", label: "Down Arrow" },
    { symbol: "↔", label: "Left Right" },
    { symbol: "⇒", label: "Double Right" },
    { symbol: "⇔", label: "Double Both" },
    { symbol: "↦", label: "Maps To" },
  ],
}

const tools = [
  { id: "select" as Tool, icon: MousePointer2, label: "Select", shortcut: "V" },
  { id: "pan" as Tool, icon: Hand, label: "Pan", shortcut: "H" },
  { id: "pen" as Tool, icon: Pencil, label: "Pen", shortcut: "P" },
  { id: "highlighter" as Tool, icon: Highlighter, label: "Highlighter", shortcut: "M" },
  { id: "eraser" as Tool, icon: Eraser, label: "Eraser", shortcut: "E" },
  { id: "text" as Tool, icon: Type, label: "Text", shortcut: "T" },
]

const shapes = [
  { id: "rectangle" as ShapeType, icon: Square, label: "Rectangle", shortcut: "R" },
  { id: "circle" as ShapeType, icon: Circle, label: "Circle", shortcut: "C" },
  { id: "triangle" as ShapeType, icon: Triangle, label: "Triangle", shortcut: "" },
  { id: "line" as ShapeType, icon: Minus, label: "Line", shortcut: "L" },
  { id: "arrow" as ShapeType, icon: ArrowRight, label: "Arrow", shortcut: "A" },
  { id: "star" as ShapeType, icon: Star, label: "Star", shortcut: "" },
  { id: "diamond" as ShapeType, icon: Diamond, label: "Diamond", shortcut: "" },
  { id: "heart" as ShapeType, icon: Heart, label: "Heart", shortcut: "" },
]

interface DockProps {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  activeShape: ShapeType
  onShapeChange: (shape: ShapeType) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onInsertSymbol?: (symbol: string) => void
}

const ToolButton = memo(function ToolButton({ 
  tool, 
  isActive, 
  onClick 
}: { 
  tool: typeof tools[0]
  isActive: boolean
  onClick: () => void 
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-10 w-10 rounded-xl transition-all duration-200",
            isActive
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
              : "hover:bg-accent hover:scale-105"
          )}
          onClick={onClick}
        >
          <tool.icon
            className={cn(
              "h-5 w-5 transition-transform duration-200",
              isActive && "scale-110"
            )}
          />
          {isActive && (
            <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-primary-foreground/50" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={12} className="flex items-center gap-2">
        {tool.label}
        <kbd className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          {tool.shortcut}
        </kbd>
      </TooltipContent>
    </Tooltip>
  )
})

function DockComponent({
  activeTool,
  onToolChange,
  activeShape,
  onShapeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onInsertSymbol,
}: DockProps) {
  const [shapesOpen, setShapesOpen] = useState(false)
  const [mathOpen, setMathOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mathCategory, setMathCategory] = useState<keyof typeof mathSymbols>("basic")
  const [settingsTab, setSettingsTab] = useState<"performance" | "canvas" | "input">("performance")
  const [monitorHz, setMonitorHz] = useState(60)
  
  const {
    targetFps, setTargetFps,
    detectedRefreshRate, setDetectedRefreshRate,
    antialiasing, setAntialiasing,
    showFpsCounter, setShowFpsCounter,
    gridEnabled, setGridEnabled,
    gridSize, setGridSize,
    snapToGrid, setSnapToGrid,
    pressureSensitivity, setPressureSensitivity,
    smoothing, setSmoothing,
    autoSave, setAutoSave,
    autoSaveInterval, setAutoSaveInterval,
  } = useSettingsStore()

  useEffect(() => {
    const detectHz = async () => {
      let hz = 60
      
      if (typeof window !== "undefined") {
        const screen = window.screen as any
        if (screen?.refreshRate) {
          hz = screen.refreshRate
        } else {
          let lastTime = performance.now()
          let frames = 0
          let total = 0
          
          await new Promise<void>((resolve) => {
            const measure = (time: number) => {
              if (frames > 0) total += time - lastTime
              lastTime = time
              frames++
              if (frames >= 60) {
                hz = Math.round(1000 / (total / (frames - 1)))
                resolve()
              } else {
                requestAnimationFrame(measure)
              }
            }
            requestAnimationFrame(measure)
          })
        }
      }
      
      const rates = [60, 75, 90, 120, 144, 165, 240, 360]
      const closest = rates.reduce((p, c) => Math.abs(c - hz) < Math.abs(p - hz) ? c : p)
      
      setMonitorHz(closest)
      setDetectedRefreshRate(closest)
      
      if (closest >= 120 && targetFps === 60) {
        setTargetFps(closest)
      }
    }
    
    detectHz()
  }, [])

  const fpsOptions = [30, 60, 90, 120, 144, 165, 240, 360].filter(f => f <= monitorHz || f === 30 || f === 60)
  
  const ActiveShapeIcon = shapes.find(s => s.id === activeShape)?.icon || Square

  const handleShapeSelect = useCallback((shapeId: ShapeType) => {
    onShapeChange(shapeId)
    onToolChange("shapes")
    setShapesOpen(false)
  }, [onShapeChange, onToolChange])
  
  const handleToolChange = useCallback((toolId: Tool) => {
    onToolChange(toolId)
  }, [onToolChange])

  return (
    <TooltipProvider delayDuration={0}>
      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 gpu-accelerated">
        <div className="flex items-center gap-1 rounded-2xl border border-border/40 bg-background/90 p-1.5 shadow-2xl backdrop-blur-xl dark:bg-zinc-900/90 dark:border-zinc-700/50 gpu-accelerated">
          <div className="flex items-center gap-0.5 rounded-xl bg-muted/50 p-1">
            {tools.map((tool) => (
              <ToolButton
                key={tool.id}
                tool={tool}
                isActive={activeTool === tool.id}
                onClick={() => handleToolChange(tool.id)}
              />
            ))}
          </div>

          <Popover open={shapesOpen} onOpenChange={setShapesOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "relative h-10 w-10 rounded-xl transition-all duration-200",
                      activeTool === "shapes"
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                        : "hover:bg-accent hover:scale-105"
                    )}
                  >
                    <ActiveShapeIcon className={cn(
                      "h-5 w-5 transition-transform duration-200",
                      activeTool === "shapes" && "scale-110"
                    )} />
                    {activeTool === "shapes" && (
                      <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-primary-foreground/50" />
                    )}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={12}>
                Shapes ({shapes.find(s => s.id === activeShape)?.label})
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="top"
              sideOffset={12}
              className="w-auto p-2"
              align="center"
            >
              <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                Select Shape
              </div>
              <div className="grid grid-cols-4 gap-1">
                {shapes.map((shape) => (
                  <Tooltip key={shape.id}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-10 w-10 rounded-lg transition-all",
                          activeShape === shape.id
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "hover:bg-accent hover:scale-105"
                        )}
                        onClick={() => handleShapeSelect(shape.id)}
                      >
                        <shape.icon className={cn(
                          "h-5 w-5 transition-transform",
                          activeShape === shape.id && "scale-110"
                        )} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8} className="flex items-center gap-2">
                      {shape.label}
                      {shape.shortcut && (
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {shape.shortcut}
                        </kbd>
                      )}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Popover open={mathOpen} onOpenChange={setMathOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "relative h-10 w-10 rounded-xl transition-all duration-200",
                      activeTool === "math"
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                        : "hover:bg-accent hover:scale-105"
                    )}
                  >
                    <Pi className={cn(
                      "h-5 w-5 transition-transform duration-200",
                      activeTool === "math" && "scale-110"
                    )} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={12}>
                Math Symbols
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="top"
              sideOffset={12}
              className="w-[320px] p-0 overflow-hidden rounded-xl border-border/30 bg-background/95 backdrop-blur-xl shadow-xl"
              align="center"
            >
              <div className="px-2 py-2 border-b border-border/30">
                <div className="flex flex-wrap gap-1">
                  {Object.keys(mathSymbols).map((category) => (
                    <button
                      key={category}
                      className={cn(
                        "px-2 py-1 text-[11px] font-medium rounded-md transition-all capitalize",
                        mathCategory === category
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                      onClick={() => setMathCategory(category as keyof typeof mathSymbols)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              <ScrollArea className="h-48">
                <div className="grid grid-cols-4 gap-1.5 p-2.5">
                  {mathSymbols[mathCategory].map((item) => (
                    <Tooltip key={item.symbol}>
                      <TooltipTrigger asChild>
                        <button
                          className="flex h-11 w-full items-center justify-center rounded-lg text-xl transition-all duration-150 bg-muted/40 hover:bg-muted text-foreground hover:scale-[1.02] active:scale-[0.98]"
                          onClick={() => {
                            onInsertSymbol?.(item.symbol)
                            setMathOpen(false)
                          }}
                        >
                          {item.symbol}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={4} className="text-xs">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-10 w-10 rounded-xl transition-all duration-200",
                  activeTool === "fill"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-accent hover:scale-105"
                )}
                onClick={() => onToolChange("fill")}
              >
                <PaintBucket className={cn(
                  "h-5 w-5 transition-transform duration-200",
                  activeTool === "fill" && "scale-110"
                )} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={12}>
              Fill Shape
            </TooltipContent>
          </Tooltip>

          <div className="mx-1 h-8 w-px bg-border/50" />

          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-10 w-10 rounded-xl transition-all duration-200",
                    canUndo
                      ? "hover:bg-accent hover:scale-105"
                      : "opacity-40 cursor-not-allowed"
                  )}
                  onClick={onUndo}
                  disabled={!canUndo}
                >
                  <Undo2 className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={12} className="flex items-center gap-2">
                Undo
                <kbd className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  Ctrl+Z
                </kbd>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-10 w-10 rounded-xl transition-all duration-200",
                    canRedo
                      ? "hover:bg-accent hover:scale-105"
                      : "opacity-40 cursor-not-allowed"
                  )}
                  onClick={onRedo}
                  disabled={!canRedo}
                >
                  <Redo2 className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={12} className="flex items-center gap-2">
                Redo
                <kbd className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  Ctrl+Y
                </kbd>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="mx-1 h-8 w-px bg-border/50" />

          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-10 w-10 rounded-xl transition-all duration-200 hover:bg-accent hover:scale-105",
                      settingsOpen && "bg-accent"
                    )}
                  >
                    <Settings2 className={cn(
                      "h-5 w-5 transition-transform duration-500",
                      settingsOpen && "rotate-180"
                    )} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={12}>
                Settings
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="top"
              sideOffset={16}
              className="w-[380px] p-0 rounded-2xl border border-border/30 bg-background/98 backdrop-blur-xl shadow-2xl"
              align="end"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
                    <Settings2 className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">Settings</h4>
                    <p className="text-[10px] text-muted-foreground">Customize your experience</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">v1.0.0</Badge>
              </div>

              <div className="flex border-b border-border/30">
                {[
                  { id: "performance", icon: Zap, label: "Performance" },
                  { id: "canvas", icon: Grid3X3, label: "Canvas" },
                  { id: "input", icon: PenIcon, label: "Input" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSettingsTab(tab.id as any)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all",
                      settingsTab === tab.id
                        ? "text-violet-600 dark:text-violet-400 border-b-2 border-violet-500 bg-violet-500/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              <ScrollArea className="h-[320px]">
                <div className="p-4 space-y-4">
                  {settingsTab === "performance" && (
                    <>
                      <div className="rounded-xl bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-purple-500/10 p-4 border border-violet-500/20">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Monitor className="h-4 w-4 text-violet-500" />
                            <span className="text-xs font-medium">Monitor Detected</span>
                          </div>
                          <span className="text-lg font-bold text-violet-600 dark:text-violet-400">{monitorHz} Hz</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {monitorHz >= 120 && (
                            <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30 text-[10px]">
                              <Sparkles className="h-3 w-3 mr-1" />
                              High Refresh Rate
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">WebGL Active</Badge>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Gauge className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Target FPS</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {fpsOptions.map((fps) => (
                              <button
                                key={fps}
                                onClick={() => setTargetFps(fps)}
                                className={cn(
                                  "px-2 py-1 text-xs font-medium rounded-md transition-all",
                                  targetFps === fps
                                    ? "bg-violet-500 text-white"
                                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                )}
                              >
                                {fps}
                              </button>
                            ))}
                          </div>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium">Antialiasing</span>
                              <p className="text-[10px] text-muted-foreground">Smooth edges</p>
                            </div>
                          </div>
                          <Switch checked={antialiasing} onCheckedChange={setAntialiasing} />
                        </div>

                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium">Show FPS</span>
                              <p className="text-[10px] text-muted-foreground">Display frame rate</p>
                            </div>
                          </div>
                          <Switch checked={showFpsCounter} onCheckedChange={setShowFpsCounter} />
                        </div>
                      </div>
                    </>
                  )}

                  {settingsTab === "canvas" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="text-sm font-medium">Show Grid</span>
                            <p className="text-[10px] text-muted-foreground">Display grid lines</p>
                          </div>
                        </div>
                        <Switch checked={gridEnabled} onCheckedChange={setGridEnabled} />
                      </div>

                      {gridEnabled && (
                        <div className="pl-6 space-y-4 border-l-2 border-violet-500/30 ml-2">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium">Grid Size</span>
                              <span className="text-xs text-muted-foreground font-mono">{gridSize}px</span>
                            </div>
                            <Slider
                              value={[gridSize]}
                              onValueChange={(v) => setGridSize(v[0])}
                              min={10}
                              max={100}
                              step={5}
                              className="cursor-pointer"
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Snap to Grid</span>
                            <Switch checked={snapToGrid} onCheckedChange={setSnapToGrid} />
                          </div>
                        </div>
                      )}

                      <Separator />

                      <div className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <Save className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="text-sm font-medium">Auto Save</span>
                            <p className="text-[10px] text-muted-foreground">Save automatically</p>
                          </div>
                        </div>
                        <Switch checked={autoSave} onCheckedChange={setAutoSave} />
                      </div>

                      {autoSave && (
                        <div className="pl-6 border-l-2 border-violet-500/30 ml-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Interval</span>
                            <div className="flex items-center gap-1">
                              {[15, 30, 60, 120].map((sec) => (
                                <button
                                  key={sec}
                                  onClick={() => setAutoSaveInterval(sec)}
                                  className={cn(
                                    "px-2 py-1 text-[10px] font-medium rounded-md transition-all",
                                    autoSaveInterval === sec
                                      ? "bg-violet-500 text-white"
                                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                  )}
                                >
                                  {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {settingsTab === "input" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <PenIcon className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="text-sm font-medium">Pressure Sensitivity</span>
                            <p className="text-[10px] text-muted-foreground">Vary stroke width</p>
                          </div>
                        </div>
                        <Switch checked={pressureSensitivity} onCheckedChange={setPressureSensitivity} />
                      </div>

                      <Separator />

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Stroke Smoothing</span>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">{smoothing}%</span>
                        </div>
                        <Slider
                          value={[smoothing]}
                          onValueChange={(v) => setSmoothing(v[0])}
                          min={0}
                          max={100}
                          step={10}
                          className="cursor-pointer"
                        />
                        <p className="text-[10px] text-muted-foreground mt-2">
                          Higher = smoother strokes, more latency
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </TooltipProvider>
  )
}

export const Dock = memo(DockComponent)
