import fs from 'fs'
import path from 'path'
import os from 'os'
import type {
  RawMessage,
  SessionSummary,
  ProjectSummary,
  DailyActivity,
  HourlyActivity,
  DashboardData,
  ToolCallSummary,
} from '../shared/types.js'

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n')
  }
  return ''
}

function truncate(s: string, maxLen = 200): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen) + '…'
}

function parseJSONLFile(filePath: string): RawMessage[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n').filter((l) => l.trim())
    const messages: RawMessage[] = []
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line))
      } catch {
        // skip malformed lines
      }
    }
    return messages
  } catch {
    return []
  }
}

function buildSessionSummary(
  sessionId: string,
  projectPath: string,
  messages: RawMessage[],
): SessionSummary | null {
  if (messages.length === 0) return null

  const userMessages = messages.filter(
    (m) => m.type === 'user' || (m.type === 'message' && m.role === 'user'),
  )
  const assistantMessages = messages.filter(
    (m) => m.type === 'assistant' || (m.type === 'message' && m.role === 'assistant'),
  )

  if (userMessages.length === 0 && assistantMessages.length === 0) return null

  // Extract timestamps
  const timestamps = messages
    .map((m) => new Date(m.timestamp).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b)

  if (timestamps.length === 0) return null

  const startTime = new Date(timestamps[0]).toISOString()
  const endTime = new Date(timestamps[timestamps.length - 1]).toISOString()
  const durationMs = timestamps[timestamps.length - 1] - timestamps[0]

  // Extract token usage from assistant messages
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let totalCacheCreateTokens = 0
  let model = 'unknown'

  const toolCallMap = new Map<string, number>()

  for (const msg of assistantMessages) {
    const apiMsg = msg.message
    if (apiMsg?.usage) {
      totalInputTokens += apiMsg.usage.input_tokens || 0
      totalOutputTokens += apiMsg.usage.output_tokens || 0
      totalCacheReadTokens += apiMsg.usage.cache_read_input_tokens || 0
      totalCacheCreateTokens += apiMsg.usage.cache_creation_input_tokens || 0
    }
    if (apiMsg?.model) model = apiMsg.model
    // Count tool calls
    if (apiMsg?.content) {
      for (const block of apiMsg.content) {
        if (block.type === 'tool_use') {
          const name = (block as any).name || 'unknown'
          toolCallMap.set(name, (toolCallMap.get(name) || 0) + 1)
        }
      }
    }
  }

  // Extract first/last user prompts
  const firstUserMsg = userMessages[0]
  const lastUserMsg = userMessages[userMessages.length - 1]
  const lastAssistantMsg = assistantMessages[assistantMessages.length - 1]

  const firstUserPrompt = truncate(
    extractText(firstUserMsg?.message?.content || firstUserMsg?.content || ''),
  )
  const lastUserPrompt = truncate(
    extractText(lastUserMsg?.message?.content || lastUserMsg?.content || ''),
  )
  const lastAssistantResponse = truncate(
    extractText(lastAssistantMsg?.message?.content || lastAssistantMsg?.content || ''),
  )

  const toolCalls: ToolCallSummary[] = Array.from(toolCallMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // Decode project name from directory
  const projectName = decodeProjectPath(path.basename(projectPath))

  // Count subagent files
  const subagentDir = path.join(projectPath, sessionId, 'subagents')
  let subagentCount = 0
  try {
    subagentCount = fs.readdirSync(subagentDir).filter((f) => f.endsWith('.jsonl')).length
  } catch {
    // no subagents dir
  }

  return {
    id: sessionId,
    projectPath,
    projectName,
    startTime,
    endTime,
    durationMs,
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheCreateTokens,
    model,
    gitBranch: messages.find((m) => m.gitBranch)?.gitBranch,
    firstUserPrompt,
    lastUserPrompt,
    lastAssistantResponse,
    toolCalls,
    subagentCount,
  }
}

function decodeProjectPath(encoded: string): string {
  // "-Users-Kunal-Documents-workspace-foo" -> "foo"
  const parts = encoded.split('-').filter(Boolean)
  return parts[parts.length - 1] || encoded
}

export function scanAllSessions(): DashboardData {
  const sessions: SessionSummary[] = []
  const projectMap = new Map<string, ProjectSummary>()
  const dailyMap = new Map<string, DailyActivity>()
  const hourlyMap = new Map<string, HourlyActivity>()

  let totalTokens = 0
  let totalMessages = 0
  let firstSessionDate = ''
  const modelUsage: Record<string, { inputTokens: number; outputTokens: number }> = {}

  // Scan project directories
  let projectDirs: string[] = []
  try {
    projectDirs = fs
      .readdirSync(PROJECTS_DIR)
      .map((d) => path.join(PROJECTS_DIR, d))
      .filter((d) => fs.statSync(d).isDirectory())
  } catch {
    return emptyDashboard()
  }

  for (const projectDir of projectDirs) {
    const projectName = decodeProjectPath(path.basename(projectDir))
    const project: ProjectSummary = {
      path: projectDir,
      name: projectName,
      sessionCount: 0,
      totalTokens: 0,
      totalMessages: 0,
      lastActiveTime: '',
      sessions: [],
    }

    // Find session JSONL files (direct children, not in subagents/)
    let sessionFiles: string[] = []
    try {
      sessionFiles = fs
        .readdirSync(projectDir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => path.join(projectDir, f))
    } catch {
      continue
    }

    for (const sessionFile of sessionFiles) {
      const sessionId = path.basename(sessionFile, '.jsonl')
      const messages = parseJSONLFile(sessionFile)
      const summary = buildSessionSummary(sessionId, projectDir, messages)
      if (!summary) continue

      sessions.push(summary)
      project.sessions.push(summary)
      project.sessionCount++
      const sessionTokens =
        summary.totalInputTokens +
        summary.totalOutputTokens +
        summary.totalCacheReadTokens +
        summary.totalCacheCreateTokens
      project.totalTokens += sessionTokens
      project.totalMessages += summary.messageCount

      if (!project.lastActiveTime || summary.endTime > project.lastActiveTime) {
        project.lastActiveTime = summary.endTime
      }

      // Aggregate daily/hourly
      const date = summary.startTime.slice(0, 10)
      const startDate = new Date(summary.startTime)
      const hour = startDate.getHours()
      const dayOfWeek = startDate.getDay()

      const daily = dailyMap.get(date) || {
        date,
        messageCount: 0,
        sessionCount: 0,
        toolCallCount: 0,
        tokensByModel: {},
      }
      daily.messageCount += summary.messageCount
      daily.sessionCount++
      daily.toolCallCount += summary.toolCalls.reduce((s, t) => s + t.count, 0)
      daily.tokensByModel[summary.model] =
        (daily.tokensByModel[summary.model] || 0) + sessionTokens
      dailyMap.set(date, daily)

      const hourKey = `${dayOfWeek}-${hour}`
      const hourly = hourlyMap.get(hourKey) || {
        hour,
        dayOfWeek,
        messageCount: 0,
        tokenCount: 0,
      }
      hourly.messageCount += summary.messageCount
      hourly.tokenCount += sessionTokens
      hourlyMap.set(hourKey, hourly)

      // Global stats
      totalTokens += sessionTokens
      totalMessages += summary.messageCount
      if (!firstSessionDate || summary.startTime < firstSessionDate) {
        firstSessionDate = summary.startTime
      }
      if (!modelUsage[summary.model]) {
        modelUsage[summary.model] = { inputTokens: 0, outputTokens: 0 }
      }
      modelUsage[summary.model].inputTokens += summary.totalInputTokens
      modelUsage[summary.model].outputTokens += summary.totalOutputTokens
    }

    if (project.sessionCount > 0) {
      projectMap.set(projectDir, project)
    }
  }

  // Sort sessions by start time descending
  sessions.sort((a, b) => b.startTime.localeCompare(a.startTime))

  return {
    projects: Array.from(projectMap.values()).sort((a, b) =>
      b.lastActiveTime.localeCompare(a.lastActiveTime),
    ),
    sessions,
    dailyActivity: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    hourlyActivity: Array.from(hourlyMap.values()),
    totalStats: {
      sessions: sessions.length,
      messages: totalMessages,
      tokens: totalTokens,
      projects: projectMap.size,
      firstSessionDate,
      models: modelUsage,
    },
  }
}

export function scanSingleSession(filePath: string): SessionSummary | null {
  const projectDir = path.dirname(filePath)
  const sessionId = path.basename(filePath, '.jsonl')
  const messages = parseJSONLFile(filePath)
  return buildSessionSummary(sessionId, projectDir, messages)
}

function emptyDashboard(): DashboardData {
  return {
    projects: [],
    sessions: [],
    dailyActivity: [],
    hourlyActivity: [],
    totalStats: {
      sessions: 0,
      messages: 0,
      tokens: 0,
      projects: 0,
      firstSessionDate: '',
      models: {},
    },
  }
}
