import { useState } from 'react'

interface Props {
  content: string
  isError: boolean
}

export default function ToolResultBlock({ content, isError }: Props) {
  const [expanded, setExpanded] = useState(false)
  const firstLine = content.split('\n')[0]?.slice(0, 80) || '(empty)'

  return (
    <div
      className="mx-2 -mt-0.5 mb-0.5 rounded cursor-pointer"
      style={{
        background: isError ? 'rgba(255,68,102,0.06)' : 'rgba(8,8,12,0.5)',
        borderLeft: `2px solid ${isError ? 'rgba(255,68,102,0.4)' : 'rgba(255,180,50,0.08)'}`,
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-1">
        <div className="flex items-center gap-2">
          <span className={`text-[8px] tracking-wider ${isError ? 'text-danger' : 'text-text-muted'}`}>
            {isError ? 'ERROR' : 'RESULT'}
          </span>
          {!expanded && (
            <span className="text-[8px] text-text-muted truncate flex-1 font-mono">{firstLine}</span>
          )}
          <span className="text-[8px] text-text-muted flex-shrink-0">
            {expanded ? '&#9660;' : '&#9654;'}
          </span>
        </div>
        {expanded && (
          <pre
            className="mt-1 text-[8px] text-text-muted leading-relaxed overflow-x-auto overflow-y-auto rounded p-2"
            style={{ maxHeight: '150px', background: 'rgba(0,0,0,0.3)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
          >
            {content}
          </pre>
        )}
      </div>
    </div>
  )
}
