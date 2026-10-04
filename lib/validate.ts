import { renderScreen } from './engine'
import { getScreen, type Flow, type ScreenId } from './flow'

export type Severity = 'error' | 'warning'

export type ProblemCode =
  | 'missing-start'
  | 'empty-menu'
  | 'invalid-key'
  | 'duplicate-key'
  | 'unlinked-option'
  | 'dangling-next'
  | 'unreachable'
  | 'empty-prompt'
  | 'end-has-options'
  | 'screen-too-long'

export interface Problem {
  severity: Severity
  code: ProblemCode
  message: string
  /** Screen the problem belongs to, when there is one. */
  screenId?: ScreenId
  /** Zero-based option index on that screen, when the problem is about one option. */
  optionIndex?: number
}

/**
 * Many gateways truncate or reject USSD pages above ~182 characters
 * (GSM 03.38, 7-bit). Treated as a warning because limits vary by network.
 */
export const MAX_SCREEN_LENGTH = 182

/** Callers press keys on a phone keypad, and '*' is the input separator, so keys are digits only. */
export const OPTION_KEY_PATTERN = /^[0-9]+$/

/**
 * Static checks for a flow. Errors make the flow unsafe to run and block code
 * export; warnings are worth fixing but do not break routing.
 */
export function validateFlow(flow: Flow): Problem[] {
  const problems: Problem[] = []
  const start = getScreen(flow, flow.start)

  if (!start) {
    problems.push({
      severity: 'error',
      code: 'missing-start',
      message: flow.start
        ? `Start screen "${flow.start}" does not exist.`
        : 'No start screen is set.',
    })
  }

  for (const screen of Object.values(flow.nodes)) {
    const at = { screenId: screen.id }

    if (screen.prompt.trim() === '') {
      problems.push({ ...at, severity: 'warning', code: 'empty-prompt', message: `Screen "${screen.id}" has an empty prompt.` })
    }

    if (screen.kind === 'end') {
      if (screen.options.length > 0) {
        problems.push({
          ...at,
          severity: 'warning',
          code: 'end-has-options',
          message: `End screen "${screen.id}" has ${screen.options.length} option(s) that will never be shown.`,
        })
      }
    } else {
      if (screen.options.length === 0) {
        problems.push({
          ...at,
          severity: 'error',
          code: 'empty-menu',
          message: `Menu screen "${screen.id}" has no options, so the caller is stuck. Add an option or make it an end screen.`,
        })
      }

      const seen = new Map<string, number>()
      screen.options.forEach((option, optionIndex) => {
        const here = { ...at, optionIndex }
        const label = `Option ${optionIndex + 1} on "${screen.id}"`

        if (!OPTION_KEY_PATTERN.test(option.key)) {
          problems.push({
            ...here,
            severity: 'error',
            code: 'invalid-key',
            message: option.key === ''
              ? `${label} has no key.`
              : `${label} has key "${option.key}"; keys must be digits only.`,
          })
        } else if (seen.has(option.key)) {
          problems.push({
            ...here,
            severity: 'error',
            code: 'duplicate-key',
            message: `Key "${option.key}" is used more than once on "${screen.id}" (options ${(seen.get(option.key) ?? 0) + 1} and ${optionIndex + 1}).`,
          })
        } else {
          seen.set(option.key, optionIndex)
        }

        if (option.next === '') {
          problems.push({ ...here, severity: 'error', code: 'unlinked-option', message: `${label} does not lead to any screen.` })
        } else if (!getScreen(flow, option.next)) {
          problems.push({
            ...here,
            severity: 'error',
            code: 'dangling-next',
            message: `${label} points to "${option.next}", which does not exist.`,
          })
        }
      })
    }

    const length = renderScreen(screen).length
    if (length > MAX_SCREEN_LENGTH) {
      problems.push({
        ...at,
        severity: 'warning',
        code: 'screen-too-long',
        message: `Screen "${screen.id}" is ${length} characters; many networks cut USSD pages at ${MAX_SCREEN_LENGTH}.`,
      })
    }
  }

  if (start) {
    const reachable = reachableFrom(flow, start.id)
    for (const id of Object.keys(flow.nodes)) {
      if (!reachable.has(id)) {
        problems.push({
          screenId: id,
          severity: 'warning',
          code: 'unreachable',
          message: `Screen "${id}" cannot be reached from the start screen.`,
        })
      }
    }
  }

  return problems
}

/** Breadth-first walk over option links. End screens do not route anywhere. */
export function reachableFrom(flow: Flow, startId: ScreenId): Set<ScreenId> {
  const seen = new Set<ScreenId>()
  const queue: ScreenId[] = [startId]
  while (queue.length > 0) {
    const id = queue.shift()!
    const screen = getScreen(flow, id)
    if (!screen || seen.has(id)) continue
    seen.add(id)
    if (screen.kind === 'menu') {
      for (const option of screen.options) queue.push(option.next)
    }
  }
  return seen
}

export function hasErrors(problems: readonly Problem[]): boolean {
  return problems.some((p) => p.severity === 'error')
}
