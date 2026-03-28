import type { DashboardData } from '../../../shared/types'
import ActivityTimeline from '../charts/ActivityTimeline'
import ProjectBars from '../charts/ProjectBars'

interface Props {
  data: DashboardData
}

export default function BottomTray({ data }: Props) {
  return (
    <div className="glass-panel h-full flex flex-col">
      <div className="glass-panel-header">
        <span>Activity</span>
        <span className="count text-[9px]">token usage over time</span>
      </div>

      <div className="flex-1 flex gap-px min-h-0">
        {/* Activity timeline (wider) */}
        <div className="flex-1 p-3 overflow-hidden">
          <ActivityTimeline data={data} />
        </div>

        {/* Project bars (narrower) */}
        <div className="w-[260px] p-3 border-l border-border overflow-hidden">
          <div className="text-[9px] text-text-muted tracking-wider uppercase mb-1.5 font-semibold">
            Projects
          </div>
          <ProjectBars projects={data.projects} />
        </div>
      </div>
    </div>
  )
}
