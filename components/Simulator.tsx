'use client'

import { useState, type FormEvent } from 'react'
import { respond } from '@/lib/engine'
import type { Flow } from '@/lib/flow'
import { Button, inputClass, Panel } from './ui'

/**
 * Runs the flow with the same pure `respond()` the tests and exported servers
 * use. The session is just the list of keys typed so far; every render replays
 * it from the start, exactly as a gateway would send it.
 */
export function Simulator({ flow }: { flow: Flow }) {
  const [inputs, setInputs] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  const text = inputs.join('*')
  const reply = respond(flow, text)
  const ended = reply.type === 'END'

  const send = (e: FormEvent) => {
    e.preventDefault()
    const key = draft.trim()
    if (key === '' || ended) return
    setInputs([...inputs, key])
    setDraft('')
  }

  const reset = () => {
    setInputs([])
    setDraft('')
  }

  return (
    <Panel
      title="Simulator"
      actions={
        <Button variant="ghost" onClick={reset}>
          Reset
        </Button>
      }
    >
      <div className="mx-auto max-w-[18rem] rounded-[2rem] border-[6px] border-slate-800 bg-slate-800 p-1 shadow-lg">
        <div className="rounded-[1.4rem] bg-slate-100 p-3">
          <div className="mb-2 flex items-center justify-between text-[10px] font-medium text-slate-500">
            <span>USSD</span>
            <span className={ended ? 'text-slate-500' : 'text-emerald-700'}>{ended ? 'Session ended' : 'Session open'}</span>
          </div>
          <div
            className="min-h-40 rounded-lg bg-white p-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-900 shadow-inner"
            aria-live="polite"
            data-testid="simulator-screen"
          >
            {reply.message}
          </div>
          {ended ? (
            <Button variant="primary" className="mt-3 w-full" onClick={reset}>
              Dial again
            </Button>
          ) : (
            <form onSubmit={send} className="mt-3 flex gap-2">
              <input
                aria-label="Reply"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Type a key"
                className={`${inputClass} text-center font-mono`}
              />
              <Button type="submit" variant="primary" disabled={draft.trim() === ''}>
                Send
              </Button>
            </form>
          )}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">Gateway text</dt>
        <dd className="truncate font-mono text-slate-800">{JSON.stringify(text)}</dd>
        <dt className="text-slate-500">Response</dt>
        <dd className="font-mono text-slate-800">
          {reply.type} {reply.screenId ? `from ${reply.screenId}` : '(engine error)'}
        </dd>
      </dl>
    </Panel>
  )
}
