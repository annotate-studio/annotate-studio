import * as tf from '@tensorflow/tfjs'

interface Point {
  x: number
  y: number
}

interface RecognitionResult {
  symbol: string
  confidence: number
  label: string
}

interface SymbolClass {
  index: number
  symbol: string
  label: string
}

let model: tf.LayersModel | null = null
let labels: SymbolClass[] = []
let isLoading = false
let isLoaded = false

const IMAGE_SIZE = 32
const GEO_FEATURES = 16

export async function loadModel(): Promise<boolean> {
  if (isLoaded) return true
  if (isLoading) return false
  
  isLoading = true
  console.log('[AI] Loading model...')
  
  try {
    const [loadedModel, labelsResponse] = await Promise.all([
      tf.loadLayersModel('/tfjs_model/model.json'),
      fetch('/tfjs_model/labels.json').then(r => r.json())
    ])
    
    model = loadedModel
    labels = labelsResponse.classes
    isLoaded = true
    isLoading = false
    console.log('[AI] Model loaded!', labels.length, 'classes')
    return true
  } catch (err) {
    console.error('[AI] Failed:', err)
    isLoading = false
    return false
  }
}

function getBounds(points: Point[]) {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

function pointsToImage(points: Point[]): Float32Array {
  const imageData = new Float32Array(IMAGE_SIZE * IMAGE_SIZE).fill(0)
  if (points.length < 2) return imageData
  
  const bounds = getBounds(points)
  const padding = 4
  const maxDim = Math.max(bounds.width, bounds.height, 1)
  const scale = (IMAGE_SIZE - padding * 2) / maxDim
  const offsetX = (IMAGE_SIZE - bounds.width * scale) / 2 - bounds.minX * scale
  const offsetY = (IMAGE_SIZE - bounds.height * scale) / 2 - bounds.minY * scale
  
  for (let i = 0; i < points.length - 1; i++) {
    const x0 = Math.round(points[i].x * scale + offsetX)
    const y0 = Math.round(points[i].y * scale + offsetY)
    const x1 = Math.round(points[i + 1].x * scale + offsetX)
    const y1 = Math.round(points[i + 1].y * scale + offsetY)
    
    const dx = Math.abs(x1 - x0)
    const dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    let x = x0, y = y0
    
    while (true) {
      if (x >= 0 && x < IMAGE_SIZE && y >= 0 && y < IMAGE_SIZE) {
        imageData[y * IMAGE_SIZE + x] = 1.0
        for (let ddy = -1; ddy <= 1; ddy++) {
          for (let ddx = -1; ddx <= 1; ddx++) {
            const nx = x + ddx
            const ny = y + ddy
            if (nx >= 0 && nx < IMAGE_SIZE && ny >= 0 && ny < IMAGE_SIZE) {
              const dist = Math.sqrt(ddx * ddx + ddy * ddy)
              const val = dist === 0 ? 1.0 : 0.6 / dist
              imageData[ny * IMAGE_SIZE + nx] = Math.max(imageData[ny * IMAGE_SIZE + nx], val)
            }
          }
        }
      }
      if (x === x1 && y === y1) break
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x += sx }
      if (e2 < dx) { err += dx; y += sy }
    }
  }
  return imageData
}

function extractGeoFeatures(points: Point[]): Float32Array {
  const features = new Float32Array(GEO_FEATURES).fill(0)
  if (points.length < 2) return features
  
  const bounds = getBounds(points)
  const width = bounds.width || 1
  const height = bounds.height || 1
  
  features[0] = Math.min(width / height, 3) / 3
  features[1] = Math.min(height / width, 3) / 3
  
  let totalLength = 0
  for (let i = 1; i < points.length; i++) {
    totalLength += Math.sqrt(
      Math.pow(points[i].x - points[i - 1].x, 2) +
      Math.pow(points[i].y - points[i - 1].y, 2)
    )
  }
  features[2] = Math.min(totalLength / Math.max(width, height), 10) / 10
  
  const startEnd = Math.sqrt(
    Math.pow(points[points.length - 1].x - points[0].x, 2) +
    Math.pow(points[points.length - 1].y - points[0].y, 2)
  )
  features[3] = Math.min(startEnd / Math.max(width, height), 2) / 2
  
  let corners = 0
  const step = Math.max(1, Math.floor(points.length / 20))
  for (let i = step; i < points.length - step; i += step) {
    const v1x = points[i].x - points[i - step].x
    const v1y = points[i].y - points[i - step].y
    const v2x = points[i + step].x - points[i].x
    const v2y = points[i + step].y - points[i].y
    const dot = v1x * v2x + v1y * v2y
    const len1 = Math.sqrt(v1x * v1x + v1y * v1y)
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y)
    if (len1 > 0 && len2 > 0 && dot / (len1 * len2) < 0.5) corners++
  }
  features[4] = Math.min(corners, 10) / 10
  
  let totalAngle = 0
  for (let i = step; i < points.length - step; i += step) {
    const a1 = Math.atan2(points[i].y - points[i - step].y, points[i].x - points[i - step].x)
    const a2 = Math.atan2(points[i + step].y - points[i].y, points[i + step].x - points[i].x)
    let diff = a2 - a1
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    totalAngle += diff
  }
  features[5] = (totalAngle / (2 * Math.PI) + 1) / 2
  
  let hDist = 0, vDist = 0
  for (let i = 1; i < points.length; i++) {
    hDist += Math.abs(points[i].x - points[i - 1].x)
    vDist += Math.abs(points[i].y - points[i - 1].y)
  }
  const total = hDist + vDist || 1
  features[6] = hDist / total
  features[7] = vDist / total
  
  let intersections = 0
  const segStep = Math.max(2, Math.floor(points.length / 15))
  for (let i = 0; i < points.length - segStep * 2; i += segStep) {
    for (let j = i + segStep * 2; j < points.length - segStep; j += segStep) {
      const p1 = points[i], p2 = points[i + segStep], p3 = points[j], p4 = points[j + segStep]
      const d1 = (p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)
      const d2 = (p4.x - p3.x) * (p2.y - p3.y) - (p4.y - p3.y) * (p2.x - p3.x)
      const d3 = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)
      const d4 = (p2.x - p1.x) * (p4.y - p1.y) - (p2.y - p1.y) * (p4.x - p1.x)
      if (d1 * d2 < 0 && d3 * d4 < 0) intersections++
    }
  }
  features[8] = Math.min(intersections, 5) / 5
  
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  let q1 = 0, q2 = 0, q3 = 0, q4 = 0
  for (const p of points) {
    if (p.x >= cx && p.y < cy) q1++
    else if (p.x < cx && p.y < cy) q2++
    else if (p.x < cx && p.y >= cy) q3++
    else q4++
  }
  const n = points.length || 1
  features[9] = q1 / n
  features[10] = q2 / n
  features[11] = q3 / n
  features[12] = q4 / n
  features[13] = Math.min(points.length, 200) / 200
  features[14] = Math.min(width * height, 10000) / 10000
  features[15] = Math.abs(totalAngle) > Math.PI ? 1 : 0
  
  return features
}

export async function recognizeSymbol(points: Point[]): Promise<RecognitionResult | null> {
  console.log('[AI] Recognizing...', points.length, 'points')
  
  if (points.length < 5) return null
  
  if (!isLoaded) {
    const loaded = await loadModel()
    if (!loaded) return null
  }
  
  if (!model) return null
  
  const bounds = getBounds(points)
  if (bounds.width < 10 && bounds.height < 10) return null
  
  try {
    const imageData = pointsToImage(points)
    const geoFeatures = extractGeoFeatures(points)
    
    const imageTensor = tf.tensor4d(Array.from(imageData), [1, IMAGE_SIZE, IMAGE_SIZE, 1])
    const geoTensor = tf.tensor2d(Array.from(geoFeatures), [1, GEO_FEATURES])
    
    const prediction = model.predict([imageTensor, geoTensor]) as tf.Tensor
    
    const probabilities = await prediction.data()
    
    imageTensor.dispose()
    geoTensor.dispose()
    prediction.dispose()
    
    let maxProb = 0
    let maxIndex = 0
    for (let i = 0; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i]
        maxIndex = i
      }
    }
    
    console.log('[AI] Result:', maxIndex, 'confidence:', maxProb)
    
    if (maxProb < 0.2) return null
    
    const symbolClass = labels.find(l => l.index === maxIndex)
    if (!symbolClass) return null
    
    return {
      symbol: symbolClass.symbol,
      confidence: maxProb,
      label: symbolClass.label
    }
  } catch (err) {
    console.error('[AI] Predict error:', err)
    return null
  }
}

export function getAvailableSymbols(): string[] {
  return labels.map(l => l.symbol)
}

export function isModelLoaded(): boolean {
  return isLoaded
}
