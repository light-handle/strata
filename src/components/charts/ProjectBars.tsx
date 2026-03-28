import type { ProjectSummary } from '../../../shared/types'
import { formatTokens } from '../../lib/format'

interface Props {
  projects: ProjectSummary[]
}

export default function ProjectBars({ projects }: Props) {
  const sorted = [...projects].sort((a, b) => b.totalTokens - a.totalTokens)
  const maxTokens = sorted[0]?.totalTokens || 1

  return (
    <div className="space-y-1.5 overflow-y-auto h-full">
      {sorted.map((project) => {
        const pct = (project.totalTokens / maxTokens) * 100
        return (
          <div key={project.path} className="group">
            <div className="flex items-center justify-between text-[9px] mb-0.5">
              <span className="text-text-bright truncate max-w-[160px]">{project.name}</span>
              <span className="text-text-muted">{formatTokens(project.totalTokens)}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,180,50,0.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-300 group-hover:opacity-100 opacity-75"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, #ffb832, #ff6600)',
                }}
              />
            </div>
            <div className="text-[8px] text-text-muted mt-0.5">
              {project.sessionCount} sessions · {project.totalMessages} messages
            </div>
          </div>
        )
      })}
    </div>
  )
}
