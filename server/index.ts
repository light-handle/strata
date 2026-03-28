import fs from 'fs'
import express from 'express'
import cors from 'cors'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { execSync } from 'child_process'
import path from 'path'
import os from 'os'
import { watch } from 'chokidar'
import { scanAllSessions, scanSingleSession, parseJSONLFile } from './scanner.js'
import type { WSEvent, DashboardData, TimelineBlock, TimelineResponse, SubagentInfo } from '../shared/types.js'

const PORT = 3141
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')

const app = express()
app.use(cors())
app.use(express.json())

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

// ── In-memory cache ──
let dashboardData: DashboardData = scanAllSessions()
console.log(
  `[scanner] Loaded ${dashboardData.sessions.length} sessions across ${dashboardData.projects.length} projects`,
)

// ── REST API ──

app.get('/api/dashboard', (_req, res) => {
  res.json(dashboardData)
})

app.get('/api/sessions', (_req, res) => {
  res.json(dashboardData.sessions)
})

app.get('/api/projects', (_req, res) => {
  res.json(dashboardData.projects)
})

app.get('/api/sessions/:id', (req, res) => {
  const session = dashboardData.sessions.find((s) => s.id === req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  res.json(session)
})

// Resume a session — launches terminal
app.post('/api/sessions/:id/resume', (req, res) => {
  const session = dashboardData.sessions.find((s) => s.id === req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })

  const cmd = `claude --resume ${session.id}`

  // Decode project path: "-Users-Kunal-Documents-workspace-foo" → "/Users/Kunal/Documents/workspace/foo"
  const encoded = path.basename(session.projectPath)
  const cwd = '/' + encoded.split('-').filter(Boolean).join('/')

  try {
    // macOS: open new Terminal window with the command
    const escapedCwd = cwd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const script = `tell application "Terminal" to do script "cd \\"${escapedCwd}\\" && ${cmd}"`
    execSync(`osascript -e '${script}'`)
    res.json({ success: true, command: cmd, cwd })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Session messages (full conversation timeline) ──

// ── Shared: build timeline blocks from raw messages ──

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
  }
  return ''
}

function buildTimelineBlocks(raw: import('../shared/types.js').RawMessage[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = []
  const RESULT_MAX = 2000
  const truncate = (s: string, max: number) =>
    s.length > max ? s.slice(0, max) + '\n... (truncated)' : s

  for (const msg of raw) {
    const ts = msg.timestamp || ''
    const id = msg.uuid || ''

    if (['file-history-snapshot', 'queue-operation', 'progress'].includes(msg.type)) continue

    if (msg.type === 'system') {
      blocks.push({ id, timestamp: ts, type: 'system', systemSubtype: msg.subtype || '', text: typeof msg.content === 'string' ? msg.content.slice(0, 500) : '' })
      continue
    }

    if (msg.type === 'user') {
      const apiMsg = msg.message
      if (apiMsg?.content) {
        if (Array.isArray(apiMsg.content)) {
          const textParts: string[] = []
          for (const block of apiMsg.content) {
            if ((block as any).type === 'text') {
              textParts.push((block as any).text || '')
            } else if ((block as any).type === 'tool_result') {
              const rc = (block as any).content
              let resultText = ''
              if (typeof rc === 'string') resultText = rc
              else if (Array.isArray(rc)) resultText = rc.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
              blocks.push({ id: id + '-tr-' + (block as any).tool_use_id, timestamp: ts, type: 'tool-result', toolResultForId: (block as any).tool_use_id || '', toolResultContent: truncate(resultText, RESULT_MAX), toolResultIsError: (block as any).is_error === true })
            }
          }
          if (textParts.length > 0) blocks.push({ id, timestamp: ts, type: 'user-prompt', text: textParts.join('\n') })
        } else if (typeof apiMsg.content === 'string') {
          blocks.push({ id, timestamp: ts, type: 'user-prompt', text: apiMsg.content })
        }
      } else if (typeof msg.content === 'string') {
        blocks.push({ id, timestamp: ts, type: 'user-prompt', text: msg.content })
      }
      continue
    }

    if (msg.type === 'assistant') {
      const apiMsg = msg.message
      if (apiMsg?.content && Array.isArray(apiMsg.content)) {
        for (const block of apiMsg.content) {
          const bType = (block as any).type
          if (bType === 'thinking') blocks.push({ id: id + '-think', timestamp: ts, type: 'thinking', thinkingText: (block as any).thinking || '' })
          else if (bType === 'text') blocks.push({ id: id + '-text', timestamp: ts, type: 'text', text: (block as any).text || '' })
          else if (bType === 'tool_use') blocks.push({ id: id + '-tool-' + ((block as any).id || ''), timestamp: ts, type: 'tool-use', toolName: (block as any).name || 'unknown', toolInput: (block as any).input || {}, toolUseId: (block as any).id || '' })
        }
      }
      continue
    }
  }

  return blocks
}

function scanSubagents(projectPath: string, sessionId: string): { subagents: SubagentInfo[]; blocks: TimelineBlock[] } {
  const subagents: SubagentInfo[] = []
  const blocks: TimelineBlock[] = []
  const subagentDir = path.join(projectPath, sessionId, 'subagents')
  try {
    const files = fs.readdirSync(subagentDir)
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const agentId = file.replace('.jsonl', '')
      const metaPath = path.join(subagentDir, agentId + '.meta.json')
      let agentType = 'general-purpose'
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        agentType = meta.agentType || agentType
      } catch {}
      const agentMessages = parseJSONLFile(path.join(subagentDir, file))
      subagents.push({ agentId, agentType, messageCount: agentMessages.length })
      const firstMsg = agentMessages[0]
      if (firstMsg) {
        const prompt = extractText(firstMsg.message?.content || firstMsg.content || '')
        blocks.push({ id: 'subagent-' + agentId, timestamp: firstMsg.timestamp || '', type: 'subagent', subagentId: agentId, subagentType: agentType, subagentPrompt: prompt.slice(0, 300) })
      }
    }
  } catch {}
  return { subagents, blocks }
}

// ── Session messages endpoint ──

app.get('/api/sessions/:id/messages', (req, res) => {
  const session = dashboardData.sessions.find((s) => s.id === req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })

  const raw = parseJSONLFile(path.join(session.projectPath, session.id + '.jsonl'))
  const blocks = buildTimelineBlocks(raw)
  const { subagents, blocks: subagentBlocks } = scanSubagents(session.projectPath, session.id)
  blocks.push(...subagentBlocks)
  blocks.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  res.json({ sessionId: session.id, blocks, subagents, totalRawMessages: raw.length } as TimelineResponse)
})

// ── Subagent messages endpoint ──

app.get('/api/sessions/:sessionId/subagents/:agentId/messages', (req, res) => {
  const session = dashboardData.sessions.find((s) => s.id === req.params.sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found' })

  const filePath = path.join(session.projectPath, session.id, 'subagents', req.params.agentId + '.jsonl')
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Subagent not found' })

  const raw = parseJSONLFile(filePath)
  const blocks = buildTimelineBlocks(raw)
  blocks.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  res.json({ sessionId: req.params.sessionId, blocks, subagents: [], totalRawMessages: raw.length } as TimelineResponse)
})

// ── WebSocket ──

const clients = new Set<WebSocket>()

wss.on('connection', (ws) => {
  clients.add(ws)
  const event: WSEvent = { type: 'initial', data: dashboardData }
  ws.send(JSON.stringify(event))

  ws.on('close', () => clients.delete(ws))
})

function broadcast(event: WSEvent) {
  const data = JSON.stringify(event)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  }
}

// ── File watcher ──

const watcher = watch(CLAUDE_PROJECTS_DIR, {
  ignoreInitial: true,
  depth: 2,
  // Only watch JSONL files, not subagent dirs
  ignored: [/subagents/, /memory/, /node_modules/],
})

// Debounce rescans per file
const pendingScans = new Map<string, NodeJS.Timeout>()

function handleFileChange(filePath: string) {
  if (!filePath.endsWith('.jsonl')) return

  // Debounce: wait 500ms after last change
  const existing = pendingScans.get(filePath)
  if (existing) clearTimeout(existing)

  pendingScans.set(
    filePath,
    setTimeout(() => {
      pendingScans.delete(filePath)
      const updated = scanSingleSession(filePath)
      if (!updated) return

      // Update in cache
      const idx = dashboardData.sessions.findIndex((s) => s.id === updated.id)
      if (idx >= 0) {
        dashboardData.sessions[idx] = updated
        broadcast({ type: 'session-update', data: updated })
      } else {
        dashboardData.sessions.unshift(updated)
        broadcast({ type: 'new-session', data: updated })
      }

      // Rebuild project aggregation
      dashboardData = scanAllSessions()
      broadcast({ type: 'stats-update', data: dashboardData.totalStats })

      console.log(`[watcher] Updated session ${updated.id} (${updated.projectName})`)
    }, 500),
  )
}

watcher.on('add', handleFileChange)
watcher.on('change', handleFileChange)

// ── Start ──

server.listen(PORT, () => {
  console.log(`[server] ClaudeViewer running at http://localhost:${PORT}`)
  console.log(`[server] WebSocket on ws://localhost:${PORT}`)
  console.log(`[server] Watching ${CLAUDE_PROJECTS_DIR}`)
})
