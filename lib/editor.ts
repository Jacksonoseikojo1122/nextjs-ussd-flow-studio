import {
  getScreen,
  nextOptionKey,
  SCREEN_ID_PATTERN,
  uniqueScreenId,
  type Flow,
  type MenuOption,
  type Screen,
  type ScreenId,
  type ScreenKind,
} from './flow'

/**
 * Editor state and a pure reducer over it. Every action returns new objects
 * for whatever it changes; nothing is mutated in place.
 */

export interface EditorState {
  flow: Flow
  selectedId: ScreenId
}

export type EditorAction =
  | { type: 'load'; flow: Flow }
  | { type: 'select'; id: ScreenId }
  | { type: 'addScreen'; kind?: ScreenKind }
  | { type: 'deleteScreen'; id: ScreenId }
  | { type: 'renameScreen'; id: ScreenId; newId: ScreenId }
  | { type: 'setStart'; id: ScreenId }
  | { type: 'updateScreen'; id: ScreenId; patch: Partial<Pick<Screen, 'prompt' | 'kind'>> }
  | { type: 'addOption'; id: ScreenId }
  | { type: 'updateOption'; id: ScreenId; index: number; patch: Partial<MenuOption> }
  | { type: 'removeOption'; id: ScreenId; index: number }
  | { type: 'moveOption'; id: ScreenId; index: number; direction: -1 | 1 }

export function initEditor(flow: Flow): EditorState {
  return { flow, selectedId: getScreen(flow, flow.start) ? flow.start : (Object.keys(flow.nodes)[0] ?? '') }
}

/** Reason a rename would be rejected, or null if it is allowed. */
export function renameError(flow: Flow, id: ScreenId, newId: ScreenId): string | null {
  if (newId === id) return null
  if (!SCREEN_ID_PATTERN.test(newId)) return 'Start with a letter; use letters, digits, "_" or "-" (max 40).'
  if (getScreen(flow, newId)) return `"${newId}" is already used by another screen.`
  return null
}

function withScreen(flow: Flow, id: ScreenId, update: (screen: Screen) => Screen): Flow {
  const screen = getScreen(flow, id)
  if (!screen) return flow
  return { ...flow, nodes: { ...flow.nodes, [id]: update(screen) } }
}

function withFlow(state: EditorState, flow: Flow): EditorState {
  return flow === state.flow ? state : { ...state, flow }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { flow } = state

  switch (action.type) {
    case 'load':
      return initEditor(action.flow)

    case 'select':
      return getScreen(flow, action.id) ? { ...state, selectedId: action.id } : state

    case 'addScreen': {
      const id = uniqueScreenId(flow)
      const kind = action.kind ?? 'menu'
      const screen: Screen = { id, prompt: kind === 'end' ? 'Thank you.' : 'New screen', kind, options: [] }
      return { flow: { ...flow, nodes: { ...flow.nodes, [id]: screen } }, selectedId: id }
    }

    case 'deleteScreen': {
      // The start screen cannot be deleted; pick another start first.
      if (action.id === flow.start || !getScreen(flow, action.id)) return state
      const nodes: Record<ScreenId, Screen> = {}
      for (const screen of Object.values(flow.nodes)) {
        if (screen.id === action.id) continue
        // Unlink options that pointed at the deleted screen; validation then flags them.
        const pointsHere = screen.options.some((o) => o.next === action.id)
        nodes[screen.id] = pointsHere
          ? { ...screen, options: screen.options.map((o) => (o.next === action.id ? { ...o, next: '' } : o)) }
          : screen
      }
      const selectedId = state.selectedId === action.id ? flow.start : state.selectedId
      return { flow: { ...flow, nodes }, selectedId }
    }

    case 'renameScreen': {
      const { id, newId } = action
      if (newId === id || renameError(flow, id, newId) !== null || !getScreen(flow, id)) return state
      // Rebuild in the same order so the screen list does not jump around.
      const nodes: Record<ScreenId, Screen> = {}
      for (const screen of Object.values(flow.nodes)) {
        const options = screen.options.some((o) => o.next === id)
          ? screen.options.map((o) => (o.next === id ? { ...o, next: newId } : o))
          : screen.options
        const renamed = screen.id === id ? { ...screen, id: newId, options } : options === screen.options ? screen : { ...screen, options }
        nodes[renamed.id] = renamed
      }
      return {
        flow: { start: flow.start === id ? newId : flow.start, nodes },
        selectedId: state.selectedId === id ? newId : state.selectedId,
      }
    }

    case 'setStart':
      return getScreen(flow, action.id) ? withFlow(state, { ...flow, start: action.id }) : state

    case 'updateScreen':
      return withFlow(state, withScreen(flow, action.id, (s) => ({ ...s, ...action.patch })))

    case 'addOption':
      return withFlow(
        state,
        withScreen(flow, action.id, (s) => ({
          ...s,
          options: [...s.options, { key: nextOptionKey(s), label: '', next: '' }],
        })),
      )

    case 'updateOption':
      return withFlow(
        state,
        withScreen(flow, action.id, (s) => ({
          ...s,
          options: s.options.map((o, i) => (i === action.index ? { ...o, ...action.patch } : o)),
        })),
      )

    case 'removeOption':
      return withFlow(
        state,
        withScreen(flow, action.id, (s) => ({ ...s, options: s.options.filter((_, i) => i !== action.index) })),
      )

    case 'moveOption':
      return withFlow(
        state,
        withScreen(flow, action.id, (s) => {
          const target = action.index + action.direction
          if (target < 0 || target >= s.options.length) return s
          const options = [...s.options]
          ;[options[action.index], options[target]] = [options[target], options[action.index]]
          return { ...s, options }
        }),
      )
  }
}
