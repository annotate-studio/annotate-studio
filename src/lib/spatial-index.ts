"use client"

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface IndexedItem {
  id: string
  bounds: Bounds
}

class QuadTreeNode {
  bounds: Bounds
  items: IndexedItem[] = []
  children: QuadTreeNode[] | null = null
  maxItems: number = 10
  maxDepth: number = 8
  depth: number = 0

  constructor(bounds: Bounds, depth: number = 0, maxItems: number = 10, maxDepth: number = 8) {
    this.bounds = bounds
    this.depth = depth
    this.maxItems = maxItems
    this.maxDepth = maxDepth
  }

  insert(item: IndexedItem): void {
    if (!this.intersects(this.bounds, item.bounds)) {
      return
    }

    if (this.children === null) {
      this.items.push(item)

      if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
        this.subdivide()
      }
    } else {
      for (const child of this.children) {
        child.insert(item)
      }
    }
  }

  private subdivide(): void {
    const { minX, minY, maxX, maxY } = this.bounds
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2

    this.children = [
      new QuadTreeNode({ minX, minY, maxX: midX, maxY: midY }, this.depth + 1, this.maxItems, this.maxDepth),
      new QuadTreeNode({ minX: midX, minY, maxX, maxY: midY }, this.depth + 1, this.maxItems, this.maxDepth),
      new QuadTreeNode({ minX, minY: midY, maxX: midX, maxY }, this.depth + 1, this.maxItems, this.maxDepth),
      new QuadTreeNode({ minX: midX, minY: midY, maxX, maxY }, this.depth + 1, this.maxItems, this.maxDepth),
    ]

    for (const item of this.items) {
      for (const child of this.children) {
        child.insert(item)
      }
    }

    this.items = []
  }

  query(bounds: Bounds, result: Set<string> = new Set()): Set<string> {
    if (!this.intersects(this.bounds, bounds)) {
      return result
    }

    if (this.children === null) {
      for (const item of this.items) {
        if (this.intersects(item.bounds, bounds)) {
          result.add(item.id)
        }
      }
    } else {
      for (const child of this.children) {
        child.query(bounds, result)
      }
    }

    return result
  }

  queryPoint(x: number, y: number, radius: number, result: Set<string> = new Set()): Set<string> {
    const bounds: Bounds = {
      minX: x - radius,
      minY: y - radius,
      maxX: x + radius,
      maxY: y + radius,
    }
    return this.query(bounds, result)
  }

  private intersects(a: Bounds, b: Bounds): boolean {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY)
  }

  clear(): void {
    this.items = []
    this.children = null
  }
}

export class SpatialIndex {
  private root: QuadTreeNode
  private worldBounds: Bounds

  constructor(worldBounds: Bounds = { minX: 0, minY: 0, maxX: 10000, maxY: 10000 }) {
    this.worldBounds = worldBounds
    this.root = new QuadTreeNode(worldBounds)
  }

  insert(item: IndexedItem): void {
    this.root.insert(item)
  }

  query(bounds: Bounds): string[] {
    const result = this.root.query(bounds)
    return Array.from(result)
  }

  queryPoint(x: number, y: number, radius: number = 10): string[] {
    const result = this.root.queryPoint(x, y, radius)
    return Array.from(result)
  }

  clear(): void {
    this.root.clear()
  }

  rebuild(items: IndexedItem[]): void {
    this.root = new QuadTreeNode(this.worldBounds)
    for (const item of items) {
      this.root.insert(item)
    }
  }
}
