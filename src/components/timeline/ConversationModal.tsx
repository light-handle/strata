import { useState, useRef, useEffect, useCallback } from 'react'
import { useSessionMessages } from '../../hooks/useSessionMessages'
import { useReplayEngine } from '../../hooks/useReplayEngine'
import ReplayControls from './ReplayControls'
import type { TimelineBlock } from '../../../shared/types'
import { formatTime } from '../../lib/format'

interface Props {
  sessionId: string
  onClose: () => void
}

const CHUNK_SIZE = 50
const GAP_THRESHOLD_MS = 60_000

export default function ConversationModal({ sessionId, onClose }: Props) {
  const { data, loading, error } = useSessionMessages(sessionId)
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentBlockRef = useRef<HTMLDivElement>(null)

  const blocks = data?.blocks || []
  const [replayState, replayControls] = useReplayEngine(blocks)
  const isReplay = replayState.mode === 'replay'

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    setVisibleCount(CHUNK_SIZE)
    scrollRef.current?.scrollTo(0, 0)
  }, [sessionId])

  const loadMore = useCallback(() => {
    if (data && visibleCount < data.blocks.length) {
      setVisibleCount((c) => Math.min(c + CHUNK_SIZE, data.blocks.length))
    }
  }, [data, visibleCount])

  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore() },
      { threshold: 0.1 },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore])

  // Auto-scroll in replay mode — keep the bottom of the current block visible
  useEffect(() => {
    if (!isReplay || !scrollRef.current) return
    // Scroll the container to the very bottom so new typed text is always visible
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [isReplay, replayState.currentBlockIndex, replayState.typingProgress])

  // Browse mode: visible blocks with gaps
  const visibleBlocks = blocks.slice(0, visibleCount)
  const browseEntries: { type: 'block' | 'gap'; block?: TimelineBlock; gapMs?: number; timestamp?: string; key: string }[] = []
  for (let i = 0; i < visibleBlocks.length; i++) {
    const block = visibleBlocks[i]
    if (i > 0) {
      const gap = new Date(block.timestamp).getTime() - new Date(visibleBlocks[i - 1].timestamp).getTime()
      if (gap > GAP_THRESHOLD_MS && !isNaN(gap)) {
        browseEntries.push({ type: 'gap', gapMs: gap, timestamp: block.timestamp, key: `gap-${i}` })
      }
    }
    browseEntries.push({ type: 'block', block, key: block.id })
  }

  // Replay mode: blocks up to currentBlockIndex
  const replayBlocks = isReplay ? blocks.slice(0, replayState.currentBlockIndex + 1) : []

  return (
    <div className="fixed inset-0 z-[90] cmd-backdrop flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="glass-panel rounded-lg overflow-hidden shadow-2xl flex flex-col"
        style={{ width: '70vw', maxWidth: '900px', maxHeight: '88vh', border: '1px solid rgba(255,180,50,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-[14px] font-bold tracking-[0.12em] uppercase text-text-bright">
              Conversation
            </h2>
            {data && !isReplay && (
              <div className="flex items-center gap-4 text-[13px]">
                <span className="text-text-muted">
                  <span className="text-primary font-semibold">{blocks.filter((b) => b.type === 'user-prompt').length}</span> prompts
                </span>
                <span className="text-text-muted">
                  <span className="text-secondary font-semibold">{blocks.filter((b) => b.type === 'tool-use').length}</span> tool calls
                </span>
                <span className="text-text-muted">
                  <span className="text-text-bright font-semibold">{blocks.length}</span> blocks
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isReplay && blocks.length > 0 && (
              <button className="pill active" onClick={replayControls.startReplay}>
                &#9654; Replay
              </button>
            )}
            <span className="kbd" style={{ fontSize: '11px', padding: '2px 8px' }}>esc</span>
            <button onClick={onClose} className="text-text-muted hover:text-text transition-colors text-lg">&times;</button>
          </div>
        </div>

        {/* Replay controls bar */}
        {isReplay && (
          <ReplayControls
            state={replayState}
            onPlayPause={replayControls.togglePlayPause}
            onSetSpeed={replayControls.setSpeed}
            onSkip={replayControls.skip}
            onSeek={replayControls.seek}
            onExit={replayControls.exitReplay}
          />
        )}

        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 py-3">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-[13px] text-text-muted">Loading conversation...</div>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-16">
              <div className="text-[13px] text-danger">Error: {error}</div>
            </div>
          )}

          {/* Browse mode */}
          {!isReplay && (
            <>
              {browseEntries.map((entry) =>
                entry.type === 'gap' ? (
                  <GapIndicator key={entry.key} timestamp={entry.timestamp!} gapMs={entry.gapMs!} />
                ) : (
                  <BlockEntry key={entry.key} block={entry.block!} />
                ),
              )}
              {data && visibleCount < data.blocks.length && (
                <div ref={sentinelRef} className="py-6 text-center text-[12px] text-text-muted">
                  Loading more... ({visibleCount}/{data.blocks.length})
                </div>
              )}
              {data && visibleCount >= data.blocks.length && data.blocks.length > 0 && (
                <div className="py-6 text-center text-[11px] text-text-muted">&mdash; end of conversation &mdash;</div>
              )}
            </>
          )}

          {/* Replay mode */}
          {isReplay && (
            <>
              {replayBlocks.map((block, i) => {
                const isCurrent = i === replayState.currentBlockIndex
                const typingProgress = isCurrent ? replayState.typingProgress : 1
                return (
                  <div key={block.id} ref={isCurrent ? currentBlockRef : undefined}>
                    <ReplayBlockEntry
                      block={block}
                      typingProgress={typingProgress}
                      isCurrent={isCurrent}
                      onSkip={replayControls.skip}
                    />
                  </div>
                )
              })}
              {!replayState.playing && replayState.elapsed >= replayState.totalDuration && replayState.currentBlockIndex >= 0 && (
                <div className="py-8 text-center">
                  <div className="text-[13px] text-primary mb-2">Replay complete</div>
                  <button className="pill" onClick={replayControls.exitReplay}>Browse full conversation</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Replay-aware block renderer ──

function ReplayBlockEntry({ block, typingProgress, isCurrent, onSkip }: {
  block: TimelineBlock; typingProgress: number; isCurrent: boolean; onSkip: () => void
}) {
  const hasTypingAnim = block.type === 'user-prompt' || block.type === 'text' || block.type === 'thinking'

  if (hasTypingAnim && isCurrent && typingProgress < 1) {
    // Typing animation
    switch (block.type) {
      case 'user-prompt':
        return <UserBlockTyping text={block.text || ''} timestamp={block.timestamp} progress={typingProgress} onSkip={onSkip} />
      case 'text':
        return <AssistantBlockTyping text={block.text || ''} progress={typingProgress} onSkip={onSkip} />
      case 'thinking':
        return <ThinkingBlockTyping text={block.thinkingText || ''} progress={typingProgress} onSkip={onSkip} />
    }
  }

  // Fully revealed or non-typing block
  return <BlockEntry block={block} />
}

// ── Typing-animated blocks ──

function UserBlockTyping({ text, timestamp, progress, onSkip }: { text: string; timestamp: string; progress: number; onSkip: () => void }) {
  const chars = Math.floor(text.length * progress)
  return (
    <div className="mx-6 my-2 rounded-lg cursor-pointer" style={{ borderLeft: '3px solid var(--color-primary)', background: 'rgba(255,180,50,0.05)' }} onClick={onSkip}>
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold tracking-wider text-primary uppercase">User</span>
          <span className="text-[10px] text-text-muted">{formatTime(timestamp)}</span>
        </div>
        <div className="text-[13px] text-text-bright leading-relaxed whitespace-pre-wrap break-words">
          {text.slice(0, chars)}<span className="animate-pulse text-primary">&#9612;</span>
        </div>
      </div>
    </div>
  )
}

function AssistantBlockTyping({ text, progress, onSkip }: { text: string; progress: number; onSkip: () => void }) {
  const chars = Math.floor(text.length * progress)
  return (
    <div className="mx-6 my-1 rounded-lg cursor-pointer" style={{ borderLeft: '3px solid var(--color-secondary)', background: 'rgba(0,229,255,0.03)' }} onClick={onSkip}>
      <div className="px-5 py-3">
        <span className="text-[11px] font-bold tracking-wider text-secondary uppercase">Claude</span>
        <div className="text-[13px] text-text leading-relaxed mt-1.5 whitespace-pre-wrap break-words">
          {text.slice(0, chars)}<span className="animate-pulse text-secondary">&#9612;</span>
        </div>
      </div>
    </div>
  )
}

function ThinkingBlockTyping({ text, progress, onSkip }: { text: string; progress: number; onSkip: () => void }) {
  const chars = Math.floor(text.length * progress)
  return (
    <div className="mx-6 my-1 rounded-lg cursor-pointer" style={{ borderLeft: '3px solid rgba(136,102,204,0.5)', background: 'rgba(136,102,204,0.04)' }} onClick={onSkip}>
      <div className="px-5 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px]">&#129504;</span>
          <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: '#8866cc' }}>Thinking</span>
        </div>
        <div className="text-[12px] text-text-muted leading-relaxed whitespace-pre-wrap break-words overflow-y-auto" style={{ maxHeight: '300px' }}>
          {text.slice(0, chars)}<span className="animate-pulse" style={{ color: '#8866cc' }}>&#9612;</span>
        </div>
      </div>
    </div>
  )
}

// ── Standard block components (browse mode + completed replay blocks) ──

function BlockEntry({ block }: { block: TimelineBlock }) {
  switch (block.type) {
    case 'user-prompt': return <UserBlock text={block.text || ''} timestamp={block.timestamp} />
    case 'text': return <AssistantBlock text={block.text || ''} />
    case 'thinking': return <ThinkingBlockWide text={block.thinkingText || ''} />
    case 'tool-use': return <ToolUseBlock name={block.toolName || 'unknown'} input={block.toolInput || {}} />
    case 'tool-result': return <ToolResultBlockWide content={block.toolResultContent || ''} isError={block.toolResultIsError || false} />
    case 'subagent': return <SubagentBlockWide type={block.subagentType || ''} prompt={block.subagentPrompt || ''} id={block.subagentId || ''} />
    case 'system': return (
      <div className="mx-6 my-1 text-[11px] text-text-muted">
        <span className="uppercase tracking-wider font-semibold">system</span>
        {block.systemSubtype && <span className="ml-2">/ {block.systemSubtype}</span>}
      </div>
    )
    default: return null
  }
}

function UserBlock({ text, timestamp }: { text: string; timestamp: string }) {
  return (
    <div className="mx-6 my-2 rounded-lg" style={{ borderLeft: '3px solid var(--color-primary)', background: 'rgba(255,180,50,0.05)' }}>
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold tracking-wider text-primary uppercase">User</span>
          <span className="text-[10px] text-text-muted">{formatTime(timestamp)}</span>
        </div>
        <div className="text-[13px] text-text-bright leading-relaxed whitespace-pre-wrap break-words">{text}</div>
      </div>
    </div>
  )
}

function AssistantBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(text.length <= 800)
  const display = expanded ? text : text.slice(0, 800)
  return (
    <div className="mx-6 my-1 rounded-lg" style={{ borderLeft: '3px solid var(--color-secondary)', background: 'rgba(0,229,255,0.03)' }}>
      <div className="px-5 py-3">
        <span className="text-[11px] font-bold tracking-wider text-secondary uppercase">Claude</span>
        <div className="text-[13px] text-text leading-relaxed mt-1.5 whitespace-pre-wrap break-words">
          {display}
          {!expanded && <button onClick={() => setExpanded(true)} className="text-secondary text-[12px] ml-1 hover:underline">show more...</button>}
        </div>
      </div>
    </div>
  )
}

const TOOL_COLORS: Record<string, string> = {
  Bash: '#ff8800', Read: '#00cc88', Write: '#00aaff', Edit: '#ccaa00',
  Grep: '#cc66aa', Glob: '#66aacc', Agent: '#ff6666',
}

function ThinkingBlockWide({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mx-6 my-1 rounded-lg cursor-pointer" style={{ borderLeft: '3px solid rgba(136,102,204,0.5)', background: 'rgba(136,102,204,0.04)' }} onClick={() => setExpanded(!expanded)}>
      <div className="px-5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px]">&#129504;</span>
          <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: '#8866cc' }}>Thinking</span>
          <span className="text-[11px] text-text-muted ml-auto">{expanded ? '&#9660;' : '&#9654;'} ~{Math.round(text.length / 5)} words</span>
        </div>
        {expanded && <div className="mt-2 text-[12px] text-text-muted leading-relaxed whitespace-pre-wrap break-words overflow-y-auto" style={{ maxHeight: '300px' }}>{text}</div>}
      </div>
    </div>
  )
}

function ToolUseBlock({ name, input }: { name: string; input: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_COLORS[name] || '#888'
  let preview = ''
  switch (name) {
    case 'Bash': preview = String(input.command || '').slice(0, 120); break
    case 'Read': case 'Write': case 'Edit': preview = String(input.file_path || '').split('/').slice(-3).join('/'); break
    case 'Grep': preview = String(input.pattern || ''); break
    case 'Glob': preview = String(input.pattern || ''); break
    case 'Agent': preview = String(input.prompt || '').slice(0, 80); break
    default: { const f = Object.values(input)[0]; preview = typeof f === 'string' ? f.slice(0, 80) : '' }
  }
  return (
    <div className="mx-6 my-1 rounded-lg cursor-pointer" style={{ background: 'rgba(8,8,12,0.8)', border: '1px solid rgba(255,180,50,0.08)' }} onClick={() => setExpanded(!expanded)}>
      <div className="px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded" style={{ background: color + '22', color, border: `1px solid ${color}44` }}>{name}</span>
          <span className="text-[12px] text-text truncate flex-1 font-mono">{preview}</span>
          <span className="text-[11px] text-text-muted flex-shrink-0">{expanded ? '&#9660;' : '&#9654;'}</span>
        </div>
        {expanded && <pre className="mt-2 text-[11px] text-text leading-relaxed overflow-auto rounded-lg p-4" style={{ background: 'rgba(0,0,0,0.4)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '250px' }}>{JSON.stringify(input, null, 2)}</pre>}
      </div>
    </div>
  )
}

function ToolResultBlockWide({ content, isError }: { content: string; isError: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const firstLine = content.split('\n')[0]?.slice(0, 100) || '(empty)'
  return (
    <div className="mx-6 -mt-0.5 mb-1 rounded-lg cursor-pointer" style={{ background: isError ? 'rgba(255,68,102,0.06)' : 'rgba(8,8,12,0.5)', borderLeft: `3px solid ${isError ? 'rgba(255,68,102,0.5)' : 'rgba(255,180,50,0.1)'}` }} onClick={() => setExpanded(!expanded)}>
      <div className="px-5 py-2">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] tracking-wider font-semibold ${isError ? 'text-danger' : 'text-text-muted'}`}>{isError ? 'ERROR' : 'RESULT'}</span>
          {!expanded && <span className="text-[11px] text-text-muted truncate flex-1 font-mono">{firstLine}</span>}
          <span className="text-[11px] text-text-muted flex-shrink-0">{expanded ? '&#9660;' : '&#9654;'}</span>
        </div>
        {expanded && <pre className="mt-2 text-[11px] text-text leading-relaxed overflow-auto rounded-lg p-4" style={{ background: 'rgba(0,0,0,0.4)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '200px' }}>{content}</pre>}
      </div>
    </div>
  )
}

function SubagentBlockWide({ type, prompt, id }: { type: string; prompt: string; id: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mx-6 my-2 rounded-lg cursor-pointer" style={{ border: '1px dashed rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.03)' }} onClick={() => setExpanded(!expanded)}>
      <div className="px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px]">&#9881;</span>
          <span className="text-[11px] font-bold tracking-wider text-secondary uppercase">Subagent</span>
          <span className="text-[11px] px-2 py-0.5 rounded border border-secondary/30 text-secondary">{type}</span>
          <span className="text-[11px] text-text-muted ml-auto">{expanded ? '&#9660;' : '&#9654;'}</span>
        </div>
        {!expanded && prompt && <div className="text-[12px] text-text-muted mt-1.5 truncate">{prompt.slice(0, 100)}</div>}
        {expanded && (
          <div className="mt-2 space-y-1.5">
            <div className="text-[13px] text-text leading-relaxed whitespace-pre-wrap break-words">{prompt}</div>
            <div className="text-[10px] text-text-muted font-mono">{id}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function GapIndicator({ timestamp, gapMs }: { timestamp: string; gapMs: number }) {
  const gapText = gapMs < 60_000 ? `${Math.round(gapMs / 1000)}s`
    : gapMs < 3_600_000 ? `${Math.round(gapMs / 60_000)}m`
    : `${Math.floor(gapMs / 3_600_000)}h ${Math.round((gapMs % 3_600_000) / 60_000)}m`
  return (
    <div className="flex items-center gap-3 py-2 px-6">
      <div className="flex-1 h-px" style={{ background: 'rgba(255,180,50,0.12)' }} />
      <span className="text-[10px] text-text-muted tracking-wider flex-shrink-0">{formatTime(timestamp)} &middot; {gapText} gap</span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,180,50,0.12)' }} />
    </div>
  )
}
