"use client"

import { useState, memo, useCallback } from "react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Layers, Plus, FileText, Pencil, PanelLeftClose, PanelLeft, Trash2 } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePdfStore } from "@/lib/store"

interface Page {
  id: number
  name: string
  hasAnnotations: boolean
}

interface SidebarProps {
  currentPage: number
  onPageChange: (page: number) => void
  pages: Page[]
  onAddPage: () => void
  onDeletePage: (id: number) => void
}

const PageItem = memo(function PageItem({ 
  page, 
  index, 
  isActive, 
  canDelete,
  onSelect, 
  onDelete 
}: { 
  page: Page
  index: number
  isActive: boolean
  canDelete: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted"
      )}
    >
      <div className={cn(
        "flex h-8 w-6 shrink-0 items-center justify-center rounded border text-xs font-medium",
        isActive 
          ? "border-primary-foreground/30 bg-primary-foreground/10" 
          : "border-border bg-background"
      )}>
        {index + 1}
      </div>
      
      <div className="flex flex-1 items-center justify-between min-w-0">
        <span className="text-sm font-medium truncate">
          Page {index + 1}
        </span>
        {page.hasAnnotations && (
          <Pencil className="h-3 w-3 shrink-0 text-amber-500" />
        )}
      </div>

      {canDelete && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation()
              onDelete()
            }
          }}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100",
            isActive 
              ? "hover:bg-primary-foreground/20" 
              : "hover:bg-destructive hover:text-destructive-foreground"
          )}
        >
          <Trash2 className="h-3 w-3" />
        </span>
      )}
    </button>
  )
})

function SidebarComponent({ currentPage, onPageChange, pages, onAddPage, onDeletePage }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pagesMeta = usePdfStore(s => s.pagesMeta)

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setIsCollapsed(false)}
                className="h-10 w-10 rounded-full shadow-lg backdrop-blur-sm transition-all hover:scale-105"
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Show Pages</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="absolute left-4 top-20 z-20 flex h-[calc(100vh-160px)] w-48 flex-col rounded-2xl border border-border/50 bg-background/95 shadow-2xl backdrop-blur-xl transition-all duration-300 dark:bg-zinc-900/95 gpu-accelerated">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 px-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Pages</span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onAddPage}
                  className="h-7 w-7 rounded-lg hover:bg-violet-500/10"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add Page</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsCollapsed(true)}
                  className="h-7 w-7 rounded-lg"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Hide</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-1.5 p-2">
            {pages.map((page, index) => (
              <PageItem
                key={page.id}
                page={page}
                index={index}
                isActive={currentPage === page.id}
                canDelete={pages.length > 1}
                onSelect={() => onPageChange(page.id)}
                onDelete={() => onDeletePage(page.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  )
}

export const Sidebar = memo(SidebarComponent)
