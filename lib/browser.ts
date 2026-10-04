import { parseFlow, type Flow } from './flow'

/** Browser-only helpers. Storage can be unavailable (private mode, quota, blocked cookies), so every access is guarded. */

const STORAGE_KEY = 'ussd-flow-studio:flow:v1'

export function loadStoredFlow(): Flow | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? parseFlow(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function storeFlow(flow: Flow): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flow))
  } catch {
    // Persistence is a convenience; the editor keeps working without it.
  }
}

export function downloadText(filename: string, content: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
