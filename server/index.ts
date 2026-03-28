import express from 'express'
import cors from 'cors'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { execSync } from 'child_process'
import path from 'path'
import os from 'os'
import { watch } from 'chokidar'
import { scanAllSessions, scanSingleSession } from './scanner.js'
import type { WSEvent, DashboardData } from '../shared/types.js'

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
  const cwd = session.projectPath.includes('projects/')
    ? session.projectPath
    : os.homedir()

  try {
    // macOS: open new Terminal window with the command
    const script = `tell application "Terminal" to do script "cd ${cwd.replace(/'/g, "\\'")} && ${cmd}"`
    execSync(`osascript -e '${script}'`)
    res.json({ success: true, command: cmd })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
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
