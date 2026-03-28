import { useState, useRef, useEffect, useCallback } from 'react'
import { useSessionMessages } from '../../hooks/useSessionMessages'
import TimelineEntry from './TimelineEntry'
import TimeGapIndicator from './TimeGapIndicator'
import type { TimelineBlock } from '../../../shared/types'

interface Props {
  sessionId: string
}

const CHUNK_SIZE = 50
const GAP_THRESHOLD_MS = 60_000

export default function ConversationTimeline({ sessionId }: Props) {
  const { data, loading, error } = useSessionMessages(sessionId)
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset visible count when session changes
  useEffect(() => {
    setVisibleCount(CHUNK_SIZE)
    scrollRef.current?.scrollTo(0, 0)
  }, [sessionId])

  // IntersectionObserver for chunked loading
  const loadMore = useCallback(() => {
    if (data && visibleCount < data.blocks.length) {
      setVisibleCount((c) => Math.min(c + CHUNK_SIZE, data.blocks.length))
    }
  }, [data, visibleCount])

  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[10px] text-text-muted">Loading conversation...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[10px] text-danger">Error: {error}</div>
      </div>
    )
  }

  if (!data || data.blocks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[10px] text-text-muted">No conversation data found.</div>
      </div>
    )
  }

  const visibleBlocks = data.blocks.slice(0, visibleCount)

  // Build entries with time gap indicators
  const entries: { type: 'block' | 'gap'; block?: TimelineBlock; gapMs?: number; timestamp?: string; key: string }[] = []

  for (let i = 0; i < visibleBlocks.length; i++) {
    const block = visibleBlocks[i]

    // Insert time gap indicator
    if (i > 0) {
      const prev = visibleBlocks[i - 1]
      const prevTime = new Date(prev.timestamp).getTime()
      const currTime = new Date(block.timestamp).getTime()
      const gap = currTime - prevTime
      if (gap > GAP_THRESHOLD_MS && !isNaN(gap)) {
        entries.push({
          type: 'gap',
          gapMs: gap,
          timestamp: block.timestamp,
          key: `gap-${i}`,
        })
      }
    }

    entries.push({ type: 'block', block, key: block.id })
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      {/* Header stats */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-3 text-[8px] text-text-muted">
        <span>{data.blocks.length} blocks</span>
        <span>{data.blocks.filter((b) => b.type === 'user-prompt').length} prompts</span>
        <span>{data.blocks.filter((b) => b.type === 'tool-use').length} tool calls</span>
        {data.subagents.length > 0 && (
          <span className="text-secondary">{data.subagents.length} subagents</span>
        )}
      </div>

      {/* Timeline entries */}
      <div className="py-1">
        {entries.map((entry) =>
          entry.type === 'gap' ? (
            <TimeGapIndicator
              key={entry.key}
              timestamp={entry.timestamp!}
              gapMs={entry.gapMs!}
            />
          ) : (
            <TimelineEntry key={entry.key} block={entry.block!} />
          ),
        )}
      </div>

      {/* Load more sentinel */}
      {visibleCount < data.blocks.length && (
        <div ref={sentinelRef} className="py-4 text-center text-[9px] text-text-muted">
          Loading more... ({visibleCount}/{data.blocks.length})
        </div>
      )}

      {/* End marker */}
      {visibleCount >= data.blocks.length && (
        <div className="py-4 text-center text-[8px] text-text-muted">
          &mdash; end of conversation &mdash;
        </div>
      )}
    </div>
  )
}
