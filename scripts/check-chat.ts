// Chat + buzz check against the local Prosody (`docker compose up -d` first).
// "A" uses the app's xmpp module; B, a second device of A and a stranger are plain clients.
// Run: npm run check:chat
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import type { Element } from '@xmpp/xml'
import * as A from '../src/main/xmpp.ts'
import { register } from './invite.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const pass = 'Check-pass1'
const CHATSTATES = 'http://jabber.org/protocol/chatstates'
const at = (user: string): string => `${user}@localhost`

const accounts: string[] = []
for (const name of ['chata', 'chatb', 'chatx']) {
  accounts.push(await register(`${name}${id}`, pass))
  await A.logout()
}
const [a, b, stranger] = accounts

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
const typing: string[] = []
A.onTyping((contact, on) => typing.push(`${contact}:${on}`))

const B = await start(b)
assert.equal((await A.login(a, pass)).ok, true)
await A.addContact(`${b}@localhost`)
await until(() => A.snapshot().contacts.find((c) => c.subscription === 'both'), 'mutual')

// A → B
await A.sendMessage(at(b), 'hola Lolo')
const toB = await until(
  () => B.inbox.find((m) => m.getChildText('body') === 'hola Lolo'),
  'B gets it'
)
assert.equal(toB.attrs.type, 'chat')
assert.ok(toB.getChild('active', CHATSTATES), 'messages carry the active chat state')

// Typing, both ways. B: composing → paused, then composing → message.
const state = (name: string): Element =>
  xml('message', { to: at(a), type: 'chat' }, xml(name, { xmlns: CHATSTATES }))
await B.xmpp.send(state('composing'))
await B.xmpp.send(state('paused'))
await B.xmpp.send(state('composing'))
await B.xmpp.send(
  xml(
    'message',
    { to: at(a), type: 'chat', id: 'm0' },
    xml('body', {}, 'ya'),
    xml('active', { xmlns: CHATSTATES })
  )
)
await until(() => received.find((m) => m.id === 'm0'), 'message after typing')
assert.deepEqual(typing, [`${at(b)}:true`, `${at(b)}:false`, `${at(b)}:true`, `${at(b)}:false`])
await A.sendTyping(at(b), true)
await until(() => B.inbox.find((m) => m.getChild('composing', CHATSTATES)), 'B sees composing')
await A.sendTyping(at(b), false)
await until(() => B.inbox.find((m) => m.getChild('paused', CHATSTATES)), 'B sees paused')

// B → A, text and buzz
await B.xmpp.send(
  xml('message', { to: at(a), type: 'chat', id: 'm1' }, xml('body', {}, '¿qué pasa?'))
)
const text = await until(() => received.find((m) => m.id === 'm1'), 'A gets text')
assert.deepEqual(
  { ...text, at: 0 },
  { id: 'm1', with: at(b), mine: false, body: '¿qué pasa?', buzz: false, wink: '', at: 0 }
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

// Winks: A → B carries a fallback body for other clients; B → A is parsed, bad ids dropped.
await A.sendWink(at(b), 'bubble')
const winkToB = await until(
  () => B.inbox.find((m) => m.getChild('wink', 'urn:palique:wink:0')),
  'B gets wink'
)
assert.equal(winkToB.getChild('wink', 'urn:palique:wink:0')?.attrs.id, 'bubble')
assert.match(winkToB.getChildText('body') ?? '', /guiño/)
const wink = (msgId: string, winkId: string): Element =>
  xml(
    'message',
    { to: at(a), type: 'chat', id: msgId },
    xml('body', {}, 'fallback'),
    xml('wink', { xmlns: 'urn:palique:wink:0', id: winkId })
  )
await B.xmpp.send(wink('w1', 'wave'))
const winkToA = await until(() => received.find((m) => m.id === 'w1'), 'A gets wink')
assert.deepEqual([winkToA.wink, winkToA.body], ['wave', ''])
await B.xmpp.send(wink('w2', '../../etc/passwd'))
const bad = await until(() => received.find((m) => m.id === 'w2'), 'bad wink id')
assert.deepEqual([bad.wink, bad.body], ['', 'fallback'], 'invalid id: shown as plain text')

// A writes from another device: the app sees a copy as its own message.
const phone = await start(a)
await phone.xmpp.send(
  xml('message', { to: at(b), type: 'chat', id: 'c1' }, xml('body', {}, 'desde el móvil'))
)
const copy = await until(() => received.find((m) => m.id === 'c1'), 'carbon')
assert.equal(copy.mine, true)
assert.equal(copy.with, at(b))
// Our own typing on the phone isn't shown as the contact typing.
const typedBefore = typing.length
await phone.xmpp.send(
  xml('message', { to: at(b), type: 'chat' }, xml('composing', { xmlns: CHATSTATES }))
)
await new Promise((r) => setTimeout(r, 500))
assert.equal(typing.length, typedBefore)

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
