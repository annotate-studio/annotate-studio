"use client"

import { Application, Graphics, Container, Text, TextStyle, Sprite, Texture } from "pixi.js"

export interface Point {
  x: number
  y: number
}

export interface Stroke {
  id: string
  points: Point[]
  color: string
  thickness: number
  opacity: number
  tool: string
  pageId: number
  fillColor?: string
  backgroundColor?: string
}

export interface ShapePreview {
  shapeType: string
  start: Point
  end: Point
  color: string
  thickness: number
  opacity: number
  fillColor?: string
}

export interface SymbolPreview {
  symbol: string
  start: Point
  end: Point
  color: string
  opacity: number
}

export interface StrokeStyle {
  color: string
  thickness: number
  opacity: number
}

class PixiEngine {
  private app: Application | null = null
  private strokesContainer: Container | null = null
  private currentStrokeGraphics: Graphics | null = null
  private shapePreviewGraphics: Graphics | null = null
  private symbolPreviewText: Text | null = null
  private selectionGraphics: Graphics | null = null
  private gridGraphics: Graphics | null = null
  private rubberBandGraphics: Graphics | null = null
  private pdfSprite: Sprite | null = null
  private strokeGraphicsMap: Map<string, Graphics | Text> = new Map()
  private strokeDataMap: Map<string, string> = new Map()
  private selectedIds: string[] = []
  private width: number = 800
  private height: number = 600
  private initialized: boolean = false
  private frameCount: number = 0
  private lastFpsTime: number = 0
  private fps: number = 0
  private dirtyStrokes: Set<string> = new Set()
  private batchUpdateScheduled: boolean = false

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<boolean> {
    if (this.initialized && this.app) {
      this.resize(width, height)
      return true
    }

    try {
      this.width = width
      this.height = height

      this.app = new Application()
      
      await this.app.init({
        canvas,
        width,
        height,
        backgroundColor: 0xffffff,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        powerPreference: "high-performance",
        clearBeforeRender: true,
        preference: "webgl",
      })

      this.gridGraphics = new Graphics()
      this.app.stage.addChild(this.gridGraphics)

      this.pdfSprite = new Sprite()
      this.pdfSprite.visible = false
      this.app.stage.addChild(this.pdfSprite)

      this.strokesContainer = new Container()
      this.app.stage.addChild(this.strokesContainer)

      this.currentStrokeGraphics = new Graphics()
      this.app.stage.addChild(this.currentStrokeGraphics)

      this.shapePreviewGraphics = new Graphics()
      this.app.stage.addChild(this.shapePreviewGraphics)

      this.selectionGraphics = new Graphics()
      this.app.stage.addChild(this.selectionGraphics)

      this.rubberBandGraphics = new Graphics()
      this.app.stage.addChild(this.rubberBandGraphics)

      this.app.ticker.add(() => {
        this.frameCount++
        const now = performance.now()
        if (now - this.lastFpsTime >= 1000) {
          this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime))
          this.frameCount = 0
          this.lastFpsTime = now
        }
      })

      console.log("✅ PixiJS WebGL initialized successfully!")
      console.log("Renderer type:", this.app.renderer.type === 1 ? "WebGL" : "WebGPU")

      this.initialized = true
      return true
    } catch (err) {
      console.error("Failed to initialize PixiJS:", err)
      return false
    }
  }

  resize(width: number, height: number): void {
    if (!this.app) return
    this.width = width
    this.height = height
    this.app.renderer.resize(width, height)
    
    if (this.pdfSprite && this.pdfSprite.visible) {
      this.pdfSprite.width = width
      this.pdfSprite.height = height
    }
  }

  getFps(): number {
    return this.fps
  }

  drawGrid(): void {
    if (!this.gridGraphics) return
    this.gridGraphics.clear()
    this.gridGraphics.setStrokeStyle({ width: 0.5, color: 0xe4e4e7 })

    for (let x = 0; x <= this.width; x += 20) {
      this.gridGraphics.moveTo(x, 0)
      this.gridGraphics.lineTo(x, this.height)
    }
    for (let y = 0; y <= this.height; y += 20) {
      this.gridGraphics.moveTo(0, y)
      this.gridGraphics.lineTo(this.width, y)
    }
    this.gridGraphics.stroke()
  }

  hideGrid(): void {
    if (this.gridGraphics) {
      this.gridGraphics.clear()
    }
  }

  setPdfImage(imageDataUrl: string | null): void {
    if (!this.pdfSprite || !this.app) return

    if (!imageDataUrl) {
      this.pdfSprite.visible = false
      this.pdfSprite.texture = Texture.EMPTY
      return
    }

    const img = new Image()
    img.onload = () => {
      if (!this.pdfSprite || !this.app) return
      
      const canvas = document.createElement('canvas')
      canvas.width = this.width
      canvas.height = this.height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, this.width, this.height)
        const texture = Texture.from(canvas)
        this.pdfSprite.texture = texture
        this.pdfSprite.width = this.width
        this.pdfSprite.height = this.height
        this.pdfSprite.visible = true
      }
    }
    img.src = imageDataUrl
  }

  setStrokes(strokes: Stroke[]): void {
    if (!this.strokesContainer) return

    const currentIds = new Set(strokes.map(s => s.id))
    
    this.strokeGraphicsMap.forEach((graphics, id) => {
      if (!currentIds.has(id)) {
        this.strokesContainer?.removeChild(graphics)
        graphics.destroy()
        this.strokeGraphicsMap.delete(id)
        this.strokeDataMap.delete(id)
      }
    })

    strokes.forEach((stroke, index) => {
      const strokeHash = this.hashStroke(stroke)
      const existingHash = this.strokeDataMap.get(stroke.id)
      
      let graphics = this.strokeGraphicsMap.get(stroke.id)
      
      if (!graphics) {
        if (stroke.tool.startsWith("text:")) {
          graphics = this.createTextGraphics(stroke)
        } else {
          graphics = this.createStrokeGraphics(stroke)
        }
        this.strokeGraphicsMap.set(stroke.id, graphics)
        this.strokeDataMap.set(stroke.id, strokeHash)
        this.strokesContainer?.addChild(graphics)
      } else if (existingHash !== strokeHash) {
        if (stroke.tool.startsWith("text:") && graphics instanceof Text) {
          this.updateTextGraphics(graphics, stroke)
        } else if (graphics instanceof Graphics) {
          this.drawStrokeToGraphics(graphics, stroke)
        }
        this.strokeDataMap.set(stroke.id, strokeHash)
      }
      
      graphics.zIndex = index
    })

    if (this.strokesContainer) {
      this.strokesContainer.sortChildren()
    }

    this.updateSelection()
  }

  private hashStroke(stroke: Stroke): string {
    return `${stroke.points.length}-${stroke.color}-${stroke.thickness}-${stroke.opacity}-${stroke.tool}-${stroke.fillColor || ''}-${stroke.backgroundColor || ''}-${stroke.points[0]?.x || 0}-${stroke.points[0]?.y || 0}`
  }

  private createStrokeGraphics(stroke: Stroke): Graphics {
    const g = new Graphics()
    this.drawStrokeToGraphics(g, stroke)
    return g
  }

  private drawStrokeToGraphics(g: Graphics, stroke: Stroke): void {
    g.clear()
    
    const color = this.hexToNumber(stroke.color)
    const alpha = stroke.opacity / 100

    if (stroke.tool === "pen" || stroke.tool === "highlighter") {
      if (stroke.points.length < 2) return
      
      g.setStrokeStyle({
        width: stroke.thickness,
        color,
        alpha,
        cap: "round",
        join: "round",
      })

      g.moveTo(stroke.points[0].x, stroke.points[0].y)
      
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1]
        const curr = stroke.points[i]
        const midX = (prev.x + curr.x) / 2
        const midY = (prev.y + curr.y) / 2
        g.quadraticCurveTo(prev.x, prev.y, midX, midY)
      }
      
      const last = stroke.points[stroke.points.length - 1]
      g.lineTo(last.x, last.y)
      g.stroke()
    } else if (stroke.tool.startsWith("shape-")) {
      this.drawShape(g, stroke)
    }
  }

  private createTextGraphics(stroke: Stroke): Text {
    const textContent = stroke.tool.replace("text:", "")
    const fontSize = Math.max(14, stroke.thickness * 4)
    
    const style = new TextStyle({
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize,
      fill: stroke.color,
    })
    
    const text = new Text({ text: textContent, style })
    text.alpha = stroke.opacity / 100
    text.position.set(stroke.points[0]?.x || 0, (stroke.points[0]?.y || 0) - fontSize * 0.85)
    
    return text
  }

  private drawShape(g: Graphics, stroke: Stroke): void {
    if (stroke.points.length < 2) return

    const shapeType = stroke.tool.replace("shape-", "")
    const start = stroke.points[0]
    const end = stroke.points[1]
    const color = this.hexToNumber(stroke.color)
    const alpha = stroke.opacity / 100

    const minX = Math.min(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)
    const centerX = (start.x + end.x) / 2
    const centerY = (start.y + end.y) / 2

    if (stroke.fillColor || stroke.backgroundColor) {
      const fillColor = this.hexToNumber(stroke.fillColor || stroke.backgroundColor || "#ffffff")
      g.fill({ color: fillColor, alpha })
    }

    g.setStrokeStyle({ width: stroke.thickness, color, alpha, cap: "round", join: "round" })

    switch (shapeType) {
      case "rectangle":
        g.rect(minX, minY, width, height)
        if (stroke.fillColor || stroke.backgroundColor) g.fill()
        g.stroke()
        break

      case "circle":
        g.ellipse(centerX, centerY, width / 2, height / 2)
        if (stroke.fillColor || stroke.backgroundColor) g.fill()
        g.stroke()
        break

      case "line":
        g.moveTo(start.x, start.y)
        g.lineTo(end.x, end.y)
        g.stroke()
        break

      case "arrow":
        g.moveTo(start.x, start.y)
        g.lineTo(end.x, end.y)
        g.stroke()
        
        const angle = Math.atan2(end.y - start.y, end.x - start.x)
        const len = 12 + stroke.thickness
        const spread = Math.PI / 7
        
        g.moveTo(end.x, end.y)
        g.lineTo(end.x - len * Math.cos(angle - spread), end.y - len * Math.sin(angle - spread))
        g.moveTo(end.x, end.y)
        g.lineTo(end.x - len * Math.cos(angle + spread), end.y - len * Math.sin(angle + spread))
        g.stroke()
        break

      case "triangle":
        g.moveTo(centerX, minY)
        g.lineTo(minX + width, minY + height)
        g.lineTo(minX, minY + height)
        g.closePath()
        if (stroke.fillColor || stroke.backgroundColor) g.fill()
        g.stroke()
        break

      case "diamond":
        g.moveTo(centerX, minY)
        g.lineTo(minX + width, centerY)
        g.lineTo(centerX, minY + height)
        g.lineTo(minX, centerY)
        g.closePath()
        if (stroke.fillColor || stroke.backgroundColor) g.fill()
        g.stroke()
        break

      case "star":
        this.drawStar(g, centerX, centerY, Math.min(width, height) / 2, stroke.fillColor || stroke.backgroundColor)
        break

      case "heart":
        this.drawHeart(g, minX, minY, width, height, stroke.fillColor || stroke.backgroundColor)
        break
    }
  }

  private drawStar(g: Graphics, cx: number, cy: number, outerR: number, hasFill?: string): void {
    const innerR = outerR * 0.4
    const spikes = 5
    let rot = -Math.PI / 2

    g.moveTo(cx + outerR * Math.cos(rot), cy + outerR * Math.sin(rot))
    
    for (let i = 0; i < spikes; i++) {
      rot += Math.PI / spikes
      g.lineTo(cx + innerR * Math.cos(rot), cy + innerR * Math.sin(rot))
      rot += Math.PI / spikes
      g.lineTo(cx + outerR * Math.cos(rot), cy + outerR * Math.sin(rot))
    }
    
    g.closePath()
    if (hasFill) g.fill()
    g.stroke()
  }

  private drawHeart(g: Graphics, x: number, y: number, w: number, h: number, hasFill?: string): void {
    const cx = x + w / 2
    
    g.moveTo(cx, y + h * 0.15)
    g.bezierCurveTo(cx, y, x, y, x, y + h * 0.3)
    g.bezierCurveTo(x, y + h * 0.8, cx, y + h, cx, y + h)
    g.bezierCurveTo(cx, y + h, x + w, y + h * 0.8, x + w, y + h * 0.3)
    g.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.15)
    
    if (hasFill) g.fill()
    g.stroke()
  }

  setCurrentStroke(points: Point[], style: StrokeStyle | null): void {
    if (!this.currentStrokeGraphics) return
    
    if (!style || points.length < 2) {
      this.currentStrokeGraphics.clear()
      return
    }

    this.currentStrokeGraphics.clear()

    const color = this.hexToNumber(style.color)
    const alpha = style.opacity / 100

    this.currentStrokeGraphics.setStrokeStyle({
      width: style.thickness,
      color,
      alpha,
      cap: "round",
      join: "round",
    })

    this.currentStrokeGraphics.moveTo(points[0].x, points[0].y)
    
    const step = points.length > 100 ? 2 : 1
    
    for (let i = 1; i < points.length; i += step) {
      const prevIdx = Math.max(0, i - step)
      const prev = points[prevIdx]
      const curr = points[i]
      const midX = (prev.x + curr.x) / 2
      const midY = (prev.y + curr.y) / 2
      this.currentStrokeGraphics.quadraticCurveTo(prev.x, prev.y, midX, midY)
    }
    
    const last = points[points.length - 1]
    this.currentStrokeGraphics.lineTo(last.x, last.y)
    this.currentStrokeGraphics.stroke()
  }

  setShapePreview(preview: ShapePreview | null): void {
    if (!this.shapePreviewGraphics) return
    this.shapePreviewGraphics.clear()

    if (!preview) return

    const stroke: Stroke = {
      id: "preview",
      points: [preview.start, preview.end],
      color: preview.color,
      thickness: preview.thickness,
      opacity: preview.opacity,
      tool: `shape-${preview.shapeType}`,
      pageId: 0,
      fillColor: preview.fillColor,
    }

    this.drawStrokeToGraphics(this.shapePreviewGraphics, stroke)
  }

  setSymbolPreview(preview: SymbolPreview | null): void {
    if (this.symbolPreviewText) {
      this.app?.stage.removeChild(this.symbolPreviewText)
      this.symbolPreviewText.destroy()
      this.symbolPreviewText = null
    }

    if (!preview || !this.app) return

    const size = Math.max(20, Math.abs(preview.end.x - preview.start.x), Math.abs(preview.end.y - preview.start.y))
    
    const style = new TextStyle({
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: size,
      fill: preview.color,
    })

    this.symbolPreviewText = new Text({ text: preview.symbol, style })
    this.symbolPreviewText.alpha = preview.opacity / 100
    this.symbolPreviewText.position.set(preview.start.x, preview.start.y)
    this.app.stage.addChild(this.symbolPreviewText)
  }

  setSelectedIds(ids: string[]): void {
    this.selectedIds = ids
    this.updateSelection()
  }

  private updateSelection(): void {
    if (!this.selectionGraphics) return
    this.selectionGraphics.clear()

    this.selectedIds.forEach(id => {
      const graphics = this.strokeGraphicsMap.get(id)
      if (!graphics) return

      const bounds = graphics.getBounds()
      const padding = 5
      const cornerSize = 8

      this.selectionGraphics!.fill({ color: 0x8b5cf6, alpha: 0.08 })
      this.selectionGraphics!.rect(
        bounds.x - padding,
        bounds.y - padding,
        bounds.width + padding * 2,
        bounds.height + padding * 2
      )
      this.selectionGraphics!.fill()

      this.selectionGraphics!.setStrokeStyle({ width: 1.5, color: 0x8b5cf6 })
      this.selectionGraphics!.rect(
        bounds.x - padding,
        bounds.y - padding,
        bounds.width + padding * 2,
        bounds.height + padding * 2
      )
      this.selectionGraphics!.stroke()

      const corners = [
        { x: bounds.x - padding, y: bounds.y - padding },
        { x: bounds.x + bounds.width + padding, y: bounds.y - padding },
        { x: bounds.x - padding, y: bounds.y + bounds.height + padding },
        { x: bounds.x + bounds.width + padding, y: bounds.y + bounds.height + padding },
      ]

      corners.forEach(corner => {
        this.selectionGraphics!.fill({ color: 0xffffff })
        this.selectionGraphics!.setStrokeStyle({ width: 2, color: 0x8b5cf6 })
        this.selectionGraphics!.rect(
          corner.x - cornerSize / 2,
          corner.y - cornerSize / 2,
          cornerSize,
          cornerSize
        )
        this.selectionGraphics!.fill()
        this.selectionGraphics!.stroke()
      })
    })
  }

  setRubberBand(start: Point | null, end: Point | null): void {
    if (!this.rubberBandGraphics) return
    this.rubberBandGraphics.clear()

    if (!start || !end) return

    const minX = Math.min(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)

    if (width < 5 && height < 5) return

    this.rubberBandGraphics.fill({ color: 0x0ea5e9, alpha: 0.15 })
    this.rubberBandGraphics.setStrokeStyle({ width: 1, color: 0x0ea5e9 })
    this.rubberBandGraphics.rect(minX, minY, width, height)
    this.rubberBandGraphics.fill()
    this.rubberBandGraphics.stroke()
  }

  hitTest(x: number, y: number, strokes: Stroke[], radius: number = 10): number {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const stroke = strokes[i]
      
      if (stroke.tool === "pen" || stroke.tool === "highlighter") {
        for (const p of stroke.points) {
          const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2)
          if (dist <= radius + stroke.thickness / 2) {
            return i
          }
        }
      } else if (stroke.tool.startsWith("shape-") && stroke.points.length >= 2) {
        const minX = Math.min(stroke.points[0].x, stroke.points[1].x)
        const minY = Math.min(stroke.points[0].y, stroke.points[1].y)
        const maxX = Math.max(stroke.points[0].x, stroke.points[1].x)
        const maxY = Math.max(stroke.points[0].y, stroke.points[1].y)
        
        if (x >= minX - radius && x <= maxX + radius && y >= minY - radius && y <= maxY + radius) {
          return i
        }
      } else if (stroke.tool.startsWith("text:") && stroke.points.length > 0) {
        const fontSize = Math.max(14, stroke.thickness * 4)
        const text = stroke.tool.replace("text:", "")
        const textWidth = text.length * fontSize * 0.6
        
        if (x >= stroke.points[0].x - radius && x <= stroke.points[0].x + textWidth + radius &&
            y >= stroke.points[0].y - fontSize - radius && y <= stroke.points[0].y + radius) {
          return i
        }
      }
    }
    return -1
  }

  private hexToNumber(hex: string): number {
    if (!hex || hex === "transparent") return 0xffffff
    const cleaned = hex.replace("#", "")
    return parseInt(cleaned, 16)
  }

  updateStroke(id: string, stroke: Stroke): void {
    const graphics = this.strokeGraphicsMap.get(id)
    if (!graphics) return

    if (stroke.tool.startsWith("text:") && graphics instanceof Text) {
      this.updateTextGraphics(graphics, stroke)
    } else if (graphics instanceof Graphics) {
      this.drawStrokeToGraphics(graphics, stroke)
    }
    
    this.strokeDataMap.set(id, this.hashStroke(stroke))
    this.updateSelection()
  }

  private updateTextGraphics(text: Text, stroke: Stroke): void {
    const fontSize = Math.max(14, stroke.thickness * 4)
    text.style.fontSize = fontSize
    text.style.fill = stroke.color
    text.alpha = stroke.opacity / 100
    text.position.set(stroke.points[0]?.x || 0, (stroke.points[0]?.y || 0) - fontSize * 0.85)
  }

  destroy(): void {
    this.strokeGraphicsMap.forEach(g => g.destroy())
    this.strokeGraphicsMap.clear()
    this.strokeDataMap.clear()
    this.dirtyStrokes.clear()
    this.app?.destroy(true)
    this.app = null
    this.initialized = false
  }

  getApp(): Application | null {
    return this.app
  }
}

export const pixiEngine = new PixiEngine()
