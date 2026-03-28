import { useState, useEffect, useRef, useCallback } from 'react'
import type { DashboardData, WSEvent } from '../../shared/types'

const WS_URL = `ws://${window.location.hostname}:3141`

export function useWebSocket() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      console.log('[ws] connected')
    }

    ws.onmessage = (event) => {
      const msg: WSEvent = JSON.parse(event.data)

      switch (msg.type) {
        case 'initial':
          setData(msg.data)
          break

        case 'session-update':
          setData((prev) => {
            if (!prev) return prev
            const sessions = prev.sessions.map((s) =>
              s.id === msg.data.id ? msg.data : s,
            )
            return { ...prev, sessions }
          })
          break

        case 'new-session':
          setData((prev) => {
            if (!prev) return prev
            return { ...prev, sessions: [msg.data, ...prev.sessions] }
          })
          break

        case 'stats-update':
          setData((prev) => {
            if (!prev) return prev
            return { ...prev, totalStats: msg.data }
          })
          break
      }
    }

    ws.onclose = () => {
      setConnected(false)
      console.log('[ws] disconnected, reconnecting in 2s...')
      reconnectTimer.current = setTimeout(connect, 2000)
    }

    ws.onerror = () => ws.close()
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Also fetch via REST as fallback
  useEffect(() => {
    if (!data) {
      fetch('/api/dashboard')
        .then((r) => r.json())
        .then(setData)
        .catch(() => {})
    }
  }, [data])

  return { data, connected }
}
