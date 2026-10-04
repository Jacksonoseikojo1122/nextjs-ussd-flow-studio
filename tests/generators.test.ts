import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatReply, respond } from '../lib/engine'
import type { Flow } from '../lib/flow'
import { FlowHasErrorsError, generate, generateExpress, generateFastAPI, toPortableFlow } from '../lib/generators'
import { SAMPLE_FLOW } from '../lib/sample-flow'
import { clone, DUPLICATE_PROMPT_FLOW, TRICKY_TEXT_FLOW } from './fixtures'

/** Inputs replayed against every target; expectations come from the TypeScript engine. */
const CASES: Array<[name: string, flow: Flow, inputs: string[]]> = [
  ['sample', SAMPLE_FLOW, ['', '1', '1*2', '1*2*3', '1*0', '1*1*0*0*2', '2', '2*9', '3', '9', '1*7', '1*', '*', ' 1']],
  ['duplicate prompts', DUPLICATE_PROMPT_FLOW, ['', '1', '2', '1*1', '2*1', '1*2']],
  ['tricky text', TRICKY_TEXT_FLOW, ['', '1', '2']],
]

// Generated files live inside the repo so `import 'express'` resolves from node_modules.
const TMP_ROOT = join(process.cwd(), '.test-tmp')
let tmpDir: string

beforeAll(() => {
  mkdirSync(TMP_ROOT, { recursive: true })
  tmpDir = mkdtempSync(join(TMP_ROOT, 'gen-'))
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('generator output', () => {
  it('refuses to generate code for a flow with validation errors', () => {
    const broken = clone(SAMPLE_FLOW)
    broken.nodes.main.options[0].next = 'missing'
    expect(() => generateExpress(broken)).toThrow(FlowHasErrorsError)
    expect(() => generateFastAPI(broken)).toThrow(FlowHasErrorsError)
  })

  it('embeds the flow as data keyed by screen id', () => {
    const js = generateExpress(SAMPLE_FLOW)
    expect(js).toContain(`const FLOW = ${JSON.stringify(toPortableFlow(SAMPLE_FLOW), null, 2)}`)
    const py = generateFastAPI(SAMPLE_FLOW)
    expect(py).toContain(`FLOW = ${JSON.stringify(toPortableFlow(SAMPLE_FLOW), null, 4)}`)
  })

  it('routes by option key and screen id, never by prompt text', () => {
    const js = generateExpress(SAMPLE_FLOW)
    expect(js).toContain("screen.options.find((o) => o.key === key)")
    expect(js).toContain('getScreen(option.next)')
    expect(js).not.toMatch(/\.prompt\s*===/)
    expect(js).not.toMatch(/startsWith\(/)

    const py = generateFastAPI(SAMPLE_FLOW)
    expect(py).toContain('if o["key"] == key')
    expect(py).toContain('get_screen(option["next"])')
    expect(py).not.toMatch(/\["prompt"\]\s*==/)
    expect(py).not.toContain('startswith(')
  })

  it('uses the same reply texts as the engine', () => {
    for (const code of [generateExpress(SAMPLE_FLOW), generateFastAPI(SAMPLE_FLOW)]) {
      expect(code).toContain('"END Invalid option."')
      expect(code).toContain('"END Service unavailable."')
    }
  })

  it('drops options from end screens in the exported data', () => {
    const flow = clone(SAMPLE_FLOW)
    flow.nodes.balance.options = [{ key: '1', label: 'Ghost', next: 'main' }]
    expect(toPortableFlow(flow).nodes.balance.options).toEqual([])
  })

  it('names files per target', () => {
    expect(generate('express', SAMPLE_FLOW)).toMatchObject({ filename: 'ussd-server.mjs', language: 'javascript' })
    expect(generate('fastapi', SAMPLE_FLOW)).toMatchObject({ filename: 'ussd_app.py', language: 'python' })
  })
})

async function startServer(file: string): Promise<{ child: ChildProcess; port: number }> {
  const child = spawn(process.execPath, [file], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
  const port = await new Promise<number>((resolve, reject) => {
    let out = ''
    let err = ''
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${out}\n${err}`)), 10_000)
    child.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      const match = /listening on port (\d+)/.exec(out)
      if (match) {
        clearTimeout(timer)
        resolve(Number(match[1]))
      }
    })
    child.stderr!.on('data', (chunk: Buffer) => (err += chunk.toString()))
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`server exited with code ${code}:\n${err}`))
    })
  })
  return { child, port }
}

describe.each(CASES)('generated Express server (%s flow)', (name, flow, inputs) => {
  let server: { child: ChildProcess; port: number }

  beforeAll(async () => {
    const file = join(tmpDir, `${name.replace(/\W+/g, '-')}.mjs`)
    writeFileSync(file, generateExpress(flow))
    server = await startServer(file)
  })

  afterAll(() => {
    server?.child.kill()
  })

  it.each(inputs)('answers text=%j exactly like the engine', async (text) => {
    const res = await fetch(`http://127.0.0.1:${server.port}/ussd`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ sessionId: 'ATUid_test', serviceCode: '*920#', phoneNumber: '+233200000000', text }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/)
    expect(await res.text()).toBe(formatReply(respond(flow, text)))
  })

  it('treats a request without a text field as the first dial', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/ussd`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'sessionId=abc',
    })
    expect(await res.text()).toBe(formatReply(respond(flow, '')))
  })
})

/**
 * The FastAPI target is exercised when a Python 3 interpreter is available
 * (always true on the CI runners). FastAPI itself is replaced by a tiny stub so
 * the test needs no pip packages; it runs the generated `handle_ussd` verbatim.
 */
function findPython(): string | null {
  for (const cmd of ['python3', 'python']) {
    const probe = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === '3') return cmd
  }
  return null
}

const PYTHON = findPython()

const PY_HARNESS = `
import json, sys, types

fastapi = types.ModuleType("fastapi")
responses = types.ModuleType("fastapi.responses")

class FastAPI:
    def post(self, *args, **kwargs):
        return lambda fn: fn

fastapi.FastAPI = FastAPI
fastapi.Form = lambda default=None, **kwargs: default
responses.PlainTextResponse = object
sys.modules["fastapi"] = fastapi
sys.modules["fastapi.responses"] = responses

namespace = {"__name__": "ussd_app"}
with open(sys.argv[1], encoding="utf-8") as source:
    exec(compile(source.read(), sys.argv[1], "exec"), namespace)

inputs = json.loads(sys.stdin.read())
sys.stdout.write(json.dumps([namespace["handle_ussd"](text) for text in inputs]))
`

describe.skipIf(!PYTHON).each(CASES)('generated FastAPI app (%s flow)', (name, flow, inputs) => {
  it('answers every input exactly like the engine', () => {
    const file = join(tmpDir, `${name.replace(/\W+/g, '_')}.py`)
    const harness = join(tmpDir, 'harness.py')
    writeFileSync(file, generateFastAPI(flow))
    writeFileSync(harness, PY_HARNESS)
    const result = spawnSync(PYTHON!, [harness, file], { input: JSON.stringify(inputs), encoding: 'utf8' })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(inputs.map((text) => formatReply(respond(flow, text))))
  })
})
