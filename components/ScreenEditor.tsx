'use client'

import { useId, useState, type Dispatch } from 'react'
import { renameError, type EditorAction } from '@/lib/editor'
import { renderScreen } from '@/lib/engine'
import { getScreen, type Flow, type Screen } from '@/lib/flow'
import { MAX_SCREEN_LENGTH, type Problem } from '@/lib/validate'
import { Button, inputClass, Panel } from './ui'

function ScreenIdField({ flow, screen, dispatch }: { flow: Flow; screen: Screen; dispatch: Dispatch<EditorAction> }) {
  const [draft, setDraft] = useState(screen.id)
  const error = renameError(flow, screen.id, draft)
  const inputId = useId()

  const commit = () => {
    if (error) return
    dispatch({ type: 'renameScreen', id: screen.id, newId: draft })
  }

  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-slate-600">
        Screen id
      </label>
      <input
        id={inputId}
        value={draft}
        onChange={(e) => setDraft(e.target.value.trim())}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(screen.id)
        }}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} font-mono`}
        spellCheck={false}
      />
      {error ? (
        <p className="mt-1 text-xs text-red-700">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">Links are by id. Renaming updates every option that points here.</p>
      )}
    </div>
  )
}

export function ScreenEditor({
  flow,
  screen,
  problems,
  dispatch,
}: {
  flow: Flow
  screen: Screen
  problems: Problem[]
  dispatch: Dispatch<EditorAction>
}) {
  const promptId = useId()
  const isStart = flow.start === screen.id
  const length = renderScreen(screen).length
  const optionProblems = (index: number) => problems.filter((p) => p.optionIndex === index)
  const screenProblems = problems.filter((p) => p.optionIndex === undefined)

  return (
    <Panel
      title={
        <span>
          Edit screen <span className="font-mono text-emerald-800">{screen.id}</span>
        </span>
      }
      actions={
        <>
          <Button variant="ghost" disabled={isStart} onClick={() => dispatch({ type: 'setStart', id: screen.id })}>
            {isStart ? 'Start screen' : 'Make start'}
          </Button>
          <Button
            variant="danger"
            disabled={isStart}
            title={isStart ? 'Choose another start screen before deleting this one' : undefined}
            onClick={() => dispatch({ type: 'deleteScreen', id: screen.id })}
          >
            Delete
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <ScreenIdField key={screen.id} flow={flow} screen={screen} dispatch={dispatch} />
          <fieldset>
            <legend className="mb-1 block text-xs font-medium text-slate-600">Screen type</legend>
            <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-sm">
              {(['menu', 'end'] as const).map((kind) => (
                <label
                  key={kind}
                  className={`cursor-pointer rounded px-3 py-1 has-focus-visible:outline-2 has-focus-visible:outline-emerald-600 ${
                    screen.kind === kind ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="radio"
                    name={`kind-${screen.id}`}
                    value={kind}
                    checked={screen.kind === kind}
                    onChange={() => dispatch({ type: 'updateScreen', id: screen.id, patch: { kind } })}
                    className="sr-only"
                  />
                  {kind === 'menu' ? 'Menu (CON)' : 'End (END)'}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label htmlFor={promptId} className="text-xs font-medium text-slate-600">
              Prompt
            </label>
            <span className={`text-xs tabular-nums ${length > MAX_SCREEN_LENGTH ? 'text-amber-700' : 'text-slate-500'}`}>
              {length}/{MAX_SCREEN_LENGTH} chars on screen
            </span>
          </div>
          <textarea
            id={promptId}
            value={screen.prompt}
            onChange={(e) => dispatch({ type: 'updateScreen', id: screen.id, patch: { prompt: e.target.value } })}
            rows={2}
            className={inputClass}
          />
        </div>

        {screen.kind === 'menu' ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium text-slate-600">Options</h3>
              <Button onClick={() => dispatch({ type: 'addOption', id: screen.id })}>+ Add option</Button>
            </div>
            {screen.options.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                No options yet. A menu needs at least one, or switch this screen to End.
              </p>
            ) : (
              <ol className="grid gap-2">
                <li className="hidden grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:grid">
                  <span>Key</span>
                  <span>Label</span>
                  <span>Goes to</span>
                  <span className="w-[6.5rem]" />
                </li>
                {screen.options.map((option, index) => {
                  const issues = optionProblems(index)
                  const invalid = issues.some((p) => p.severity === 'error')
                  return (
                    <li key={index} className={`rounded-md p-1 ${invalid ? 'bg-red-50 ring-1 ring-red-200' : ''}`}>
                      <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2 sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <input
                          aria-label={`Option ${index + 1} key`}
                          value={option.key}
                          inputMode="numeric"
                          onChange={(e) =>
                            dispatch({ type: 'updateOption', id: screen.id, index, patch: { key: e.target.value.trim() } })
                          }
                          className={`${inputClass} text-center font-mono`}
                        />
                        <input
                          aria-label={`Option ${index + 1} label`}
                          placeholder="Label shown to caller"
                          value={option.label}
                          onChange={(e) => dispatch({ type: 'updateOption', id: screen.id, index, patch: { label: e.target.value } })}
                          className={inputClass}
                        />
                        <select
                          aria-label={`Option ${index + 1} target screen`}
                          value={option.next}
                          onChange={(e) => dispatch({ type: 'updateOption', id: screen.id, index, patch: { next: e.target.value } })}
                          className={`${inputClass} col-span-2 font-mono sm:col-span-1`}
                        >
                          <option value="">Choose a screen...</option>
                          {option.next !== '' && !getScreen(flow, option.next) && (
                            <option value={option.next}>{option.next} (missing)</option>
                          )}
                          {Object.keys(flow.nodes).map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </select>
                        <div className="col-span-2 flex justify-end gap-0.5 sm:col-span-1">
                          <Button
                            variant="ghost"
                            className="px-2"
                            aria-label={`Move option ${index + 1} up`}
                            disabled={index === 0}
                            onClick={() => dispatch({ type: 'moveOption', id: screen.id, index, direction: -1 })}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="ghost"
                            className="px-2"
                            aria-label={`Move option ${index + 1} down`}
                            disabled={index === screen.options.length - 1}
                            onClick={() => dispatch({ type: 'moveOption', id: screen.id, index, direction: 1 })}
                          >
                            ↓
                          </Button>
                          <Button
                            variant="ghost"
                            className="px-2 hover:text-red-700"
                            aria-label={`Remove option ${index + 1}`}
                            onClick={() => dispatch({ type: 'removeOption', id: screen.id, index })}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                      {issues.map((p, i) => (
                        <p key={i} className={`mt-1 px-1 text-xs ${p.severity === 'error' ? 'text-red-700' : 'text-amber-800'}`}>
                          {p.message}
                        </p>
                      ))}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        ) : (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            End screens show their prompt and close the session.
            {screen.options.length > 0 &&
              ` This screen still has ${screen.options.length} option(s) from when it was a menu; they are ignored and left out of exported code.`}
          </p>
        )}

        {screenProblems.length > 0 && (
          <ul className="grid gap-1">
            {screenProblems.map((p, i) => (
              <li key={i} className={`text-xs ${p.severity === 'error' ? 'text-red-700' : 'text-amber-800'}`}>
                {p.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
