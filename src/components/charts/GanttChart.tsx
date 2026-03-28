import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import type { ToolExecution } from '../../../shared/types'

interface Props {
  executions: ToolExecution[]
  onClose: () => void
}

const TOOL_COLORS: Record<string, string> = {
  Bash: '#ff8800',
  Read: '#00cc88',
  Write: '#00aaff',
  Edit: '#ccaa00',
  Grep: '#cc66aa',
  Glob: '#66aacc',
  Agent: '#ff6666',
  WebSearch: '#aa66ff',
  WebFetch: '#66aaaa',
}

function getColor(name: string): string {
  return TOOL_COLORS[name] || '#888888'
}

function getInputPreview(name: string, input?: Record<string, unknown>): string {
  if (!input) return ''
  switch (name) {
    case 'Bash': return String(input.command || '').slice(0, 120)
    case 'Read': case 'Write': case 'Edit':
      return String(input.file_path || '').split('/').slice(-3).join('/')
    case 'Grep': return `/${String(input.pattern || '')}/`
    case 'Glob': return String(input.pattern || '')
    case 'Agent': return String(input.prompt || '').slice(0, 100)
    default: {
      const first = Object.values(input)[0]
      return typeof first === 'string' ? first.slice(0, 80) : ''
    }
  }
}

function formatDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/** Greedy row assignment for parallel tools */
function assignRows(execs: ToolExecution[]): ToolExecution[] {
  const sorted = [...execs].sort((a, b) => a.startTime.localeCompare(b.startTime))
  const rowEnds: number[] = []

  for (const exec of sorted) {
    const startMs = new Date(exec.startTime).getTime()
    let assigned = false
    for (let r = 0; r < rowEnds.length; r++) {
      if (rowEnds[r] <= startMs) {
        exec.row = r
        rowEnds[r] = new Date(exec.endTime).getTime()
        assigned = true
        break
      }
    }
    if (!assigned) {
      exec.row = rowEnds.length
      rowEnds.push(new Date(exec.endTime).getTime())
    }
  }

  return sorted
}

export default function GanttChart({ executions, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; exec: ToolExecution } | null>(null)
  const [selectedExec, setSelectedExec] = useState<ToolExecution | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || executions.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const assigned = assignRows(executions)
    const numRows = Math.max(...assigned.map((e) => (e.row || 0) + 1), 1)

    const containerWidth = containerRef.current.clientWidth
    const margin = { top: 36, right: 20, bottom: 20, left: 20 }
    const rowHeight = 30
    const rowGap = 4
    const innerW = containerWidth - margin.left - margin.right
    const innerH = numRows * (rowHeight + rowGap)
    const totalH = Math.max(innerH + margin.top + margin.bottom, 150)

    svg.attr('width', containerWidth).attr('height', totalH)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Time scale
    const times = assigned.flatMap((e) => [new Date(e.startTime), new Date(e.endTime)])
    const timeExtent = d3.extent(times) as [Date, Date]
    const span = timeExtent[1].getTime() - timeExtent[0].getTime()
    const padded: [Date, Date] = [
      new Date(timeExtent[0].getTime() - span * 0.02),
      new Date(timeExtent[1].getTime() + span * 0.02),
    ]
    const x = d3.scaleTime().domain(padded).range([0, innerW])

    // Time axis
    const xAxis = d3.axisTop(x)
      .ticks(Math.min(12, Math.floor(innerW / 90)))
      .tickFormat(d3.timeFormat('%H:%M:%S') as any)
      .tickSize(-innerH)

    g.append('g')
      .call(xAxis)
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line')
        .attr('stroke', 'rgba(255,180,50,0.08)')
        .attr('stroke-dasharray', '2,4'))
      .call((g) => g.selectAll('.tick text')
        .attr('fill', '#8890a0')
        .attr('font-size', 12)
        .attr('font-family', 'JetBrains Mono, monospace'))

    // Row stripes
    for (let r = 0; r < numRows; r++) {
      if (r % 2 === 1) {
        g.append('rect')
          .attr('x', 0)
          .attr('y', r * (rowHeight + rowGap))
          .attr('width', innerW)
          .attr('height', rowHeight + rowGap)
          .attr('fill', 'rgba(255,180,50,0.02)')
      }
    }

    // Bars
    const bars = g.selectAll('.bar')
      .data(assigned)
      .join('g')
      .attr('class', 'bar')
      .attr('transform', (d) => `translate(0, ${(d.row || 0) * (rowHeight + rowGap)})`)

    bars.append('rect')
      .attr('x', (d) => x(new Date(d.startTime)))
      .attr('width', (d) => Math.max(4, x(new Date(d.endTime)) - x(new Date(d.startTime))))
      .attr('height', rowHeight)
      .attr('rx', 4)
      .attr('fill', (d) => getColor(d.toolName))
      .attr('opacity', 0.8)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1).attr('stroke', '#eef0f8').attr('stroke-width', 1.5)
        const rect = containerRef.current!.getBoundingClientRect()
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          exec: d,
        })
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 0.8).attr('stroke', 'none')
        setTooltip(null)
      })
      .on('click', function (_, d) {
        setSelectedExec(selectedExec?.toolUseId === d.toolUseId ? null : d)
      })

    // Label inside bar
    bars.append('text')
      .attr('x', (d) => x(new Date(d.startTime)) + 8)
      .attr('y', rowHeight / 2)
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 12)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-weight', 500)
      .attr('fill', '#ffffff')
      .attr('pointer-events', 'none')
      .text((d) => {
        const barWidth = x(new Date(d.endTime)) - x(new Date(d.startTime))
        if (barWidth < 28) return ''
        if (barWidth < 60) return d.toolName
        if (barWidth < 120) return `${d.toolName}  ${formatDur(d.durationMs)}`
        const preview = getInputPreview(d.toolName, d.toolInput)
        const label = `${d.toolName}  ${formatDur(d.durationMs)}`
        const maxChars = Math.floor((barWidth - 16) / 7)
        if (preview && maxChars > label.length + 4) {
          return `${label}  ${preview.slice(0, maxChars - label.length - 3)}`
        }
        return label
      })
      .each(function (d) {
        const barWidth = x(new Date(d.endTime)) - x(new Date(d.startTime))
        const textEl = d3.select(this)
        const textNode = textEl.node() as SVGTextElement
        if (textNode.getComputedTextLength() > barWidth - 12) {
          let t = textEl.text()
          while (t.length > 0 && textNode.getComputedTextLength() > barWidth - 16) {
            t = t.slice(0, -1)
            textEl.text(t + '...')
          }
        }
      })

  }, [executions, selectedExec])

  if (executions.length === 0) return null

  const toolNames = [...new Set(executions.map((e) => e.toolName))]
  const totalDuration = executions.reduce((s, e) => s + e.durationMs, 0)
  const maxParallel = Math.max(...assignRows([...executions]).map((e) => (e.row || 0) + 1), 1)

  return (
    <div
      className="fixed inset-0 z-[90] cmd-backdrop flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="glass-panel rounded-lg overflow-hidden shadow-2xl flex flex-col"
        style={{
          width: '88vw',
          maxWidth: '1400px',
          maxHeight: '85vh',
          border: '1px solid rgba(255,180,50,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-5">
            <h2 className="text-[14px] font-bold tracking-[0.12em] uppercase text-text-bright">
              Tool Execution Timeline
            </h2>
            <div className="flex items-center gap-5 text-[13px]">
              <span className="text-text-muted">
                <span className="text-primary font-semibold">{executions.length}</span> tool calls
              </span>
              <span className="text-text-muted">
                <span className="text-primary font-semibold">{formatDur(totalDuration)}</span> total
              </span>
              <span className="text-text-muted">
                <span className="text-secondary font-semibold">{maxParallel}</span> max parallel
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="kbd" style={{ fontSize: '11px', padding: '2px 8px' }}>esc</span>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text transition-colors text-lg"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 py-3 border-b border-border flex items-center gap-5 flex-shrink-0 flex-wrap">
          {toolNames.map((name) => {
            const count = executions.filter((e) => e.toolName === name).length
            const dur = executions.filter((e) => e.toolName === name).reduce((s, e) => s + e.durationMs, 0)
            return (
              <div key={name} className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded" style={{ background: getColor(name) }} />
                <span className="text-[13px] text-text-bright font-medium">{name}</span>
                <span className="text-[12px] text-text-muted">
                  {count} &middot; {formatDur(dur)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Chart area */}
        <div className="flex-1 overflow-auto min-h-0">
          <div ref={containerRef} className="relative p-3 min-h-full">
            <svg ref={svgRef} />

            {/* Tooltip */}
            {tooltip && (
              <div
                className="absolute z-50 pointer-events-none rounded-lg px-4 py-3"
                style={{
                  left: Math.min(tooltip.x + 16, (containerRef.current?.clientWidth || 600) - 320),
                  top: tooltip.y + 24,
                  background: 'rgba(12,14,22,0.95)',
                  border: '1px solid rgba(255,180,50,0.3)',
                  maxWidth: '320px',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-3 h-3 rounded" style={{ background: getColor(tooltip.exec.toolName) }} />
                  <span className="text-[14px] text-text-bright font-semibold">{tooltip.exec.toolName}</span>
                  <span className="text-[13px] text-primary ml-auto font-semibold">{formatDur(tooltip.exec.durationMs)}</span>
                </div>
                <div className="text-[12px] text-text font-mono leading-relaxed break-all">
                  {getInputPreview(tooltip.exec.toolName, tooltip.exec.toolInput)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected tool detail panel */}
        {selectedExec && (
          <div className="border-t border-border px-6 py-4 flex-shrink-0 max-h-[240px] overflow-y-auto">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3.5 h-3.5 rounded" style={{ background: getColor(selectedExec.toolName) }} />
              <span className="text-[14px] text-text-bright font-semibold">{selectedExec.toolName}</span>
              <span className="text-[13px] text-primary font-medium">{formatDur(selectedExec.durationMs)}</span>
              <button
                onClick={() => setSelectedExec(null)}
                className="text-text-muted hover:text-text ml-auto text-base"
              >
                &times;
              </button>
            </div>
            <pre
              className="text-[12px] text-text leading-relaxed rounded-lg p-4 overflow-auto"
              style={{ background: 'rgba(0,0,0,0.4)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '160px' }}
            >
              {JSON.stringify(selectedExec.toolInput, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
