import { useState, useEffect } from 'react'
import type { DashboardData } from '../../shared/types'
import { formatTokens } from '../lib/format'
import { useAppDispatch } from '../context/AppContext'

interface Props {
  stats: DashboardData['totalStats']
  connected: boolean
}

export default function HUDBar({ stats, connected }: Props) {
  const dispatch = useAppDispatch()
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const clock = time.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) +
    ' ' + time.toLocaleTimeString('en-US', { hour12: false })

  return (
    <div className="relative z-50 flex items-center justify-between px-4 h-9 glass-panel border-t-0 border-x-0">
      {/* Left: Logo + stats */}
      <div className="flex items-center gap-6">
        <h1
          className="text-primary text-xs font-bold tracking-[0.25em] uppercase cursor-pointer"
          style={{ textShadow: '0 0 6px rgba(255,184,50,0.3)' }}
          onClick={() => dispatch({ type: 'TOGGLE_LEFT_DRAWER' })}
        >
          Strata
        </h1>
        <div className="flex items-center gap-4 text-[10px]">
          <span>
            <span className="text-text-muted tracking-wider">sessions:</span>{' '}
            <span className="text-text-bright">{stats.sessions}</span>
          </span>
          <span className="text-text-muted">·</span>
          <span>
            <span className="text-text-muted tracking-wider">tokens:</span>{' '}
            <span className="text-text-bright">{formatTokens(stats.tokens)}</span>
          </span>
          <span className="text-text-muted">·</span>
          <span>
            <span className="text-text-muted tracking-wider">projects:</span>{' '}
            <span className="text-text-bright">{stats.projects}</span>
          </span>
        </div>
      </div>

      {/* Right: cmd palette + status + clock */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })}
          className="flex items-center gap-1.5 text-text-muted hover:text-text transition-colors"
        >
          <span className="kbd">/</span>
          <span className="text-[9px] tracking-wider">SEARCH</span>
        </button>

        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? 'bg-success' : 'bg-danger'
            }`}
            style={connected ? { boxShadow: '0 0 4px rgba(68,255,170,0.5)' } : {}}
          />
          <span className="text-[9px] text-text-muted tracking-wider">
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        <span className="text-[10px] text-text-muted tracking-wider">{clock}</span>
      </div>
    </div>
  )
}
