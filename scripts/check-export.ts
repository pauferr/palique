// History export check (no server needed). Run: npm run check:export
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportHistory } from '../src/main/export.ts'
import { openHistory } from '../src/main/history.ts'

const me = 'tere@localhost'
// JIDs are random ids: the export shows display names instead.
const names: Record<string, string> = { [me]: 'Tere', 'lolo@localhost': 'Lolo' }
const name = (jid: string): string => names[jid] ?? 'Sin nombre'
const history = openHistory(join(mkdtempSync(join(tmpdir(), 'palique-')), 'history.sqlite'))
const at = Date.UTC(2026, 9, 4, 11, 30)
const save = (
  id: string,
  contact: string,
  mine: boolean,
  body: string,
  buzz = false,
  wink = ''
): void =>
  history.save(me, { id, with: contact, mine, body, buzz, wink, at: at + Number(id) * 60_000 })

save('2', 'lolo@localhost', true, 'Voy\ncon el bocata')
save('1', 'lolo@localhost', false, '¿Bajas?')
save('3', 'lolo@localhost', false, '', true)
save('4', 'chusa@localhost', false, '<script>alert("hola")</script> & "AsÍ"')
save('5', 'lolo@localhost', true, '', false, 'burbuja')
history.save('fina@localhost', {
  id: 'x',
  with: 'lolo@localhost',
  mine: false,
  body: 'ajeno',
  buzz: false,
  wink: '',
  at
})

const messages = history.all(me)
assert.deepEqual(
  messages.map((m) => `${m.with}:${m.id}`),
  [
    'chusa@localhost:4',
    'lolo@localhost:1',
    'lolo@localhost:2',
    'lolo@localhost:3',
    'lolo@localhost:5'
  ]
)

// Plain text: one section per contact, multi-line bodies indented, buzz marked.
const txt = exportHistory('txt', me, messages, name)
assert.match(txt, /^Historial de Palique de Tere/)
assert.match(
  txt,
  /=== Conversación con Lolo ===\n\[.+\] Lolo: ¿Bajas\?\n\[.+\] Tere: Voy\n {4}con el bocata\n\[.+\] Lolo: \*zumbido\*/
)
assert.match(txt, /\] Tere: \*guiño: burbuja\*/)
assert.match(txt, /=== Conversación con Sin nombre ===/)
assert.doesNotMatch(txt, /ajeno|@localhost/)

// HTML: user text is escaped, never markup.
const html = exportHistory('html', me, messages, name)
assert.ok(html.startsWith('<!doctype html>'))
assert.ok(!html.includes('<script>'))
assert.ok(
  html.includes('&lt;script&gt;alert(&quot;hola&quot;)&lt;/script&gt; &amp; &quot;AsÍ&quot;')
)
assert.ok(html.includes('¡Lolo ha enviado un zumbido!'))
assert.ok(html.includes('¡Tere ha enviado un guiño: burbuja!'))
assert.ok(!html.includes('@localhost'))

// JSON: lossless, versioned.
const json = JSON.parse(exportHistory('json', me, messages, name))
assert.equal(json.format, 'palique-history')
assert.equal(json.version, 1)
assert.equal(json.account, me)
assert.deepEqual(json.messages[2], {
  contact: 'lolo@localhost',
  id: '2',
  mine: true,
  body: 'Voy\ncon el bocata',
  buzz: false,
  wink: '',
  at: at + 2 * 60_000
})

console.log('export check passed')
