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

      // Escape — close modals first, then panels
      if (e.key === 'Escape') {
        // Modals handle their own Escape — don't double-fire
        if (state.chatModalOpen || state.ganttOpen || state.subagentTreeOpen || state.commandPaletteOpen) {
          return
        }
        if (state.selectedSessionId) {
          dispatch({ type: 'DESELECT_SESSION' })
        } else if (state.leftDrawerOpen) {
          dispatch({ type: 'TOGGLE_LEFT_DRAWER' })
        } else if (state.bottomTrayOpen) {
          dispatch({ type: 'TOGGLE_BOTTOM_TRAY' })
        }
        return
      }

      // [ — toggle left drawer
      if (e.key === '[') {
        dispatch({ type: 'TOGGLE_LEFT_DRAWER' })
        return
      }

      // ] — toggle right drawer
      if (e.key === ']') {
        if (state.selectedSessionId) {
          dispatch({ type: 'TOGGLE_RIGHT_DRAWER' })
        }
        return
      }

      // ` — toggle bottom tray
      if (e.key === '`') {
        dispatch({ type: 'TOGGLE_BOTTOM_TRAY' })
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dispatch, state])
}
