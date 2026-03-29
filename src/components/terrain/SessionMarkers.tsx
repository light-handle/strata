import { useMemo, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { DashboardData } from '../../../shared/types'
import { mapSessionsToGrid, DEFAULT_CONFIG } from '../../lib/terrainUtils'
import { useAppDispatch, useAppState } from '../../context/AppContext'
import { formatTokens } from '../../lib/format'

interface Props {
  data: DashboardData
}

export default function SessionMarkers({ data }: Props) {
  const dispatch = useAppDispatch()
  const { selectedSessionId, selectedProjectName } = useAppState()
  const { camera, gl } = useThree()
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const positions = useMemo(() => {
    const { positions } = mapSessionsToGrid(data, DEFAULT_CONFIG)
    return positions
  }, [data])

  // Raycasting
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const mouse = useMemo(() => new THREE.Vector2(), [])
  const markerRefs = useRef<(THREE.Mesh | null)[]>([])
  const clickStart = useRef<{ x: number; y: number } | null>(null)

  useMemo(() => {
    const canvas = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      clickStart.current = { x: e.clientX, y: e.clientY }
    }

    const handleClick = (e: MouseEvent) => {
      // Ignore drags — only fire on actual clicks
      if (clickStart.current) {
        const dx = e.clientX - clickStart.current.x
        const dy = e.clientY - clickStart.current.y
        if (Math.sqrt(dx * dx + dy * dy) > 5) return
      }

      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const meshes = markerRefs.current.filter(Boolean) as THREE.Mesh[]
      const intersects = raycaster.intersectObjects(meshes)

      if (intersects.length > 0) {
        const idx = meshes.indexOf(intersects[0].object as THREE.Mesh)
        if (idx >= 0 && positions[idx]) {
          const pos = positions[idx]
          dispatch({
            type: 'SELECT_SESSION',
            id: pos.session.id,
            cameraTarget: { x: pos.worldX, y: pos.height, z: pos.worldZ },
          })
        }
      }
    }

    const handleHover = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const meshes = markerRefs.current.filter(Boolean) as THREE.Mesh[]
      const intersects = raycaster.intersectObjects(meshes)

      if (intersects.length > 0) {
        const idx = meshes.indexOf(intersects[0].object as THREE.Mesh)
        setHoveredIdx(idx >= 0 ? idx : null)
        canvas.style.cursor = idx >= 0 ? 'pointer' : 'default'
      } else {
        setHoveredIdx(null)
        canvas.style.cursor = 'default'
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('mousemove', handleHover)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('mousemove', handleHover)
    }
  }, [camera, gl, positions, dispatch, raycaster, mouse])

  return (
    <group>
      {positions.map((pos, i) => {
        const isHovered = hoveredIdx === i
        const isSelected = selectedSessionId === pos.session.id
        const isProjectHighlighted = selectedProjectName !== null && pos.session.projectName === selectedProjectName
        const isDimmed = selectedProjectName !== null && !isProjectHighlighted
        const isActive = isHovered || isSelected || isProjectHighlighted

        return (
          <group key={pos.session.id}>
            {/* Invisible hitbox sphere — larger for easier clicking */}
            <mesh
              ref={(el) => { markerRefs.current[i] = el }}
              position={[pos.worldX, pos.height + 1.5, pos.worldZ]}
            >
              <sphereGeometry args={[1.8, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* Vertical scan line from ground to peak */}
            <VerticalBeam
              x={pos.worldX}
              z={pos.worldZ}
              height={pos.height}
              active={isActive}
              dimmed={isDimmed}
            />

            {/* Diamond marker at peak */}
            <DiamondMarker
              position={[pos.worldX, pos.height + 0.6, pos.worldZ]}
              active={isActive}
              selected={isSelected}
              dimmed={isDimmed}
            />

            {/* Ground ring — targeting reticle */}
            {isActive && !isDimmed && (
              <TargetRing
                position={[pos.worldX, 0.15, pos.worldZ]}
              />
            )}

            {/* Label — token count + prompt on hover */}
            <Billboard
              position={[pos.worldX, pos.height + 2.2, pos.worldZ]}
              follow={true}
              lockX={false}
              lockY={false}
              lockZ={false}
            >
              {/* Token count */}
              <Text
                fontSize={isActive && !isDimmed ? 0.8 : 0.55}
                color={isDimmed ? '#222230' : isActive ? '#00e5ff' : '#557788'}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.03}
                outlineColor="#08080c"
              >
                {formatTokens(pos.tokens)}
              </Text>

              {/* First prompt preview on hover/select */}
              {isActive && !isDimmed && (
                <Text
                  position={[0, -1.0, 0]}
                  fontSize={0.45}
                  color="#8899aa"
                  anchorX="center"
                  anchorY="bottom"
                  outlineWidth={0.02}
                  outlineColor="#08080c"
                  maxWidth={18}
                >
                  {pos.session.firstUserPrompt.slice(0, 60)}
                </Text>
              )}
            </Billboard>
          </group>
        )
      })}
    </group>
  )
}

/** Vertical beam line from ground to peak — military scan line */
function VerticalBeam({ x, z, height, active, dimmed }: { x: number; z: number; height: number; active: boolean; dimmed: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (meshRef.current && active && !dimmed) {
      const pulse = 0.6 + Math.sin(state.clock.elapsedTime * 3) * 0.15
      ;(meshRef.current.material as THREE.MeshBasicMaterial).opacity = pulse
    }
  })

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[x, height / 2, z]}
      >
        <boxGeometry args={[0.06, height, 0.06]} />
        <meshBasicMaterial
          color={dimmed ? '#222230' : active ? '#00e5ff' : '#ffb832'}
          transparent
          opacity={dimmed ? 0.04 : active ? 0.6 : 0.12}
        />
      </mesh>

      {active && !dimmed && (
        <mesh position={[x, height / 2, z]}>
          <boxGeometry args={[0.3, height, 0.3]} />
          <meshBasicMaterial color="#00e5ff" transparent opacity={0.06} />
        </mesh>
      )}
    </group>
  )
}

/** Diamond-shaped marker at peak */
function DiamondMarker({ position, active, selected, dimmed }: { position: [number, number, number]; active: boolean; selected: boolean; dimmed: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * (dimmed ? 0.2 : 0.5)
      if (active && !dimmed) {
        const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.15
        meshRef.current.scale.setScalar(scale)
      } else {
        meshRef.current.scale.setScalar(dimmed ? 0.6 : 1)
      }
    }
  })

  return (
    <mesh ref={meshRef} position={position} rotation={[0, 0, Math.PI / 4]}>
      <octahedronGeometry args={[active && !dimmed ? 0.5 : 0.35, 0]} />
      <meshBasicMaterial
        color={dimmed ? '#222230' : selected ? '#00ffcc' : active ? '#00e5ff' : '#ffb832'}
        transparent
        opacity={dimmed ? 0.15 : active ? 0.9 : 0.5}
      />
    </mesh>
  )
}

/** Targeting reticle ring on the ground */
function TargetRing({ position }: { position: [number, number, number] }) {
  const ringRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.3
      const pulse = 0.4 + Math.sin(state.clock.elapsedTime * 2) * 0.15
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = pulse
    }
  })

  return (
    <mesh ref={ringRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[2.5, 3.0, 32]} />
      <meshBasicMaterial
        color="#00e5ff"
        transparent
        opacity={0.3}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
