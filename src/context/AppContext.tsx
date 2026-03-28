import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react'

interface AppState {
  leftDrawerOpen: boolean
  rightDrawerOpen: boolean
  bottomTrayOpen: boolean
  commandPaletteOpen: boolean
  selectedSessionId: string | null
  cameraTarget: { x: number; y: number; z: number } | null
}

type Action =
  | { type: 'TOGGLE_LEFT_DRAWER' }
  | { type: 'TOGGLE_RIGHT_DRAWER' }
  | { type: 'TOGGLE_BOTTOM_TRAY' }
  | { type: 'TOGGLE_COMMAND_PALETTE' }
  | { type: 'CLOSE_ALL_PANELS' }
  | { type: 'SELECT_SESSION'; id: string; cameraTarget?: { x: number; y: number; z: number } }
  | { type: 'DESELECT_SESSION' }
  | { type: 'FLY_TO'; target: { x: number; y: number; z: number } }

const initialState: AppState = {
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  bottomTrayOpen: false,
  commandPaletteOpen: false,
  selectedSessionId: null,
  cameraTarget: null,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'TOGGLE_LEFT_DRAWER':
      return { ...state, leftDrawerOpen: !state.leftDrawerOpen }
    case 'TOGGLE_RIGHT_DRAWER':
      return { ...state, rightDrawerOpen: !state.rightDrawerOpen }
    case 'TOGGLE_BOTTOM_TRAY':
      return { ...state, bottomTrayOpen: !state.bottomTrayOpen }
    case 'TOGGLE_COMMAND_PALETTE':
      return { ...state, commandPaletteOpen: !state.commandPaletteOpen }
    case 'CLOSE_ALL_PANELS':
      return {
        ...state,
        leftDrawerOpen: false,
        rightDrawerOpen: false,
        bottomTrayOpen: false,
        commandPaletteOpen: false,
      }
    case 'SELECT_SESSION':
      return {
        ...state,
        selectedSessionId: action.id,
        rightDrawerOpen: true,
        cameraTarget: action.cameraTarget || state.cameraTarget,
      }
    case 'DESELECT_SESSION':
      return { ...state, selectedSessionId: null, rightDrawerOpen: false }
    case 'FLY_TO':
      return { ...state, cameraTarget: action.target }
    default:
      return state
  }
}

const AppStateContext = createContext<AppState>(initialState)
const AppDispatchContext = createContext<Dispatch<Action>>(() => {})

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  )
}

export function useAppState() {
  return useContext(AppStateContext)
}

export function useAppDispatch() {
  return useContext(AppDispatchContext)
}
