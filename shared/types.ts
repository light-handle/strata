// ── Raw JSONL message types from ~/.claude ──

export interface RawMessage {
  parentUuid: string | null
  isSidechain: boolean
  userType: string
  cwd: string
  sessionId: string
  version: string
  gitBranch?: string
  type: string
  subtype?: string
  role?: string
  message?: APIMessage
  requestId?: string
  uuid: string
  timestamp: string
  isMeta?: boolean
  content?: string
  // file-history-snapshot fields
  messageId?: string
  snapshot?: unknown
  isSnapshotUpdate?: boolean
  // progress fields
  tool?: string
}

export interface APIMessage {
  model: string
  id: string
  type: string
  role: string
  content: MessageContent[]
  stop_reason: string | null
  stop_sequence: string | null
  usage: TokenUsage
}

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string | MessageContent[] }

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  service_tier?: string
}

// ── Processed data types for the dashboard ──

export interface SessionSummary {
  id: string
  projectPath: string
  projectName: string
  startTime: string
  endTime: string
  durationMs: number
  messageCount: number
  userMessageCount: number
  assistantMessageCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreateTokens: number
  model: string
  gitBranch?: string
  firstUserPrompt: string
  lastUserPrompt: string
  lastAssistantResponse: string
  toolCalls: ToolCallSummary[]
  subagentCount: number
}

export interface ToolCallSummary {
  name: string
  count: number
}

export interface ProjectSummary {
  path: string
  name: string
  sessionCount: number
  totalTokens: number
  totalMessages: number
  lastActiveTime: string
  sessions: SessionSummary[]
}

export interface DailyActivity {
  date: string
  messageCount: number
  sessionCount: number
  toolCallCount: number
  tokensByModel: Record<string, number>
}

export interface HourlyActivity {
  hour: number
  dayOfWeek: number
  messageCount: number
  tokenCount: number
}

export interface DashboardData {
  projects: ProjectSummary[]
  sessions: SessionSummary[]
  dailyActivity: DailyActivity[]
  hourlyActivity: HourlyActivity[]
  totalStats: {
    sessions: number
    messages: number
    tokens: number
    projects: number
    firstSessionDate: string
    models: Record<string, { inputTokens: number; outputTokens: number }>
  }
}

// ── Conversation Timeline ──

export type TimelineBlockType =
  | 'user-prompt'
  | 'thinking'
  | 'text'
  | 'tool-use'
  | 'tool-result'
  | 'system'
  | 'subagent'

export interface TimelineBlock {
  id: string
  timestamp: string
  type: TimelineBlockType
  text?: string
  thinkingText?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  toolResultForId?: string
  toolResultContent?: string
  toolResultIsError?: boolean
  subagentId?: string
  subagentType?: string
  subagentPrompt?: string
  systemSubtype?: string
}

export interface SubagentInfo {
  agentId: string
  agentType: string
  messageCount: number
}

export interface TimelineResponse {
  sessionId: string
  blocks: TimelineBlock[]
  subagents: SubagentInfo[]
  totalRawMessages: number
}

// ── WebSocket events ──

export type WSEvent =
  | { type: 'initial'; data: DashboardData }
  | { type: 'session-update'; data: SessionSummary }
  | { type: 'new-session'; data: SessionSummary }
  | { type: 'stats-update'; data: DashboardData['totalStats'] }
