import type { Flow } from '../lib/flow'

/**
 * Two screens share the exact same prompt but lead to different outcomes.
 * The original label-matching generators routed this flow incorrectly.
 */
export const DUPLICATE_PROMPT_FLOW: Flow = {
  start: 'home',
  nodes: {
    home: {
      id: 'home',
      prompt: 'Choose',
      kind: 'menu',
      options: [
        { key: '1', label: 'Send money', next: 'confirm_send' },
        { key: '2', label: 'Withdraw', next: 'confirm_withdraw' },
      ],
    },
    confirm_send: {
      id: 'confirm_send',
      prompt: 'Confirm?',
      kind: 'menu',
      options: [{ key: '1', label: 'Yes', next: 'sent' }],
    },
    confirm_withdraw: {
      id: 'confirm_withdraw',
      prompt: 'Confirm?',
      kind: 'menu',
      options: [{ key: '1', label: 'Yes', next: 'withdrawn' }],
    },
    sent: { id: 'sent', prompt: 'Money sent.', kind: 'end', options: [] },
    withdrawn: { id: 'withdrawn', prompt: 'Withdrawal approved.', kind: 'end', options: [] },
  },
}

/** Prompts that need escaping in both JavaScript and Python source. */
export const TRICKY_TEXT_FLOW: Flow = {
  start: 'start',
  nodes: {
    start: {
      id: 'start',
      prompt: 'Quotes " \' and backslash \\ and ${template} and """triple""" — Akwaaba!',
      kind: 'menu',
      options: [{ key: '1', label: 'Next "line"\nbreak', next: 'done' }],
    },
    done: { id: 'done', prompt: "END isn't a keyword here", kind: 'end', options: [] },
  },
}

export function clone<T>(value: T): T {
  return structuredClone(value)
}
