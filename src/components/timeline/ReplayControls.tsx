import { useRef } from 'react'
import type { ReplayState } from '../../hooks/useReplayEngine'

interface Props {
  state: ReplayState
  onPlayPause: () => void
  onSetSpeed: (s: number) => void
  onSkip: () => void
  onSeek: (fraction: number) => void
  onExit: () => void
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ReplayControls({ state, onPlayPause, onSetSpeed, onSkip, onSeek, onExit }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const fraction = state.totalDuration > 0 ? state.elapsed / state.totalDuration : 0

  const handleBarClick = (e: React.MouseEvent) => {
    if (!barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(f)
  }

  const speeds = [1, 2, 4, 8]

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border flex-shrink-0" style={{ background: 'rgba(8,8,12,0.5)' }}>
      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        className="text-[16px] text-primary hover:text-text-bright transition-colors w-6 text-center"
        title={state.playing ? 'Pause' : 'Play'}
      >
        {state.playing ? '\u23F8' : '\u25B6'}
      </button>

      {/* Progress bar */}
      <div
        ref={barRef}
        className="flex-1 h-2 rounded-full cursor-pointer relative"
        style={{ background: 'rgba(255,180,50,0.1)' }}
        onClick={handleBarClick}
      >
        <div
          className="h-full rounded-full transition-none"
          style={{
            width: `${fraction * 100}%`,
            background: 'linear-gradient(90deg, var(--color-primary), #ff8800)',
          }}
        />
        {/* Scrubber handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary"
          style={{
            left: `calc(${fraction * 100}% - 6px)`,
            boxShadow: '0 0 6px rgba(255,184,50,0.4)',
          }}
        />
      </div>

      {/* Time */}
      <span className="text-[11px] text-text-muted font-mono w-[90px] text-center flex-shrink-0">
        {formatMs(state.elapsed)} / {formatMs(state.totalDuration)}
      </span>

      {/* Speed buttons */}
      <div className="flex gap-1 flex-shrink-0">
        {speeds.map((s) => (
          <button
            key={s}
            onClick={() => onSetSpeed(s)}
            className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
              state.speed === s
                ? 'bg-primary text-bg'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Skip */}
      <button
        onClick={onSkip}
        className="text-[14px] text-text-muted hover:text-primary transition-colors flex-shrink-0"
        title="Skip to next block"
      >
        &#9197;
      </button>

      {/* Exit replay */}
      <button
        onClick={onExit}
        className="pill flex-shrink-0"
      >
        Browse
      </button>
    </div>
  )
}
