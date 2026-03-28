import { useState } from 'react'

interface Props {
  text: string
}

const COLLAPSE_THRESHOLD = 500

export default function AssistantTextBlock({ text }: Props) {
  const [expanded, setExpanded] = useState(text.length <= COLLAPSE_THRESHOLD)
  const displayText = expanded ? text : text.slice(0, COLLAPSE_THRESHOLD)

  return (
    <div className="mx-2 my-0.5 rounded" style={{ borderLeft: '2px solid var(--color-secondary)', background: 'rgba(0,229,255,0.03)' }}>
      <div className="px-3 py-2">
        <span className="text-[8px] font-semibold tracking-wider text-secondary uppercase">Claude</span>
        <div className="text-[10px] text-text leading-relaxed mt-1 whitespace-pre-wrap break-words">
          {displayText}
          {!expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-secondary text-[9px] ml-1 hover:underline"
            >
              show more...
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
