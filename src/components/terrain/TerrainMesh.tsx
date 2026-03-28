import { useMemo } from 'react'
import * as THREE from 'three'
import type { DashboardData } from '../../../shared/types'
import {
  mapSessionsToGrid,
  heightToColor,
  generateContourLines,
  DEFAULT_CONFIG,
} from '../../lib/terrainUtils'

interface Props {
  data: DashboardData
}

export default function TerrainMesh({ data }: Props) {
  const { geometry, wireframeGeo, contourLines } = useMemo(() => {
    const config = DEFAULT_CONFIG
    const { heights, maxHeight } = mapSessionsToGrid(data, config)
    const gridCount = config.resolution + 1

    // Main terrain geometry
    const geo = new THREE.PlaneGeometry(
      config.worldSize,
      config.worldSize,
      config.resolution,
      config.resolution,
    )
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)

    for (let i = 0; i < pos.count; i++) {
      const ix = i % gridCount
      const iz = Math.floor(i / gridCount)
      const h = heights[iz * gridCount + ix] || 0

      pos.setY(i, h)

      const normalizedH = maxHeight > 0 ? h / maxHeight : 0
      const [r, g, b] = heightToColor(normalizedH)
      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    // Wireframe at lower resolution
    const wireRes = 64
    const wireGeo = new THREE.PlaneGeometry(
      config.worldSize,
      config.worldSize,
      wireRes,
      wireRes,
    )
    wireGeo.rotateX(-Math.PI / 2)

    const wirePos = wireGeo.attributes.position
    const wireGridCount = wireRes + 1
    const scale = config.resolution / wireRes

    for (let i = 0; i < wirePos.count; i++) {
      const wx = i % wireGridCount
      const wz = Math.floor(i / wireGridCount)
      const sx = Math.min(Math.round(wx * scale), config.resolution)
      const sz = Math.min(Math.round(wz * scale), config.resolution)
      const h = heights[sz * gridCount + sx] || 0
      wirePos.setY(i, h + 0.08)
    }

    // Generate contour lines at many height levels — the topo map signature
    const contours: { array: Float32Array; opacity: number; color: string }[] = []
    if (maxHeight > 0) {
      const numContours = 12
      for (let i = 1; i <= numContours; i++) {
        const level = (i / (numContours + 1)) * maxHeight
        const array = generateContourLines(heights, config, level)
        if (array.length > 0) {
          const t = i / numContours
          // Every 4th contour is a "major" contour — brighter
          const isMajor = i % 4 === 0
          const color = t < 0.4 ? '#00cc88' : t < 0.7 ? '#88aa22' : t < 0.9 ? '#ccaa00' : '#ffcc44'
          contours.push({
            array,
            opacity: isMajor ? 0.5 + t * 0.3 : 0.2 + t * 0.25,
            color,
          })
        }
      }
    }

    return { geometry: geo, wireframeGeo: wireGeo, contourLines: contours }
  }, [data])

  return (
    <group>
      {/* Solid terrain with vertex colors */}
      <mesh geometry={geometry}>
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          roughness={0.75}
          metalness={0.1}
        />
      </mesh>

      {/* Wireframe overlay — topo grid on terrain surface */}
      <mesh geometry={wireframeGeo}>
        <meshBasicMaterial
          color="#22aa77"
          wireframe
          transparent
          opacity={0.12}
        />
      </mesh>

      {/* Contour lines — the topo signature */}
      {contourLines.map((contour, i) => (
        <lineSegments key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={contour.array.length / 3}
              array={contour.array}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={contour.color}
            transparent
            opacity={contour.opacity}
            linewidth={1}
          />
        </lineSegments>
      ))}
    </group>
  )
}
