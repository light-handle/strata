import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Text, Billboard } from '@react-three/drei'
import type { DashboardData } from '../../../shared/types'
import { mapSessionsToGrid, DEFAULT_CONFIG, type ProjectCenter } from '../../lib/terrainUtils'
import TerrainMesh from './TerrainMesh'
import MapCamera from './FlyCamera'
import SessionMarkers from './SessionMarkers'
import { formatTokens } from '../../lib/format'

interface Props {
  data: DashboardData
}

export default function TerrainViewport({ data }: Props) {
  const islandLabels = useMemo(() => {
    const { projectCenters, positions } = mapSessionsToGrid(data, DEFAULT_CONFIG)

    // Per-project: peak height, leftmost X, rightmost X, date range
    const peakHeights = new Map<string, number>()
    const minX = new Map<string, number>()
    const maxX = new Map<string, number>()
    const minDate = new Map<string, string>()
    const maxDate = new Map<string, string>()

    for (const pos of positions) {
      const name = pos.session.projectName
      const h = peakHeights.get(name) || 0
      if (pos.height > h) peakHeights.set(name, pos.height)

      const lx = minX.get(name)
      if (lx === undefined || pos.worldX < lx) minX.set(name, pos.worldX)
      const rx = maxX.get(name)
      if (rx === undefined || pos.worldX > rx) maxX.set(name, pos.worldX)

      const d = pos.session.startTime.slice(0, 10)
      const md = minDate.get(name)
      if (!md || d < md) minDate.set(name, d)
      const xd = maxDate.get(name)
      if (!xd || d > xd) maxDate.set(name, d)
    }

    return projectCenters.map((pc) => ({
      ...pc,
      peakHeight: peakHeights.get(pc.name) || 3,
      leftX: minX.get(pc.name) ?? pc.worldX,
      rightX: maxX.get(pc.name) ?? pc.worldX,
      earliestDate: minDate.get(pc.name) || '',
      latestDate: maxDate.get(pc.name) || '',
    }))
  }, [data])

  return (
    <Canvas
      camera={{ position: [0, 30, 25], fov: 55, near: 0.5, far: 300 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: '#050508' }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.25} color="#889aaa" />
      <directionalLight position={[50, 80, 30]} intensity={0.6} color="#ffcc88" />
      <directionalLight position={[-40, 50, -30]} intensity={0.15} color="#4488cc" />
      <pointLight position={[0, 30, 0]} intensity={0.2} color="#ffb832" distance={80} />

      {/* Fog */}
      <fog attach="fog" args={['#050508', 50, 180]} />

      {/* Ground grid */}
      <gridHelper args={[80, 16, '#1a4040', '#0d2828']} position={[0, -0.05, 0]} />
      <gridHelper args={[80, 80, '#0f2a2a', '#091818']} position={[0, -0.03, 0]} />

      {/* Project island labels — floating above peaks */}
      {islandLabels.map((il) => {
        const formatDateShort = (d: string) => {
          if (!d) return ''
          const [, m, day] = d.split('-')
          const months = ['', 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
          return `${months[parseInt(m)]} ${parseInt(day)}`
        }
        const showDates = il.earliestDate && il.earliestDate !== il.latestDate
        const labelZ = il.worldZ + 4  // offset south so label doesn't overlap peaks

        return (
          <group key={il.name}>
            {/* Project name — billboarded above peak */}
            <Billboard
              position={[il.worldX, il.peakHeight + 4, il.worldZ]}
              follow={true}
              lockX={false}
              lockY={false}
              lockZ={false}
            >
              <Text
                fontSize={1.8}
                color="#ffb832"
                anchorX="center"
                anchorY="bottom"
                letterSpacing={0.1}
                outlineWidth={0.06}
                outlineColor="#050508"
              >
                {il.name.toUpperCase()}
              </Text>
              <Text
                position={[0, -0.3, 0]}
                fontSize={0.7}
                color="#557788"
                anchorX="center"
                anchorY="top"
                outlineWidth={0.03}
                outlineColor="#050508"
              >
                {`${il.sessionCount} sessions · ${formatTokens(il.totalTokens)}`}
              </Text>
            </Billboard>

            {/* Date markers on ground — left (earliest) to right (latest) */}
            {showDates && (
              <>
                <Text
                  position={[il.leftX, 0.12, labelZ]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={0.6}
                  color="#3a5a5a"
                  anchorX="center"
                  letterSpacing={0.05}
                >
                  {formatDateShort(il.earliestDate)}
                </Text>
                <Text
                  position={[il.rightX, 0.12, labelZ]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={0.6}
                  color="#3a5a5a"
                  anchorX="center"
                  letterSpacing={0.05}
                >
                  {formatDateShort(il.latestDate)}
                </Text>
                {/* Time arrow */}
                <Text
                  position={[il.worldX, 0.12, labelZ + 1.5]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={0.5}
                  color="#2a4a4a"
                  anchorX="center"
                  letterSpacing={0.15}
                >
                  {'TIME \u2192'}
                </Text>
              </>
            )}
          </group>
        )
      })}

      {/* Terrain surface + contour lines */}
      <TerrainMesh data={data} />

      {/* Session markers */}
      <SessionMarkers data={data} />

      {/* Camera */}
      <MapCamera />
    </Canvas>
  )
}
