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

export interface ProjectCenter {
  name: string
  worldX: number
  worldZ: number
  totalTokens: number
  sessionCount: number
}

/**
 * Map sessions to 2D grid as PROJECT ISLANDS.
 * Each project is a distinct landmass positioned in a circle.
 * Sessions within a project cluster around their island center.
 */
export function mapSessionsToGrid(
  data: DashboardData,
  config: TerrainConfig = DEFAULT_CONFIG,
): { positions: SessionPosition[]; heights: Float32Array; maxHeight: number; projectCenters: ProjectCenter[] } {
  const { worldSize, resolution, sigma, heightScale } = config
  const gridCount = resolution + 1
  const heights = new Float32Array(gridCount * gridCount)

  const sessions = data.sessions
  if (sessions.length === 0) {
    return { positions: [], heights, maxHeight: 0, projectCenters: [] }
  }

  // Group sessions by project
  const projectNames = [...new Set(sessions.map((s) => s.projectName))]
  const projectSessions = new Map<string, SessionSummary[]>()
  const projectTokens = new Map<string, number>()
  for (const s of sessions) {
    if (!projectSessions.has(s.projectName)) projectSessions.set(s.projectName, [])
    projectSessions.get(s.projectName)!.push(s)
    const tokens = s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreateTokens
    projectTokens.set(s.projectName, (projectTokens.get(s.projectName) || 0) + tokens)
  }

  // Place projects in a circle
  const circleRadius = worldSize * 0.28
  const projectCenters: ProjectCenter[] = projectNames.map((name, i) => {
    let cx: number, cz: number

    if (projectNames.length === 1) {
      cx = 0; cz = 0
    } else if (projectNames.length === 2) {
      cx = (i === 0 ? -1 : 1) * circleRadius * 0.7
      cz = 0
    } else {
      const angle = (i / projectNames.length) * Math.PI * 2 - Math.PI / 2
      cx = Math.cos(angle) * circleRadius
      cz = Math.sin(angle) * circleRadius
    }

    return {
      name,
      worldX: cx,
      worldZ: cz,
      totalTokens: projectTokens.get(name) || 0,
      sessionCount: projectSessions.get(name)?.length || 0,
    }
  })

  // Island spread radius scales with session count (min 3, max 10 units)
  function islandRadius(sessionCount: number): number {
    return Math.min(10, Math.max(3, 2 + sessionCount * 1.5))
  }

  // Place sessions within their project island
  // X = time (left=earliest, right=latest), Z = slight jitter
  const positions: SessionPosition[] = []

  for (const pc of projectCenters) {
    const pSessions = projectSessions.get(pc.name) || []
    const sorted = [...pSessions].sort((a, b) => a.startTime.localeCompare(b.startTime))
    const radius = islandRadius(sorted.length)

    for (let i = 0; i < sorted.length; i++) {
      const session = sorted[i]
      let offX: number, offZ: number

      if (sorted.length === 1) {
        offX = 0; offZ = 0
      } else {
        // X = time position within island (left to right)
        const t = i / (sorted.length - 1) // 0 to 1
        offX = (t - 0.5) * radius * 1.6 // spread across island width
        // Z = slight alternating offset so peaks don't overlap in a line
        offZ = (i % 2 === 0 ? -1 : 1) * radius * 0.15
      }

      const worldX = pc.worldX + offX
      const worldZ = pc.worldZ + offZ

      const gridX = Math.round(((worldX + worldSize / 2) / worldSize) * resolution)
      const gridZ = Math.round(((worldZ + worldSize / 2) / worldSize) * resolution)

      const tokens =
        session.totalInputTokens + session.totalOutputTokens +
        session.totalCacheReadTokens + session.totalCacheCreateTokens

      positions.push({
        session,
        gridX: Math.max(0, Math.min(resolution, gridX)),
        gridZ: Math.max(0, Math.min(resolution, gridZ)),
        worldX,
        worldZ,
        height: 0,
        tokens,
      })
    }
  }

  // Gaussian heightfield
  const maxTokens = Math.max(...positions.map((p) => p.tokens), 1)
  const sigmaGrid = (sigma / worldSize) * resolution
  const sigmaGridSq = sigmaGrid * sigmaGrid
  const influenceRadius = Math.ceil(sigmaGrid * 3)

  for (const pos of positions) {
    const normalizedTokens = pos.tokens / maxTokens
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

  return { positions, heights, maxHeight, projectCenters }
}

/**
 * Military thermal color ramp: dark navy → teal → green → amber → hot white
 */
export function heightToColor(normalizedHeight: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, normalizedHeight))

  const stops = [
    { t: 0.0,  r: 0.02, g: 0.03, b: 0.06 },
    { t: 0.02, r: 0.02, g: 0.04, b: 0.08 },
    { t: 0.05, r: 0.06, g: 0.15, b: 0.20 },
    { t: 0.10, r: 0.08, g: 0.25, b: 0.22 },
    { t: 0.20, r: 0.10, g: 0.35, b: 0.18 },
    { t: 0.35, r: 0.20, g: 0.42, b: 0.10 },
    { t: 0.50, r: 0.45, g: 0.40, b: 0.05 },
    { t: 0.65, r: 0.70, g: 0.42, b: 0.05 },
    { t: 0.80, r: 0.90, g: 0.55, b: 0.08 },
    { t: 0.92, r: 1.0,  g: 0.70, b: 0.15 },
    { t: 1.0,  r: 1.0,  g: 0.85, b: 0.50 },
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
      const h00 = heights[gz * gridCount + gx]
      const h10 = heights[gz * gridCount + gx + 1]
      const h01 = heights[(gz + 1) * gridCount + gx]
      const h11 = heights[(gz + 1) * gridCount + gx + 1]

      const b00 = h00 >= level ? 1 : 0
      const b10 = h10 >= level ? 1 : 0
      const b01 = h01 >= level ? 1 : 0
      const b11 = h11 >= level ? 1 : 0

      const code = b00 | (b10 << 1) | (b01 << 2) | (b11 << 3)
      if (code === 0 || code === 15) continue

      const x0 = gx * cellSize - half
      const z0 = gz * cellSize - half

      const lerpX = (ha: number, hb: number) => {
        const t = (level - ha) / (hb - ha || 1)
        return x0 + t * cellSize
      }
      const lerpZ = (ha: number, hb: number) => {
        const t = (level - ha) / (hb - ha || 1)
        return z0 + t * cellSize
      }

      const top = () => [lerpX(h00, h10), level + 0.1, z0] as const
      const bottom = () => [lerpX(h01, h11), level + 0.1, z0 + cellSize] as const
      const left = () => [x0, level + 0.1, lerpZ(h00, h01)] as const
      const right = () => [x0 + cellSize, level + 0.1, lerpZ(h10, h11)] as const

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
