import { formatTime } from '../../lib/format'

interface Props {
  timestamp: string
  gapMs: number
}

export default function TimeGapIndicator({ timestamp, gapMs }: Props) {
  const gapText =
    gapMs < 60_000 ? `${Math.round(gapMs / 1000)}s`
    : gapMs < 3_600_000 ? `${Math.round(gapMs / 60_000)}m`
    : `${Math.floor(gapMs / 3_600_000)}h ${Math.round((gapMs % 3_600_000) / 60_000)}m`

  return (
    <div className="flex items-center gap-2 py-1.5 px-2">
      <div className="flex-1 h-px" style={{ background: 'rgba(255,180,50,0.1)' }} />
      <span className="text-[8px] text-text-muted tracking-wider flex-shrink-0">
        {formatTime(timestamp)} &middot; {gapText} gap
      </span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,180,50,0.1)' }} />
    </div>
  )
}
