import type { Dispatch } from 'react'
import type { EditorAction } from '@/lib/editor'
import type { Flow, ScreenId } from '@/lib/flow'
import type { Problem } from '@/lib/validate'
import { Button, Panel } from './ui'

export function ScreenList({
  flow,
  selectedId,
  problems,
  dispatch,
}: {
  flow: Flow
  selectedId: ScreenId
  problems: Problem[]
  dispatch: Dispatch<EditorAction>
}) {
  const severityFor = (id: ScreenId) => {
    const own = problems.filter((p) => p.screenId === id)
    if (own.some((p) => p.severity === 'error')) return 'error'
    return own.length > 0 ? 'warning' : null
  }

  return (
    <Panel
      title={`Screens (${Object.keys(flow.nodes).length})`}
      actions={
        <Button variant="ghost" onClick={() => dispatch({ type: 'addScreen' })} aria-label="Add screen">
          + Add
        </Button>
      }
    >
      <ul className="-mx-2 flex flex-col gap-0.5">
        {Object.values(flow.nodes).map((screen) => {
          const active = screen.id === selectedId
          const severity = severityFor(screen.id)
          return (
            <li key={screen.id}>
              <button
                type="button"
                onClick={() => dispatch({ type: 'select', id: screen.id })}
                aria-current={active ? 'true' : undefined}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                  active ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    screen.kind === 'end' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {screen.kind === 'end' ? 'END' : 'CON'}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{screen.id}</span>
                {screen.id === flow.start && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">start</span>
                )}
                {severity && (
                  <span
                    className={`size-2 shrink-0 rounded-full ${severity === 'error' ? 'bg-red-500' : 'bg-amber-400'}`}
                    title={severity === 'error' ? 'Has errors' : 'Has warnings'}
                  />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
