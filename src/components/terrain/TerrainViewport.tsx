import { Canvas } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import type { DashboardData } from '../../../shared/types'
import TerrainMesh from './TerrainMesh'
import MapCamera from './FlyCamera'
import SessionMarkers from './SessionMarkers'

interface Props {
  data: DashboardData
}

export default function TerrainViewport({ data }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 30, 25], fov: 55, near: 0.5, far: 300 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: '#050508' }}
    >
      {/* Tactical lighting — cooler, more directional */}
      <ambientLight intensity={0.25} color="#889aaa" />
      <directionalLight position={[50, 80, 30]} intensity={0.6} color="#ffcc88" />
      <directionalLight position={[-40, 50, -30]} intensity={0.15} color="#4488cc" />
      <pointLight position={[0, 30, 0]} intensity={0.2} color="#ffb832" distance={80} />

      {/* Fog — military depth */}
      <fog attach="fog" args={['#050508', 50, 180]} />

      {/* Tactical grid — prominent double layer */}
      <gridHelper args={[80, 16, '#1a4040', '#0d2828']} position={[0, -0.05, 0]} />
      <gridHelper args={[80, 80, '#0f2a2a', '#091818']} position={[0, -0.03, 0]} />

      {/* Axis labels */}
      <AxisLabels />

      {/* Terrain surface + contour lines */}
      <TerrainMesh data={data} />

      {/* Session markers with labels */}
      <SessionMarkers data={data} />

      {/* Camera controls */}
      <MapCamera />
    </Canvas>
  )
}

/** Coordinate axis labels at grid edges — like a military map */
function AxisLabels() {
  const labels: { pos: [number, number, number]; text: string; rot?: [number, number, number] }[] = []

  // Along X axis (time)
  for (let i = -30; i <= 30; i += 15) {
    labels.push({
      pos: [i, 0.1, 34],
      text: `${i > 0 ? '+' : ''}${i}`,
    })
  }

  // Along Z axis (projects)
  for (let i = -30; i <= 30; i += 15) {
    labels.push({
      pos: [-34, 0.1, i],
      text: `${i > 0 ? '+' : ''}${i}`,
      rot: [Math.PI / -2, 0, Math.PI / 2],
    })
  }

  return (
    <group>
      {labels.map((l, i) => (
        <Text
          key={i}
          position={l.pos}
          rotation={l.rot || [-Math.PI / 2, 0, 0]}
          fontSize={0.8}
          color="#2a5555"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.1}
        >
          {l.text}
        </Text>
      ))}

      {/* Axis names */}
      <Text
        position={[0, 0.1, 37]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={1.0}
        color="#2a5555"
        anchorX="center"
        letterSpacing={0.2}
      >
        TIME AXIS
      </Text>
      <Text
        position={[-37, 0.1, 0]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        fontSize={1.0}
        color="#2a5555"
        anchorX="center"
        letterSpacing={0.2}
      >
        PROJECT AXIS
      </Text>
    </group>
  )
}
