import { useState, useEffect, useRef } from 'react'
import type { TimelineResponse } from '../../shared/types'

export function useSubagentMessages(sessionId: string | null, agentId: string | null) {
  const [data, setData] = useState<TimelineResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cache = useRef(new Map<string, TimelineResponse>())

  useEffect(() => {
    if (!sessionId || !agentId) {
      setData(null)
      return
    }

    const key = `${sessionId}:${agentId}`
    const cached = cache.current.get(key)
    if (cached) {
      setData(cached)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(`/api/sessions/${sessionId}/subagents/${agentId}/messages`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((response: TimelineResponse) => {
        cache.current.set(key, response)
        setData(response)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [sessionId, agentId])

  return { data, loading, error }
}
