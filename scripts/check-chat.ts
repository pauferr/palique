// Chat + buzz check against the local Prosody (`docker compose up -d` first).
// "A" uses the app's xmpp module; B, a second device of A and a stranger are plain clients.
// Run: npm run check:chat
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import type { Element } from '@xmpp/xml'
import * as A from '../src/main/xmpp.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const [a, b, stranger] = ['chata', 'chatb', 'chatx'].map((name) => `${name}${id}`)
const pass = 'check-password'
const at = (user: string): string => `${user}@localhost`

for (const user of [a, b, stranger]) {
  assert.equal((await A.login(user, pass, true)).ok, true)
  await A.logout()
}

// A plain client that accepts subscriptions and records the messages it gets.
async function start(user: string): Promise<{ xmpp: ReturnType<typeof client>; inbox: Element[] }> {
  const xmpp = client({
    service: 'xmpp://localhost:5222',
    domain: 'localhost',
    username: user,
    password: pass
  })
  const inbox: Element[] = []
  xmpp.on('error', () => {})
  xmpp.on('stanza', (s) => {
    if (s.is('message')) inbox.push(s)
    if (s.is('presence') && s.attrs.type === 'subscribe') {
      xmpp.send(xml('presence', { to: s.attrs.from, type: 'subscribed' }))
      xmpp.send(xml('presence', { to: s.attrs.from, type: 'subscribe' }))
    }
  })
  await xmpp.start()
  await xmpp.iqCaller.request(
    xml('iq', { type: 'get' }, xml('query', { xmlns: 'jabber:iq:roster' }))
  )
  await xmpp.send(xml('presence'))
  return { xmpp, inbox }
}

function until<T>(get: () => T | undefined, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = setInterval(() => {
      const value = get()
      if (value !== undefined) {
        clearInterval(poll)
        resolve(value)
      } else if (Date.now() - started > 5000) {
        clearInterval(poll)
        reject(new Error(`timeout: ${label}`))
      }
    }, 50)
  })
}

const received: A.ChatMessage[] = []
A.onMessage((m) => received.push(m))

const B = await start(b)
assert.equal((await A.login(a, pass)).ok, true)
await A.addContact(b)
await until(() => A.snapshot().contacts.find((c) => c.subscription === 'both'), 'mutual')

// A → B
await A.sendMessage(at(b), 'hola Lolo')
const toB = await until(
  () => B.inbox.find((m) => m.getChildText('body') === 'hola Lolo'),
  'B gets it'
)
assert.equal(toB.attrs.type, 'chat')

// B → A, text and buzz
await B.xmpp.send(
  xml('message', { to: at(a), type: 'chat', id: 'm1' }, xml('body', {}, '¿qué pasa?'))
)
const text = await until(() => received.find((m) => m.id === 'm1'), 'A gets text')
assert.deepEqual(
  { ...text, at: 0 },
  { id: 'm1', with: at(b), mine: false, body: '¿qué pasa?', buzz: false, at: 0 }
)
await B.xmpp.send(
  xml(
    'message',
    { to: at(a), type: 'headline', id: 'z1' },
    xml('attention', { xmlns: 'urn:xmpp:attention:0' })
  )
)
assert.equal((await until(() => received.find((m) => m.id === 'z1'), 'A gets buzz')).buzz, true)

// A → B buzz
await A.sendBuzz(at(b))
await until(
  () => B.inbox.find((m) => m.getChild('attention', 'urn:xmpp:attention:0')),
  'B gets buzz'
)

// A writes from another device: the app sees a copy as its own message.
const phone = await start(a)
await phone.xmpp.send(
  xml('message', { to: at(b), type: 'chat', id: 'c1' }, xml('body', {}, 'desde el móvil'))
)
const copy = await until(() => received.find((m) => m.id === 'c1'), 'carbon')
assert.equal(copy.mine, true)
assert.equal(copy.with, at(b))

// A stranger (not a contact) can't message A.
const X = await start(stranger)
await X.xmpp.send(
  xml('message', { to: at(a), type: 'chat', id: 'spam' }, xml('body', {}, 'compra ya'))
)
await new Promise((r) => setTimeout(r, 800))
assert.equal(
  received.find((m) => m.id === 'spam'),
  undefined
)

await Promise.all([B.xmpp.stop(), phone.xmpp.stop(), X.xmpp.stop()])
await A.logout()
console.log('chat check passed')
process.exit(0)
