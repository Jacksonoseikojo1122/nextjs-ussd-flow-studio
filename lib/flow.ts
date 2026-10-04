/**
 * The USSD flow model.
 *
 * A flow is a directed graph of screens keyed by id. Routing is always done by
 * id (never by prompt text), so two screens may safely share the same prompt.
 */

export type ScreenId = string

/** `menu` screens keep the session open (CON); `end` screens close it (END). */
export type ScreenKind = 'menu' | 'end'

export interface MenuOption {
  /** What the caller types to choose this option, e.g. "1". */
  key: string
  /** Text shown next to the key, e.g. "Buy airtime". */
  label: string
  /** Id of the screen this option leads to. Empty string means "not linked yet". */
  next: ScreenId
}

export interface Screen {
  id: ScreenId
  prompt: string
  kind: ScreenKind
  /** Only meaningful for `menu` screens; ignored on `end` screens. */
  options: MenuOption[]
}

export interface Flow {
  start: ScreenId
  nodes: Record<ScreenId, Screen>
}

/** Ids must be safe to use as object keys, file-friendly and easy to read in generated code. */
export const SCREEN_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/

/** Own-property lookup, so ids like "constructor" or "__proto__" never resolve to prototype members. */
export function getScreen(flow: Flow, id: ScreenId): Screen | undefined {
  return Object.prototype.hasOwnProperty.call(flow.nodes, id) ? flow.nodes[id] : undefined
}

export function screenIds(flow: Flow): ScreenId[] {
  return Object.keys(flow.nodes)
}

/** Picks the first id of the form `${base}_${n}` that is not already used. */
export function uniqueScreenId(flow: Flow, base = 'screen'): ScreenId {
  for (let n = 1; ; n++) {
    const id = `${base}_${n}`
    if (!getScreen(flow, id)) return id
  }
}

/** Picks the lowest positive integer key not already used on the screen. */
export function nextOptionKey(screen: Screen): string {
  const used = new Set(screen.options.map((o) => o.key))
  for (let n = 1; ; n++) {
    if (!used.has(String(n))) return String(n)
  }
}

export class FlowParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlowParseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Converts untrusted JSON (an imported file, localStorage) into a well-formed
 * `Flow`, or throws `FlowParseError`. Structural problems throw; semantic
 * problems (dangling links, unreachable screens, ...) are left for
 * `validateFlow` so the user can see and fix them in the editor.
 */
export function parseFlow(input: unknown): Flow {
  if (!isRecord(input)) throw new FlowParseError('Flow must be a JSON object.')
  if (typeof input.start !== 'string') throw new FlowParseError('Flow "start" must be a string.')
  if (!isRecord(input.nodes)) throw new FlowParseError('Flow "nodes" must be an object keyed by screen id.')

  const nodes: Record<ScreenId, Screen> = {}
  for (const [id, raw] of Object.entries(input.nodes)) {
    if (!SCREEN_ID_PATTERN.test(id)) {
      throw new FlowParseError(
        `Screen id "${id}" is invalid. Use a letter followed by letters, digits, "_" or "-" (max 40 chars).`,
      )
    }
    if (!isRecord(raw)) throw new FlowParseError(`Screen "${id}" must be an object.`)
    if (raw.id !== undefined && raw.id !== id) {
      throw new FlowParseError(`Screen keyed "${id}" declares a different id "${String(raw.id)}".`)
    }
    if (typeof raw.prompt !== 'string') throw new FlowParseError(`Screen "${id}" needs a string "prompt".`)
    if (raw.kind !== 'menu' && raw.kind !== 'end') {
      throw new FlowParseError(`Screen "${id}" has kind "${String(raw.kind)}"; expected "menu" or "end".`)
    }
    const rawOptions = raw.options ?? []
    if (!Array.isArray(rawOptions)) throw new FlowParseError(`Screen "${id}" "options" must be an array.`)

    const options: MenuOption[] = rawOptions.map((opt, i) => {
      if (!isRecord(opt)) throw new FlowParseError(`Screen "${id}" option #${i + 1} must be an object.`)
      if (typeof opt.key !== 'string' || typeof opt.next !== 'string') {
        throw new FlowParseError(`Screen "${id}" option #${i + 1} needs string "key" and "next".`)
      }
      if (opt.label !== undefined && typeof opt.label !== 'string') {
        throw new FlowParseError(`Screen "${id}" option #${i + 1} "label" must be a string.`)
      }
      return { key: opt.key, label: opt.label ?? '', next: opt.next }
    })

    nodes[id] = { id, prompt: raw.prompt, kind: raw.kind, options }
  }

  return { start: input.start, nodes }
}
