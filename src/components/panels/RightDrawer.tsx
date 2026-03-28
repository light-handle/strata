import { useMemo, useState } from 'react'
import type { SessionSummary, ProjectSummary, DashboardData } from '../../../shared/types'
import ConversationTimeline from '../timeline/ConversationTimeline'
import { useAppState, useAppDispatch } from '../../context/AppContext'
import { mapSessionsToGrid, DEFAULT_CONFIG } from '../../lib/terrainUtils'
import {
  formatTokens,
  formatDuration,
  formatDate,
  formatTime,
  timeAgo,
  modelShortName,
} from '../../lib/format'

interface Props {
  sessions: SessionSummary[]
  projects: ProjectSummary[]
  data?: DashboardData
}

export default function RightPanel({ sessions, projects, data }: Props) {
  const { selectedSessionId, selectedProjectName } = useAppState()
  const session = sessions.find((s) => s.id === selectedSessionId)
  const project = projects.find((p) => p.name === selectedProjectName)

  // Build position map for camera navigation
  const positionMap = useMemo(() => {
    if (!data) return new Map<string, { x: number; y: number; z: number }>()
    const { positions } = mapSessionsToGrid(data, DEFAULT_CONFIG)
    const map = new Map<string, { x: number; y: number; z: number }>()
    for (const pos of positions) {
      map.set(pos.session.id, { x: pos.worldX, y: pos.height, z: pos.worldZ })
    }
    return map
  }, [data])

  // Determine which view to show
  const view = session ? 'session' : project ? 'project' : 'overview'

  const headerText = view === 'session' ? 'Detail' : view === 'project' ? project!.name : 'Projects'
  const headerCount = view === 'session'
    ? modelShortName(session!.model)
    : view === 'project'
      ? `${project!.sessionCount} sessions`
      : `${projects.length} total`

  return (
    <div className="glass-panel h-full flex flex-col">
      <div className="glass-panel-header">
        <span className="truncate">{headerText}</span>
        <span className="count flex-shrink-0">{headerCount}</span>
      </div>

      {view === 'overview' && (
        <ProjectsOverview projects={projects} />
      )}
      {view === 'project' && project && (
        <ProjectDrillDown project={project} positionMap={positionMap} />
      )}
      {view === 'session' && session && (
        <SessionDetailView session={session} />
      )}
    </div>
  )
}

// ── Level 1: Projects overview (tiles + list) ──

function ProjectsOverview({ projects }: { projects: ProjectSummary[] }) {
  const dispatch = useAppDispatch()
  const maxTokens = Math.max(...projects.map((p) => p.totalTokens), 1)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-2 grid grid-cols-2 gap-1.5">
        {projects.map((project) => {
          const intensity = project.totalTokens / maxTokens
          const bgG = Math.round(15 + intensity * 35)
          const bgB = Math.round(10 + intensity * 15)

          return (
            <div
              key={project.path}
              className="rounded p-2 cursor-pointer transition-all hover:brightness-125 group relative"
              style={{
                background: `linear-gradient(135deg, rgba(${Math.round(intensity * 60)}, ${bgG + 10}, ${bgB}, 0.8), rgba(12,14,22,0.9))`,
                border: `1px solid rgba(255, 180, 50, ${0.06 + intensity * 0.15})`,
                minHeight: '68px',
              }}
              onClick={() => dispatch({ type: 'SELECT_PROJECT', name: project.name })}
            >
              {/* Mini session blocks */}
              <div className="grid grid-cols-4 gap-px mb-2">
                {project.sessions.slice(0, 12).map((s) => {
                  const sTokens = s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreateTokens
                  const sIntensity = Math.min(sTokens / maxTokens, 1)
                  return (
                    <div
                      key={s.id}
                      className="rounded-sm"
                      style={{
                        background: `rgb(${Math.round(40 + sIntensity * 200)}, ${Math.round(30 + sIntensity * 120)}, ${Math.round(sIntensity * 20)})`,
                        height: '5px',
                        opacity: 0.5 + sIntensity * 0.5,
                      }}
                    />
                  )
                })}
              </div>
              <div className="text-[9px] text-text-bright font-medium truncate">{project.name}</div>
              <div className="text-[8px] text-text-muted mt-0.5">
                {formatTokens(project.totalTokens)} &middot; {project.sessionCount}s
              </div>
              <div className="absolute inset-0 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ boxShadow: 'inset 0 0 12px rgba(255, 180, 50, 0.12)' }}
              />
            </div>
          )
        })}
      </div>

      {/* List view below */}
      <div className="border-t border-border mt-1">
        {projects.map((project) => {
          const intensity = project.totalTokens / maxTokens
          return (
            <div
              key={project.path}
              className="flex items-center gap-2 px-3 py-2 border-b border-border/50 cursor-pointer hover:bg-surface-hover transition-colors"
              onClick={() => dispatch({ type: 'SELECT_PROJECT', name: project.name })}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  background: `rgb(${Math.round(100 + intensity * 155)}, ${Math.round(80 + intensity * 100)}, ${Math.round(intensity * 30)})`,
                  boxShadow: intensity > 0.5 ? `0 0 4px rgba(255,180,50,${intensity * 0.4})` : 'none',
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-text-bright truncate">{project.name}</div>
                <div className="text-[8px] text-text-muted">
                  {project.sessionCount} sessions &middot; {timeAgo(project.lastActiveTime)}
                </div>
              </div>
              <div className="text-[9px] text-text-muted text-right flex-shrink-0">
                {formatTokens(project.totalTokens)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Level 2: Project drill-down (all sessions for one project) ──

function ProjectDrillDown({
  project,
  positionMap,
}: {
  project: ProjectSummary
  positionMap: Map<string, { x: number; y: number; z: number }>
}) {
  const dispatch = useAppDispatch()

  const totalTokens = project.totalTokens
  const maxSessionTokens = Math.max(
    ...project.sessions.map((s) =>
      s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreateTokens
    ), 1
  )

  // Sort sessions by start time descending
  const sorted = [...project.sessions].sort((a, b) => b.startTime.localeCompare(a.startTime))

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Back */}
      <div className="px-4 py-2 border-b border-border">
        <button
          onClick={() => dispatch({ type: 'DESELECT_PROJECT' })}
          className="text-[9px] text-text-muted hover:text-primary transition-colors tracking-wider"
        >
          &larr; ALL PROJECTS
        </button>
      </div>

      {/* Project stats */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded p-2" style={{ background: 'rgba(8,8,12,0.6)', border: '1px solid rgba(255,180,50,0.06)' }}>
            <div className="text-[8px] text-text-muted uppercase tracking-wider">Sessions</div>
            <div className="text-[13px] font-medium text-primary mt-0.5">{project.sessionCount}</div>
          </div>
          <div className="rounded p-2" style={{ background: 'rgba(8,8,12,0.6)', border: '1px solid rgba(255,180,50,0.06)' }}>
            <div className="text-[8px] text-text-muted uppercase tracking-wider">Tokens</div>
            <div className="text-[13px] font-medium text-secondary mt-0.5">{formatTokens(totalTokens)}</div>
          </div>
          <div className="rounded p-2" style={{ background: 'rgba(8,8,12,0.6)', border: '1px solid rgba(255,180,50,0.06)' }}>
            <div className="text-[8px] text-text-muted uppercase tracking-wider">Messages</div>
            <div className="text-[13px] font-medium text-text-bright mt-0.5">{project.totalMessages}</div>
          </div>
        </div>
        <div className="text-[8px] text-text-muted mt-2">
          Last active {timeAgo(project.lastActiveTime)}
        </div>
      </div>

      {/* Sessions list */}
      <div className="px-2 py-2">
        <div className="text-[9px] text-text-muted tracking-wider uppercase px-2 mb-2 font-semibold">
          Sessions
        </div>
        {sorted.map((session) => {
          const tokens = session.totalInputTokens + session.totalOutputTokens +
            session.totalCacheReadTokens + session.totalCacheCreateTokens
          const pct = (tokens / maxSessionTokens) * 100
          const target = positionMap.get(session.id)

          return (
            <div
              key={session.id}
              className="rounded p-3 mb-1.5 cursor-pointer transition-all hover:brightness-110 border border-transparent hover:border-primary/20 group"
              style={{ background: 'rgba(12,14,22,0.7)' }}
              onClick={() => dispatch({
                type: 'SELECT_SESSION',
                id: session.id,
                cameraTarget: target,
              })}
            >
              {/* Prompt preview */}
              <div className="text-[10px] text-text-bright leading-snug line-clamp-2 mb-2">
                {session.firstUserPrompt || '(empty session)'}
              </div>

              {/* Token bar */}
              <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: 'rgba(255,180,50,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #ffb832, #ff8800)' }}
                />
              </div>

              {/* Meta */}
              <div className="flex items-center gap-2 text-[8px] text-text-muted">
                <span className="text-secondary">{modelShortName(session.model)}</span>
                <span>{session.userMessageCount} prompts</span>
                <span>{formatTokens(tokens)}</span>
                <span>{formatDuration(session.durationMs)}</span>
                <span className="ml-auto">{timeAgo(session.startTime)}</span>
              </div>

              {/* Fly-to hint */}
              <div className="text-[8px] text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                click to view on terrain &rarr;
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Level 3: Session detail with Summary/Conversation tabs ──

function SessionDetailView({ session }: { session: SessionSummary }) {
  const dispatch = useAppDispatch()
  const { selectedProjectName } = useAppState()
  const [tab, setTab] = useState<'summary' | 'conversation'>('summary')

  const handleResume = async () => {
    try {
      await fetch(`/api/sessions/${session.id}/resume`, { method: 'POST' })
    } catch {
      navigator.clipboard.writeText(`claude --resume ${session.id}`)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Back + tabs */}
      <div className="flex-shrink-0">
        <div className="px-4 py-2 border-b border-border flex items-center justify-between">
          <button
            onClick={() => dispatch({ type: 'DESELECT_SESSION' })}
            className="text-[9px] text-text-muted hover:text-primary transition-colors tracking-wider"
          >
            &larr; {selectedProjectName ? `BACK TO ${selectedProjectName.toUpperCase()}` : 'BACK TO PROJECTS'}
          </button>
          <div className="flex gap-1">
            <button
              className={`pill ${tab === 'summary' ? 'active' : ''}`}
              onClick={() => setTab('summary')}
            >
              Summary
            </button>
            <button
              className={`pill ${tab === 'conversation' ? 'active' : ''}`}
              onClick={() => setTab('conversation')}
            >
              Conversation
            </button>
          </div>
        </div>
      </div>

      {/* Conversation tab */}
      {tab === 'conversation' ? (
        <ConversationTimeline sessionId={session.id} />
      ) : (
      <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-primary text-[10px] font-semibold tracking-wider uppercase">
            {session.projectName}
          </span>
          <span className="text-[8px] px-1.5 py-0.5 rounded border border-border text-secondary">
            {modelShortName(session.model)}
          </span>
          {session.gitBranch && session.gitBranch !== 'HEAD' && (
            <span className="text-[8px] text-text-muted">{session.gitBranch}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[9px] text-text-muted">
          <span>{formatDate(session.startTime)} {formatTime(session.startTime)}</span>
          <span>{formatDuration(session.durationMs)}</span>
          <span>{timeAgo(session.startTime)}</span>
        </div>
      </div>

      {/* First prompt */}
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[9px] text-text-muted tracking-wider uppercase mb-1">First Prompt</div>
        <div className="text-[11px] text-text-bright leading-relaxed">{session.firstUserPrompt}</div>
      </div>

      {/* Token breakdown */}
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[9px] text-text-muted tracking-wider uppercase mb-2">Tokens</div>
        <div className="grid grid-cols-2 gap-1.5">
          <TokenStat label="Input" value={session.totalInputTokens} color="#ffb832" />
          <TokenStat label="Output" value={session.totalOutputTokens} color="#00e5ff" />
          <TokenStat label="Cache Read" value={session.totalCacheReadTokens} color="#8866cc" />
          <TokenStat label="Cache Write" value={session.totalCacheCreateTokens} color="#cc6688" />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[9px]">
          <span className="text-text-muted">Total</span>
          <span className="text-text-bright font-medium">
            {formatTokens(
              session.totalInputTokens + session.totalOutputTokens +
              session.totalCacheReadTokens + session.totalCacheCreateTokens
            )}
          </span>
        </div>
      </div>

      {/* Tool calls */}
      {session.toolCalls.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <div className="text-[9px] text-text-muted tracking-wider uppercase mb-2">Tools</div>
          <div className="space-y-1">
            {session.toolCalls.slice(0, 8).map((tc) => {
              const maxCount = session.toolCalls[0].count
              const pct = (tc.count / maxCount) * 100
              return (
                <div key={tc.name} className="flex items-center gap-2 text-[9px]">
                  <span className="w-14 text-text-muted truncate">{tc.name}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,180,50,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #ffb832, #ff8800)' }} />
                  </div>
                  <span className="text-text-muted w-5 text-right">{tc.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Last exchange */}
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[9px] text-text-muted tracking-wider uppercase mb-1">Last Prompt</div>
        <div className="text-[10px] text-text leading-relaxed mb-2">{session.lastUserPrompt}</div>
        <div className="text-[9px] text-text-muted tracking-wider uppercase mb-1">Last Response</div>
        <div className="text-[10px] text-text leading-relaxed">{session.lastAssistantResponse}</div>
      </div>

      {/* Stats */}
      <div className="px-4 py-2 border-b border-border flex flex-wrap gap-3 text-[9px] text-text-muted">
        <span>{session.messageCount} messages</span>
        <span>{session.userMessageCount} prompts</span>
        {session.subagentCount > 0 && (
          <span className="text-secondary">{session.subagentCount} subagents</span>
        )}
      </div>

      {/* Resume */}
      <div className="px-4 py-3">
        <button
          onClick={handleResume}
          className="w-full border border-primary text-primary text-[10px] font-medium py-2 rounded tracking-wider uppercase hover:bg-primary-glow transition-colors"
        >
          &gt; resume session
        </button>
        <div className="mt-1.5 text-[8px] text-text-muted font-mono text-center">{session.id}</div>
      </div>
    </div>
      )}
    </div>
  )
}

function TokenStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded p-1.5" style={{ background: 'rgba(8,8,12,0.6)', border: '1px solid rgba(255,180,50,0.06)' }}>
      <div className="text-[8px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-[11px] font-medium mt-0.5" style={{ color }}>{formatTokens(value)}</div>
    </div>
  )
}
