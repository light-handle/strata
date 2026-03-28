import { useState, useRef, useCallback, useEffect } from 'react'
import type { TimelineBlock } from '../../shared/types'

const MAX_GAP_MS = 5000      // cap gaps > 30s to this
const GAP_CAP_THRESHOLD = 30000
const TYPING_CHARS_PER_SEC = 40

export interface ReplayState {
  mode: 'browse' | 'replay'
  playing: boolean
  currentBlockIndex: number
  typingProgress: number   // 0 to 1 for current block
  speed: number            // 1, 2, 4, 8
  elapsed: number          // ms from replay start
  totalDuration: number    // ms total
}

interface ReplayControls {
  startReplay: () => void
  exitReplay: () => void
  play: () => void
  pause: () => void
  togglePlayPause: () => void
  setSpeed: (s: number) => void
  skip: () => void
  seek: (fraction: number) => void
}

function hasTyping(block: TimelineBlock): boolean {
  return block.type === 'user-prompt' || block.type === 'text' || block.type === 'thinking'
}

function getBlockText(block: TimelineBlock): string {
  if (block.type === 'user-prompt' || block.type === 'text') return block.text || ''
  if (block.type === 'thinking') return block.thinkingText || ''
  return ''
}

/**
 * Precompute the timeline: for each block, the gap before it (ms) and whether it has typing.
 */
function buildTimeline(blocks: TimelineBlock[]) {
  const entries: { block: TimelineBlock; gapBefore: number; typingDuration: number; startTime: number }[] = []
  let cumulativeTime = 0

  for (let i = 0; i < blocks.length; i++) {
    let gapBefore = 0
    if (i > 0) {
      const prev = new Date(blocks[i - 1].timestamp).getTime()
      const curr = new Date(blocks[i].timestamp).getTime()
      gapBefore = Math.max(0, curr - prev)
      if (isNaN(gapBefore)) gapBefore = 500
      // Cap long gaps
      if (gapBefore > GAP_CAP_THRESHOLD) gapBefore = MAX_GAP_MS
    }

    const text = getBlockText(blocks[i])
    const typingDuration = hasTyping(blocks[i]) && text.length > 0
      ? (text.length / TYPING_CHARS_PER_SEC) * 1000
      : 200 // instant blocks get 200ms appearance time

    cumulativeTime += gapBefore
    entries.push({
      block: blocks[i],
      gapBefore,
      typingDuration,
      startTime: cumulativeTime,
    })
    cumulativeTime += typingDuration
  }

  return { entries, totalDuration: cumulativeTime }
}

export function useReplayEngine(blocks: TimelineBlock[]): [ReplayState, ReplayControls] {
  const [state, setState] = useState<ReplayState>({
    mode: 'browse',
    playing: false,
    currentBlockIndex: -1,
    typingProgress: 0,
    speed: 1,
    elapsed: 0,
    totalDuration: 0,
  })

  const stateRef = useRef(state)
  stateRef.current = state

  const rafRef = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)
  const timelineRef = useRef(buildTimeline(blocks))

  // Rebuild timeline when blocks change
  useEffect(() => {
    timelineRef.current = buildTimeline(blocks)
    setState((s) => ({ ...s, totalDuration: timelineRef.current.totalDuration }))
  }, [blocks])

  // The animation loop
  const tick = useCallback((now: number) => {
    const s = stateRef.current
    if (!s.playing || s.mode !== 'replay') return

    const dt = (now - lastFrameRef.current) * s.speed
    lastFrameRef.current = now

    const { entries, totalDuration } = timelineRef.current
    const newElapsed = Math.min(s.elapsed + dt, totalDuration)

    // Find which block we're on and typing progress
    let blockIdx = -1
    let typing = 0

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const blockEnd = entry.startTime + entry.typingDuration
      if (newElapsed >= entry.startTime) {
        blockIdx = i
        const intoBlock = newElapsed - entry.startTime
        typing = Math.min(1, intoBlock / entry.typingDuration)
      }
      if (newElapsed < blockEnd) break
    }

    // Check if complete
    if (newElapsed >= totalDuration) {
      setState((prev) => ({
        ...prev,
        playing: false,
        elapsed: totalDuration,
        currentBlockIndex: entries.length - 1,
        typingProgress: 1,
      }))
      return
    }

    setState((prev) => ({
      ...prev,
      elapsed: newElapsed,
      currentBlockIndex: blockIdx,
      typingProgress: typing,
    }))

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // Start/stop animation loop based on playing state
  useEffect(() => {
    if (state.playing && state.mode === 'replay') {
      lastFrameRef.current = performance.now()
      rafRef.current = requestAnimationFrame(tick)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [state.playing, state.mode, tick])

  const startReplay = useCallback(() => {
    timelineRef.current = buildTimeline(blocks)
    setState({
      mode: 'replay',
      playing: true,
      currentBlockIndex: 0,
      typingProgress: 0,
      speed: 1,
      elapsed: 0,
      totalDuration: timelineRef.current.totalDuration,
    })
  }, [blocks])

  const exitReplay = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setState((s) => ({
      ...s,
      mode: 'browse',
      playing: false,
      currentBlockIndex: -1,
      typingProgress: 0,
      elapsed: 0,
    }))
  }, [])

  const play = useCallback(() => {
    setState((s) => ({ ...s, playing: true }))
  }, [])

  const pause = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setState((s) => ({ ...s, playing: false }))
  }, [])

  const togglePlayPause = useCallback(() => {
    setState((s) => {
      if (s.playing) {
        cancelAnimationFrame(rafRef.current)
        return { ...s, playing: false }
      }
      // If at the end, restart
      if (s.elapsed >= s.totalDuration) {
        return { ...s, playing: true, elapsed: 0, currentBlockIndex: 0, typingProgress: 0 }
      }
      return { ...s, playing: true }
    })
  }, [])

  const setSpeed = useCallback((speed: number) => {
    setState((s) => ({ ...s, speed }))
  }, [])

  const skip = useCallback(() => {
    const s = stateRef.current
    const { entries } = timelineRef.current
    if (s.currentBlockIndex < 0) return

    // Jump to the end of the current block
    const entry = entries[s.currentBlockIndex]
    if (!entry) return
    const blockEnd = entry.startTime + entry.typingDuration

    // If typing is already complete, advance to next block
    if (s.typingProgress >= 0.99 && s.currentBlockIndex < entries.length - 1) {
      const next = entries[s.currentBlockIndex + 1]
      setState((prev) => ({
        ...prev,
        elapsed: next.startTime + 1,
        currentBlockIndex: prev.currentBlockIndex + 1,
        typingProgress: 0,
      }))
    } else {
      setState((prev) => ({
        ...prev,
        elapsed: blockEnd,
        typingProgress: 1,
      }))
    }
  }, [])

  const seek = useCallback((fraction: number) => {
    const { entries, totalDuration } = timelineRef.current
    const targetElapsed = fraction * totalDuration

    let blockIdx = 0
    let typing = 0
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (targetElapsed >= entry.startTime) {
        blockIdx = i
        const into = targetElapsed - entry.startTime
        typing = Math.min(1, into / entry.typingDuration)
      }
    }

    setState((s) => ({
      ...s,
      elapsed: targetElapsed,
      currentBlockIndex: blockIdx,
      typingProgress: typing,
    }))
  }, [])

  return [state, { startReplay, exitReplay, play, pause, togglePlayPause, setSpeed, skip, seek }]
}
