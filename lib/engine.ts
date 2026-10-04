import { getScreen, type Flow, type MenuOption, type Screen, type ScreenId } from './flow'

/**
 * The USSD runtime, as a pure function of (flow, text).
 *
 * Gateways such as Africa's Talking send the full input history on every
 * request as a '*'-joined string ("" on the first dial, then "1", "1*2", ...).
 * The engine replays that history from the start screen, following option keys
 * by screen id. The simulator in the UI and the exported servers implement
 * exactly this algorithm; the test suite checks they agree.
 */

export const INVALID_OPTION_MESSAGE = 'Invalid option.'
export const SERVICE_UNAVAILABLE_MESSAGE = 'Service unavailable.'

export type ReplyType = 'CON' | 'END'

export interface UssdReply {
  type: ReplyType
  /** Body shown on the handset, without the CON/END prefix. */
  message: string
  /** Screen that produced the reply, or null for engine-level errors. */
  screenId: ScreenId | null
}

/** Text shown for a screen: the prompt, then one "key. label" line per option on menus. */
export function renderScreen(screen: Screen): string {
  if (screen.kind === 'end') return screen.prompt
  return [screen.prompt, ...screen.options.map((o) => `${o.key}. ${o.label}`)].join('\n')
}

function replyFor(screen: Screen): UssdReply {
  return {
    type: screen.kind === 'end' ? 'END' : 'CON',
    message: renderScreen(screen),
    screenId: screen.id,
  }
}

/** Splits the gateway's `text` field into individual key presses. */
export function splitInput(text: string): string[] {
  return text === '' ? [] : text.split('*')
}

export function respond(flow: Flow, text: string): UssdReply {
  const start = getScreen(flow, flow.start)
  if (!start) return { type: 'END', message: SERVICE_UNAVAILABLE_MESSAGE, screenId: null }

  let screen: Screen = start
  for (const key of splitInput(text)) {
    // A session ends at an END screen; any further input is ignored.
    if (screen.kind === 'end') break
    const option: MenuOption | undefined = screen.options.find((o) => o.key === key)
    const next: Screen | undefined = option ? getScreen(flow, option.next) : undefined
    if (!next) return { type: 'END', message: INVALID_OPTION_MESSAGE, screenId: null }
    screen = next
  }

  return replyFor(screen)
}

/** The wire format a USSD gateway expects, e.g. "CON Main menu\n1. Balance". */
export function formatReply(reply: UssdReply): string {
  return `${reply.type} ${reply.message}`
}
