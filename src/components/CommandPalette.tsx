import { useState, useEffect, useRef } from 'react'
import type { SessionSummary, ProjectSummary } from '../../shared/types'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { formatTokens, timeAgo, modelShortName } from '../lib/format'

interface Props {
  sessions: SessionSummary[]
  projects: ProjectSummary[]
}

interface SearchResult {
  type: 'session' | 'project' | 'action'
  id: string
  title: string
  subtitle: string
  action: () => void
}

export default function CommandPalette({ sessions, projects }: Props) {
  const { commandPaletteOpen } = useAppState()
  const dispatch = useAppDispatch()
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  // Build results
  const results: SearchResult[] = []

  if (query.length > 0) {
    const q = query.toLowerCase()

    // Search sessions
    for (const s of sessions.slice(0, 100)) {
      if (
        s.firstUserPrompt.toLowerCase().includes(q) ||
        s.projectName.toLowerCase().includes(q) ||
        s.lastUserPrompt.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'session',
          id: s.id,
          title: s.firstUserPrompt.slice(0, 80) || '(empty)',
          subtitle: `${s.projectName} · ${modelShortName(s.model)} · ${timeAgo(s.startTime)}`,
          action: () => {
            dispatch({ type: 'SELECT_SESSION', id: s.id })
            dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
          },
        })
      }
      if (results.length >= 12) break
    }

    // Search projects
    for (const p of projects) {
      if (p.name.toLowerCase().includes(q)) {
        results.push({
          type: 'project',
          id: p.path,
          title: p.name,
          subtitle: `${formatTokens(p.totalTokens)} tokens · ${p.sessionCount} sessions`,
          action: () => {
            dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
            dispatch({ type: 'TOGGLE_LEFT_DRAWER' })
          },
        })
      }
    }
  } else {
    // Default: show actions
    results.push(
      {
        type: 'action',
        id: 'sessions',
        title: 'Open sessions panel',
        subtitle: '[ key',
        action: () => {
          dispatch({ type: 'TOGGLE_LEFT_DRAWER' })
          dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        },
      },
      {
        type: 'action',
        id: 'analytics',
        title: 'Open analytics tray',
        subtitle: '` key',
        action: () => {
          dispatch({ type: 'TOGGLE_BOTTOM_TRAY' })
          dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        },
      },
      {
        type: 'action',
        id: 'reset-camera',
        title: 'Reset camera to overview',
        subtitle: 'Shift+Space',
        action: () => {
          dispatch({ type: 'FLY_TO', target: { x: 0, y: 45, z: 50 } })
          dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        },
      },
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      results[selectedIdx]?.action()
    } else if (e.key === 'Escape') {
      dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
    }
  }

  if (!commandPaletteOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] cmd-backdrop flex items-start justify-center pt-[15vh]"
      onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })}
    >
      <div
        className="w-[520px] glass-panel rounded-lg overflow-hidden shadow-2xl"
        style={{ border: '1px solid rgba(255,180,50,0.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="text-primary text-[11px]">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="search sessions, projects, actions..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-[12px] text-text-bright placeholder-text-muted focus:outline-none"
          />
          <span className="kbd">esc</span>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto">
          {results.map((result, i) => (
            <div
              key={`${result.type}-${result.id}`}
              onClick={result.action}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                i === selectedIdx
                  ? 'bg-primary-glow border-l-2 border-primary'
                  : 'border-l-2 border-transparent hover:bg-surface-hover'
              }`}
            >
              {/* Type badge */}
              <span
                className={`text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded border ${
                  result.type === 'session'
                    ? 'text-primary border-primary/30'
                    : result.type === 'project'
                      ? 'text-secondary border-secondary/30'
                      : 'text-text-muted border-text-muted/30'
                }`}
              >
                {result.type}
              </span>

              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-text-bright truncate">{result.title}</div>
                <div className="text-[9px] text-text-muted truncate">{result.subtitle}</div>
              </div>
            </div>
          ))}

          {results.length === 0 && query.length > 0 && (
            <div className="px-4 py-6 text-center text-[10px] text-text-muted">
              no results for "{query}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
