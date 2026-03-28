import type { SessionSummary } from '../../../shared/types'
import { useAppState } from '../../context/AppContext'
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
}

export default function SessionDetail({ sessions }: Props) {
  const { selectedSessionId } = useAppState()
  const session = sessions.find((s) => s.id === selectedSessionId)

  const handleResume = async () => {
    if (!session) return
    try {
      await fetch(`/api/sessions/${session.id}/resume`, { method: 'POST' })
    } catch {
      navigator.clipboard.writeText(`claude --resume ${session.id}`)
    }
  }

  return (
    <div className="glass-panel h-full flex flex-col">
      <div className="glass-panel-header">
        <span>Detail</span>
        {session && (
          <span className="count">{modelShortName(session.model)}</span>
        )}
      </div>

      {!session ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-text-muted text-[10px] text-center px-6">
            <div className="text-primary text-lg mb-2">▲</div>
            Click a session or terrain peak to view details
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-primary text-[10px] font-semibold tracking-wider uppercase">
                {session.projectName}
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
            <div className="text-[11px] text-text-bright leading-relaxed">
              {session.firstUserPrompt}
            </div>
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
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #ffb832, #ff8800)' }}
                        />
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
