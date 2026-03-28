import { useState, useMemo } from 'react'
import type { SessionSummary } from '../../../shared/types'
import type { DashboardData } from '../../../shared/types'
import { useAppState, useAppDispatch } from '../../context/AppContext'
import { formatTokens, formatDuration, timeAgo, modelShortName } from '../../lib/format'
import { mapSessionsToGrid, DEFAULT_CONFIG } from '../../lib/terrainUtils'

interface Props {
  sessions: SessionSummary[]
  data?: DashboardData
}

export default function SessionList({ sessions, data }: Props) {
  const { selectedSessionId, selectedProjectName } = useAppState()
  const dispatch = useAppDispatch()
  const [filter, setFilter] = useState('')

  // Build a map of session ID -> terrain position for camera navigation
  const positionMap = useMemo(() => {
    if (!data) return new Map<string, { x: number; y: number; z: number }>()
    const { positions } = mapSessionsToGrid(data, DEFAULT_CONFIG)
    const map = new Map<string, { x: number; y: number; z: number }>()
    for (const pos of positions) {
      map.set(pos.session.id, { x: pos.worldX, y: pos.height, z: pos.worldZ })
    }
    return map
  }, [data])

  const filtered = sessions.filter((s) => {
    // Auto-filter when a project is selected in the right panel
    if (selectedProjectName && s.projectName !== selectedProjectName) return false
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      s.projectName.toLowerCase().includes(q) ||
      s.firstUserPrompt.toLowerCase().includes(q)
    )
  })

  // Group by project
  const grouped = new Map<string, SessionSummary[]>()
  for (const s of filtered) {
    const key = s.projectName
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(s)
  }

  return (
    <div className="glass-panel h-full flex flex-col">
      <div className="glass-panel-header">
        <span>{selectedProjectName ? selectedProjectName : 'Sessions'}</span>
        <span className="count">{filtered.length}</span>
      </div>

      {/* Active project filter indicator */}
      {selectedProjectName && (
        <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
          <span className="text-[9px] text-primary tracking-wider">
            Filtered to {selectedProjectName}
          </span>
          <button
            onClick={() => dispatch({ type: 'DESELECT_PROJECT' })}
            className="text-[8px] text-text-muted hover:text-text transition-colors"
          >
            clear
          </button>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-primary text-[10px]">&gt;</span>
          <input
            type="text"
            placeholder="search sessions..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 bg-transparent text-[10px] text-text placeholder-text-muted focus:outline-none"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(grouped.entries()).map(([project, sessions]) => (
          <div key={project}>
            <div className="px-3 py-1.5 text-[9px] font-semibold tracking-[0.15em] uppercase text-primary border-b border-border/50">
              {project}
            </div>
            {sessions.map((session) => {
              const tokens =
                session.totalInputTokens +
                session.totalOutputTokens +
                session.totalCacheReadTokens +
                session.totalCacheCreateTokens

              return (
                <div
                  key={session.id}
                  className={`session-item ${
                    selectedSessionId === session.id ? 'active' : ''
                  }`}
                  onClick={() => {
                    const target = positionMap.get(session.id)
                    dispatch({
                      type: 'SELECT_SESSION',
                      id: session.id,
                      cameraTarget: target,
                    })
                  }}
                >
                  <div className="text-[11px] text-text-bright leading-snug line-clamp-2">
                    {session.firstUserPrompt || '(empty session)'}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[9px] text-text-muted">
                    <span className="text-secondary">{modelShortName(session.model)}</span>
                    <span>{session.userMessageCount}p</span>
                    <span>{formatTokens(tokens)}</span>
                    <span>{formatDuration(session.durationMs)}</span>
                    <span className="ml-auto">{timeAgo(session.startTime)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-text-muted text-center py-12 text-[10px]">
            no sessions found
          </div>
        )}
      </div>
    </div>
  )
}
