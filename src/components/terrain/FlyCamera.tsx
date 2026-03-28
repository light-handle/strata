import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { MapControls as DreiMapControls } from '@react-three/drei'
import * as THREE from 'three'
import { useAppState } from '../../context/AppContext'

export default function MapCamera() {
  const controlsRef = useRef<any>(null)
  const { camera } = useThree()
  const { cameraTarget } = useAppState()
  const flyingTo = useRef<THREE.Vector3 | null>(null)
  const flyingLookAt = useRef<THREE.Vector3 | null>(null)

  // Set initial camera position — closer for 60-unit world
  useEffect(() => {
    camera.position.set(0, 30, 25)
    camera.lookAt(0, 0, 0)
  }, [camera])

  // Fly to target when session is selected
  useEffect(() => {
    if (cameraTarget) {
      flyingTo.current = new THREE.Vector3(
        cameraTarget.x,
        Math.max(10, cameraTarget.y + 12),
        cameraTarget.z + 15,
      )
      flyingLookAt.current = new THREE.Vector3(
        cameraTarget.x,
        cameraTarget.y,
        cameraTarget.z,
      )
    }
  }, [cameraTarget])

  // Smooth fly-to animation
  useFrame(() => {
    if (flyingTo.current && controlsRef.current) {
      camera.position.lerp(flyingTo.current, 0.06)
      controlsRef.current.target.lerp(flyingLookAt.current!, 0.06)
      controlsRef.current.update()

      if (camera.position.distanceTo(flyingTo.current) < 0.3) {
        flyingTo.current = null
        flyingLookAt.current = null
      }
    }
  })

  return (
    <DreiMapControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.15}
      minDistance={5}
      maxDistance={60}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2.5}
      maxTargetRadius={40}
      zoomSpeed={1.2}
      panSpeed={0.8}
      screenSpacePanning={false}
    />
  )
}
