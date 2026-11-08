// Chat + buzz check against the local Prosody (`docker compose up -d` first).
// "A" uses the app's xmpp module; B and a second device of A are plain clients with their
// own OMEMO store, and a stranger is a plain client without one.
// Run: npm run check:chat
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import type { Element } from '@xmpp/xml'
import * as A from '../src/main/xmpp.ts'
import { isGifUrl } from '../src/renderer/src/gif.ts'
import { openOmemo, type Omemo, type TrustChange } from '../src/main/omemo.ts'
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
// After registering: the sign-ups above sign in with the app's module too.
const dir = mkdtempSync(join(tmpdir(), 'palique-chat-'))
A.setOmemoOpener((account) => openOmemo(join(dir, 'a.sqlite'), account))

// A plain client that accepts subscriptions and records the messages it gets.
async function start(
  user: string,
  carbons = false
): Promise<{ xmpp: ReturnType<typeof client>; inbox: Element[] }> {
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
  if (carbons) {
    await xmpp.iqCaller.request(
      xml('iq', { type: 'set' }, xml('enable', { xmlns: 'urn:xmpp:carbons:2' }))
    )
  }
  await xmpp.send(xml('presence'))
  return { xmpp, inbox }
}

// OMEMO by hand, for the plain clients: the app's element builders, our own iqs.
type Xmpp = ReturnType<typeof client>
const OMEMO = 'eu.siacs.conversations.axolotl'
const PUBSUB = 'http://jabber.org/protocol/pubsub'
const publish = (x: Xmpp, node: string, payload: Element): Promise<Element> =>
  x.iqCaller.request(
    xml(
      'iq',
      { type: 'set' },
      xml(
        'pubsub',
        { xmlns: PUBSUB },
        xml('publish', { node }, xml('item', { id: 'current' }, payload)),
        xml(
          'publish-options',
          {},
          xml(
            'x',
            { xmlns: 'jabber:x:data', type: 'submit' },
            xml(
              'field',
              { var: 'FORM_TYPE', type: 'hidden' },
              xml('value', {}, `${PUBSUB}#publish-options`)
            ),
            xml('field', { var: 'pubsub#access_model' }, xml('value', {}, 'open'))
          )
        )
      )
    )
  )
const item = async (x: Xmpp, owner: string, node: string): Promise<Element | undefined> => {
  try {
    const res = await x.iqCaller.request(
      xml(
        'iq',
        { type: 'get', to: owner },
        xml('pubsub', { xmlns: PUBSUB }, xml('items', { node }))
      )
    )
    return res.getChild('pubsub')?.getChild('items')?.getChild('item')
  } catch {
    return undefined // no such node yet
  }
}
const deviceIds = async (x: Xmpp, owner: string): Promise<number[]> =>
  (
    (await item(x, owner, `${OMEMO}.devicelist`))?.getChild('list')?.getChildren('device') ?? []
  ).map((d) => Number(d.attrs.id))
const publishBundle = async (x: Xmpp, store: Omemo): Promise<void> => {
  await publish(x, `${OMEMO}.bundles:${store.deviceId}`, A.bundleElement(await store.bundle()))
}
// Adds this store's device to `owner`'s list, with its bundle, like the app does.
async function announce(x: Xmpp, store: Omemo, owner: string): Promise<void> {
  await publishBundle(x, store)
  const ids = (await deviceIds(x, owner)).filter((id) => id !== store.deviceId)
  await publish(x, `${OMEMO}.devicelist`, A.deviceListElement([...ids, store.deviceId]))
}
async function encryptFor(x: Xmpp, store: Omemo, to: string, text: string): Promise<Element> {
  const devices = (await deviceIds(x, to)).map((deviceId) => ({ jid: to, deviceId }))
  for (const d of devices) {
    if (await store.hasSession(d)) continue
    const bundle = await item(x, to, `${OMEMO}.bundles:${d.deviceId}`)
    await store.startSession(d, A.readBundle(bundle!.getChild('bundle')!, d.deviceId))
  }
  return A.encryptedElement(await store.encrypt(text, devices))
}
// Decrypts as the app would, republishing the bundle when a one-time key got used.
async function decrypt(x: Xmpp, store: Omemo, from: string, m: Element): Promise<string> {
  const e = A.readEncrypted(m.getChild('encrypted', OMEMO)!)!
  const text = await store.decrypt(from, e)
  if (e.keys.find((k) => k.rid === store.deviceId)?.prekey) await publishBundle(x, store)
  return text
}
const encryptedIn = (inbox: Element[], label: string, skip = 0): Promise<Element> =>
  until(() => inbox.filter((m) => m.getChild('encrypted', OMEMO))[skip], label)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

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
const trustChanges: TrustChange[] = []
A.onTrust((changes) => trustChanges.push(...changes))
const typing: string[] = []
A.onTyping((contact, on) => typing.push(`${contact}:${on}`))

let B = await start(b)
const bStore = await openOmemo(join(dir, 'b.sqlite'), at(b))
await announce(B.xmpp, bStore, at(b))
assert.equal((await A.login(a, pass)).ok, true)
assert.match(A.ownFingerprint(), /^([0-9a-f]{8} ){7}[0-9a-f]{8}$/)
await A.addContact(`${b}@localhost`)
await until(() => A.snapshot().contacts.find((c) => c.subscription === 'both'), 'mutual')

// A → B, encrypted: other clients only see the fallback body.
await A.sendMessage(at(b), 'hola')
const toB = await encryptedIn(B.inbox, 'B gets it')
assert.equal(toB.attrs.type, 'chat')
assert.equal(toB.getChildText('body'), 'Mensaje cifrado con OMEMO')
assert.ok(toB.getChild('store', 'urn:xmpp:hints'), 'kept for offline delivery')
assert.ok(toB.getChild('active', CHATSTATES), 'messages carry the active chat state')
assert.equal(await decrypt(B.xmpp, bStore, at(a), toB), 'hola')

// A GIF is just its Klipy link, encrypted like any message (the server can't tell which).
const gif = 'https://static.klipy.com/ii/abc/de/fg.webp'
await A.sendMessage(at(b), gif)
const gifToB = await encryptedIn(B.inbox, 'B gets the GIF', 1)
assert.equal(gifToB.getChildText('body'), 'Mensaje cifrado con OMEMO')
const gifText = await decrypt(B.xmpp, bStore, at(a), gifToB)
assert.equal(gifText, gif)
assert.ok(isGifUrl(gifText), 'shown as a GIF')

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
  {
    id: 'm1',
    with: at(b),
    mine: false,
    body: '¿qué pasa?',
    buzz: false,
    wink: '',
    encrypted: false,
    at: 0
  },
  'not encrypted: shown as such'
)
// B → A, encrypted.
await B.xmpp.send(
  xml(
    'message',
    { to: at(a), type: 'chat', id: 'e1' },
    await encryptFor(B.xmpp, bStore, at(a), 'cifrado'),
    xml('body', {}, 'Mensaje cifrado con OMEMO')
  )
)
const secret = await until(() => received.find((m) => m.id === 'e1'), 'A gets encrypted')
assert.deepEqual(
  [secret.body, secret.encrypted, secret.undecryptable],
  ['cifrado', true, undefined]
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
const phone = await start(a, true)
const phoneStore = await openOmemo(join(dir, 'phone.sqlite'), at(a))
await announce(phone.xmpp, phoneStore, at(a))
await phone.xmpp.send(
  xml('message', { to: at(b), type: 'chat', id: 'c1' }, xml('body', {}, 'desde el móvil'))
)
const copy = await until(() => received.find((m) => m.id === 'c1'), 'carbon')
assert.equal(copy.mine, true)
assert.equal(copy.encrypted, false)
assert.equal(copy.with, at(b))
// Our own typing on the phone isn't shown as the contact typing.
const typedBefore = typing.length
await phone.xmpp.send(
  xml('message', { to: at(b), type: 'chat' }, xml('composing', { xmlns: CHATSTATES }))
)
await new Promise((r) => setTimeout(r, 500))
assert.equal(typing.length, typedBefore)

// A new device of our own account is news (someone else may have signed in), even when
// the app was the only one so far.
await until(
  () => trustChanges.find((c) => c.jid === at(a) && c.deviceId === phoneStore.deviceId),
  'own new device noticed'
)
assert.deepEqual(trustChanges.splice(0), [
  { jid: at(a), deviceId: phoneStore.deviceId, kind: 'new-device' }
])

// The app learnt of the phone (PEP notification): its sent copy is encrypted for it too.
await A.sendMessage(at(b), 'también al móvil')
const sentCopy = await until(
  () =>
    phone.inbox
      .map((m) => m.getChild('sent', 'urn:xmpp:carbons:2'))
      .map((s) => s?.getChild('forwarded')?.getChild('message'))
      .find((m) => m?.getChild('encrypted', OMEMO)),
  'phone gets the copy'
)
assert.equal(await decrypt(phone.xmpp, phoneStore, at(a), sentCopy), 'también al móvil')
await encryptedIn(B.inbox, 'B gets it too', 2)
// The phone writes to B only (as if before this device existed): no key for the app, and
// it's our own copy, so nothing to show.
await phone.xmpp.send(
  xml(
    'message',
    { to: at(b), type: 'chat', id: 'c2' },
    await encryptFor(phone.xmpp, phoneStore, at(b), 'solo para B'),
    xml('body', {}, 'Mensaje cifrado con OMEMO')
  )
)
await sleep(800)
assert.equal(
  received.find((m) => m.id === 'c2'),
  undefined
)

// B offline: the server keeps the message, B reads it when it comes back.
await B.xmpp.stop()
await A.sendMessage(at(b), 'mientras dormías')
B = await start(b)
const stored = await encryptedIn(B.inbox, 'B gets the stored message')
assert.ok(stored.getChild('delay', 'urn:xmpp:delay'))
assert.equal(await decrypt(B.xmpp, bStore, at(a), stored), 'mientras dormías')

// No session for B's device (gone on the app's side): B's normal message can't be read,
// and the app's next message starts a new session from B's bundle.
const aDb = new DatabaseSync(join(dir, 'a.sqlite'))
// The library's address: `name.deviceId`, and omemo.ts's name is `jid/deviceId`.
const bAddress = `${at(b)}/${bStore.deviceId}.${bStore.deviceId}`
assert.equal(aDb.prepare('DELETE FROM sessions WHERE address = ?').run(bAddress).changes, 1)
aDb.close()
await B.xmpp.send(
  xml(
    'message',
    { to: at(a), type: 'chat', id: 'e2' },
    await encryptFor(B.xmpp, bStore, at(a), 'sin sesión'),
    xml('body', {}, 'Mensaje cifrado con OMEMO')
  )
)
const lost = await until(() => received.find((m) => m.id === 'e2'), 'A gets undecryptable')
assert.deepEqual([lost.body, lost.encrypted, lost.undecryptable], ['', true, true])
await A.sendMessage(at(b), 'otra vez')
const again = await encryptedIn(B.inbox, 'B gets a new session', 1)
assert.equal(await decrypt(B.xmpp, bStore, at(a), again), 'otra vez')

// A new device of B writes before its list reaches the app: still noticed as new.
const b2Store = await openOmemo(join(dir, 'b2.sqlite'), at(b))
await publishBundle(B.xmpp, b2Store)
await B.xmpp.send(
  xml(
    'message',
    { to: at(a), type: 'chat', id: 'e3' },
    await encryptFor(B.xmpp, b2Store, at(a), 'desde la tableta'),
    xml('body', {}, 'Mensaje cifrado con OMEMO')
  )
)
assert.equal(
  (await until(() => received.find((m) => m.id === 'e3'), 'second device')).body,
  'desde la tableta'
)
assert.deepEqual(trustChanges, [{ jid: at(b), deviceId: b2Store.deviceId, kind: 'new-device' }])

// B's only device blocked (verified, then its key changed): nothing can reach B.
const blockDb = new DatabaseSync(join(dir, 'a.sqlite'))
const setBlocked = blockDb.prepare(
  'UPDATE identities SET blocked = ? WHERE jid = ? AND device_id = ?'
)
setBlocked.run(1, at(b), bStore.deviceId)
await assert.rejects(A.sendMessage(at(b), 'bloqueado'), { message: 'no-devices' })
setBlocked.run(0, at(b), bStore.deviceId)
blockDb.close()

// Our list grows past the 32 devices the app reads: it puts itself back first, so it
// stays within what it reads and doesn't republish on every notification.
const fakes = Array.from({ length: 40 }, (_, i) => 1000 + i)
await publish(phone.xmpp, `${OMEMO}.devicelist`, A.deviceListElement(fakes))
let ownList: number[] = []
for (let i = 0; i < 50 && ownList.every((id) => fakes.includes(id)); i++) {
  await sleep(100)
  ownList = await deviceIds(phone.xmpp, at(a))
}
assert.ok(!fakes.includes(ownList[0]), 'the app adds itself back, first')
assert.equal(ownList.length, 33, 'with the 32 devices it read')

// Someone without OMEMO can't be written to.
await assert.rejects(A.sendMessage(at(stranger), 'hola'), { message: 'no-devices' })

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
