import { useState, useEffect, useRef } from 'react'
import type { TimelineResponse } from '../../shared/types'

export function useSessionMessages(sessionId: string | null) {
  const [data, setData] = useState<TimelineResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cache = useRef(new Map<string, TimelineResponse>())

  useEffect(() => {
    if (!sessionId) {
      setData(null)
      return
    }

    // Check cache
    const cached = cache.current.get(sessionId)
    if (cached) {
      setData(cached)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(`/api/sessions/${sessionId}/messages`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((response: TimelineResponse) => {
        cache.current.set(sessionId, response)
        setData(response)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message)
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [sessionId])

  return { data, loading, error }
}
