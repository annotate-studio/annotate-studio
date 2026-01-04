"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useColorStore } from "@/lib/store"
import {
  Palette,
  Plus,
  X,
  PanelRightClose,
  PanelRight,
  Pipette,
} from "lucide-react"
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

const presetColors = [
  { name: "Black", color: "#18181b" },
  { name: "White", color: "#ffffff" },
  { name: "Red", color: "#ef4444" },
  { name: "Orange", color: "#f97316" },
  { name: "Yellow", color: "#eab308" },
  { name: "Green", color: "#22c55e" },
  { name: "Cyan", color: "#06b6d4" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Purple", color: "#a855f7" },
  { name: "Pink", color: "#ec4899" },
]

interface ToolSettings {
  color: string
  thickness: number
  opacity: number
  borderColor?: string
  backgroundColor?: string
}

interface InspectorProps {
  activeTool: string
  currentSettings: ToolSettings
  onSettingsChange: (updates: Partial<ToolSettings>) => void
}

const toolLabels: Record<string, string> = {
  pen: "Pen",
  highlighter: "Highlighter",
  eraser: "Eraser",
  shapes: "Shapes",
  text: "Text",
  fill: "Fill",
  select: "Select",
  pan: "Pan",
  math: "Math",
}

export function Inspector({
  activeTool,
  currentSettings,
  onSettingsChange,
}: InspectorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [customColorInput, setCustomColorInput] = useState("#6366f1")
  const [borderColorInput, setBorderColorInput] = useState("#3b82f6")
  const [bgColorInput, setBgColorInput] = useState("#ffffff")
  const { customColors, addCustomColor, removeCustomColor, recentColors, addRecentColor } = useColorStore()

  const showColor = activeTool !== "eraser" && activeTool !== "select" && activeTool !== "pan" && activeTool !== "shapes"
  const showShapeColors = activeTool === "shapes"
  const showThickness = activeTool === "pen" || activeTool === "highlighter" || activeTool === "eraser" || activeTool === "shapes" || activeTool === "text"
  const showOpacity = activeTool === "pen" || activeTool === "highlighter" || activeTool === "shapes" || activeTool === "text"

  const handleColorSelect = (color: string) => {
    onSettingsChange({ color })
    addRecentColor(color)
  }

  const handleBorderColorSelect = (color: string) => {
    onSettingsChange({ borderColor: color })
    addRecentColor(color)
  }

  const handleBgColorSelect = (color: string) => {
    onSettingsChange({ backgroundColor: color })
    if (color !== "transparent") addRecentColor(color)
  }

  const handleAddCustomColor = () => {
    if (customColorInput && /^#[0-9A-Fa-f]{6}$/.test(customColorInput)) {
      addCustomColor(customColorInput)
      handleColorSelect(customColorInput)
    }
  }

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="absolute right-4 top-1/2 z-20 -translate-y-1/2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setIsCollapsed(false)}
                className="h-10 w-10 rounded-full shadow-lg backdrop-blur-sm transition-all hover:scale-105"
              >
                <PanelRight className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Show Inspector</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="absolute right-4 top-20 z-20 flex w-56 flex-col rounded-2xl border border-border/50 bg-background/95 shadow-2xl backdrop-blur-xl transition-all duration-300 dark:bg-zinc-900/95 gpu-accelerated">
        <div className="flex h-12 items-center justify-between border-b border-border/50 px-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Inspector</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCollapsed(true)}
                className="h-7 w-7 rounded-lg"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Hide</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="max-h-[calc(100vh-200px)] flex-1">
          <div className="flex flex-col gap-4 p-3">
            {showColor && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Colors
                </h3>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md hover:bg-violet-500/10">
                      <Pipette className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent 
                    side="left" 
                    align="start" 
                    sideOffset={8}
                    className="w-64 rounded-xl border-border/50 bg-background/98 p-0 shadow-2xl backdrop-blur-xl"
                  >
                    <div className="border-b border-border/50 px-4 py-3">
                      <h4 className="flex items-center gap-2 text-sm font-semibold">
                        <Palette className="h-4 w-4 text-violet-500" />
                        Custom Color
                      </h4>
                    </div>
                    <div className="p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div
                          className="h-14 w-14 shrink-0 rounded-xl border-2 border-border/50 shadow-inner transition-colors"
                          style={{ backgroundColor: customColorInput }}
                        />
                        <div className="relative flex-1">
                          <input
                            type="color"
                            value={customColorInput}
                            onChange={(e) => setCustomColorInput(e.target.value)}
                            className="h-14 w-full cursor-pointer rounded-xl border-2 border-border/50 p-1"
                          />
                        </div>
                      </div>
                      <div className="mb-4">
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          Hex Code
                        </label>
                        <input
                          type="text"
                          value={customColorInput}
                          onChange={(e) => setCustomColorInput(e.target.value)}
                          className="h-10 w-full rounded-lg border border-border/50 bg-muted/50 px-3 text-sm font-mono uppercase tracking-wider focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                          placeholder="#000000"
                        />
                      </div>
                      <Button 
                        onClick={handleAddCustomColor} 
                        className="w-full rounded-lg bg-violet-600 hover:bg-violet-700"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add to Palette
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="grid grid-cols-5 gap-1.5">
                {presetColors.map((item) => (
                  <Tooltip key={item.name}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleColorSelect(item.color)}
                        className={cn(
                          "h-8 w-8 rounded-lg border transition-all duration-200",
                          "hover:scale-110 hover:shadow-lg",
                          currentSettings.color === item.color
                            ? "ring-2 ring-violet-500 ring-offset-2 ring-offset-background scale-110"
                            : "border-border/50"
                        )}
                        style={{ backgroundColor: item.color }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{item.name}</TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {customColors.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Custom
                  </h4>
                  <div className="grid grid-cols-5 gap-1.5">
                    {customColors.map((color) => (
                      <Tooltip key={color}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleColorSelect(color)}
                            className={cn(
                              "group relative h-8 w-8 rounded-lg border transition-all duration-200",
                              "hover:scale-110 hover:shadow-lg",
                              currentSettings.color === color
                                ? "ring-2 ring-violet-500 ring-offset-2 ring-offset-background scale-110"
                                : "border-border/50"
                            )}
                            style={{ backgroundColor: color }}
                          >
                            <span
                              onClick={(e) => {
                                e.stopPropagation()
                                removeCustomColor(color)
                              }}
                              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <X className="h-2.5 w-2.5" />
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{color}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )}

              {recentColors.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Recent
                  </h4>
                  <div className="flex gap-1">
                    {recentColors.slice(0, 5).map((color, i) => (
                      <button
                        key={`${color}-${i}`}
                        onClick={() => handleColorSelect(color)}
                        className={cn(
                          "h-6 w-6 rounded-md border border-border/50 transition-all",
                          "hover:scale-110"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
            )}

            {showShapeColors && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Border Color
                </h3>
                <div className="grid grid-cols-5 gap-1.5">
                  {presetColors.map((item) => (
                    <button
                      key={`border-${item.name}`}
                      onClick={() => handleBorderColorSelect(item.color)}
                      className={cn(
                        "h-7 w-7 rounded-md border transition-all duration-200",
                        "hover:scale-110 hover:shadow-lg",
                        currentSettings.borderColor === item.color
                          ? "ring-2 ring-violet-500 ring-offset-1 ring-offset-background scale-110"
                          : "border-border/50"
                      )}
                      style={{ backgroundColor: item.color }}
                    />
                  ))}
                </div>
              </section>
            )}

            {showShapeColors && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Background Color
                </h3>
                <div className="grid grid-cols-5 gap-1.5">
                  <button
                    onClick={() => handleBgColorSelect("transparent")}
                    className={cn(
                      "h-7 w-7 rounded-md border transition-all duration-200 flex items-center justify-center",
                      "hover:scale-110",
                      currentSettings.backgroundColor === "transparent"
                        ? "ring-2 ring-violet-500 ring-offset-1 ring-offset-background scale-110"
                        : "border-border/50"
                    )}
                    style={{ background: "repeating-conic-gradient(#d4d4d8 0% 25%, transparent 0% 50%) 50% / 8px 8px" }}
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                  {presetColors.slice(0, 9).map((item) => (
                    <button
                      key={`bg-${item.name}`}
                      onClick={() => handleBgColorSelect(item.color)}
                      className={cn(
                        "h-7 w-7 rounded-md border transition-all duration-200",
                        "hover:scale-110 hover:shadow-lg",
                        currentSettings.backgroundColor === item.color
                          ? "ring-2 ring-violet-500 ring-offset-1 ring-offset-background scale-110"
                          : "border-border/50"
                      )}
                      style={{ backgroundColor: item.color }}
                    />
                  ))}
                </div>
              </section>
            )}

            {showThickness && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {activeTool === "eraser" ? "Eraser Size" : "Thickness"}
                  </h3>
                  <span className="text-xs font-medium tabular-nums">{currentSettings.thickness}px</span>
                </div>
                <Slider
                  value={[currentSettings.thickness]}
                  onValueChange={(v) => onSettingsChange({ thickness: v[0] })}
                  min={1}
                  max={activeTool === "eraser" ? 50 : activeTool === "highlighter" ? 40 : 24}
                  step={1}
                  className="cursor-pointer"
                />
                <div className="mt-2 flex items-center justify-center gap-2">
                  <div
                    className="rounded-full transition-all duration-200"
                    style={{
                      width: Math.max(currentSettings.thickness * 1.5, 6),
                      height: Math.max(currentSettings.thickness * 1.5, 6),
                      backgroundColor: activeTool === "eraser" ? "#d4d4d8" : currentSettings.color,
                    }}
                  />
                </div>
              </section>
            )}

            {showOpacity && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Opacity
                  </h3>
                  <span className="text-xs font-medium tabular-nums">{currentSettings.opacity}%</span>
                </div>
                <Slider
                  value={[currentSettings.opacity]}
                  onValueChange={(v) => onSettingsChange({ opacity: v[0] })}
                  min={10}
                  max={100}
                  step={5}
                  className="cursor-pointer"
                />
                <div className="mt-2 flex items-center justify-center">
                  <div
                    className="h-4 w-full rounded-md"
                    style={{
                      background: `linear-gradient(to right, transparent, ${currentSettings.color})`,
                    }}
                  />
                </div>
              </section>
            )}

            <section className="rounded-xl border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Pipette className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {toolLabels[activeTool] || "Current"}
                </h3>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-xl border border-border shadow-inner"
                  style={{ backgroundColor: activeTool === "eraser" ? "#d4d4d8" : currentSettings.color, opacity: currentSettings.opacity / 100 }}
                />
                <div className="flex flex-col">
                  <span className="font-mono text-xs uppercase">{activeTool === "eraser" ? "Eraser" : currentSettings.color}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {currentSettings.thickness}px · {currentSettings.opacity}%
                  </span>
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  )
}
