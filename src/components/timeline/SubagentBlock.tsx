import { useState } from 'react'

interface Props {
  agentType: string
  prompt: string
  agentId: string
}

export default function SubagentBlock({ agentType, prompt, agentId }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="mx-2 my-1 rounded cursor-pointer"
      style={{ border: '1px dashed rgba(0,229,255,0.25)', background: 'rgba(0,229,255,0.03)' }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px]">&#9881;</span>
          <span className="text-[8px] font-semibold tracking-wider text-secondary uppercase">
            Subagent
          </span>
          <span className="text-[8px] px-1.5 py-0.5 rounded border border-secondary/30 text-secondary">
            {agentType}
          </span>
          <span className="text-[8px] text-text-muted ml-auto">
            {expanded ? '&#9660;' : '&#9654;'}
          </span>
        </div>
        {expanded && (
          <div className="mt-2 space-y-1">
            <div className="text-[9px] text-text leading-relaxed whitespace-pre-wrap break-words">
              {prompt}
            </div>
            <div className="text-[7px] text-text-muted font-mono">{agentId}</div>
          </div>
        )}
        {!expanded && prompt && (
          <div className="text-[9px] text-text-muted mt-1 truncate">{prompt.slice(0, 80)}</div>
        )}
      </div>
    </div>
  )
}
