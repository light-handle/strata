import { useState, useEffect, useRef, useCallback } from 'react'
import { useSessionMessages } from '../../hooks/useSessionMessages'
import { useSubagentMessages } from '../../hooks/useSubagentMessages'
import type { TimelineBlock, SubagentInfo } from '../../../shared/types'
import { formatTime, formatDate } from '../../lib/format'

interface Props {
  sessionId: string
  onClose: () => void
}

const CHUNK_SIZE = 50
const GAP_THRESHOLD_MS = 60_000

type SelectedNode = { type: 'main' } | { type: 'subagent'; agentId: string }

export default function SubagentTreeModal({ sessionId, onClose }: Props) {
  const { data: parentData, loading: parentLoading } = useSessionMessages(sessionId)
  const [selected, setSelected] = useState<SelectedNode>({ type: 'main' })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Reset selection when session changes
  useEffect(() => { setSelected({ type: 'main' }) }, [sessionId])

  const subagents = parentData?.subagents || []
  const selectedAgentId = selected.type === 'subagent' ? selected.agentId : null

  return (
    <div className="fixed inset-0 z-[90] cmd-backdrop flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="glass-panel rounded-lg overflow-hidden shadow-2xl flex flex-col"
        style={{ width: '88vw', maxWidth: '1300px', maxHeight: '88vh', border: '1px solid rgba(255,180,50,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-[14px] font-bold tracking-[0.12em] uppercase text-text-bright">
              Session Tree
            </h2>
            <div className="flex items-center gap-4 text-[13px]">
              <span className="text-text-muted">
                <span className="text-secondary font-semibold">{subagents.length}</span> subagents
              </span>
              {parentData && (
                <span className="text-text-muted">
                  <span className="text-text-bright font-semibold">{parentData.blocks.length}</span> parent blocks
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="kbd" style={{ fontSize: '11px', padding: '2px 8px' }}>esc</span>
            <button onClick={onClose} className="text-text-muted hover:text-text transition-colors text-lg">&times;</button>
          </div>
        </div>

        {/* Body: tree left, conversation right */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Tree */}
          <div className="w-[320px] flex-shrink-0 border-r border-border overflow-y-auto p-4">
            {parentLoading ? (
              <div className="text-[12px] text-text-muted py-8 text-center">Loading tree...</div>
            ) : (
              <TreeView
                subagents={subagents}
                parentBlocks={parentData?.blocks || []}
                selected={selected}
                onSelect={setSelected}
              />
            )}
          </div>

          {/* Right: Conversation for selected node */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {selected.type === 'main' ? (
              <ConversationPanel blocks={parentData?.blocks || []} loading={parentLoading} label="Main Session" />
            ) : (
              <SubagentConversationPanel sessionId={sessionId} agentId={selectedAgentId!} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tree View (left panel) ──

function TreeView({
  subagents,
  parentBlocks,
  selected,
  onSelect,
}: {
  subagents: SubagentInfo[]
  parentBlocks: TimelineBlock[]
  selected: SelectedNode
  onSelect: (node: SelectedNode) => void
}) {
  const parentPromptCount = parentBlocks.filter((b) => b.type === 'user-prompt').length

  // Find first user prompt for label
  const firstPrompt = parentBlocks.find((b) => b.type === 'user-prompt')?.text || '(no prompt)'

  // Find subagent prompts and timestamps from the blocks
  const subagentPrompts = new Map<string, string>()
  const subagentTimes = new Map<string, string>()
  for (const b of parentBlocks) {
    if (b.type === 'subagent' && b.subagentId) {
      subagentPrompts.set(b.subagentId, b.subagentPrompt || '')
      subagentTimes.set(b.subagentId, b.timestamp)
    }
  }

  // Build enriched agent list sorted by timestamp
  const enriched = subagents.map((agent) => ({
    ...agent,
    prompt: subagentPrompts.get(agent.agentId) || '',
    timestamp: subagentTimes.get(agent.agentId) || '',
    timeMs: new Date(subagentTimes.get(agent.agentId) || 0).getTime(),
  })).sort((a, b) => a.timeMs - b.timeMs)

  // Group parallel agents — agents within 5 seconds of each other
  const PARALLEL_THRESHOLD_MS = 5000
  const groups: { agents: typeof enriched; isParallel: boolean }[] = []
  let currentGroup: typeof enriched = []

  for (const agent of enriched) {
    if (currentGroup.length === 0) {
      currentGroup.push(agent)
    } else {
      const lastInGroup = currentGroup[currentGroup.length - 1]
      if (Math.abs(agent.timeMs - lastInGroup.timeMs) <= PARALLEL_THRESHOLD_MS) {
        currentGroup.push(agent)
      } else {
        groups.push({ agents: currentGroup, isParallel: currentGroup.length > 1 })
        currentGroup = [agent]
      }
    }
  }
  if (currentGroup.length > 0) {
    groups.push({ agents: currentGroup, isParallel: currentGroup.length > 1 })
  }

  return (
    <div>
      {/* Root node: Main Session */}
      <div
        className="rounded-lg p-3 cursor-pointer transition-all mb-3"
        style={{
          background: selected.type === 'main' ? 'rgba(255,180,50,0.1)' : 'rgba(12,14,22,0.6)',
          border: `2px solid ${selected.type === 'main' ? 'var(--color-primary)' : 'rgba(255,180,50,0.08)'}`,
        }}
        onClick={() => onSelect({ type: 'main' })}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-[13px] text-text-bright font-semibold">Main Session</span>
        </div>
        <div className="text-[11px] text-text-muted">{parentPromptCount} prompts &middot; {parentBlocks.length} blocks</div>
        <div className="text-[11px] text-text mt-1 line-clamp-2">{firstPrompt.slice(0, 100)}</div>
      </div>

      {/* Branch line + subagent nodes grouped by parallel execution */}
      {groups.length > 0 && (
        <div className="ml-4 border-l-2 border-border pl-4 space-y-3">
          {groups.map((group, gi) => (
            <div key={gi}>
              {/* Parallel group indicator */}
              {group.isParallel && (
                <div className="flex items-center gap-2 mb-1.5 -ml-1">
                  <span className="text-[9px] font-semibold tracking-wider uppercase text-primary">
                    &#9656; {group.agents.length} parallel
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,180,50,0.15)' }} />
                  <span className="text-[9px] text-text-muted">
                    {group.agents[0].timestamp && formatDate(group.agents[0].timestamp)} {formatTime(group.agents[0].timestamp)}
                  </span>
                </div>
              )}

              <div className={group.isParallel ? 'space-y-1.5 ml-2 border-l border-primary/20 pl-3' : 'space-y-2'}>
                {group.agents.map((agent, i) => {
                  const isSelected = selected.type === 'subagent' && selected.agentId === agent.agentId

                  return (
                    <div
                      key={agent.agentId}
                      className="rounded-lg p-3 cursor-pointer transition-all relative"
                      style={{
                        background: isSelected ? 'rgba(0,229,255,0.08)' : 'rgba(12,14,22,0.6)',
                        border: `2px solid ${isSelected ? 'var(--color-secondary)' : 'rgba(255,180,50,0.06)'}`,
                      }}
                      onClick={() => onSelect({ type: 'subagent', agentId: agent.agentId })}
                    >
                      {/* Branch connector */}
                      {!group.isParallel && (
                        <div
                          className="absolute -left-[22px] top-[14px] w-[18px] h-0"
                          style={{ borderTop: '2px solid rgba(255,180,50,0.12)' }}
                        />
                      )}

                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px]">&#9881;</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded border border-secondary/30 text-secondary font-medium">
                          {agent.agentType}
                        </span>
                        <span className="text-[10px] text-text-muted ml-auto">
                          {!group.isParallel && agent.timestamp && (
                            <>{formatDate(agent.timestamp)} {formatTime(agent.timestamp)} &middot; </>
                          )}
                          {agent.messageCount} msgs
                        </span>
                      </div>
                      <div className="text-[11px] text-text mt-1 line-clamp-2">
                        {agent.prompt.slice(0, 120) || `Agent ${i + 1}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Conversation panel (right side) ──

function SubagentConversationPanel({ sessionId, agentId }: { sessionId: string; agentId: string }) {
  const { data, loading, error } = useSubagentMessages(sessionId, agentId)

  if (loading) return <div className="flex items-center justify-center h-full text-[13px] text-text-muted">Loading subagent conversation...</div>
  if (error) return <div className="flex items-center justify-center h-full text-[13px] text-danger">Error: {error}</div>

  return (
    <ConversationPanel
      blocks={data?.blocks || []}
      loading={false}
      label={`Subagent: ${agentId.slice(0, 12)}...`}
    />
  )
}

function ConversationPanel({ blocks, loading, label }: { blocks: TimelineBlock[]; loading: boolean; label: string }) {
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setVisibleCount(CHUNK_SIZE)
    scrollRef.current?.scrollTo(0, 0)
  }, [blocks])

  const loadMore = useCallback(() => {
    if (visibleCount < blocks.length) setVisibleCount((c) => Math.min(c + CHUNK_SIZE, blocks.length))
  }, [blocks.length, visibleCount])

  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore() }, { threshold: 0.1 })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore])

  if (loading) return <div className="flex items-center justify-center h-full text-[13px] text-text-muted">Loading...</div>

  const visible = blocks.slice(0, visibleCount)
  const entries: { type: 'block' | 'gap'; block?: TimelineBlock; gapMs?: number; timestamp?: string; key: string }[] = []
  for (let i = 0; i < visible.length; i++) {
    const block = visible[i]
    if (i > 0) {
      const gap = new Date(block.timestamp).getTime() - new Date(visible[i - 1].timestamp).getTime()
      if (gap > GAP_THRESHOLD_MS && !isNaN(gap)) {
        entries.push({ type: 'gap', gapMs: gap, timestamp: block.timestamp, key: `gap-${i}` })
      }
    }
    entries.push({ type: 'block', block, key: block.id })
  }

  const promptCount = blocks.filter((b) => b.type === 'user-prompt').length
  const toolCount = blocks.filter((b) => b.type === 'tool-use').length

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      {/* Stats header */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-4">
        <span className="text-[13px] text-text-bright font-semibold">{label}</span>
        <span className="text-[11px] text-text-muted">{promptCount} prompts</span>
        <span className="text-[11px] text-text-muted">{toolCount} tool calls</span>
        <span className="text-[11px] text-text-muted">{blocks.length} blocks</span>
      </div>

      <div className="py-2">
        {entries.map((entry) =>
          entry.type === 'gap' ? (
            <GapIndicator key={entry.key} timestamp={entry.timestamp!} gapMs={entry.gapMs!} />
          ) : (
            <BlockEntry key={entry.key} block={entry.block!} />
          ),
        )}
      </div>

      {visibleCount < blocks.length && (
        <div ref={sentinelRef} className="py-4 text-center text-[11px] text-text-muted">
          Loading more... ({visibleCount}/{blocks.length})
        </div>
      )}
      {visibleCount >= blocks.length && blocks.length > 0 && (
        <div className="py-4 text-center text-[10px] text-text-muted">&mdash; end &mdash;</div>
      )}
    </div>
  )
}

// ── Reusable block renderers (same style as ConversationModal) ──

function BlockEntry({ block }: { block: TimelineBlock }) {
  switch (block.type) {
    case 'user-prompt': return <UserBlock text={block.text || ''} timestamp={block.timestamp} />
    case 'text': return <AssistantBlock text={block.text || ''} />
    case 'thinking': return <ThinkingBlock text={block.thinkingText || ''} />
    case 'tool-use': return <ToolBlock name={block.toolName || 'unknown'} input={block.toolInput || {}} />
    case 'tool-result': return <ResultBlock content={block.toolResultContent || ''} isError={block.toolResultIsError || false} />
    case 'system': return <div className="mx-5 my-1 text-[10px] text-text-muted uppercase tracking-wider">system{block.systemSubtype ? ` / ${block.systemSubtype}` : ''}</div>
    default: return null
  }
}

function UserBlock({ text, timestamp }: { text: string; timestamp: string }) {
  return (
    <div className="mx-5 my-2 rounded-lg" style={{ borderLeft: '3px solid var(--color-primary)', background: 'rgba(255,180,50,0.05)' }}>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold tracking-wider text-primary uppercase">User</span>
          <span className="text-[9px] text-text-muted">{formatTime(timestamp)}</span>
        </div>
        <div className="text-[12px] text-text-bright leading-relaxed whitespace-pre-wrap break-words">{text}</div>
      </div>
    </div>
  )
}

function AssistantBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(text.length <= 600)
  return (
    <div className="mx-5 my-1 rounded-lg" style={{ borderLeft: '3px solid var(--color-secondary)', background: 'rgba(0,229,255,0.03)' }}>
      <div className="px-4 py-2">
        <span className="text-[10px] font-bold tracking-wider text-secondary uppercase">Claude</span>
        <div className="text-[12px] text-text leading-relaxed mt-1 whitespace-pre-wrap break-words">
          {expanded ? text : text.slice(0, 600)}
          {!expanded && <button onClick={() => setExpanded(true)} className="text-secondary text-[11px] ml-1 hover:underline">show more...</button>}
        </div>
      </div>
    </div>
  )
}

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mx-5 my-1 rounded-lg cursor-pointer" style={{ borderLeft: '3px solid rgba(136,102,204,0.5)', background: 'rgba(136,102,204,0.04)' }} onClick={() => setExpanded(!expanded)}>
      <div className="px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px]">&#129504;</span>
          <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: '#8866cc' }}>Thinking</span>
          <span className="text-[10px] text-text-muted ml-auto">{expanded ? '▾' : '▸'} ~{Math.round(text.length / 5)} words</span>
        </div>
        {expanded && <div className="mt-2 text-[11px] text-text-muted leading-relaxed whitespace-pre-wrap break-words overflow-y-auto" style={{ maxHeight: '250px' }}>{text}</div>}
      </div>
    </div>
  )
}

const TOOL_COLORS: Record<string, string> = { Bash: '#ff8800', Read: '#00cc88', Write: '#00aaff', Edit: '#ccaa00', Grep: '#cc66aa', Glob: '#66aacc', Agent: '#ff6666' }

function ToolBlock({ name, input }: { name: string; input: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_COLORS[name] || '#888'
  let preview = ''
  switch (name) {
    case 'Bash': preview = String(input.command || '').slice(0, 100); break
    case 'Read': case 'Write': case 'Edit': preview = String(input.file_path || '').split('/').slice(-3).join('/'); break
    case 'Grep': preview = String(input.pattern || ''); break
    default: { const f = Object.values(input)[0]; preview = typeof f === 'string' ? f.slice(0, 80) : '' }
  }
  return (
    <div className="mx-5 my-1 rounded-lg cursor-pointer" style={{ background: 'rgba(8,8,12,0.8)', border: '1px solid rgba(255,180,50,0.08)' }} onClick={() => setExpanded(!expanded)}>
      <div className="px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: color + '22', color, border: `1px solid ${color}44` }}>{name}</span>
          <span className="text-[11px] text-text truncate flex-1 font-mono">{preview}</span>
          <span className="text-[10px] text-text-muted">{expanded ? '▾' : '▸'}</span>
        </div>
        {expanded && <pre className="mt-2 text-[10px] text-text leading-relaxed overflow-auto rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.4)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '200px' }}>{JSON.stringify(input, null, 2)}</pre>}
      </div>
    </div>
  )
}

function ResultBlock({ content, isError }: { content: string; isError: boolean }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mx-5 -mt-0.5 mb-1 rounded-lg cursor-pointer" style={{ background: isError ? 'rgba(255,68,102,0.06)' : 'rgba(8,8,12,0.5)', borderLeft: `3px solid ${isError ? 'rgba(255,68,102,0.5)' : 'rgba(255,180,50,0.1)'}` }} onClick={() => setExpanded(!expanded)}>
      <div className="px-4 py-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] tracking-wider font-semibold ${isError ? 'text-danger' : 'text-text-muted'}`}>{isError ? 'ERROR' : 'RESULT'}</span>
          {!expanded && <span className="text-[10px] text-text-muted truncate flex-1 font-mono">{content.split('\n')[0]?.slice(0, 80)}</span>}
          <span className="text-[10px] text-text-muted">{expanded ? '▾' : '▸'}</span>
        </div>
        {expanded && <pre className="mt-1.5 text-[10px] text-text-muted leading-relaxed overflow-auto rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.4)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '180px' }}>{content}</pre>}
      </div>
    </div>
  )
}

function GapIndicator({ timestamp, gapMs }: { timestamp: string; gapMs: number }) {
  const t = gapMs < 60_000 ? `${Math.round(gapMs / 1000)}s` : gapMs < 3_600_000 ? `${Math.round(gapMs / 60_000)}m` : `${Math.floor(gapMs / 3_600_000)}h ${Math.round((gapMs % 3_600_000) / 60_000)}m`
  return (
    <div className="flex items-center gap-3 py-1.5 px-5">
      <div className="flex-1 h-px" style={{ background: 'rgba(255,180,50,0.12)' }} />
      <span className="text-[9px] text-text-muted tracking-wider">{formatTime(timestamp)} &middot; {t} gap</span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,180,50,0.12)' }} />
    </div>
  )
}
