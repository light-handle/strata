import type { DashboardData, SessionSummary } from '../../shared/types'

export interface TerrainConfig {
  worldSize: number
  resolution: number
  sigma: number
  heightScale: number
}

export const DEFAULT_CONFIG: TerrainConfig = {
  worldSize: 60,
  resolution: 128,
  sigma: 2.5,
  heightScale: 10,
}

export interface SessionPosition {
  session: SessionSummary
  gridX: number
  gridZ: number
  worldX: number
  worldZ: number
  height: number
  tokens: number
}

/**
 * Map sessions to 2D grid positions.
 * X = time (days), Z = project index
 */
export function mapSessionsToGrid(
  data: DashboardData,
  config: TerrainConfig = DEFAULT_CONFIG,
): { positions: SessionPosition[]; heights: Float32Array; maxHeight: number } {
  const { worldSize, resolution, sigma, heightScale } = config
  const gridCount = resolution + 1
  const heights = new Float32Array(gridCount * gridCount)

  const sessions = data.sessions
  if (sessions.length === 0) {
    return { positions: [], heights, maxHeight: 0 }
  }

  const timestamps = sessions.map((s) => new Date(s.startTime).getTime())
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const timeSpan = maxTime - minTime || 1

  const projectNames = [...new Set(sessions.map((s) => s.projectName))]

  // Map data region to center 70% of the world — keeps peaks visible together
  const dataRegion = worldSize * 0.7
  const offsetX = (worldSize - dataRegion) / 2
  const offsetZ = (worldSize - dataRegion) / 2

  const positions: SessionPosition[] = sessions.map((session) => {
    const t = new Date(session.startTime).getTime()
    const normalizedX = (t - minTime) / timeSpan
    const projectIdx = projectNames.indexOf(session.projectName)
    const normalizedZ = projectNames.length > 1
      ? projectIdx / (projectNames.length - 1)
      : 0.5

    const worldX = offsetX + normalizedX * dataRegion - worldSize / 2
    const worldZ = offsetZ + normalizedZ * dataRegion - worldSize / 2

    const gridX = Math.round(((worldX + worldSize / 2) / worldSize) * resolution)
    const gridZ = Math.round(((worldZ + worldSize / 2) / worldSize) * resolution)

    const tokens =
      session.totalInputTokens +
      session.totalOutputTokens +
      session.totalCacheReadTokens +
      session.totalCacheCreateTokens

    return {
      session,
      gridX: Math.max(0, Math.min(resolution, gridX)),
      gridZ: Math.max(0, Math.min(resolution, gridZ)),
      worldX,
      worldZ,
      height: 0,
      tokens,
    }
  })

  const maxTokens = Math.max(...positions.map((p) => p.tokens), 1)

  // Gaussian influence
  const sigmaGrid = (sigma / worldSize) * resolution
  const sigmaGridSq = sigmaGrid * sigmaGrid
  const influenceRadius = Math.ceil(sigmaGrid * 3)

  for (const pos of positions) {
    const normalizedTokens = pos.tokens / maxTokens
    // Minimum 15% height so even tiny sessions create visible peaks
    const boosted = 0.15 + normalizedTokens * 0.85
    const amplitude = boosted * heightScale

    const minGx = Math.max(0, pos.gridX - influenceRadius)
    const maxGx = Math.min(resolution, pos.gridX + influenceRadius)
    const minGz = Math.max(0, pos.gridZ - influenceRadius)
    const maxGz = Math.min(resolution, pos.gridZ + influenceRadius)

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const dx = gx - pos.gridX
        const dz = gz - pos.gridZ
        const distSq = dx * dx + dz * dz
        const gauss = Math.exp(-distSq / (2 * sigmaGridSq))
        heights[gz * gridCount + gx] += amplitude * gauss
      }
    }
  }

  let maxHeight = 0
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] > maxHeight) maxHeight = heights[i]
  }

  for (const pos of positions) {
    pos.height = heights[pos.gridZ * gridCount + pos.gridX]
  }

  return { positions, heights, maxHeight }
}

/**
 * Military thermal color ramp: dark navy → teal → green → amber → hot white
 */
export function heightToColor(normalizedHeight: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, normalizedHeight))

  const stops = [
    { t: 0.0,  r: 0.02, g: 0.03, b: 0.06 },   // flat terrain — near-black
    { t: 0.02, r: 0.02, g: 0.04, b: 0.08 },   // still flat
    { t: 0.05, r: 0.06, g: 0.15, b: 0.20 },   // first hint of elevation — visible teal
    { t: 0.10, r: 0.08, g: 0.25, b: 0.22 },   // small peak — clear teal
    { t: 0.20, r: 0.10, g: 0.35, b: 0.18 },   // teal-green
    { t: 0.35, r: 0.20, g: 0.42, b: 0.10 },   // military green
    { t: 0.50, r: 0.45, g: 0.40, b: 0.05 },   // olive
    { t: 0.65, r: 0.70, g: 0.42, b: 0.05 },   // amber
    { t: 0.80, r: 0.90, g: 0.55, b: 0.08 },   // hot amber
    { t: 0.92, r: 1.0,  g: 0.70, b: 0.15 },   // bright amber
    { t: 1.0,  r: 1.0,  g: 0.85, b: 0.50 },   // white-hot peak
  ]

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t)
      return [
        a.r + (b.r - a.r) * f,
        a.g + (b.g - a.g) * f,
        a.b + (b.b - a.b) * f,
      ]
    }
  }
  return [1, 0.85, 0.5]
}

/**
 * Generate contour ring points at a given height level.
 * Uses marching squares on the height grid.
 */
export function generateContourLines(
  heights: Float32Array,
  config: TerrainConfig,
  level: number,
): Float32Array {
  const { worldSize, resolution } = config
  const gridCount = resolution + 1
  const segments: number[] = []
  const half = worldSize / 2
  const cellSize = worldSize / resolution

  for (let gz = 0; gz < resolution; gz++) {
    for (let gx = 0; gx < resolution; gx++) {
      // Four corners of the cell
      const h00 = heights[gz * gridCount + gx]
      const h10 = heights[gz * gridCount + gx + 1]
      const h01 = heights[(gz + 1) * gridCount + gx]
      const h11 = heights[(gz + 1) * gridCount + gx + 1]

      // Which corners are above the level?
      const b00 = h00 >= level ? 1 : 0
      const b10 = h10 >= level ? 1 : 0
      const b01 = h01 >= level ? 1 : 0
      const b11 = h11 >= level ? 1 : 0

      const code = b00 | (b10 << 1) | (b01 << 2) | (b11 << 3)
      if (code === 0 || code === 15) continue // all above or all below

      const x0 = gx * cellSize - half
      const z0 = gz * cellSize - half
      const x1 = x0 + cellSize
      const z1 = z0 + cellSize

      // Interpolation helpers
      const lerpX = (ha: number, hb: number) => {
        const t = (level - ha) / (hb - ha || 1)
        return x0 + t * cellSize
      }
      const lerpZ = (ha: number, hb: number) => {
        const t = (level - ha) / (hb - ha || 1)
        return z0 + t * cellSize
      }

      // Edge midpoints
      const top = () => [lerpX(h00, h10), level + 0.1, z0] as const
      const bottom = () => [lerpX(h01, h11), level + 0.1, z1] as const
      const left = () => [x0, level + 0.1, lerpZ(h00, h01)] as const
      const right = () => [x1, level + 0.1, lerpZ(h10, h11)] as const

      // Marching squares cases (simplified)
      const addSeg = (a: readonly number[], b: readonly number[]) => {
        segments.push(a[0], a[1], a[2], b[0], b[1], b[2])
      }

      switch (code) {
        case 1: case 14: addSeg(top(), left()); break
        case 2: case 13: addSeg(top(), right()); break
        case 3: case 12: addSeg(left(), right()); break
        case 4: case 11: addSeg(left(), bottom()); break
        case 6: case 9:  addSeg(top(), bottom()); break
        case 7: case 8:  addSeg(right(), bottom()); break
        case 5:  addSeg(top(), left()); addSeg(right(), bottom()); break
        case 10: addSeg(top(), right()); addSeg(left(), bottom()); break
      }
    }
  }

  return new Float32Array(segments)
}
