'use client'

import { useMemo, useState } from 'react'
import { downloadText } from '@/lib/browser'
import type { Flow } from '@/lib/flow'
import { generate, type ExportTarget } from '@/lib/generators'
import { Button, Panel } from './ui'

const TARGETS: { id: ExportTarget; label: string }[] = [
  { id: 'express', label: 'Express (Node.js)' },
  { id: 'fastapi', label: 'FastAPI (Python)' },
]

export function ExportPanel({ flow, errorCount }: { flow: Flow; errorCount: number }) {
  const [target, setTarget] = useState<ExportTarget>('express')
  const [copied, setCopied] = useState(false)
  const blocked = errorCount > 0
  const file = useMemo(() => (blocked ? null : generate(target, flow)), [blocked, target, flow])

  const copy = async () => {
    if (!file) return
    try {
      await navigator.clipboard.writeText(file.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Panel
      title="Export server code"
      actions={
        <>
          <Button variant="ghost" disabled={!file} onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="primary"
            disabled={!file}
            onClick={() => file && downloadText(file.filename, file.code, file.language === 'python' ? 'text/x-python' : 'text/javascript')}
          >
            Download {file?.filename ?? ''}
          </Button>
        </>
      }
    >
      <div role="tablist" aria-label="Export target" className="mb-3 flex gap-1 border-b border-slate-200">
        {TARGETS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={target === t.id}
            onClick={() => setTarget(t.id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
              target === t.id ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {file ? (
        <pre className="max-h-96 overflow-auto rounded-md bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
          <code>{file.code}</code>
        </pre>
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Export is disabled while the flow has {errorCount} validation error{errorCount === 1 ? '' : 's'}. Fix them in the
          Validation panel to generate code.
        </p>
      )}
    </Panel>
  )
}
