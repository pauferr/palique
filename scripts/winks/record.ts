// Records winks from scripts/winks/winks.js into src/renderer/src/assets/winks/<id>.webm.
// Chrome plays each one in real time and records it with MediaRecorder (VP9 keeps the
// alpha channel, plus Opus sound), so no ffmpeg is needed.
// Run: node scripts/winks/record.ts [id ...]   (all of them without ids)
// CHROME=/path/to/chrome if it isn't in the usual macOS place.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const out = join(here, '../../src/renderer/src/assets/winks')
const chromePath =
  process.env['CHROME'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9339
const profile = mkdtempSync(join(tmpdir(), 'palique-winks-'))

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--autoplay-policy=no-user-gesture-required',
  pathToFileURL(join(here, 'record.html')).href
])

type Target = { type: string; webSocketDebuggerUrl: string }

async function page(): Promise<Target> {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Target[]
      const found = targets.find((t) => t.type === 'page')
      if (found) return found
    } catch {
      // Chrome isn't listening yet.
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Chrome didn't start (${chromePath})`)
}

try {
  const ws = new WebSocket((await page()).webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let next = 0
  const evaluate = (expression: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++next
      const listener = (event: MessageEvent): void => {
        const message = JSON.parse(String(event.data))
        if (message.id !== id) return
        ws.removeEventListener('message', listener)
        const result = message.result
        if (result?.exceptionDetails) reject(new Error(result.exceptionDetails.text))
        else resolve(result?.result?.value)
      }
      ws.addEventListener('message', listener)
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true }
        })
      )
    })

  // The page's scripts load after the first paint; wait until it says which winks exist.
  let all: string[] = []
  for (let i = 0; i < 50 && !all.length; i++) {
    all = ((await evaluate('window.ids')) as string[] | undefined) ?? []
    if (!all.length) await new Promise((r) => setTimeout(r, 100))
  }
  const asked = process.argv.slice(2)
  const unknown = asked.filter((id) => !all.includes(id))
  if (unknown.length) throw new Error(`Unknown winks: ${unknown.join(', ')}`)

  for (const id of asked.length ? asked : all) {
    const base64 = (await evaluate(`window.record(${JSON.stringify(id)})`)) as string
    const bytes = Buffer.from(base64, 'base64')
    writeFileSync(join(out, `${id}.webm`), bytes)
    console.log(`${id}.webm ${Math.round(bytes.length / 1024)} KB`)
  }
  ws.close()
} finally {
  // Its profile can only go once Chrome has really quit.
  const quit = new Promise((r) => chrome.once('exit', r))
  chrome.kill()
  await quit
  rmSync(profile, { recursive: true, force: true })
}
