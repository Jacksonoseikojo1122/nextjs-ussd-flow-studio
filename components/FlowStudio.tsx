'use client'

import { useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent } from 'react'
import { downloadText, loadStoredFlow, storeFlow } from '@/lib/browser'
import { editorReducer, initEditor } from '@/lib/editor'
import { FlowParseError, getScreen, parseFlow, type Flow } from '@/lib/flow'
import { SAMPLE_FLOW } from '@/lib/sample-flow'
import { validateFlow } from '@/lib/validate'
import { ExportPanel } from './ExportPanel'
import { ProblemsPanel } from './ProblemsPanel'
import { ScreenEditor } from './ScreenEditor'
import { ScreenList } from './ScreenList'
import { Simulator } from './Simulator'
import { Button } from './ui'

type Notice = { kind: 'info' | 'error'; text: string } | null

export function FlowStudio() {
  const [state, dispatch] = useReducer(editorReducer, SAMPLE_FLOW, initEditor)
  const [hydrated, setHydrated] = useState(false)
  const [sessionKey, setSessionKey] = useState(0)
  const [notice, setNotice] = useState<Notice>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const { flow, selectedId } = state
  const problems = useMemo(() => validateFlow(flow), [flow])
  const errorCount = problems.filter((p) => p.severity === 'error').length
  const selected = getScreen(flow, selectedId)

  // Restore after mount (not during render) so server and client HTML match.
  useEffect(() => {
    const stored = loadStoredFlow()
    if (stored) dispatch({ type: 'load', flow: stored })
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) storeFlow(flow)
  }, [flow, hydrated])

  const load = (next: Flow, message: string) => {
    dispatch({ type: 'load', flow: next })
    setSessionKey((k) => k + 1)
    setNotice({ kind: 'info', text: message })
  }

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      load(parseFlow(JSON.parse(await file.text())), `Imported ${file.name}.`)
    } catch (err) {
      const reason = err instanceof FlowParseError ? err.message : err instanceof SyntaxError ? 'File is not valid JSON.' : 'Could not read file.'
      setNotice({ kind: 'error', text: `Import failed: ${reason}` })
    }
  }

  const resetToSample = () => {
    if (window.confirm('Replace the current flow with the Demo Wallet sample? Unsaved changes will be lost.')) {
      load(SAMPLE_FLOW, 'Loaded the Demo Wallet sample.')
    }
  }

  return (
    <div className="mx-auto flex max-w-[90rem] flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">USSD Flow Studio</h1>
          <p className="text-sm text-slate-600">Design a USSD menu, test it in the simulator, export a server.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={importFile} />
          <Button onClick={() => fileInput.current?.click()}>Import JSON</Button>
          <Button onClick={() => downloadText('ussd-flow.json', `${JSON.stringify(flow, null, 2)}\n`, 'application/json')}>
            Export JSON
          </Button>
          <Button variant="ghost" onClick={resetToSample}>
            Reset to sample
          </Button>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
            notice.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" className="text-xs underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
        <ScreenList flow={flow} selectedId={selectedId} problems={problems} dispatch={dispatch} />

        {selected ? (
          <ScreenEditor
            flow={flow}
            screen={selected}
            problems={problems.filter((p) => p.screenId === selected.id)}
            dispatch={dispatch}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">Select a screen to edit it.</p>
        )}

        <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
          <Simulator key={sessionKey} flow={flow} />
          <ProblemsPanel problems={problems} dispatch={dispatch} />
        </div>
      </div>

      <ExportPanel flow={flow} errorCount={errorCount} />
    </div>
  )
}
