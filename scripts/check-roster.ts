// Contacts + presence check against the local Prosody (`docker compose up -d` first).
// "A" uses the app's xmpp module; "B" is a plain XMPP client playing the other person.
// Run: npm run check:roster
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
const [aName, bName, cName] = ['rostera', 'rosterb', 'rosterc'].map((n) => `${n}${id}`)
const pass = 'check-password'

// Resolves once the module's snapshot satisfies `test`.
function until(test: (s: A.Snapshot) => boolean, label: string): Promise<A.Snapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout: ${label} ${JSON.stringify(A.snapshot())}`)),
      5000
    )
    const check = (s: A.Snapshot): void => {
      if (!test(s)) return
      clearTimeout(timer)
      resolve(s)
    }
    A.onChange(check)
    check(A.snapshot())
  })
}
const contact = (s: A.Snapshot): A.Contact | undefined =>
  s.contacts.find((c) => c.jid === `${b}@localhost`)

// B: a plain client that accepts anything A asks (fresh one per session).
const b = await register(bName, pass)
await A.logout()
async function startB(...presence: ReturnType<typeof xml>[]): Promise<ReturnType<typeof client>> {
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
  })
  await B.start()
  // Like a real client: roster first, then presence. Prosody only delivers
  // subscription requests to sessions that fetched the roster.
  await B.iqCaller.request(xml('iq', { type: 'get' }, xml('query', { xmlns: 'jabber:iq:roster' })))
  await B.send(xml('presence', {}, ...presence))
  return B
}
let B = await startB(xml('show', {}, 'dnd'), xml('status', {}, 'currando'))

// A finds B by email and adds them → mutual subscription, B's presence and name show up.
const a = await register(aName, pass)
assert.equal(await A.lookupContact(`${bName}@correo.test`), `${b}@localhost`)
assert.equal(await A.lookupContact(`nadie${id}@correo.test`), '')
await assert.rejects(A.lookupContact('nada'), /invalid/)
await A.addContact(`${b}@localhost`)
let s = await until(
  (s) =>
    contact(s)?.subscription === 'both' && contact(s)?.show === 'dnd' && contact(s)?.name === bName,
  'mutual + presence + name'
)
assert.equal(contact(s)?.status, 'currando')

// B changes status, then goes offline.
await B.send(xml('presence', {}, xml('show', {}, 'away')))
await until((s) => contact(s)?.show === 'away', 'away')
await B.stop()
await until((s) => contact(s)?.show === 'offline', 'offline')

// A removes B.
await A.removeContact(`${b}@localhost`)
await until((s) => !contact(s), 'removed')

// Incoming request: B asks to add A, A accepts.
B = await startB()
await B.send(xml('presence', { to: `${a}@localhost`, type: 'subscribe' }))
await until((s) => s.requests.some((r) => r.jid === `${b}@localhost`), 'request')
await A.acceptRequest(`${b}@localhost`)
s = await until(
  (s) => contact(s)?.subscription === 'both' && contact(s)?.show === 'online',
  'accepted'
)
assert.deepEqual(s.requests, [])

// Nobody gets in without consent: C asks, can't message meanwhile, and A rejects.
const received: A.ChatMessage[] = []
A.onMessage((m) => received.push(m))
await A.logout()
const c = await register(cName, pass)
await A.logout()
await A.login(a, pass)
const C = client({
  service: 'xmpp://localhost:5222',
  domain: 'localhost',
  username: c,
  password: pass
})
const cGot: string[] = []
C.on('error', () => {})
C.on('stanza', (st) => {
  if (st.is('presence') && st.attrs.type) cGot.push(st.attrs.type)
})
await C.start()
// Like a real client: roster first, or Prosody won't deliver the answer to C.
await C.iqCaller.request(xml('iq', { type: 'get' }, xml('query', { xmlns: 'jabber:iq:roster' })))
await C.send(xml('presence'))
// The request carries C's name: A can't read C's profile before accepting.
await C.send(
  xml(
    'presence',
    { to: `${a}@localhost`, type: 'subscribe' },
    xml('nick', { xmlns: 'http://jabber.org/protocol/nick' }, 'Ce')
  )
)
await until(
  (s) => s.requests.some((r) => r.jid === `${c}@localhost` && r.name === 'Ce'),
  'request from C, with name'
)
await C.send(
  xml('message', { to: `${a}@localhost`, type: 'chat', id: 'c1' }, xml('body', {}, 'hola'))
)
await new Promise((r) => setTimeout(r, 800))
assert.equal(received.length, 0, 'no messages before accepting')
assert.ok(!A.snapshot().contacts.some((x) => x.jid === `${c}@localhost`))
await A.rejectRequest(`${c}@localhost`)
await new Promise((r) => setTimeout(r, 800))
assert.ok(cGot.includes('unsubscribed'), 'C is told')
assert.deepEqual(A.snapshot().requests, [])
await C.stop()

await B.stop()
await A.logout()
console.log('roster check passed')
process.exit(0)
