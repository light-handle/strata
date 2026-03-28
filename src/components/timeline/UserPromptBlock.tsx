import { formatTime } from '../../lib/format'

interface Props {
  text: string
  timestamp: string
}

export default function UserPromptBlock({ text, timestamp }: Props) {
  return (
    <div className="mx-2 my-1 rounded" style={{ borderLeft: '2px solid var(--color-primary)', background: 'rgba(255,180,50,0.04)' }}>
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] font-semibold tracking-wider text-primary uppercase">User</span>
          <span className="text-[7px] text-text-muted">{formatTime(timestamp)}</span>
        </div>
        <div className="text-[10px] text-text-bright leading-relaxed whitespace-pre-wrap break-words">
          {text}
        </div>
      </div>
    </div>
  )
}
