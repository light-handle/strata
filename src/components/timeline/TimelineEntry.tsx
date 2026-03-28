import { memo } from 'react'
import type { TimelineBlock } from '../../../shared/types'
import UserPromptBlock from './UserPromptBlock'
import AssistantTextBlock from './AssistantTextBlock'
import ThinkingBlock from './ThinkingBlock'
import ToolCallCard from './ToolCallCard'
import ToolResultBlock from './ToolResultBlock'
import SubagentBlock from './SubagentBlock'

interface Props {
  block: TimelineBlock
}

function TimelineEntry({ block }: Props) {
  switch (block.type) {
    case 'user-prompt':
      return <UserPromptBlock text={block.text || ''} timestamp={block.timestamp} />

    case 'text':
      return <AssistantTextBlock text={block.text || ''} />

    case 'thinking':
      return <ThinkingBlock text={block.thinkingText || ''} />

    case 'tool-use':
      return (
        <ToolCallCard
          toolName={block.toolName || 'unknown'}
          toolInput={block.toolInput || {}}
          toolUseId={block.toolUseId || ''}
        />
      )

    case 'tool-result':
      return (
        <ToolResultBlock
          content={block.toolResultContent || ''}
          isError={block.toolResultIsError || false}
        />
      )

    case 'subagent':
      return (
        <SubagentBlock
          agentType={block.subagentType || 'general-purpose'}
          prompt={block.subagentPrompt || ''}
          agentId={block.subagentId || ''}
        />
      )

    case 'system':
      return (
        <div className="mx-2 my-0.5 px-3 py-1 text-[8px] text-text-muted">
          <span className="tracking-wider uppercase">system</span>
          {block.systemSubtype && <span className="ml-1">/ {block.systemSubtype}</span>}
        </div>
      )

    default:
      return null
  }
}

export default memo(TimelineEntry)
