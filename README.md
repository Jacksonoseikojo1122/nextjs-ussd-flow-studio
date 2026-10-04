# USSD Flow Studio

[![CI](https://github.com/Jacksonoseikojo1122/nextjs-ussd-flow-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Jacksonoseikojo1122/nextjs-ussd-flow-studio/actions/workflows/ci.yml)

A browser-based designer for USSD menu flows. Build the screens, check the flow
in a phone-style simulator, fix any validation problems it reports, then export
a standalone **Express** or **FastAPI** server that answers USSD gateway
callbacks with exactly the responses you saw in the simulator.

Built with Next.js 15, React 19, TypeScript and Tailwind CSS 4.

## Features

- **Screen editor**: menu screens (`CON`) and end screens (`END`), numbered
  options linked to other screens, option reordering, and renaming a screen
  updates every link that points to it.
- **Live simulator**: type keys and step through the flow as a caller would.
  It shows the gateway `text` string being replayed (for example `"1*2"`) and
  which screen answered. It uses the same engine that the tests check.
- **Validation**: problems appear next to the field that causes them and in a
  Validation panel. Code export is disabled while the flow has errors.
- **Code export** for Express (Node.js) and FastAPI (Python). You can preview,
  copy or download the code. The flow is embedded in the file as data.
- **Import and export the flow as JSON**. The flow is also saved to
  `localStorage`; if storage is unavailable, the editor keeps working without it.
- **Sample flow**: a "Demo Wallet" menu with buy airtime (network, then
  amount), check balance and exit.
- Responsive layout. It works on a phone-sized screen and uses three columns on
  a wide display.

## Quickstart

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script              | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | Start the Next.js dev server                            |
| `npm run build`     | Production build (also lints and type-checks)           |
| `npm start`         | Serve the production build                              |
| `npm test`          | Run the Vitest suite                                    |
| `npm run typecheck` | Generate Next route types, then `tsc --noEmit`          |
| `npm run lint`      | ESLint (`next/core-web-vitals` + `next/typescript`)     |

## How flows are modelled

The model, engine, validator and code generators in [`lib/`](lib) are pure,
typed functions with no React or browser dependencies.

```ts
type Flow = {
  start: ScreenId
  nodes: Record<ScreenId, Screen>
}

type Screen = {
  id: ScreenId
  prompt: string
  kind: 'menu' | 'end'          // menu -> "CON ...", end -> "END ..."
  options: { key: string; label: string; next: ScreenId }[]
}
```

Routing is always **by screen id**. Two screens can share the same prompt text,
and a prompt that happens to start with "END" is still just text. Only `kind`
decides whether a session continues.

### Runtime semantics

USSD gateways (Africa's Talking style) send the caller's whole input history
on every request as a `*`-joined `text` field: `""` on first dial, then `"1"`,
`"1*2"`, and so on. `respond(flow, text)` in
[`lib/engine.ts`](lib/engine.ts) replays that history:

1. Start at `flow.start`. If that screen is missing, reply `END Service unavailable.`
2. For each key, find the option with that exact key on the current screen and
   move to its `next` screen. If there is no such option, or the target screen
   doesn't exist, reply `END Invalid option.`
3. Once an end screen is reached the session is over and any further keys are
   ignored.
4. Render the screen it stops on:
   - menu: `CON <prompt>` followed by one `<key>. <label>` line per option
   - end: `END <prompt>`

```
CON Welcome to Demo Wallet
1. Buy airtime
2. Check balance
3. Exit
```

Screens are looked up as own properties only, so ids such as `constructor`
never resolve to `Object.prototype` members.

## Validation rules

`validateFlow(flow)` in [`lib/validate.ts`](lib/validate.ts) returns a list of
problems, each tagged with the screen and option it belongs to.

| Rule                                                    | Severity |
| ------------------------------------------------------- | -------- |
| Start screen is not set or does not exist               | error    |
| Menu screen has no options                              | error    |
| Option key is empty or not digits only (`*` is the separator) | error |
| Duplicate option key on the same screen                 | error    |
| Option is not linked to a screen                        | error    |
| Option points to a screen that does not exist           | error    |
| Screen cannot be reached from the start screen          | warning  |
| Prompt is empty                                         | warning  |
| End screen still has options (they are ignored)         | warning  |
| Rendered screen is longer than 182 characters           | warning  |

Errors block code export, both in the UI and in the generators themselves,
which throw `FlowHasErrorsError`. Warnings are shown but don't block export.
Deleting a screen unlinks any options that pointed to it, so the validator
flags them. The start screen can't be deleted.

## Export targets

| Target  | File              | Run                                                                    |
| ------- | ----------------- | ---------------------------------------------------------------------- |
| Express | `ussd-server.mjs` | `npm install express && node ussd-server.mjs` (listens on `$PORT`, default 3000) |
| FastAPI | `ussd_app.py`     | `pip install fastapi uvicorn python-multipart && uvicorn ussd_app:app` |

Both expose `POST /ussd`. It accepts a form-encoded body with a `text` field
and returns a `text/plain` `CON`/`END` response. Other gateway fields such as
`sessionId` and `phoneNumber` are accepted and ignored. Each generated file
embeds the flow as a `FLOW` constant and ports `respond()` line for line.

An excerpt of the generated Express server (the embedded `FLOW` is shortened here):

```js
import express from 'express'

const FLOW = {
  "start": "main",
  "nodes": {
    "main": {
      "id": "main",
      "prompt": "Welcome to Demo Wallet",
      "kind": "menu",
      "options": [
        { "key": "1", "label": "Buy airtime", "next": "airtime_network" },
        // ...
}

function getScreen(id) {
  return Object.prototype.hasOwnProperty.call(FLOW.nodes, id) ? FLOW.nodes[id] : undefined
}

function render(screen) {
  if (screen.kind === 'end') return 'END ' + screen.prompt
  const lines = [screen.prompt, ...screen.options.map((o) => o.key + '. ' + o.label)]
  return 'CON ' + lines.join('\n')
}

export function handleUssd(text) {
  let screen = getScreen(FLOW.start)
  if (!screen) return "END Service unavailable."

  const keys = text === '' ? [] : text.split('*')
  for (const key of keys) {
    if (screen.kind === 'end') break
    const option = screen.options.find((o) => o.key === key)
    const next = option ? getScreen(option.next) : undefined
    if (!next) return "END Invalid option."
    screen = next
  }
  return render(screen)
}

const app = express()
app.use(express.urlencoded({ extended: false }))

app.post('/ussd', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : ''
  res.type('text/plain').send(handleUssd(text))
})
```

Limitations: flows are menu-driven, so every step is a choice from fixed
option keys. There is no free-text input (such as typing an amount), no
session variables and no calls to external services. Add those to the exported
server yourself.

## Testing

```bash
npm test
```

The [Vitest](https://vitest.dev) suite in [`tests/`](tests) covers:

- **Engine**: first dial, nested menus, Back-option cycles, END handling,
  input after END, invalid and empty keys, duplicate prompts routed by id,
  missing start, dangling links, prototype-key lookups, no mutation.
- **Validator and JSON import**: every rule above, reachability through
  cycles, and rejection of malformed imported JSON.
- **Editor reducer**: every action returns new state without mutating the
  previous one; renaming rewrites links; deleting unlinks them.
- **Generated Express server**: the generated file is written to disk, started
  with `node` on a random port, and sent real form-encoded `POST /ussd`
  requests. Each response must match `respond()` exactly. This covers the
  sample flow, a flow with duplicate prompts, and prompts containing quotes,
  backslashes, `${...}` and newlines.
- **Generated FastAPI app**: the generated module runs under Python 3, with
  FastAPI stubbed so no pip install is needed. Its `handle_ussd()` must match
  `respond()` for the same inputs. These tests are skipped if no Python 3
  interpreter is found; CI installs one.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint,
typecheck, tests and a production build on Node 20 and 22.

## Project layout

```
app/            Next.js App Router entry (layout, page, global styles)
components/     Editor UI: screen list, screen editor, simulator, validation, export
lib/            Pure model, engine, validator, generators, reducer, sample flow
tests/          Vitest suites
```

## Related projects

- [node-ussd-gateway](https://github.com/Jacksonoseikojo1122/node-ussd-gateway): stateless USSD service in Node.js/Express for Africa's Talking-style gateways
- [fastapi-ussd-gateway](https://github.com/Jacksonoseikojo1122/fastapi-ussd-gateway): the same service in Python/FastAPI

---

Built by Jackson Kojo Osei — [LinkedIn](https://www.linkedin.com/in/jackson-kojo-osei-740846189)
