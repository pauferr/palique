// Invisible status check against the local Prosody (`docker compose up -d` first).
// "A" uses the app's xmpp module; "B" is a plain client. Run: npm run check:invisible
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import * as A from '../src/main/xmpp.ts'
import { register } from './invite.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const pass = 'Check-pass1'
const at = (user: string): string => `${user}@localhost`
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function until<T>(get: () => T | undefined | false, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = setInterval(() => {
      const value = get()
      if (value) {
        clearInterval(poll)
        resolve(value)
      } else if (Date.now() - started > 5000) {
        clearInterval(poll)
        reject(new Error(`timeout: ${label}`))
      }
    }, 50)
  })
}

const accounts: string[] = []
for (const name of ['inva', 'invb']) {
  accounts.push(await register(`${name}${id}`, pass))
  await A.logout()
}
const [a, b] = accounts

// B tracks whether it currently sees A online, and A's messages.
let aOnline = false
async function startB(): Promise<ReturnType<typeof client>> {
  const B = client({
    service: 'xmpp://localhost:5222',
    domain: 'localhost',
    username: b,
    password: pass
  })
  B.on('error', () => {})
  B.on('stanza', (s) => {
    if (s.is('presence') && s.attrs.type === 'subscribe') {
      B.send(xml('presence', { to: s.attrs.from, type: 'subscribed' }))
      B.send(xml('presence', { to: s.attrs.from, type: 'subscribe' }))
    }
    if (s.is('presence') && s.attrs.from?.startsWith(at(a))) {
      if (!s.attrs.type) aOnline = true
      if (s.attrs.type === 'unavailable') aOnline = false
    }
  })
  await B.start()
  await B.iqCaller.request(xml('iq', { type: 'get' }, xml('query', { xmlns: 'jabber:iq:roster' })))
  await B.send(xml('presence'))
  return B
}
const received: A.ChatMessage[] = []
A.onMessage((m) => received.push(m))
const seesB = (): boolean => A.snapshot().contacts.find((c) => c.jid === at(b))?.show === 'online'

let B = await startB()
assert.equal((await A.login(a, pass)).ok, true)
await A.addContact(`${b}@localhost`)
await until(() => aOnline && seesB(), 'mutual and online')

// Going invisible: B sees A leave, A still gets messages and sees B.
await A.setPresence('invisible', 'shh')
assert.equal(A.snapshot().show, 'invisible')
await until(() => !aOnline, 'B sees A offline')
await B.send(xml('message', { to: at(a), type: 'chat', id: 'i1' }, xml('body', {}, '¿estás?')))
await until(() => received.find((m) => m.id === 'i1'), 'A gets message')
assert.ok(seesB())

// Status changes while invisible stay hidden; so does A when B reconnects.
await A.setPresence('invisible', 'otra cosa')
await B.stop()
aOnline = false
B = await startB()
await sleep(1000)
assert.equal(aOnline, false, 'B reconnects and still does not see A')

// Signing in again while invisible: never visible, contacts still visible to A.
await A.logout()
await sleep(300)
assert.equal(aOnline, false)
await A.login(a, pass, { show: 'invisible' })
await until(() => seesB(), 'A sees B after sign-in')
await sleep(800)
assert.equal(aOnline, false, 'B never saw A')

// Back to visible.
await A.setPresence('away', '')
await until(() => aOnline, 'B sees A again')
assert.equal(A.snapshot().show, 'away')

await B.stop()
await A.logout()
console.log('invisible check passed')
process.exit(0)
