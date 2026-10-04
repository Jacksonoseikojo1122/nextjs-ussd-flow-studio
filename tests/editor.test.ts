import { describe, expect, it } from 'vitest'
import { editorReducer, initEditor, renameError, type EditorState } from '../lib/editor'
import { SAMPLE_FLOW } from '../lib/sample-flow'
import { validateFlow } from '../lib/validate'
import { clone } from './fixtures'

function fresh(): EditorState {
  return initEditor(clone(SAMPLE_FLOW))
}

describe('editorReducer', () => {
  it('selects the start screen initially', () => {
    expect(fresh().selectedId).toBe('main')
  })

  it('never mutates the previous state', () => {
    const before = fresh()
    const snapshot = clone(before)
    const actions = [
      { type: 'updateScreen', id: 'main', patch: { prompt: 'Hello' } },
      { type: 'addOption', id: 'main' },
      { type: 'updateOption', id: 'main', index: 0, patch: { label: 'Airtime' } },
      { type: 'removeOption', id: 'main', index: 1 },
      { type: 'moveOption', id: 'main', index: 0, direction: 1 },
      { type: 'addScreen' },
      { type: 'renameScreen', id: 'balance', newId: 'wallet_balance' },
      { type: 'deleteScreen', id: 'goodbye' },
      { type: 'setStart', id: 'balance' },
    ] as const
    for (const action of actions) {
      const after = editorReducer(before, action)
      expect(after).not.toBe(before)
      expect(before).toEqual(snapshot)
    }
  })

  it('shares untouched screens between states', () => {
    const before = fresh()
    const after = editorReducer(before, { type: 'updateScreen', id: 'main', patch: { prompt: 'Hi' } })
    expect(after.flow.nodes.main.prompt).toBe('Hi')
    expect(after.flow.nodes.balance).toBe(before.flow.nodes.balance)
  })

  it('adds a uniquely named screen and selects it', () => {
    const s1 = editorReducer(fresh(), { type: 'addScreen' })
    const s2 = editorReducer(s1, { type: 'addScreen', kind: 'end' })
    expect(s1.selectedId).toBe('screen_1')
    expect(s2.selectedId).toBe('screen_2')
    expect(s2.flow.nodes.screen_2.kind).toBe('end')
  })

  it('adds options with the next free key', () => {
    const s = editorReducer(fresh(), { type: 'addOption', id: 'main' })
    expect(s.flow.nodes.main.options.at(-1)).toEqual({ key: '4', label: '', next: '' })
  })

  it('unlinks options that pointed at a deleted screen so validation flags them', () => {
    const s = editorReducer(fresh(), { type: 'deleteScreen', id: 'balance' })
    expect(s.flow.nodes.balance).toBeUndefined()
    expect(s.flow.nodes.main.options[1].next).toBe('')
    expect(validateFlow(s.flow)).toContainEqual(expect.objectContaining({ code: 'unlinked-option', screenId: 'main' }))
  })

  it('refuses to delete the start screen', () => {
    const before = fresh()
    expect(editorReducer(before, { type: 'deleteScreen', id: 'main' })).toBe(before)
  })

  it('renames a screen and rewrites every reference to it', () => {
    let s = editorReducer(fresh(), { type: 'select', id: 'airtime_network' })
    s = editorReducer(s, { type: 'renameScreen', id: 'airtime_network', newId: 'network' })
    expect(s.flow.nodes.airtime_network).toBeUndefined()
    expect(s.flow.nodes.network.id).toBe('network')
    expect(s.flow.nodes.main.options[0].next).toBe('network')
    expect(s.flow.nodes.airtime_amount.options[3].next).toBe('network')
    expect(s.selectedId).toBe('network')
    expect(Object.keys(s.flow.nodes)[1]).toBe('network')
    expect(validateFlow(s.flow)).toEqual([])
  })

  it('renaming the start screen moves the start pointer', () => {
    const s = editorReducer(fresh(), { type: 'renameScreen', id: 'main', newId: 'home' })
    expect(s.flow.start).toBe('home')
  })

  it('rejects invalid or clashing renames', () => {
    const before = fresh()
    expect(renameError(before.flow, 'main', 'balance')).toMatch(/already used/)
    expect(renameError(before.flow, 'main', '9lives')).toMatch(/Start with a letter/)
    expect(renameError(before.flow, 'main', 'main')).toBeNull()
    expect(editorReducer(before, { type: 'renameScreen', id: 'main', newId: 'balance' })).toBe(before)
  })

  it('reorders options', () => {
    const s = editorReducer(fresh(), { type: 'moveOption', id: 'main', index: 0, direction: 1 })
    expect(s.flow.nodes.main.options.map((o) => o.key)).toEqual(['2', '1', '3'])
  })

  it('loads a new flow and selects its start screen', () => {
    const s = editorReducer(editorReducer(fresh(), { type: 'select', id: 'balance' }), {
      type: 'load',
      flow: { start: 'x', nodes: { x: { id: 'x', prompt: 'X', kind: 'end', options: [] } } },
    })
    expect(s.selectedId).toBe('x')
  })
})
