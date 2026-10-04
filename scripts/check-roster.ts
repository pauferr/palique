// Contacts + presence check against the local Prosody (`docker compose up -d` first).
// "A" uses the app's xmpp module; "B" is a plain XMPP client playing the other person.
// Run: npm run check:roster
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import * as A from '../src/main/xmpp.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const a = `rostera${id}`
const b = `rosterb${id}`
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
assert.equal((await A.login(b, pass, true)).ok, true)
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

// A adds B → mutual subscription, B's presence shows up.
assert.equal((await A.login(a, pass, true)).ok, true)
await A.addContact(b)
let s = await until(
  (s) => contact(s)?.subscription === 'both' && contact(s)?.show === 'dnd',
  'mutual + presence'
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
await until((s) => s.requests.includes(`${b}@localhost`), 'request')
await A.acceptRequest(`${b}@localhost`)
s = await until(
  (s) => contact(s)?.subscription === 'both' && contact(s)?.show === 'online',
  'accepted'
)
assert.deepEqual(s.requests, [])

await B.stop()
await A.logout()
console.log('roster check passed')
process.exit(0)
