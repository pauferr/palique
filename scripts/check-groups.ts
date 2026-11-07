// Group chats in the app (src/main/groups.ts) against the local Prosody (`docker compose up
// -d` first). "A" uses the app's modules; B, C and X are plain clients, B and C with their own
// OMEMO store (as in check-chat.ts). The server side has its own check (check:groups-server).
// Run: npm run check:groups
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import type { Element } from '@xmpp/xml'
import * as A from '../src/main/xmpp.ts'
import * as G from '../src/main/groups.ts'
import { openOmemo, type Omemo } from '../src/main/omemo.ts'
import { register } from './invite.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const pass = 'Check-pass1'
const at = (user: string): string => `${user}@localhost`
const OMEMO = 'eu.siacs.conversations.axolotl'
const PUBSUB = 'http://jabber.org/protocol/pubsub'
const MUC = 'http://jabber.org/protocol/muc'
const MUC_USER = `${MUC}#user`
const BOOKMARKS = 'urn:xmpp:bookmarks:1'
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function until<T>(get: () => T | undefined | false, label: string): Promise<T> {
  const deadline = Date.now() + 5000
  for (;;) {
    const value = get()
    if (value) return value
    assert.ok(Date.now() < deadline, `timeout: ${label}`)
    await sleep(50)
  }
}

const accounts: string[] = []
for (const name of ['gappa', 'gappb', 'gappc', 'gappx']) {
  accounts.push(await register(`${name}${id}`, pass))
  await A.logout()
}
const [a, b, c, x] = accounts
const dir = mkdtempSync(join(tmpdir(), 'palique-groups-'))
A.setOmemoOpener((account) => openOmemo(join(dir, 'a.sqlite'), account))

type Xmpp = ReturnType<typeof client>
type Plain = { xmpp: Xmpp; user: string; inbox: Element[]; presences: Element[] }

// A plain client that accepts subscriptions and records what it gets.
async function start(user: string): Promise<Plain> {
  const xmpp = client({
    service: 'xmpp://localhost:5222',
    domain: 'localhost',
    username: user,
    password: pass
  })
  const me: Plain = { xmpp, user, inbox: [], presences: [] }
  xmpp.on('error', () => {})
  xmpp.on('stanza', (s) => {
    if (s.is('message')) me.inbox.push(s)
    if (s.is('presence')) me.presences.push(s)
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
  return me
}

// OMEMO by hand, for the plain clients: the app's element builders, our own iqs.
const publish = (p: Plain, node: string, payload: Element): Promise<Element> =>
  p.xmpp.iqCaller.request(
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
const item = async (p: Plain, owner: string, node: string): Promise<Element | undefined> => {
  try {
    const res = await p.xmpp.iqCaller.request(
      xml(
        'iq',
        { type: 'get', to: owner },
        xml('pubsub', { xmlns: PUBSUB }, xml('items', { node }))
      )
    )
    return res.getChild('pubsub')?.getChild('items')?.getChild('item')
  } catch {
    return undefined
  }
}
const deviceIds = async (p: Plain, owner: string): Promise<number[]> =>
  (
    (await item(p, owner, `${OMEMO}.devicelist`))?.getChild('list')?.getChildren('device') ?? []
  ).map((d) => Number(d.attrs.id))
const publishBundle = async (p: Plain, store: Omemo): Promise<void> => {
  await publish(p, `${OMEMO}.bundles:${store.deviceId}`, A.bundleElement(await store.bundle()))
}
async function announce(p: Plain, store: Omemo): Promise<void> {
  await publishBundle(p, store)
  await publish(p, `${OMEMO}.devicelist`, A.deviceListElement([store.deviceId]))
}
// One encrypted element for every device of everyone in `to`.
async function encryptFor(p: Plain, store: Omemo, to: string[], text: string): Promise<Element> {
  const devices = []
  for (const jid of to) {
    for (const deviceId of await deviceIds(p, jid)) {
      const d = { jid, deviceId }
      if (!(await store.hasSession(d))) {
        const bundle = await item(p, jid, `${OMEMO}.bundles:${deviceId}`)
        await store.startSession(d, A.readBundle(bundle!.getChild('bundle')!, deviceId))
      }
      devices.push(d)
    }
  }
  return A.encryptedElement(await store.encrypt(text, devices))
}
async function decrypt(p: Plain, store: Omemo, from: string, m: Element): Promise<string> {
  const e = A.readEncrypted(m.getChild('encrypted', OMEMO)!)!
  const text = await store.decrypt(from, e)
  if (e.keys.find((k) => k.rid === store.deviceId)?.prekey) await publishBundle(p, store)
  return text
}

// Plain MUC: enter with nick = localpart and a display name; resolves on the self presence.
async function enter(p: Plain, room: string, name: string): Promise<void> {
  const to = `${room}/${p.user}`
  const from = p.presences.length
  await p.xmpp.send(
    xml(
      'presence',
      { to },
      xml('x', { xmlns: MUC }),
      xml('nick', { xmlns: 'http://jabber.org/protocol/nick' }, name)
    )
  )
  const self = await until(
    () =>
      p.presences.slice(from).find(
        (s) =>
          s.attrs.from === to &&
          (s.attrs.type === 'error' ||
            s
              .getChild('x', MUC_USER)
              ?.getChildren('status')
              .some((st) => st.attrs.code === '110'))
      ),
    `${p.user} enters`
  )
  assert.notEqual(self.attrs.type, 'error', `${p.user} enters ${room}`)
}
const invite = (p: Plain, room: string, to: string): Promise<void> =>
  p.xmpp.send(xml('message', { to: room }, xml('x', { xmlns: MUC_USER }, xml('invite', { to }))))
const inviteIn = (p: Plain, room: string): Promise<Element> =>
  until(
    () =>
      p.inbox.find((m) => m.attrs.from === room && m.getChild('x', MUC_USER)?.getChild('invite')),
    `${p.user} gets the invite`
  )
async function say(
  p: Plain,
  store: Omemo,
  room: string,
  to: string[],
  text: string
): Promise<void> {
  await p.xmpp.send(
    xml(
      'message',
      { to: room, type: 'groupchat' },
      await encryptFor(p, store, to, text),
      xml('body', {}, 'Mensaje cifrado con OMEMO')
    )
  )
}

// A's bookmarks, straight from its PEP.
async function bookmarks(): Promise<Element[]> {
  try {
    const res = await A.request(
      xml(
        'iq',
        { type: 'get' },
        xml('pubsub', { xmlns: PUBSUB }, xml('items', { node: BOOKMARKS }))
      )
    )
    return res.getChild('pubsub')?.getChild('items')?.getChildren('item') ?? []
  } catch {
    return []
  }
}

const received: A.ChatMessage[] = []
A.onMessage((m) => received.push(m))
const message = (label: string, test: (m: A.ChatMessage) => boolean): Promise<A.ChatMessage> =>
  until(() => received.find(test), label)

const B = await start(b)
const bStore = await openOmemo(join(dir, 'b.sqlite'), at(b))
await announce(B, bStore)
const C = await start(c)
const cStore = await openOmemo(join(dir, 'c.sqlite'), at(c))
await announce(C, cStore)
const X = await start(x)
assert.equal((await A.login(a, pass)).ok, true)
const ana = A.snapshot().name
await A.addContact(at(b))
await until(() => A.snapshot().contacts.find((m) => m.subscription === 'both'), 'mutual')

// Create: A owns it, B is a member, and the bookmark is private.
const room = await G.createGroup('Los del insti', [at(b)])
assert.match(room, /@groups\.localhost$/)
const created = G.groups().find((g) => g.jid === room)
assert.ok(created, 'the group is listed')
assert.equal(created.name, 'Los del insti')
assert.equal(created.owner, true)
assert.deepEqual(
  created.members.map((m) => [m.jid, m.owner]).sort(),
  [
    [at(a), true],
    [at(b), false]
  ].sort()
)
assert.equal(created.members.find((m) => m.jid === at(b))?.contact, true)
assert.ok(
  A.snapshot().groups.some((g) => g.jid === room),
  'in the snapshot'
)
const mark = (await bookmarks()).find((i) => i.attrs.id === room)
assert.equal(mark?.getChild('conference', BOOKMARKS)?.attrs.name, 'Los del insti')
assert.equal(mark?.getChild('conference', BOOKMARKS)?.attrs.autojoin, 'true')
const config = await A.request(
  xml(
    'iq',
    { type: 'get' },
    xml('pubsub', { xmlns: `${PUBSUB}#owner` }, xml('configure', { node: BOOKMARKS }))
  )
)
const access = config
  .getChild('pubsub')
  ?.getChild('configure')
  ?.getChild('x')
  ?.getChildren('field')
  .find((f) => f.attrs.var === 'pubsub#access_model')
  ?.getChildText('value')
assert.equal(access, 'whitelist')
// The names are 40 characters at most.
const long = await G.createGroup('x'.repeat(60), [])
assert.equal(G.groups().find((g) => g.jid === long)?.name, 'x'.repeat(40))
await G.leaveGroup(long)

await inviteIn(B, room)
await enter(B, room, 'Bea')

// A writes: encrypted for B, with the fallback body for other clients.
const sent = await G.sendGroupMessage(room, 'hola grupo')
assert.deepEqual([sent.with, sent.mine, sent.encrypted, sent.sender], [room, true, true, at(a)])
const toB = await until(
  () => B.inbox.find((m) => m.attrs.type === 'groupchat' && m.getChild('encrypted', OMEMO)),
  'B gets the group message'
)
assert.equal(toB.attrs.from, `${room}/${a}`)
assert.equal(toB.getChildText('body'), 'Mensaje cifrado con OMEMO')
assert.equal(await decrypt(B, bStore, at(a), toB), 'hola grupo')
await G.sendGroupWink(room, 'bubble')
await until(
  () => B.inbox.find((m) => m.getChild('wink', 'urn:palique:wink:0')?.attrs.id === 'bubble'),
  'B gets the wink'
)
await sleep(300)
assert.ok(
  !received.some((m) => m.with === room && m.mine),
  "A's own messages don't come back from the room"
)

// B writes: A gets it from the room, with who wrote it.
await say(B, bStore, room, [at(a)], 'hola Ana')
const fromB = await message('B in the group', (m) => m.body === 'hola Ana')
assert.deepEqual(
  [fromB.with, fromB.sender, fromB.senderName, fromB.mine, fromB.encrypted],
  [room, at(b), 'Bea', false, true]
)
// A member can't pass a live message off as an old one (no effects, a made-up time).
await B.xmpp.send(
  xml(
    'message',
    { to: room, type: 'groupchat' },
    xml('body', {}, 'del pasado'),
    xml('delay', { xmlns: 'urn:xmpp:delay', stamp: '2001-01-01T00:00:00Z' })
  )
)
const backdated = await message('backdated', (m) => m.body === 'del pasado')
assert.equal(backdated.delayed, undefined, 'live, whatever its <delay> says')
assert.ok(Date.now() - backdated.at < 60_000, 'at: when it arrived')

// C, B's friend and a stranger to A, comes in through B and writes: A fetches C's devices
// and name.
await invite(B, room, at(c))
await inviteIn(C, room)
await enter(C, room, 'Carla')
await say(C, cStore, room, [at(a), at(b)], 'soy Carla')
const fromC = await message('C in the group', (m) => m.body === 'soy Carla')
assert.deepEqual([fromC.sender, fromC.senderName, fromC.encrypted], [at(c), 'Carla', true])
assert.ok(
  A.deviceTrust(at(c)).some((d) => d.deviceId === cStore.deviceId),
  'seen before'
)
const carla = G.groups()
  .find((g) => g.jid === room)
  ?.members.find((m) => m.jid === at(c))
assert.deepEqual([carla?.name, carla?.contact, carla?.owner], ['Carla', false, false])
// And A's next message reaches C too.
await G.sendGroupMessage(room, 'bienvenida')
const toC = await until(
  () => C.inbox.find((m) => m.attrs.from === `${room}/${a}` && m.getChild('encrypted', OMEMO)),
  'C gets the group message'
)
assert.equal(await decrypt(C, cStore, at(a), toC), 'bienvenida')

// X, not A's contact, adds A to its own room: A doesn't take it.
const other = `x${id}@groups.localhost`
await enter(X, other, 'Xavi')
await invite(X, other, at(a))
await sleep(800)
assert.ok(!G.groups().some((g) => g.jid === other), 'not listed')
assert.ok(!(await bookmarks()).some((i) => i.attrs.id === other), 'not bookmarked')
assert.ok(!X.presences.some((p) => p.attrs.from === `${other}/${a}`), 'A never came in')
// B, a contact, does the same: A comes in and keeps it.
const bees = `b${id}@groups.localhost`
await enter(B, bees, 'Bea')
await B.xmpp.iqCaller.request(
  xml(
    'iq',
    { type: 'set', to: bees },
    xml(
      'query',
      { xmlns: `${MUC}#owner` },
      xml(
        'x',
        { xmlns: 'jabber:x:data', type: 'submit' },
        xml('field', { var: 'FORM_TYPE' }, xml('value', {}, `${MUC}#roomconfig`)),
        xml('field', { var: 'muc#roomconfig_roomname' }, xml('value', {}, 'Las abejas'))
      )
    )
  )
)
await invite(B, bees, at(a))
await until(() => G.groups().find((g) => g.jid === bees)?.name === 'Las abejas', 'A takes it')
await until(() => B.presences.find((p) => p.attrs.from === `${bees}/${a}`), 'A comes in')
for (let i = 0; !(await bookmarks()).some((m) => m.attrs.id === bees); i++) {
  assert.ok(i < 50, 'bookmarked')
  await sleep(100)
}
await G.leaveGroup(bees)

// Events, with names: renaming, a new admin, someone removed.
const event = (kind: string): Promise<A.ChatMessage> =>
  message(`${kind} event`, (m) => m.with === room && m.event?.kind === kind)
await G.setName(room, 'Los de siempre')
const renamed = (await event('name')).event!
assert.deepEqual([renamed.actor, renamed.actorName, renamed.name], [at(a), ana, 'Los de siempre'])
assert.equal(G.groups().find((g) => g.jid === room)?.name, 'Los de siempre')
await G.setOwner(room, at(b), true)
const owner = (await event('owner')).event!
assert.deepEqual([owner.actor, owner.actorName, owner.jid, owner.name], [at(a), ana, at(b), 'Bea'])
assert.equal(
  G.groups()
    .find((g) => g.jid === room)
    ?.members.find((m) => m.jid === at(b))?.owner,
  true
)
await G.removeMember(room, at(c))
const removed = (await event('removed')).event!
assert.deepEqual([removed.actor, removed.jid, removed.name], [at(a), at(c), 'Carla'])
assert.ok(
  !G.groups()
    .find((g) => g.jid === room)
    ?.members.some((m) => m.jid === at(c))
)

// The photo: a PNG up to the avatar limit, shown as a data: URL; null brings back the faces.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
await G.setPhoto(room, PNG)
await event('photo')
assert.equal(
  G.groups().find((g) => g.jid === room)?.photo,
  `data:image/png;base64,${PNG.toString('base64')}`
)
await assert.rejects(G.setPhoto(room, new Uint8Array(A.AVATAR_MAX_BYTES + 1)))
await assert.rejects(G.setPhoto(room, new Uint8Array([1, 2, 3])), 'only PNGs')

// No buzz in groups: nothing to send it with, and one from a room is ignored.
assert.ok(!('sendGroupBuzz' in G))
await B.xmpp.send(
  xml(
    'message',
    { to: room, type: 'groupchat' },
    xml('body', {}, '¡Zumbido!'),
    xml('attention', { xmlns: 'urn:xmpp:attention:0' })
  )
)
await sleep(800)
assert.ok(!received.some((m) => m.body === '¡Zumbido!' || m.buzz), 'buzz ignored')

// Leaving: gone from the list and the bookmarks.
const brief = await G.createGroup('Para salir', [at(b)])
await G.leaveGroup(brief)
assert.ok(!G.groups().some((g) => g.jid === brief))
assert.ok(!(await bookmarks()).some((i) => i.attrs.id === brief))

// Reconnecting: what A missed comes from the archive, nothing twice.
// B writes again the moment A is back in: the archive still starts where A left off.
await A.logout()
await say(B, bStore, room, [at(a)], 'mientras no estabas')
await say(B, bStore, room, [at(a)], 'y esto también')
// Ready beforehand, and sent from the stanza handler: no time for A to settle in.
const third = xml(
  'message',
  { to: room, type: 'groupchat' },
  await encryptFor(B, bStore, [at(a)], 'nada más entrar'),
  xml('body', {}, 'Mensaje cifrado con OMEMO')
)
const rightAway = new Promise<void>((resolve) => {
  const watch = (p: Element): void => {
    if (p.is('presence') && p.attrs.from === `${room}/${a}` && !p.attrs.type) {
      B.xmpp.off('stanza', watch)
      B.xmpp.send(third).then(resolve)
    }
  }
  B.xmpp.on('stanza', watch)
})
assert.equal((await A.login(a, pass)).ok, true)
await rightAway
await G.joinAll()
const missed = await message('from the archive', (m) => m.body === 'mientras no estabas')
assert.deepEqual([missed.with, missed.delayed, missed.senderName], [room, true, 'Bea'])
await message('second from the archive', (m) => m.body === 'y esto también')
await message('right after coming in', (m) => m.body === 'nada más entrar')
await sleep(300)
for (const text of ['mientras no estabas', 'y esto también', 'nada más entrar']) {
  assert.equal(received.filter((m) => m.body === text).length, 1, `${text}: once`)
}
await say(B, bStore, room, [at(a)], 'ya estás')
await message('live again', (m) => m.body === 'ya estás')
const ids = received.filter((m) => m.with === room).map((m) => m.id)
assert.equal(new Set(ids).size, ids.length, 'no duplicates')
assert.equal(received.filter((m) => m.body === 'hola Ana').length, 1)

// Signed in invisible: A is back in its groups and gets everything live, but B doesn't
// see A come in.
await A.logout()
const quiet = B.presences.length
assert.equal((await A.login(a, pass, { show: 'invisible' })).ok, true)
await G.joinAll()
assert.ok(
  G.groups().some((g) => g.jid === room),
  'still listed'
)
await say(B, bStore, room, [at(a)], 'aunque no te vea')
await message('while invisible', (m) => m.body === 'aunque no te vea' && !m.delayed)
assert.ok(
  !B.presences.slice(quiet).some((p) => p.attrs.from === `${room}/${a}` && !p.attrs.type),
  'B never sees A in the room'
)

// Removed while offline: on coming back the group goes away, once, with a notice.
await A.logout()
await B.xmpp.iqCaller.request(
  xml(
    'iq',
    { type: 'set', to: room },
    xml('query', { xmlns: `${MUC}#admin` }, xml('item', { jid: at(a), affiliation: 'none' }))
  )
)
assert.equal((await A.login(a, pass)).ok, true)
await G.joinAll()
const kicked = await event('kicked')
assert.equal(kicked.event!.name, 'Los de siempre')
assert.ok(!G.groups().some((g) => g.jid === room), 'not listed')
assert.ok(!(await bookmarks()).some((i) => i.attrs.id === room), 'bookmark gone')
await G.joinAll()
await sleep(500)
assert.equal(received.filter((m) => m.event?.kind === 'kicked').length, 1, 'no retries')

await Promise.all([B.xmpp.stop(), C.xmpp.stop(), X.xmpp.stop()])
await A.logout()
console.log('groups check passed')
process.exit(0)
