import { useState } from 'react'

interface Props {
  text: string
}

export default function ThinkingBlock({ text }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="mx-2 my-0.5 rounded cursor-pointer"
      style={{ borderLeft: '2px solid rgba(136,102,204,0.5)', background: 'rgba(136,102,204,0.04)' }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]">&#129504;</span>
          <span className="text-[8px] font-semibold tracking-wider uppercase" style={{ color: '#8866cc' }}>
            Thinking
          </span>
          <span className="text-[8px] text-text-muted ml-auto">
            {expanded ? '&#9660;' : '&#9654;'} {Math.round(text.length / 4)} words
          </span>
        </div>
        {expanded && (
          <div
            className="mt-1.5 text-[9px] text-text-muted leading-relaxed whitespace-pre-wrap break-words overflow-y-auto"
            style={{ maxHeight: '200px' }}
          >
            {text}
          </div>
        )}
      </div>
    </div>
  )
}
