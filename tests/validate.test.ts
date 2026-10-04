import { describe, expect, it } from 'vitest'
import { parseFlow, FlowParseError, type Flow } from '../lib/flow'
import { SAMPLE_FLOW } from '../lib/sample-flow'
import { hasErrors, MAX_SCREEN_LENGTH, reachableFrom, validateFlow, type ProblemCode } from '../lib/validate'
import { clone, DUPLICATE_PROMPT_FLOW } from './fixtures'

const codes = (flow: Flow): ProblemCode[] => validateFlow(flow).map((p) => p.code)

describe('validateFlow', () => {
  it('accepts the sample flow with no problems', () => {
    expect(validateFlow(SAMPLE_FLOW)).toEqual([])
    expect(validateFlow(DUPLICATE_PROMPT_FLOW)).toEqual([])
  })

  it('reports a missing start screen as an error', () => {
    const problems = validateFlow({ ...SAMPLE_FLOW, start: 'ghost' })
    expect(problems).toEqual([
      { severity: 'error', code: 'missing-start', message: 'Start screen "ghost" does not exist.' },
    ])
    expect(validateFlow({ ...SAMPLE_FLOW, start: '' })[0].message).toBe('No start screen is set.')
  })

  it('reports options that point to deleted screens', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.main.options[1].next = 'old_balance'
    const [problem] = validateFlow(flow).filter((p) => p.code === 'dangling-next')
    expect(problem).toMatchObject({ severity: 'error', screenId: 'main', optionIndex: 1 })
    expect(problem.message).toContain('"old_balance"')
  })

  it('reports options that are not linked to any screen', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.main.options[2].next = ''
    expect(validateFlow(flow)).toContainEqual(
      expect.objectContaining({ code: 'unlinked-option', severity: 'error', screenId: 'main', optionIndex: 2 }),
    )
  })

  it('reports a menu with no options', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.balance.kind = 'menu'
    expect(validateFlow(flow)).toContainEqual(
      expect.objectContaining({ code: 'empty-menu', severity: 'error', screenId: 'balance' }),
    )
  })

  it('reports duplicate option keys on the same screen', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.main.options[2].key = '1'
    const duplicates = validateFlow(flow).filter((p) => p.code === 'duplicate-key')
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0]).toMatchObject({ severity: 'error', screenId: 'main', optionIndex: 2 })
  })

  it('allows the same key on different screens', () => {
    // "1" and "0" appear on several sample screens.
    expect(codes(SAMPLE_FLOW)).not.toContain('duplicate-key')
  })

  it('rejects empty and non-digit keys', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.main.options[0].key = ''
    flow.nodes.main.options[1].key = '1*2'
    flow.nodes.main.options[2].key = 'a'
    const invalid = validateFlow(flow).filter((p) => p.code === 'invalid-key')
    expect(invalid.map((p) => p.optionIndex)).toEqual([0, 1, 2])
    expect(invalid.every((p) => p.severity === 'error')).toBe(true)
  })

  it('warns about screens that cannot be reached from the start', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.orphan = { id: 'orphan', prompt: 'Nobody gets here', kind: 'end', options: [] }
    const problems = validateFlow(flow)
    expect(problems).toEqual([
      expect.objectContaining({ code: 'unreachable', severity: 'warning', screenId: 'orphan' }),
    ])
    expect(hasErrors(problems)).toBe(false)
  })

  it('does not count links from end screens towards reachability', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.orphan = { id: 'orphan', prompt: 'Hidden', kind: 'end', options: [] }
    flow.nodes.balance.options = [{ key: '1', label: 'More', next: 'orphan' }]
    expect(codes(flow).sort()).toEqual(['end-has-options', 'unreachable'])
  })

  it('warns about empty prompts and over-long screens', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.goodbye.prompt = '   '
    flow.nodes.balance.prompt = 'x'.repeat(MAX_SCREEN_LENGTH + 1)
    const problems = validateFlow(flow)
    expect(problems).toContainEqual(expect.objectContaining({ code: 'empty-prompt', screenId: 'goodbye', severity: 'warning' }))
    expect(problems).toContainEqual(expect.objectContaining({ code: 'screen-too-long', screenId: 'balance', severity: 'warning' }))
    expect(hasErrors(problems)).toBe(false)
  })

  it('collects several problems at once', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.main.options[1].key = '1'
    flow.nodes.airtime_amount.options = []
    // airtime_done was only reachable through airtime_amount's options.
    expect(codes(flow).sort()).toEqual(['duplicate-key', 'empty-menu', 'unreachable'])
  })
})

describe('reachableFrom', () => {
  it('walks every option link once, including cycles', () => {
    expect([...reachableFrom(SAMPLE_FLOW, 'main')].sort()).toEqual(Object.keys(SAMPLE_FLOW.nodes).sort())
    expect([...reachableFrom(SAMPLE_FLOW, 'balance')]).toEqual(['balance'])
  })
})

describe('parseFlow', () => {
  it('round-trips a valid flow through JSON', () => {
    expect(parseFlow(JSON.parse(JSON.stringify(SAMPLE_FLOW)))).toEqual(SAMPLE_FLOW)
  })

  it('fills in defaults for optional fields', () => {
    const flow = parseFlow({
      start: 'a',
      nodes: { a: { prompt: 'Hi', kind: 'menu', options: [{ key: '1', next: 'b' }] }, b: { prompt: 'Bye', kind: 'end' } },
    })
    expect(flow.nodes.a).toEqual({ id: 'a', prompt: 'Hi', kind: 'menu', options: [{ key: '1', label: '', next: 'b' }] })
    expect(flow.nodes.b.options).toEqual([])
  })

  it.each([
    ['not an object', []],
    ['missing start', { nodes: {} }],
    ['nodes as array', { start: 'a', nodes: [] }],
    ['bad kind', { start: 'a', nodes: { a: { prompt: 'x', kind: 'menuu' } } }],
    ['bad id', { start: 'a', nodes: { '1a': { prompt: 'x', kind: 'end' } } }],
    ['mismatched id', { start: 'a', nodes: { a: { id: 'b', prompt: 'x', kind: 'end' } } }],
    ['numeric option key', { start: 'a', nodes: { a: { prompt: 'x', kind: 'menu', options: [{ key: 1, next: 'a' }] } } }],
  ])('rejects %s', (_name, input) => {
    expect(() => parseFlow(input)).toThrow(FlowParseError)
  })
})
