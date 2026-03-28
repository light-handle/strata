import { useMemo } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useKeyboard } from './hooks/useKeyboard'
import { useSessionMessages } from './hooks/useSessionMessages'
import { AppProvider, useAppState, useAppDispatch } from './context/AppContext'
import HUDBar from './components/HUDBar'
import TerrainViewport from './components/terrain/TerrainViewport'
import SessionList from './components/panels/LeftDrawer'
import SessionDetail from './components/panels/RightDrawer'
import BottomTray from './components/panels/BottomTray'
import CommandPalette from './components/CommandPalette'
import GanttChart from './components/charts/GanttChart'
import ConversationModal from './components/timeline/ConversationModal'
import type { ToolExecution } from '../shared/types'

function ChatModal() {
  const { chatModalOpen, selectedSessionId } = useAppState()
  const dispatch = useAppDispatch()

  if (!chatModalOpen || !selectedSessionId) return null

  return <ConversationModal sessionId={selectedSessionId} onClose={() => dispatch({ type: 'CLOSE_CHAT_MODAL' })} />
}

function GanttModal() {
  const { ganttOpen, selectedSessionId } = useAppState()
  const dispatch = useAppDispatch()
  const { data: timelineData, loading: ganttLoading } = useSessionMessages(ganttOpen ? selectedSessionId : null)

  const toolExecutions = useMemo((): ToolExecution[] => {
    if (!timelineData) return []
    const starts = new Map<string, { toolName: string; startTime: string; toolInput?: Record<string, unknown> }>()
    const executions: ToolExecution[] = []

    for (const block of timelineData.blocks) {
      if (block.type === 'tool-use' && block.toolUseId) {
        starts.set(block.toolUseId, {
          toolName: block.toolName || 'unknown',
          startTime: block.timestamp,
          toolInput: block.toolInput,
        })
      }
      if (block.type === 'tool-result' && block.toolResultForId) {
        const start = starts.get(block.toolResultForId)
        if (start) {
          const startMs = new Date(start.startTime).getTime()
          const endMs = new Date(block.timestamp).getTime()
          executions.push({
            toolUseId: block.toolResultForId,
            toolName: start.toolName,
            startTime: start.startTime,
            endTime: block.timestamp,
            durationMs: Math.max(0, endMs - startMs),
            toolInput: start.toolInput,
          })
        }
      }
    }
    return executions
  }, [timelineData])

  if (!ganttOpen) return null

  const handleClose = () => dispatch({ type: 'CLOSE_GANTT' })

  if (ganttLoading || (!timelineData && ganttOpen)) {
    return (
      <div className="fixed inset-0 z-[90] cmd-backdrop flex items-center justify-center" onClick={handleClose}>
        <div className="glass-panel rounded-lg px-8 py-6 text-center" style={{ border: '1px solid rgba(255,180,50,0.2)' }} onClick={(e) => e.stopPropagation()}>
          <div className="text-[14px] text-text-bright mb-2">Loading tool data...</div>
          <div className="text-[11px] text-text-muted">Parsing session messages</div>
        </div>
      </div>
    )
  }

  if (toolExecutions.length === 0) {
    return (
      <div className="fixed inset-0 z-[90] cmd-backdrop flex items-center justify-center" onClick={handleClose}>
        <div className="glass-panel rounded-lg px-8 py-6 text-center" style={{ border: '1px solid rgba(255,180,50,0.2)' }} onClick={(e) => e.stopPropagation()}>
          <div className="text-[14px] text-text-bright mb-2">No tool calls found</div>
          <div className="text-[11px] text-text-muted">This session has no tool executions to visualize.</div>
          <button onClick={handleClose} className="mt-4 pill active">Close</button>
        </div>
      </div>
    )
  }

  return <GanttChart executions={toolExecutions} onClose={handleClose} />
}

function Dashboard() {
  const { data, connected } = useWebSocket()
  useKeyboard()

  if (!data) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <div
            className="text-primary text-lg font-bold tracking-[0.3em] uppercase mb-3"
            style={{ textShadow: '0 0 8px rgba(255,184,50,0.4)' }}
          >
            Strata
          </div>
          <div className="text-text-muted text-[10px] tracking-wider">
            {connected ? 'scanning sessions...' : 'connecting to server...'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <HUDBar stats={data.totalStats} connected={connected} />

      {/* Main layout: 3 columns */}
      <div className="flex-1 flex min-h-0 gap-px p-1 pt-0">
        {/* Left: Sessions list */}
        <div className="w-[320px] flex-shrink-0 min-h-0">
          <SessionList sessions={data.sessions} data={data} />
        </div>

        {/* Center: Terrain + Activity */}
        <div className="flex-1 flex flex-col min-h-0 gap-px">
          <div className="flex-1 min-h-0 glass-panel overflow-hidden relative">
            <div className="glass-panel-header">
              <span>Tactical Terrain</span>
              <span className="count text-[9px]">LMB pan · scroll zoom · RMB tilt</span>
            </div>
            <div className="absolute inset-0 top-[33px] terrain-canvas">
              <TerrainViewport data={data} />
            </div>
          </div>
          <div className="h-[200px] flex-shrink-0">
            <BottomTray data={data} />
          </div>
        </div>

        {/* Right: Session detail */}
        <div className="w-[320px] flex-shrink-0 min-h-0">
          <SessionDetail sessions={data.sessions} projects={data.projects} data={data} />
        </div>
      </div>

    </div>

    {/* Modals — rendered OUTSIDE overflow-hidden container */}
    <CommandPalette sessions={data.sessions} projects={data.projects} />
    <GanttModal />
    <ChatModal />
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  )
}
