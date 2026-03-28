import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import type { DashboardData } from '../../../shared/types'

interface Props {
  data: DashboardData
}

export default function ActivityTimeline({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.dailyActivity.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const rect = containerRef.current.getBoundingClientRect()
    const width = rect.width
    const height = rect.height - 4
    const margin = { top: 8, right: 12, bottom: 24, left: 45 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    svg.attr('width', width).attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Prepare stacked data: one layer per project
    const projectNames = [...new Set(data.sessions.map((s) => s.projectName))]
    const daily = data.dailyActivity

    // Build date -> project -> tokens map
    const tokenMap = new Map<string, Record<string, number>>()
    for (const s of data.sessions) {
      const date = s.startTime.slice(0, 10)
      const tokens =
        s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheCreateTokens
      if (!tokenMap.has(date)) tokenMap.set(date, {})
      const m = tokenMap.get(date)!
      m[s.projectName] = (m[s.projectName] || 0) + tokens
    }

    const stackData = daily.map((d) => {
      const entry: Record<string, any> = { date: d.date }
      for (const p of projectNames) {
        entry[p] = tokenMap.get(d.date)?.[p] || 0
      }
      return entry
    })

    const stack = d3.stack<any>().keys(projectNames).order(d3.stackOrderNone).offset(d3.stackOffsetNone)
    const series = stack(stackData)

    // Scales
    const x = d3
      .scaleTime()
      .domain(d3.extent(daily, (d) => new Date(d.date)) as [Date, Date])
      .range([0, innerW])

    const maxY = d3.max(series, (layer) => d3.max(layer, (d) => d[1])) || 1
    const y = d3.scaleLinear().domain([0, maxY]).range([innerH, 0])

    // Color palette: amber variations
    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(projectNames)
      .range(['#ffb832', '#ff8800', '#cc5500', '#ff6644', '#ddaa22', '#ffcc66', '#aa6600'])

    // Area generator
    const area = d3
      .area<any>()
      .x((d) => x(new Date(d.data.date)))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveBasis)

    // Draw layers
    g.selectAll('.layer')
      .data(series)
      .join('path')
      .attr('class', 'layer')
      .attr('d', area)
      .attr('fill', (d) => colorScale(d.key))
      .attr('opacity', 0.6)
      .append('title')
      .text((d) => d.key)

    // Axes
    const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%b %d') as any).tickSize(-innerH)
    const yAxis = d3.axisLeft(y).ticks(4).tickFormat((d) => {
      const n = d as number
      if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`
      if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
      return String(n)
    }).tickSize(-innerW)

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').attr('stroke', 'rgba(255,180,50,0.08)'))
      .call((g) => g.selectAll('.tick text').attr('fill', '#555a6a').attr('font-size', 8).attr('font-family', 'JetBrains Mono'))

    g.append('g')
      .call(yAxis)
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').attr('stroke', 'rgba(255,180,50,0.05)'))
      .call((g) => g.selectAll('.tick text').attr('fill', '#555a6a').attr('font-size', 8).attr('font-family', 'JetBrains Mono'))

    // Hover crosshair
    const crosshair = g.append('line')
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', 'rgba(255,180,50,0.3)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .style('display', 'none')

    const tooltip = g.append('text')
      .attr('fill', '#eef0f8')
      .attr('font-size', 9)
      .attr('font-family', 'JetBrains Mono')
      .style('display', 'none')

    g.append('rect')
      .attr('width', innerW).attr('height', innerH)
      .attr('fill', 'transparent')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event)
        crosshair.attr('x1', mx).attr('x2', mx).style('display', null)
        const date = x.invert(mx)
        const dateStr = d3.timeFormat('%b %d')(date)
        tooltip.attr('x', mx + 5).attr('y', 12).text(dateStr).style('display', null)
      })
      .on('mouseleave', function () {
        crosshair.style('display', 'none')
        tooltip.style('display', 'none')
      })

  }, [data])

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg ref={svgRef} />
    </div>
  )
}
