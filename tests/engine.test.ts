import { describe, expect, it } from 'vitest'
import { formatReply, renderScreen, respond, splitInput } from '../lib/engine'
import type { Flow } from '../lib/flow'
import { SAMPLE_FLOW } from '../lib/sample-flow'
import { clone, DUPLICATE_PROMPT_FLOW } from './fixtures'

const run = (flow: Flow, text: string) => formatReply(respond(flow, text))

describe('splitInput', () => {
  it('treats the empty string as "no input yet"', () => {
    expect(splitInput('')).toEqual([])
  })

  it('splits the gateway history on *', () => {
    expect(splitInput('1*2*10')).toEqual(['1', '2', '10'])
    expect(splitInput('1*')).toEqual(['1', ''])
  })
})

describe('renderScreen', () => {
  it('renders a menu as the prompt followed by "key. label" lines', () => {
    expect(renderScreen(SAMPLE_FLOW.nodes.main)).toBe(
      'Welcome to Demo Wallet\n1. Buy airtime\n2. Check balance\n3. Exit',
    )
  })

  it('renders an end screen as its prompt only', () => {
    expect(renderScreen(SAMPLE_FLOW.nodes.goodbye)).toBe('Thank you for using Demo Wallet.')
  })
})

describe('respond', () => {
  it('shows the start screen on first dial', () => {
    const reply = respond(SAMPLE_FLOW, '')
    expect(reply).toEqual({
      type: 'CON',
      message: 'Welcome to Demo Wallet\n1. Buy airtime\n2. Check balance\n3. Exit',
      screenId: 'main',
    })
  })

  it('follows option keys through nested menus', () => {
    expect(respond(SAMPLE_FLOW, '1').screenId).toBe('airtime_network')
    expect(respond(SAMPLE_FLOW, '1*2').screenId).toBe('airtime_amount')
    expect(run(SAMPLE_FLOW, '1*2*3')).toBe('END Request received. You will get an SMS confirmation shortly.')
  })

  it('supports cycles such as Back options', () => {
    expect(respond(SAMPLE_FLOW, '1*0').screenId).toBe('main')
    expect(respond(SAMPLE_FLOW, '1*1*0*0*2').screenId).toBe('balance')
  })

  it('closes the session with END when an end screen is reached', () => {
    expect(run(SAMPLE_FLOW, '2')).toBe('END Your Demo Wallet balance is GHS 120.50.')
    expect(run(SAMPLE_FLOW, '3')).toBe('END Thank you for using Demo Wallet.')
  })

  it('ignores input sent after an end screen', () => {
    expect(run(SAMPLE_FLOW, '2*9*9')).toBe('END Your Demo Wallet balance is GHS 120.50.')
  })

  it('answers unknown keys with END Invalid option.', () => {
    expect(run(SAMPLE_FLOW, '9')).toBe('END Invalid option.')
    expect(run(SAMPLE_FLOW, '1*7')).toBe('END Invalid option.')
    expect(run(SAMPLE_FLOW, '1*')).toBe('END Invalid option.')
    expect(run(SAMPLE_FLOW, ' 1')).toBe('END Invalid option.')
    expect(respond(SAMPLE_FLOW, '9').screenId).toBeNull()
  })

  it('routes by screen id, so duplicate prompts do not collide', () => {
    expect(run(DUPLICATE_PROMPT_FLOW, '1*1')).toBe('END Money sent.')
    expect(run(DUPLICATE_PROMPT_FLOW, '2*1')).toBe('END Withdrawal approved.')
  })

  it('does not treat prompt text starting with "END" as terminal; only kind matters', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.main.prompt = 'END of month promo'
    expect(run(flow, '')).toMatch(/^CON END of month promo\n1\. Buy airtime/)
  })

  it('answers an option pointing at a missing screen with Invalid option instead of crashing', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.main.options[0].next = 'deleted_screen'
    expect(run(flow, '1')).toBe('END Invalid option.')
    flow.nodes.main.options[0].next = ''
    expect(run(flow, '1')).toBe('END Invalid option.')
  })

  it('never resolves ids to Object.prototype members', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.main.options[0].next = 'constructor'
    expect(run(flow, '1')).toBe('END Invalid option.')
    expect(run({ ...flow, start: 'toString' }, '')).toBe('END Service unavailable.')
  })

  it('reports Service unavailable when the start screen is missing', () => {
    expect(respond({ start: 'nope', nodes: {} }, '')).toEqual({
      type: 'END',
      message: 'Service unavailable.',
      screenId: null,
    })
  })

  it('ends immediately when the start screen is itself an end screen', () => {
    const flow: Flow = { start: 'only', nodes: { only: { id: 'only', prompt: 'Closed today.', kind: 'end', options: [] } } }
    expect(run(flow, '')).toBe('END Closed today.')
    expect(run(flow, '1')).toBe('END Closed today.')
  })

  it('hides options on end screens', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.balance.options = [{ key: '1', label: 'Ghost', next: 'main' }]
    expect(run(flow, '2')).toBe('END Your Demo Wallet balance is GHS 120.50.')
    expect(run(flow, '2*1')).toBe('END Your Demo Wallet balance is GHS 120.50.')
  })

  it('does not mutate the flow', () => {
    const flow = clone(SAMPLE_FLOW)
    respond(flow, '1*2*3')
    expect(flow).toEqual(SAMPLE_FLOW)
  })
})
