import type { Dispatch } from 'react'
import type { EditorAction } from '@/lib/editor'
import type { Problem } from '@/lib/validate'
import { Panel } from './ui'

export function ProblemsPanel({ problems, dispatch }: { problems: Problem[]; dispatch: Dispatch<EditorAction> }) {
  const errors = problems.filter((p) => p.severity === 'error').length
  const warnings = problems.length - errors

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Validation
          {errors > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">{errors} error{errors === 1 ? '' : 's'}</span>}
          {warnings > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{warnings} warning{warnings === 1 ? '' : 's'}</span>
          )}
        </span>
      }
    >
      {problems.length === 0 ? (
        <p className="text-sm text-emerald-800">No problems found. The flow is ready to export.</p>
      ) : (
        <ul className="grid gap-1.5">
          {problems.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!p.screenId}
                onClick={() => p.screenId && dispatch({ type: 'select', id: p.screenId })}
                className="flex w-full gap-2 rounded-md p-1.5 text-left text-xs hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded px-1 font-semibold uppercase ${
                    p.severity === 'error' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {p.severity === 'error' ? 'Error' : 'Warn'}
                </span>
                <span className="text-slate-700">{p.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
