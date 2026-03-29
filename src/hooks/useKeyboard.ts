import { useEffect } from 'react'
import { useAppDispatch, useAppState } from '../context/AppContext'

export function useKeyboard() {
  const dispatch = useAppDispatch()
  const state = useAppState()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // Cmd+K / Ctrl+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        return
      }

      // Escape — close modals first, then deselect session
      if (e.key === 'Escape') {
        // Modals handle their own Escape — don't double-fire
        if (state.chatModalOpen || state.ganttOpen || state.subagentTreeOpen || state.commandPaletteOpen) {
          return
        }
        if (state.selectedSessionId) {
          dispatch({ type: 'DESELECT_SESSION' })
        }
        if (state.selectedProjectName) {
          dispatch({ type: 'DESELECT_PROJECT' })
        }
        return
      }

      // C — open chat modal for selected session
      if (e.key === 'c' && state.selectedSessionId && !state.chatModalOpen) {
        dispatch({ type: 'OPEN_CHAT_MODAL' })
        return
      }

      // T — open tools gantt for selected session
      if (e.key === 't' && state.selectedSessionId && !state.ganttOpen) {
        dispatch({ type: 'OPEN_GANTT' })
        return
      }

      // A — open agents tree for selected session
      if (e.key === 'a' && state.selectedSessionId && !state.subagentTreeOpen) {
        dispatch({ type: 'OPEN_SUBAGENT_TREE' })
        return
      }
    }

    // Listen on window AND document to catch events even when canvas has focus
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [dispatch, state])
}
