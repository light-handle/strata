import { useState } from 'react'

interface Props {
  toolName: string
  toolInput: Record<string, unknown>
  toolUseId: string
}

const TOOL_COLORS: Record<string, string> = {
  Bash: '#ff8800',
  Read: '#00cc88',
  Write: '#00aaff',
  Edit: '#ccaa00',
  Grep: '#cc66aa',
  Glob: '#66aacc',
  Agent: '#ff6666',
}

function getKeyPreview(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Bash':
      return String(input.command || '').slice(0, 80)
    case 'Read':
    case 'Write':
    case 'Edit':
      return String(input.file_path || '').split('/').slice(-2).join('/')
    case 'Grep':
      return String(input.pattern || '')
    case 'Glob':
      return String(input.pattern || '')
    case 'Agent':
      return String(input.prompt || '').slice(0, 60)
    default: {
      const first = Object.values(input)[0]
      return typeof first === 'string' ? first.slice(0, 60) : ''
    }
  }
}

export default function ToolCallCard({ toolName, toolInput, toolUseId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_COLORS[toolName] || '#888'
  const preview = getKeyPreview(toolName, toolInput)

  return (
    <div
      className="mx-2 my-0.5 rounded cursor-pointer"
      style={{ background: 'rgba(8,8,12,0.8)', border: '1px solid rgba(255,180,50,0.06)' }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span
            className="text-[8px] font-semibold tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: color + '22', color, border: `1px solid ${color}44` }}
          >
            {toolName}
          </span>
          <span className="text-[9px] text-text-muted truncate flex-1 font-mono">
            {preview}
          </span>
          <span className="text-[8px] text-text-muted flex-shrink-0">
            {expanded ? '&#9660;' : '&#9654;'}
          </span>
        </div>
        {expanded && (
          <pre
            className="mt-1.5 text-[8px] text-text-muted leading-relaxed overflow-x-auto overflow-y-auto rounded p-2"
            style={{ maxHeight: '200px', background: 'rgba(0,0,0,0.3)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
          >
            {JSON.stringify(toolInput, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
