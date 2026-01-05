"use client"

import { SpatialIndex, type Bounds, type IndexedItem } from "./spatial-index"

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
  timestamp?: number
}

interface StrokeBuffer {
  buffer: WebGLBuffer
  vertexCount: number
  lastUpdate: number
}

interface TextureCache {
  texture: WebGLTexture
  width: number
  height: number
  lastUpdate: number
}

const VERTEX_SHADER = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;
  uniform vec2 u_translation;
  uniform float u_scale;
  
  void main() {
    vec2 position = (a_position + u_translation) * u_scale;
    vec2 clipSpace = (position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
  }
`

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec4 u_color;
  
  void main() {
    gl_FragColor = u_color;
  }
`

const LINE_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_normal;
  attribute float a_miter;
  
  uniform vec2 u_resolution;
  uniform float u_thickness;
  
  void main() {
    vec2 position = a_position + a_normal * u_thickness * a_miter;
    vec2 clipSpace = (position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
  }
`

class WebGLRenderer {
  private gl: WebGLRenderingContext | null = null
  private canvas: HTMLCanvasElement | null = null
  private program: WebGLProgram | null = null
  private lineProgram: WebGLProgram | null = null
  private width: number = 800
  private height: number = 600
  private strokeBufferCache: Map<string, StrokeBuffer> = new Map()
  private textTextureCache: Map<string, TextureCache> = new Map()
  private pdfTexture: WebGLTexture | null = null
  private pdfProgram: WebGLProgram | null = null
  private gridBuffer: WebGLBuffer | null = null
  private gridVertexCount: number = 0
  private frameCount: number = 0
  private lastFpsTime: number = 0
  private fps: number = 0
  private animationId: number = 0
  private needsRender: boolean = true
  private needsFullRender: boolean = true
  private initialized: boolean = false
  private targetFps: number = 60
  private lastRenderTime: number = 0
  private showGrid: boolean = false
  private gridSize: number = 20

  private pendingStrokes: Stroke[] = []
  private selectedIds: string[] = []
  private currentPoints: Point[] = []
  private currentStyle: { color: string; thickness: number; opacity: number } | null = null
  private shapePreview: { type: string; start: Point; end: Point; color: string; thickness: number; opacity: number; fillColor?: string } | null = null
  private symbolPreview: { symbol: string; position: Point; size: number; color: string; opacity: number } | null = null
  private rubberBand: { start: Point; end: Point } | null = null
  private eraserPath: { points: Point[]; radius: number } | null = null
  private hasPdf: boolean = false
  private gpuInfo: string = "Unknown"
  
  private spatialIndex!: SpatialIndex
  private dirtyStrokes: Set<string> = new Set()
  private textCanvas: HTMLCanvasElement | null = null
  private textCtx: CanvasRenderingContext2D | null = null

  init(canvas: HTMLCanvasElement, width: number, height: number): boolean {
    if (this.initialized && this.gl) {
      this.resize(width, height)
      return true
    }

    this.canvas = canvas
    this.width = width
    this.height = height
    
    this.spatialIndex = new SpatialIndex({ minX: 0, minY: 0, maxX: width, maxY: height })

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
      desynchronized: true,
    }) || canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
      desynchronized: true,
    })

    if (!gl) {
      console.error("WebGL not supported")
      return false
    }

    this.gl = gl
    gl.viewport(0, 0, width, height)
    gl.clearColor(1, 1, 1, 1)

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info")
    if (debugInfo) {
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      this.gpuInfo = `${vendor} - ${renderer}`
      console.log("🎮 GPU:", this.gpuInfo)
    }

    this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER)
    this.lineProgram = this.createProgram(LINE_VERTEX_SHADER, FRAGMENT_SHADER)
    this.pdfProgram = this.createPdfProgram()

    if (!this.program || !this.lineProgram || !this.pdfProgram) {
      console.error("Failed to create shaders")
      return false
    }

    this.createGridBuffer()
    this.startRenderLoop()
    this.initialized = true

    console.log("✅ WebGL Renderer initialized (WebGL" + (gl instanceof WebGL2RenderingContext ? "2" : "1") + ")")
    return true
  }

  private createProgram(vertexSrc: string, fragmentSrc: string): WebGLProgram | null {
    const gl = this.gl!
    
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vertexShader, vertexSrc)
    gl.compileShader(vertexShader)
    
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error("Vertex shader error:", gl.getShaderInfoLog(vertexShader))
      return null
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fragmentShader, fragmentSrc)
    gl.compileShader(fragmentShader)
    
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error("Fragment shader error:", gl.getShaderInfoLog(fragmentShader))
      return null
    }

    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program))
      return null
    }

    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)

    return program
  }

  private createPdfProgram(): WebGLProgram | null {
    const vertexSrc = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      uniform vec2 u_resolution;
      
      void main() {
        vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        v_texCoord = a_texCoord;
      }
    `
    
    const fragmentSrc = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      
      void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
      }
    `
    
    return this.createProgram(vertexSrc, fragmentSrc)
  }

  private createGridBuffer(): void {
    const gl = this.gl!
    const vertices: number[] = []
    const step = this.gridSize

    for (let x = 0; x <= this.width; x += step) {
      vertices.push(x, 0, x, this.height)
    }
    for (let y = 0; y <= this.height; y += step) {
      vertices.push(0, y, this.width, y)
    }

    this.gridBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)
    this.gridVertexCount = vertices.length / 2
  }

  resize(width: number, height: number): void {
    if (!this.gl || !this.canvas) return
    
    this.width = width
    this.height = height
    this.canvas.width = width
    this.canvas.height = height
    this.gl.viewport(0, 0, width, height)
    this.createGridBuffer()
    this.spatialIndex = new SpatialIndex({ minX: 0, minY: 0, maxX: width, maxY: height })
    this.rebuildSpatialIndex()
    this.needsRender = true
    this.needsFullRender = true
  }

  private startRenderLoop(): void {
    const render = (now: number) => {
      const frameInterval = 1000 / this.targetFps
      const elapsed = now - this.lastRenderTime
      
      if (elapsed >= frameInterval) {
        this.lastRenderTime = now - (elapsed % frameInterval)
        
        this.frameCount++
        
        if (now - this.lastFpsTime >= 1000) {
          this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime))
          this.frameCount = 0
          this.lastFpsTime = now
        }

        if (this.needsRender) {
          this.render()
          this.needsRender = false
        }
      }

      this.animationId = requestAnimationFrame(render)
    }
    
    this.animationId = requestAnimationFrame(render)
  }

  setTargetFps(fps: number): void {
    this.targetFps = Math.max(30, Math.min(360, fps))
  }

  getTargetFps(): number {
    return this.targetFps
  }

  setGridEnabled(enabled: boolean): void {
    this.showGrid = enabled
    this.needsRender = true
  }

  setGridSize(size: number): void {
    this.gridSize = Math.max(10, Math.min(100, size))
    this.createGridBuffer()
    this.needsRender = true
  }

  getFps(): number {
    return this.fps
  }

  getGpuInfo(): string {
    return this.gpuInfo
  }

  private render(): void {
    const gl = this.gl
    if (!gl) return

    gl.clear(gl.COLOR_BUFFER_BIT)

    if (this.hasPdf && this.pdfTexture) {
      this.renderPdf()
    }
    
    if (this.showGrid) {
      this.renderGrid()
    }

    this.renderStrokes()
    this.renderCurrentStroke()
    this.renderShapePreview()
    this.renderSymbolPreview()
    this.renderSelection()
    this.renderRubberBand()
    this.renderEraserPath()
  }

  private renderGrid(): void {
    const gl = this.gl!
    if (!this.gridBuffer || !this.program || !this.showGrid) return

    gl.useProgram(this.program)
    
    const posLoc = gl.getAttribLocation(this.program, "a_position")
    const resLoc = gl.getUniformLocation(this.program, "u_resolution")
    const transLoc = gl.getUniformLocation(this.program, "u_translation")
    const scaleLoc = gl.getUniformLocation(this.program, "u_scale")
    const colorLoc = gl.getUniformLocation(this.program, "u_color")

    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuffer)
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(resLoc, this.width, this.height)
    gl.uniform2f(transLoc, 0, 0)
    gl.uniform1f(scaleLoc, 1)
    gl.uniform4f(colorLoc, 0.9, 0.9, 0.9, 1)

    gl.drawArrays(gl.LINES, 0, this.gridVertexCount)
    gl.disableVertexAttribArray(posLoc)
  }

  private renderPdf(): void {
    const gl = this.gl!
    if (!this.pdfTexture || !this.pdfProgram) return

    gl.useProgram(this.pdfProgram)

    const vertices = new Float32Array([
      0, 0, 0, 0,
      this.width, 0, 1, 0,
      0, this.height, 0, 1,
      this.width, this.height, 1, 1,
    ])

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)

    const posLoc = gl.getAttribLocation(this.pdfProgram, "a_position")
    const texLoc = gl.getAttribLocation(this.pdfProgram, "a_texCoord")
    const resLoc = gl.getUniformLocation(this.pdfProgram, "u_resolution")

    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(texLoc)
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8)

    gl.uniform2f(resLoc, this.width, this.height)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.pdfTexture)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.disableVertexAttribArray(posLoc)
    gl.disableVertexAttribArray(texLoc)
    gl.deleteBuffer(buffer)
  }

  private renderStrokes(): void {
    for (const stroke of this.pendingStrokes) {
      if (stroke.tool === "pen" || stroke.tool === "highlighter") {
        this.renderPenStroke(stroke)
      } else if (stroke.tool.startsWith("shape-")) {
        this.renderShape(stroke)
      } else if (stroke.tool.startsWith("text:")) {
        this.renderText(stroke)
      }
    }
  }

  private renderPenStroke(stroke: Stroke): void {
    if (stroke.points.length < 2) return
    
    const gl = this.gl!
    if (!this.program) return

    let cached = this.strokeBufferCache.get(stroke.id)
    const strokeTime = stroke.timestamp || 0
    
    if (!cached || strokeTime > cached.lastUpdate || this.dirtyStrokes.has(stroke.id)) {
      const vertices = this.createLineVertices(stroke.points, stroke.thickness)
      
      if (cached) {
        gl.bindBuffer(gl.ARRAY_BUFFER, cached.buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)
        cached.vertexCount = vertices.length / 2
        cached.lastUpdate = strokeTime
      } else {
        const buffer = gl.createBuffer()!
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)
        
        cached = {
          buffer,
          vertexCount: vertices.length / 2,
          lastUpdate: strokeTime
        }
        this.strokeBufferCache.set(stroke.id, cached)
      }
      
      this.dirtyStrokes.delete(stroke.id)
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, cached.buffer)
    }

    gl.useProgram(this.program)
    
    const posLoc = gl.getAttribLocation(this.program, "a_position")
    const resLoc = gl.getUniformLocation(this.program, "u_resolution")
    const transLoc = gl.getUniformLocation(this.program, "u_translation")
    const scaleLoc = gl.getUniformLocation(this.program, "u_scale")
    const colorLoc = gl.getUniformLocation(this.program, "u_color")

    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(resLoc, this.width, this.height)
    gl.uniform2f(transLoc, 0, 0)
    gl.uniform1f(scaleLoc, 1)

    const color = this.hexToRgb(stroke.color)
    gl.uniform4f(colorLoc, color[0], color[1], color[2], stroke.opacity / 100)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, cached.vertexCount)

    gl.disable(gl.BLEND)
    gl.disableVertexAttribArray(posLoc)
  }

  private createLineVertices(points: Point[], thickness: number): number[] {
    const vertices: number[] = []
    const halfThickness = thickness / 2

    for (let i = 0; i < points.length; i++) {
      const curr = points[i]
      const prev = points[Math.max(0, i - 1)]
      const next = points[Math.min(points.length - 1, i + 1)]

      let nx = -(next.y - prev.y)
      let ny = next.x - prev.x
      const len = Math.sqrt(nx * nx + ny * ny) || 1
      nx /= len
      ny /= len

      vertices.push(
        curr.x + nx * halfThickness, curr.y + ny * halfThickness,
        curr.x - nx * halfThickness, curr.y - ny * halfThickness
      )
    }

    return vertices
  }

  private renderShape(stroke: Stroke): void {
    if (stroke.points.length < 2) return
    
    const gl = this.gl!
    if (!this.program) return

    const shapeType = stroke.tool.replace("shape-", "")
    const start = stroke.points[0]
    const end = stroke.points[1]
    
    let vertices: number[] = []
    let mode: number = gl.LINE_LOOP

    const minX = Math.min(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const maxX = Math.max(start.x, end.x)
    const maxY = Math.max(start.y, end.y)
    const w = maxX - minX
    const h = maxY - minY
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    switch (shapeType) {
      case "rectangle":
        vertices = [minX, minY, maxX, minY, maxX, maxY, minX, maxY]
        break
      case "circle":
        vertices = this.createEllipseVertices(cx, cy, w / 2, h / 2, 32)
        break
      case "triangle":
        vertices = [cx, minY, maxX, maxY, minX, maxY]
        break
      case "line":
        vertices = [start.x, start.y, end.x, end.y]
        mode = gl.LINES
        break
      case "arrow":
        vertices = this.createArrowVertices(start, end, stroke.thickness)
        mode = gl.LINES
        break
      case "diamond":
        vertices = [cx, minY, maxX, cy, cx, maxY, minX, cy]
        break
      case "star":
        vertices = this.createStarVertices(cx, cy, Math.min(w, h) / 2)
        break
      case "heart":
        vertices = this.createHeartVertices(cx, cy, w, h)
        break
    }

    if (vertices.length === 0) return

    if (stroke.fillColor || stroke.backgroundColor) {
      this.renderFilledShape(vertices, stroke.fillColor || stroke.backgroundColor!, stroke.opacity)
    }

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW)

    gl.useProgram(this.program)
    
    const posLoc = gl.getAttribLocation(this.program, "a_position")
    const resLoc = gl.getUniformLocation(this.program, "u_resolution")
    const transLoc = gl.getUniformLocation(this.program, "u_translation")
    const scaleLoc = gl.getUniformLocation(this.program, "u_scale")
    const colorLoc = gl.getUniformLocation(this.program, "u_color")

    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(resLoc, this.width, this.height)
    gl.uniform2f(transLoc, 0, 0)
    gl.uniform1f(scaleLoc, 1)

    const color = this.hexToRgb(stroke.color)
    gl.uniform4f(colorLoc, color[0], color[1], color[2], stroke.opacity / 100)

    gl.lineWidth(stroke.thickness)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.drawArrays(mode, 0, vertices.length / 2)

    gl.disable(gl.BLEND)
    gl.disableVertexAttribArray(posLoc)
    gl.deleteBuffer(buffer)
  }

  private renderFilledShape(vertices: number[], fillColor: string, opacity: number): void {
    const gl = this.gl!
    if (!this.program || fillColor === "transparent") return

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW)

    gl.useProgram(this.program)
    
    const posLoc = gl.getAttribLocation(this.program, "a_position")
    const resLoc = gl.getUniformLocation(this.program, "u_resolution")
    const transLoc = gl.getUniformLocation(this.program, "u_translation")
    const scaleLoc = gl.getUniformLocation(this.program, "u_scale")
    const colorLoc = gl.getUniformLocation(this.program, "u_color")

    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(resLoc, this.width, this.height)
    gl.uniform2f(transLoc, 0, 0)
    gl.uniform1f(scaleLoc, 1)

    const color = this.hexToRgb(fillColor)
    gl.uniform4f(colorLoc, color[0], color[1], color[2], opacity / 100)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.drawArrays(gl.TRIANGLE_FAN, 0, vertices.length / 2)

    gl.disable(gl.BLEND)
    gl.disableVertexAttribArray(posLoc)
    gl.deleteBuffer(buffer)
  }

  private createEllipseVertices(cx: number, cy: number, rx: number, ry: number, segments: number): number[] {
    const vertices: number[] = []
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      vertices.push(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry)
    }
    return vertices
  }

  private createArrowVertices(start: Point, end: Point, thickness: number): number[] {
    const angle = Math.atan2(end.y - start.y, end.x - start.x)
    const len = 12 + thickness
    const spread = Math.PI / 7
    
    return [
      start.x, start.y, end.x, end.y,
      end.x, end.y, end.x - len * Math.cos(angle - spread), end.y - len * Math.sin(angle - spread),
      end.x, end.y, end.x - len * Math.cos(angle + spread), end.y - len * Math.sin(angle + spread),
    ]
  }

  private createStarVertices(cx: number, cy: number, outerR: number): number[] {
    const vertices: number[] = []
    const innerR = outerR * 0.4
    const spikes = 5
    let rot = -Math.PI / 2

    for (let i = 0; i < spikes; i++) {
      vertices.push(cx + outerR * Math.cos(rot), cy + outerR * Math.sin(rot))
      rot += Math.PI / spikes
      vertices.push(cx + innerR * Math.cos(rot), cy + innerR * Math.sin(rot))
      rot += Math.PI / spikes
    }
    
    return vertices
  }

  private createHeartVertices(cx: number, cy: number, w: number, h: number): number[] {
    const vertices: number[] = []
    const steps = 30
    
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2
      const x = 16 * Math.pow(Math.sin(t), 3)
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
      vertices.push(cx + x * w / 32, cy - y * h / 32)
    }
    
    return vertices
  }

  private renderText(stroke: Stroke): void {
    if (stroke.points.length === 0) return
    
    const text = stroke.tool.replace("text:", "")
    const fontSize = Math.max(14, stroke.thickness * 4)
    const cacheKey = `${stroke.id}-${text}-${fontSize}-${stroke.color}-${stroke.opacity}`
    
    const gl = this.gl!
    let cached = this.textTextureCache.get(cacheKey)
    const strokeTime = stroke.timestamp || 0
    
    if (!cached || strokeTime > cached.lastUpdate) {
      if (!this.textCanvas) {
        this.textCanvas = document.createElement("canvas")
        this.textCtx = this.textCanvas.getContext("2d")
      }
      
      const ctx = this.textCtx
      if (!ctx) return
      
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
      const metrics = ctx.measureText(text)
      const textWidth = Math.ceil(metrics.width) + 4
      const textHeight = Math.ceil(fontSize * 1.2)
      
      this.textCanvas.width = textWidth
      this.textCanvas.height = textHeight
      
      ctx.clearRect(0, 0, textWidth, textHeight)
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
      ctx.fillStyle = stroke.color
      ctx.globalAlpha = stroke.opacity / 100
      ctx.textBaseline = "top"
      ctx.fillText(text, 0, 0)
      
      if (cached) {
        gl.bindTexture(gl.TEXTURE_2D, cached.texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas)
        cached.width = textWidth
        cached.height = textHeight
        cached.lastUpdate = strokeTime
      } else {
        const texture = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        
        cached = {
          texture,
          width: textWidth,
          height: textHeight,
          lastUpdate: strokeTime
        }
        this.textTextureCache.set(cacheKey, cached)
      }
    } else {
      gl.bindTexture(gl.TEXTURE_2D, cached.texture)
    }

    const x = stroke.points[0].x
    const y = stroke.points[0].y - fontSize * 0.85

    const vertices = new Float32Array([
      x, y, 0, 0,
      x + cached.width, y, 1, 0,
      x, y + cached.height, 0, 1,
      x + cached.width, y + cached.height, 1, 1,
    ])

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW)

    gl.useProgram(this.pdfProgram)

    const posLoc = gl.getAttribLocation(this.pdfProgram!, "a_position")
    const texLoc = gl.getAttribLocation(this.pdfProgram!, "a_texCoord")
    const resLoc = gl.getUniformLocation(this.pdfProgram!, "u_resolution")

    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(texLoc)
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8)

    gl.uniform2f(resLoc, this.width, this.height)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.activeTexture(gl.TEXTURE0)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    gl.disable(gl.BLEND)
    gl.disableVertexAttribArray(posLoc)
    gl.disableVertexAttribArray(texLoc)
    gl.deleteBuffer(buffer)
  }

  private renderCurrentStroke(): void {
    if (!this.currentStyle || this.currentPoints.length < 2) return
    
    const gl = this.gl!
    if (!this.program) return

    const vertices = this.createLineVertices(this.currentPoints, this.currentStyle.thickness)
    
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW)

    gl.useProgram(this.program)
    
    const posLoc = gl.getAttribLocation(this.program, "a_position")
    const resLoc = gl.getUniformLocation(this.program, "u_resolution")
    const transLoc = gl.getUniformLocation(this.program, "u_translation")
    const scaleLoc = gl.getUniformLocation(this.program, "u_scale")
    const colorLoc = gl.getUniformLocation(this.program, "u_color")

    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(resLoc, this.width, this.height)
    gl.uniform2f(transLoc, 0, 0)
    gl.uniform1f(scaleLoc, 1)

    const color = this.hexToRgb(this.currentStyle.color)
    gl.uniform4f(colorLoc, color[0], color[1], color[2], this.currentStyle.opacity / 100)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertices.length / 2)

    gl.disable(gl.BLEND)
    gl.disableVertexAttribArray(posLoc)
    gl.deleteBuffer(buffer)
  }

  private renderShapePreview(): void {
    if (!this.shapePreview) return
    
    const stroke: Stroke = {
      id: "preview",
      points: [this.shapePreview.start, this.shapePreview.end],
      color: this.shapePreview.color,
      thickness: this.shapePreview.thickness,
      opacity: this.shapePreview.opacity,
      tool: `shape-${this.shapePreview.type}`,
      pageId: 0,
      fillColor: this.shapePreview.fillColor,
    }
    
    this.renderShape(stroke)
  }

  private renderSymbolPreview(): void {
    if (!this.symbolPreview) return
    
    const { symbol, position, size, color, opacity } = this.symbolPreview
    const fontSize = Math.max(14, size)
    
    if (!this.textCanvas) {
      this.textCanvas = document.createElement("canvas")
      this.textCtx = this.textCanvas.getContext("2d")
    }
    
    const ctx = this.textCtx
    if (!ctx) return
    
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
    const metrics = ctx.measureText(symbol)
    const textWidth = Math.ceil(metrics.width) + 4
    const textHeight = Math.ceil(fontSize * 1.2)
    
    this.textCanvas.width = textWidth
    this.textCanvas.height = textHeight
    
    ctx.clearRect(0, 0, textWidth, textHeight)
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
    ctx.fillStyle = color
    ctx.globalAlpha = opacity / 100
    ctx.textBaseline = "top"
    ctx.fillText(symbol, 0, 0)
    
    const gl = this.gl!
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    const x = position.x
    const y = position.y - fontSize * 0.85

    const vertices = new Float32Array([
      x, y, 0, 0,
      x + textWidth, y, 1, 0,
      x, y + textHeight, 0, 1,
      x + textWidth, y + textHeight, 1, 1,
    ])

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW)

    gl.useProgram(this.pdfProgram)

    const posLoc = gl.getAttribLocation(this.pdfProgram!, "a_position")
    const texLoc = gl.getAttribLocation(this.pdfProgram!, "a_texCoord")
    const resLoc = gl.getUniformLocation(this.pdfProgram!, "u_resolution")

    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(texLoc)
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8)

    gl.uniform2f(resLoc, this.width, this.height)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    gl.disable(gl.BLEND)
    gl.disableVertexAttribArray(posLoc)
    gl.disableVertexAttribArray(texLoc)
    gl.deleteBuffer(buffer)
    gl.deleteTexture(texture)
  }

  private renderSelection(): void {
    if (this.selectedIds.length === 0) return
    
    const gl = this.gl!
    if (!this.program) return

    for (const id of this.selectedIds) {
      const stroke = this.pendingStrokes.find(s => s.id === id)
      if (!stroke) continue

      const bounds = this.getStrokeBounds(stroke)
      if (!bounds) continue

      const padding = 5
      const { minX, minY, maxX, maxY } = bounds
      
      const vertices = [
        minX - padding, minY - padding,
        maxX + padding, minY - padding,
        maxX + padding, maxY + padding,
        minX - padding, maxY + padding,
      ]

      const buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW)

      gl.useProgram(this.program)
      
      const posLoc = gl.getAttribLocation(this.program, "a_position")
      const resLoc = gl.getUniformLocation(this.program, "u_resolution")
      const transLoc = gl.getUniformLocation(this.program, "u_translation")
      const scaleLoc = gl.getUniformLocation(this.program, "u_scale")
      const colorLoc = gl.getUniformLocation(this.program, "u_color")

      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

      gl.uniform2f(resLoc, this.width, this.height)
      gl.uniform2f(transLoc, 0, 0)
      gl.uniform1f(scaleLoc, 1)
      gl.uniform4f(colorLoc, 0.545, 0.361, 0.965, 0.08)

      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)

      gl.uniform4f(colorLoc, 0.545, 0.361, 0.965, 1)
      gl.drawArrays(gl.LINE_LOOP, 0, 4)

      gl.disable(gl.BLEND)
      gl.disableVertexAttribArray(posLoc)
      gl.deleteBuffer(buffer)
    }
  }

  private renderRubberBand(): void {
    if (!this.rubberBand) return
    
    const gl = this.gl!
    if (!this.program) return

    const { start, end } = this.rubberBand
    const minX = Math.min(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const maxX = Math.max(start.x, end.x)
    const maxY = Math.max(start.y, end.y)

    if (maxX - minX < 5 && maxY - minY < 5) return

    const vertices = [minX, minY, maxX, minY, maxX, maxY, minX, maxY]

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW)

    gl.useProgram(this.program)
    
    const posLoc = gl.getAttribLocation(this.program, "a_position")
    const resLoc = gl.getUniformLocation(this.program, "u_resolution")
    const transLoc = gl.getUniformLocation(this.program, "u_translation")
    const scaleLoc = gl.getUniformLocation(this.program, "u_scale")
    const colorLoc = gl.getUniformLocation(this.program, "u_color")

    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(resLoc, this.width, this.height)
    gl.uniform2f(transLoc, 0, 0)
    gl.uniform1f(scaleLoc, 1)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.uniform4f(colorLoc, 0.055, 0.647, 0.914, 0.15)
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)

    gl.uniform4f(colorLoc, 0.055, 0.647, 0.914, 1)
    gl.drawArrays(gl.LINE_LOOP, 0, 4)

    gl.disable(gl.BLEND)
    gl.disableVertexAttribArray(posLoc)
    gl.deleteBuffer(buffer)
  }

  private getStrokeBounds(stroke: Stroke): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (stroke.points.length === 0) return null

    if (stroke.tool.startsWith("shape-") && stroke.points.length >= 2) {
      return {
        minX: Math.min(stroke.points[0].x, stroke.points[1].x),
        minY: Math.min(stroke.points[0].y, stroke.points[1].y),
        maxX: Math.max(stroke.points[0].x, stroke.points[1].x),
        maxY: Math.max(stroke.points[0].y, stroke.points[1].y),
      }
    }

    if (stroke.tool.startsWith("text:")) {
      const text = stroke.tool.replace("text:", "")
      const fontSize = Math.max(14, stroke.thickness * 4)
      const textWidth = text.length * fontSize * 0.6
      return {
        minX: stroke.points[0].x,
        minY: stroke.points[0].y - fontSize,
        maxX: stroke.points[0].x + textWidth,
        maxY: stroke.points[0].y,
      }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    return { minX, minY, maxX, maxY }
  }

  private hexToRgb(hex: string): [number, number, number] {
    if (!hex || hex === "transparent") return [1, 1, 1]
    const cleaned = hex.replace("#", "")
    const num = parseInt(cleaned, 16)
    return [(num >> 16) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255]
  }

  setStrokes(strokes: Stroke[]): void {
    const oldStrokesMap = new Map(this.pendingStrokes.map(s => [s.id, s]))
    
    for (const stroke of strokes) {
      const oldStroke = oldStrokesMap.get(stroke.id)
      if (oldStroke) {
        if (stroke.points !== oldStroke.points || 
            stroke.color !== oldStroke.color || 
            stroke.thickness !== oldStroke.thickness ||
            stroke.opacity !== oldStroke.opacity) {
          this.dirtyStrokes.add(stroke.id)
        }
      } else {
        this.dirtyStrokes.add(stroke.id)
      }
    }
    
    this.pendingStrokes = strokes
    this.needsRender = true
    this.rebuildSpatialIndex()
  }

  rebuildSpatialIndex(): void {
    const items: IndexedItem[] = []
    
    for (const stroke of this.pendingStrokes) {
      const bounds = this.getStrokeBounds(stroke)
      if (bounds) {
        items.push({
          id: stroke.id,
          bounds
        })
      }
    }
    
    this.spatialIndex.rebuild(items)
  }
  
  markStrokeDirty(strokeId: string): void {
    this.dirtyStrokes.add(strokeId)
    this.needsRender = true
  }
  
  markStrokesDirty(strokeIds: string[]): void {
    for (const id of strokeIds) {
      this.dirtyStrokes.add(id)
    }
    this.needsRender = true
  }

  setCurrentStroke(points: Point[], style: { color: string; thickness: number; opacity: number } | null): void {
    this.currentPoints = points
    this.currentStyle = style
    this.needsRender = true
  }

  setShapePreview(preview: { type: string; start: Point; end: Point; color: string; thickness: number; opacity: number; fillColor?: string } | null): void {
    this.shapePreview = preview
    this.needsRender = true
  }

  setSymbolPreview(preview: { symbol: string; position: Point; size: number; color: string; opacity: number } | null): void {
    this.symbolPreview = preview
    this.needsRender = true
  }

  setSelectedIds(ids: string[]): void {
    this.selectedIds = ids
    this.needsRender = true
  }

  setRubberBand(start: Point | null, end: Point | null): void {
    if (start && end) {
      this.rubberBand = { start, end }
    } else {
      this.rubberBand = null
    }
    this.needsRender = true
  }
  
  setEraserPath(points: Point[] | null, radius?: number): void {
    if (points && points.length > 0 && radius) {
      this.eraserPath = { points, radius }
    } else {
      this.eraserPath = null
    }
    this.needsRender = true
  }
  
  private renderEraserPath(): void {
    if (!this.eraserPath || this.eraserPath.points.length === 0) return
    
    const gl = this.gl!
    if (!this.program) return

    const { points, radius } = this.eraserPath
    
    for (const point of points) {
      const segments = 16
      const vertices: number[] = []
      
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2
        vertices.push(
          point.x + Math.cos(angle) * radius,
          point.y + Math.sin(angle) * radius
        )
      }

      const buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW)

      gl.useProgram(this.program)
      
      const posLoc = gl.getAttribLocation(this.program, "a_position")
      const resLoc = gl.getUniformLocation(this.program, "u_resolution")
      const transLoc = gl.getUniformLocation(this.program, "u_translation")
      const scaleLoc = gl.getUniformLocation(this.program, "u_scale")
      const colorLoc = gl.getUniformLocation(this.program, "u_color")

      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

      gl.uniform2f(resLoc, this.width, this.height)
      gl.uniform2f(transLoc, 0, 0)
      gl.uniform1f(scaleLoc, 1)

      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      gl.uniform4f(colorLoc, 1, 0.3, 0.3, 0.3)
      gl.drawArrays(gl.TRIANGLE_FAN, 0, vertices.length / 2)

      gl.uniform4f(colorLoc, 1, 0, 0, 0.8)
      gl.drawArrays(gl.LINE_LOOP, 0, vertices.length / 2)

      gl.disable(gl.BLEND)
      gl.disableVertexAttribArray(posLoc)
      gl.deleteBuffer(buffer)
    }
  }

  setPdfImage(imageDataUrl: string | null): void {
    const gl = this.gl
    if (!gl) return

    if (!imageDataUrl) {
      if (this.pdfTexture) {
        gl.deleteTexture(this.pdfTexture)
        this.pdfTexture = null
      }
      this.hasPdf = false
      this.needsRender = true
      return
    }

    const img = new Image()
    img.onload = () => {
      if (!this.gl) return
      
      if (this.pdfTexture) {
        gl.deleteTexture(this.pdfTexture)
      }

      this.pdfTexture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, this.pdfTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

      this.hasPdf = true
      this.needsRender = true
    }
    img.src = imageDataUrl
  }

  hitTest(x: number, y: number, radius: number = 10): number {
    const candidateIds = this.spatialIndex.queryPoint(x, y, radius)
    
    if (candidateIds.length === 0) {
      return -1
    }
    
    for (let i = this.pendingStrokes.length - 1; i >= 0; i--) {
      const stroke = this.pendingStrokes[i]
      
      if (!candidateIds.includes(stroke.id)) {
        continue
      }
      
      if (stroke.tool === "pen" || stroke.tool === "highlighter") {
        for (const p of stroke.points) {
          const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2)
          if (dist <= radius + stroke.thickness / 2) {
            return i
          }
        }
      } else {
        const bounds = this.getStrokeBounds(stroke)
        if (bounds) {
          if (x >= bounds.minX - radius && x <= bounds.maxX + radius &&
              y >= bounds.minY - radius && y <= bounds.maxY + radius) {
            return i
          }
        }
      }
    }
    return -1
  }

  forceRender(): void {
    this.needsRender = true
  }

  destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
    }
    
    if (this.gl) {
      if (this.pdfTexture) this.gl.deleteTexture(this.pdfTexture)
      if (this.gridBuffer) this.gl.deleteBuffer(this.gridBuffer)
      if (this.program) this.gl.deleteProgram(this.program)
      if (this.lineProgram) this.gl.deleteProgram(this.lineProgram)
      if (this.pdfProgram) this.gl.deleteProgram(this.pdfProgram)
      
      for (const cached of this.strokeBufferCache.values()) {
        this.gl.deleteBuffer(cached.buffer)
      }
      this.strokeBufferCache.clear()
      
      for (const cached of this.textTextureCache.values()) {
        this.gl.deleteTexture(cached.texture)
      }
      this.textTextureCache.clear()
    }
    
    this.spatialIndex.clear()
    this.dirtyStrokes.clear()
    this.gl = null
    this.canvas = null
    this.initialized = false
  }
}

export const webglRenderer = new WebGLRenderer()
