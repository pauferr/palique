// Group rooms on the local Prosody (`docker compose up -d` first): the groups component's
// defaults and mod_palique_groups (members, names, leaving, succession, events, size limit).
// Plain clients only; the app's side has its own check.
// Run: npm run check:groups-server
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
const at = (user: string): string => `${user}@localhost`
const G = 'urn:palique:groups:0'
const MUC = 'http://jabber.org/protocol/muc'
const MUC_USER = `${MUC}#user`
const NICK = 'http://jabber.org/protocol/nick'
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
for (const name of ['groa', 'grob', 'groc', 'grox', 'grod']) {
  accounts.push(await register(`${name}${id}`, pass))
  await A.logout()
}
const [a, b, c, x, d] = accounts

type Xmpp = ReturnType<typeof client>
type Client = { xmpp: Xmpp; user: string; inbox: Element[]; presences: Element[] }

async function start(user: string): Promise<Client> {
  const xmpp = client({
    service: 'xmpp://localhost:5222',
    domain: 'localhost',
    username: user,
    password: pass
  })
  const me: Client = { xmpp, user, inbox: [], presences: [] }
  xmpp.on('error', () => {})
  xmpp.on('stanza', (s) => {
    if (s.is('message')) me.inbox.push(s)
    if (s.is('presence')) me.presences.push(s)
  })
  await xmpp.start()
  await xmpp.send(xml('presence'))
  return me
}

const iq = (cl: Client, type: 'get' | 'set', to: string, child: Element): Promise<Element> =>
  cl.xmpp.iqCaller.request(xml('iq', { type, to }, child))

async function fails(promise: Promise<unknown>, condition?: string): Promise<void> {
  await assert.rejects(
    promise,
    (e: { condition?: string }) => !condition || e.condition === condition
  )
}

// Enters the room with nick = its localpart (and a display name); resolves with the self
// presence, or the error presence (not a late "you were removed" from an earlier visit).
async function join(
  cl: Client,
  room: string,
  name?: string,
  nick = cl.user,
  attrs: Record<string, string> = {}
): Promise<Element> {
  const to = `${room}/${nick}`
  const from = cl.presences.length
  await cl.xmpp.send(
    xml(
      'presence',
      { ...attrs, to },
      xml('x', { xmlns: MUC }),
      ...(name ? [xml('nick', { xmlns: NICK }, name)] : [])
    )
  )
  return until(
    () =>
      cl.presences.slice(from).find(
        (p) =>
          p.attrs.from === to &&
          p.attrs.type !== 'unavailable' &&
          (p.attrs.type === 'error' ||
            p
              .getChild('x', MUC_USER)
              ?.getChildren('status')
              .some((s) => s.attrs.code === '110'))
      ),
    `${cl.user} joins ${room}`
  )
}

const field = (name: string, value: string): Element =>
  xml('field', { var: name }, xml('value', {}, value))
const rename = (cl: Client, room: string, name: string): Promise<Element> =>
  iq(
    cl,
    'set',
    room,
    xml(
      'query',
      { xmlns: `${MUC}#owner` },
      xml(
        'x',
        { xmlns: 'jabber:x:data', type: 'submit' },
        field('FORM_TYPE', `${MUC}#roomconfig`),
        field('muc#roomconfig_roomname', name)
      )
    )
  )
const affiliate = (cl: Client, room: string, jid: string, affiliation: string): Promise<Element> =>
  iq(cl, 'set', room, xml('query', { xmlns: `${MUC}#admin` }, xml('item', { jid, affiliation })))
async function members(cl: Client, room: string): Promise<Record<string, string>[]> {
  const res = await iq(cl, 'get', room, xml('members', { xmlns: G }))
  return res
    .getChild('members', G)!
    .getChildren('member')
    .map((m) => m.attrs)
}
const leave = (cl: Client, room: string): Promise<Element> =>
  iq(cl, 'set', room, xml('leave', { xmlns: G }))
const say = (cl: Client, room: string, text: string): Promise<void> =>
  cl.xmpp.send(xml('message', { to: room, type: 'groupchat' }, xml('body', {}, text)))

// A group event from the room, with these attributes.
const event = (
  cl: Client,
  room: string,
  kind: string,
  attrs: Record<string, string> = {}
): Promise<Element> =>
  until(
    () =>
      cl.inbox.find((m) => {
        const e = m.attrs.from === room && m.attrs.type === 'groupchat' && m.getChild('event', G)
        return (
          e &&
          e.attrs.kind === kind &&
          m.getChildText('body') &&
          Object.entries(attrs).every(([k, v]) => e.attrs[k] === v)
        )
      }),
    `${cl.user} gets ${kind} ${JSON.stringify(attrs)}`
  )

const ca = await start(a)
const cb = await start(b)
const cc = await start(c)
const cx = await start(x)
const cd = await start(d)

// Create: the creator owns it; the component's defaults make it private, members-only,
// persistent and with real JIDs visible to members.
const room = `g${id}@groups.localhost`
const created = await join(ca, room, 'Ana')
assert.notEqual(created.attrs.type, 'error', 'local users create rooms')
assert.equal(created.getChild('x', MUC_USER)!.getChild('item')!.attrs.affiliation, 'owner')
await rename(ca, room, 'Los del insti')
await event(ca, room, 'created', { actor: at(a), jid: at(a), name: 'Ana' })
const info = await iq(
  ca,
  'get',
  room,
  xml('query', { xmlns: 'http://jabber.org/protocol/disco#info' })
)
const features = info
  .getChild('query')!
  .getChildren('feature')
  .map((f) => f.attrs.var)
for (const f of ['muc_membersonly', 'muc_persistent', 'muc_hidden', 'muc_nonanonymous']) {
  assert.ok(features.includes(f), f)
}
assert.equal(info.getChild('query')!.getChild('identity')!.attrs.name, 'Los del insti')
// The first name isn't a change.
await sleep(300)
assert.ok(!ca.inbox.some((m) => m.getChild('event', G)?.attrs.kind === 'name'))

// Strangers stay out: no joining, no member list, no messages, no archive.
assert.equal(
  (await join(cx, room)).getChild('error')!.getChild('registration-required')?.name,
  'registration-required'
)
await fails(members(cx, room), 'forbidden')
await fails(leave(cx, room), 'forbidden')
await fails(iq(cx, 'set', room, xml('query', { xmlns: 'urn:xmpp:mam:2' })), 'forbidden')
await say(cx, room, 'hola')
await until(
  () => cx.inbox.find((m) => m.attrs.from === room && m.attrs.type === 'error'),
  'stranger message bounces'
)

// Add: B is a member; entering with a display name stores it for the member list.
await affiliate(ca, room, at(b), 'member')
await event(ca, room, 'added', { actor: at(a), jid: at(b) })
assert.notEqual((await join(cb, room, 'Bea')).attrs.type, 'error')
const list = await members(ca, room)
const bea = list.find((m) => m.jid === at(b))
assert.equal(bea?.name, 'Bea')
assert.equal(bea?.affiliation, 'member')
assert.ok(bea?.since && !Number.isNaN(Date.parse(bea.since)), 'since is a date')
assert.equal(list.find((m) => m.jid === at(a))?.affiliation, 'owner')
assert.equal(list.length, 2)

// A member invites: the invitee becomes a member, gets the invite, and the room says who.
await cb.xmpp.send(
  xml('message', { to: room }, xml('x', { xmlns: MUC_USER }, xml('invite', { to: at(c) })))
)
await until(
  () =>
    cc.inbox.find((m) => m.attrs.from === room && m.getChild('x', MUC_USER)?.getChild('invite')),
  'C gets the invite'
)
await event(cb, room, 'added', { actor: at(b), 'actor-name': 'Bea', jid: at(c) })
assert.equal((await members(ca, room)).find((m) => m.jid === at(c))?.affiliation, 'member')
// Nicks are the member's own localpart: neither a member already inside (B, while C is
// out) nor one entering (C) may use someone else's.
const posing = await join(cb, room, 'Bea', c)
assert.equal(posing.getChild('error')?.getChild('not-acceptable')?.name, 'not-acceptable')
const entering = await join(cc, room, 'Carla', d)
assert.equal(entering.getChild('error')?.getChild('not-acceptable')?.name, 'not-acceptable')
assert.notEqual((await join(cc, room, 'Carla')).attrs.type, 'error')

// Room registration is off: it would let members rewrite their name or join date, or
// reserve others' nicks.
await fails(iq(cb, 'get', room, xml('query', { xmlns: 'jabber:iq:register' })), 'not-allowed')
await fails(
  iq(cb, 'set', room, xml('query', { xmlns: 'jabber:iq:register' }, xml('remove'))),
  'not-allowed'
)

// Name and photo: owners only, 1 to 40 characters.
await fails(rename(cb, room, 'Nuestro grupo'), 'forbidden')
await fails(rename(ca, room, 'x'.repeat(41)), 'not-acceptable')
await fails(rename(ca, room, ''), 'not-acceptable')
await rename(ca, room, 'Los de siempre')
await event(cb, room, 'name', { actor: at(a), name: 'Los de siempre' })
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const vcard = xml(
  'vCard',
  { xmlns: 'vcard-temp' },
  xml('PHOTO', {}, xml('TYPE', {}, 'image/png'), xml('BINVAL', {}, PNG))
)
await fails(iq(cb, 'set', room, vcard))
await iq(ca, 'set', room, vcard)
await event(cb, room, 'photo', { actor: at(a) })
await until(
  () =>
    cb.presences.find(
      (p) => p.attrs.from === room && p.getChild('x', 'vcard-temp:x:update')?.getChildText('photo')
    ),
  'the photo hash in the room presence'
)

// Admins: an owner makes another; that one removes someone, who can't come back.
await affiliate(ca, room, at(b), 'owner')
await event(cc, room, 'owner', { actor: at(a), jid: at(b), name: 'Bea' })
// Setting the same affiliation again changes nothing, and says nothing.
await affiliate(ca, room, at(b), 'owner')
await sleep(300)
assert.equal(
  cc.inbox.filter((m) => m.getChild('event', G)?.attrs.kind === 'owner').length,
  1,
  'no event when nothing changes'
)
await affiliate(cb, room, at(c), 'none')
await event(ca, room, 'removed', { actor: at(b), jid: at(c), name: 'Carla' })
const back = await join(cc, room)
assert.equal(
  back.getChild('error')?.getChild('registration-required')?.name,
  'registration-required'
)
await affiliate(cb, room, at(a), 'member')
await event(cb, room, 'unowner', { actor: at(b), jid: at(a) })
await affiliate(cb, room, at(a), 'owner')

// Archive: B misses a message while offline and gets it from the room's archive.
await cb.xmpp.stop()
const sent = ca.inbox.length
await say(ca, room, 'Mañana a las 5')
const live = await until(
  () => ca.inbox.slice(sent).find((m) => m.getChildText('body') === 'Mañana a las 5'),
  'A gets its message back'
)
const stanzaId = live.getChild('stanza-id', 'urn:xmpp:sid:0')
assert.equal(stanzaId?.attrs.by, room)
const cb2 = await start(b)
await iq(cb2, 'set', room, xml('query', { xmlns: 'urn:xmpp:mam:2', queryid: 'q1' }))
const archived = cb2.inbox
  .map((m) => m.getChild('result', 'urn:xmpp:mam:2'))
  .filter((r) => r?.attrs.queryid === 'q1')
const kept = archived.find(
  (r) => r!.getChild('forwarded')?.getChild('message')?.getChildText('body') === 'Mañana a las 5'
)
assert.equal(kept?.attrs.id, stanzaId?.attrs.id, 'archived under its stanza-id')
assert.ok(
  archived.some(
    (r) =>
      r!.getChild('forwarded')?.getChild('message')?.getChild('event', G)?.attrs.kind === 'created'
  ),
  'events are archived too'
)

// Leaving and succession: with both owners gone, the oldest member (C, not D, who came a
// second later: `since` is in seconds) takes over, with no actor.
await affiliate(ca, room, at(c), 'member')
assert.notEqual((await join(cc, room, 'Carla')).attrs.type, 'error')
await sleep(1100)
await affiliate(ca, room, at(d), 'member')
assert.notEqual((await join(cd, room, 'Dani')).attrs.type, 'error')
await leave(ca, room)
await event(cc, room, 'left', { jid: at(a), name: 'Ana' })
await leave(cb2, room)
const heir = await event(cc, room, 'owner', { jid: at(c) })
assert.equal(heir.getChild('event', G)!.attrs.actor, undefined, 'made by the server')
assert.equal(heir.getChild('event', G)!.attrs['actor-name'], undefined)
await event(cc, room, 'left', { jid: at(b) })
assert.deepEqual(
  (await members(cc, room)).map((m) => [m.jid, m.affiliation]).sort(),
  [
    [at(c), 'owner'],
    [at(d), 'member']
  ].sort()
)
await fails(members(ca, room), 'forbidden')
await leave(cc, room)
await event(cd, room, 'owner', { jid: at(d) })
// The last one out destroys it (a tombstone answers `gone` for a while, then nothing).
await leave(cd, room)
await fails(
  iq(cc, 'get', room, xml('query', { xmlns: 'http://jabber.org/protocol/disco#info' })),
  'gone'
)

// Up to 50 people: the 51st isn't added, neither by an owner nor by a member's invite.
const big = `g2${id}@groups.localhost`
await join(ca, big, 'Ana')
await rename(ca, big, 'Grande')
for (let i = 0; i < 48; i++) await affiliate(ca, big, at(`relleno${i}${id}`), 'member')
await affiliate(ca, big, at(b), 'member')
assert.equal((await members(ca, big)).length, 50)
await fails(affiliate(ca, big, at(c), 'member'), 'not-allowed')
// Display names are kept up to 100 characters, cut between characters.
assert.notEqual((await join(cb2, big, '語'.repeat(150))).attrs.type, 'error')
assert.equal((await members(ca, big)).find((m) => m.jid === at(b))?.name, '語'.repeat(100))
const before = cb2.inbox.length
await cb2.xmpp.send(
  xml('message', { to: big }, xml('x', { xmlns: MUC_USER }, xml('invite', { to: at(c) })))
)
await until(
  () => cb2.inbox.slice(before).find((m) => m.attrs.from === big && m.attrs.type === 'error'),
  'invite refused'
)
assert.equal((await members(ca, big)).length, 50)

// Invisible members stay in their groups and get everything, but the others don't see them
// there until they turn visible.
const shy = `g3${id}@groups.localhost`
await join(cb2, shy, 'Bea')
await rename(cb2, shy, 'Discretos')
await affiliate(cb2, shy, at(a), 'member')
await affiliate(cb2, shy, at(d), 'member')
const invisible = (cl: Client, on: boolean): Promise<Element> =>
  iq(cl, 'set', at(cl.user), xml(on ? 'invisible' : 'visible', { xmlns: 'urn:xmpp:invisible:0' }))
const seen = (cl: Client, from: number, type?: string): Element | undefined =>
  cl.presences.slice(from).find((p) => p.attrs.from === `${shy}/${a}` && p.attrs.type === type)
await invisible(ca, true)
let mark = cb2.presences.length
let from = 0
assert.notEqual((await join(ca, shy, 'Ana')).attrs.type, 'error', 'joins while invisible')
await say(cb2, shy, '¿hay alguien?')
await until(
  () =>
    ca.inbox.find(
      (m) => m.attrs.from === `${shy}/${b}` && m.getChildText('body') === '¿hay alguien?'
    ),
  'the invisible member gets messages'
)
assert.equal(seen(cb2, mark), undefined, 'B never sees A come in')
// Someone joining meanwhile doesn't get A in the room's list.
assert.notEqual((await join(cd, shy, 'Dani')).attrs.type, 'error')
await sleep(300)
assert.equal(seen(cd, 0), undefined, 'not in the list a joiner gets')
// Visible: A shows up; invisible again: A leaves for the others but stays in.
mark = cb2.presences.length
await invisible(ca, false)
await until(() => seen(cb2, mark), 'B sees A once visible')
mark = cb2.presences.length
await invisible(ca, true)
await until(() => seen(cb2, mark, 'unavailable'), 'B sees A go')
const heard = ca.inbox.length
await say(cb2, shy, 'sigues ahí')
await until(
  () => ca.inbox.slice(heard).find((m) => m.getChildText('body') === 'sigues ahí'),
  'still in the room'
)
mark = cb2.presences.length
await invisible(ca, false)
await until(() => seen(cb2, mark), 'B sees A again')

// A curious member with a raw client can't tell A-invisible-in-the-room from A-absent.
type Plain = { name: string; attrs: Record<string, string>; children: Plain[] }
const plain = (el: Element): Plain => {
  const attrs = { ...(el.attrs as Record<string, string>) }
  delete attrs.id
  return {
    name: el.name,
    attrs,
    children: el.getChildElements().map(plain)
  }
}
const fromA = `${shy}/${a}`
async function looks(): Promise<unknown> {
  // The occupant list B gets on coming in.
  await cb2.xmpp.send(xml('presence', { to: `${shy}/${b}`, type: 'unavailable' }))
  await sleep(300)
  let from = cb2.presences.length
  await join(cb2, shy, 'Bea')
  await sleep(300)
  const list = cb2.presences
    .slice(from)
    .filter((p) => p.attrs.from !== `${shy}/${b}`)
    .map((p) => `${p.attrs.from} ${p.attrs.type ?? ''}`)
    .sort()
  // A probe to A's nick.
  from = cb2.presences.length
  await cb2.xmpp.send(xml('presence', { to: fromA, type: 'probe' }))
  await sleep(300)
  const probe = cb2.presences
    .slice(from)
    .filter((p) => p.attrs.from === fromA)
    .map(plain)
  // How many are in.
  const info = await iq(
    cb2,
    'get',
    shy,
    xml('query', { xmlns: 'http://jabber.org/protocol/disco#info' })
  )
  const count = info
    .getChild('query')
    ?.getChild('x')
    ?.getChildren('field')
    .find((f) => f.attrs.var === 'muc#roominfo_occupants')
    ?.getChildText('value')
  // A private message and a ping to A's nick.
  from = cb2.inbox.length
  await cb2.xmpp.send(
    xml('message', { to: fromA, type: 'chat', id: 'psst' }, xml('body', {}, 'psst'))
  )
  const pm = await until(
    () => cb2.inbox.slice(from).find((m) => m.attrs.id === 'psst'),
    'an answer to the private message'
  )
  const ping = await iq(cb2, 'get', fromA, xml('ping', { xmlns: 'urn:xmpp:ping' })).then(
    () => 'result',
    (e: { element?: Element }) => (e.element ? plain(e.element) : 'no answer')
  )
  return { list, probe, count, pm: plain(pm), ping }
}
// A leaves for real (visible): what B sees, then what B can find out.
from = cb2.presences.length
await ca.xmpp.send(xml('presence', { to: fromA, type: 'unavailable' }))
const left = await until(() => seen(cb2, from, 'unavailable'), 'B sees A leave')
const absent = await looks()
assert.equal((absent as { count: string }).count, '2', 'B and D')
// A comes back invisible: B can't see a difference.
await invisible(ca, true)
assert.notEqual((await join(ca, shy, 'Ana')).attrs.type, 'error')
assert.deepEqual(await looks(), absent, 'invisible looks exactly like absent')
// Going invisible inside the room looks exactly like leaving.
from = cb2.presences.length
await invisible(ca, false)
await until(() => seen(cb2, from), 'B sees A')
from = cb2.presences.length
await invisible(ca, true)
const gone = await until(() => seen(cb2, from, 'unavailable'), 'B sees A go')
assert.deepEqual(plain(gone), plain(left), 'like a real leave')
// And leaving while invisible: B sees nothing (it never saw A come in).
from = cb2.presences.length
await ca.xmpp.send(xml('presence', { to: fromA, type: 'unavailable' }))
await sleep(500)
assert.equal(
  cb2.presences.slice(from).find((p) => p.attrs.from === fromA),
  undefined
)

// Several devices: A is in while any of its devices in the room is visible, and gone for
// the others once only invisible ones are left, however the visible one goes.
const fromB = (from: number): Element[] =>
  cb2.presences.slice(from).filter((p) => p.attrs.from === fromA)
const ca2 = await start(a)
from = cb2.presences.length
assert.notEqual((await join(ca2, shy, 'Ana')).attrs.type, 'error')
await until(() => seen(cb2, from), 'B sees A on its visible device')
assert.notEqual((await join(ca, shy, 'Ana')).attrs.type, 'error')
// (a) The visible device leaves; the invisible one stays.
from = cb2.presences.length
await ca2.xmpp.send(xml('presence', { to: fromA, type: 'unavailable' }))
await until(() => seen(cb2, from, 'unavailable'), 'B sees A go with its visible device')
await sleep(500)
assert.equal(fromB(from).at(-1)?.attrs.type, 'unavailable', 'and A stays gone')
// (b) Two invisible devices; one disconnects.
await invisible(ca2, true)
from = cb2.presences.length
assert.notEqual((await join(ca2, shy, 'Ana')).attrs.type, 'error')
await ca2.xmpp.stop()
await sleep(500)
assert.deepEqual(fromB(from), [], 'one of two invisible devices goes: B sees nothing')

// A forged mark on a member's own presence doesn't hide it from the others.
const fromD = `${shy}/${d}`
await cd.xmpp.send(xml('presence', { to: fromD, type: 'unavailable' }))
await sleep(300)
const [atA, atB] = [ca.presences.length, cb2.presences.length]
assert.notEqual((await join(cd, shy, 'Dani', d, { 'palique-hidden': at(b) })).attrs.type, 'error')
const dIn = (cl: Client, from: number): Element | undefined =>
  cl.presences.slice(from).find((p) => p.attrs.from === fromD && !p.attrs.type)
await until(() => dIn(ca, atA), 'A sees D despite the forged mark')
await until(() => dIn(cb2, atB), 'B sees D despite the forged mark')

// Members' real JIDs stay visible to members: owners can't make the room semi-anonymous.
const whois = (value: string): Promise<Element> =>
  iq(
    cb2,
    'set',
    shy,
    xml(
      'query',
      { xmlns: `${MUC}#owner` },
      xml(
        'x',
        { xmlns: 'jabber:x:data', type: 'submit' },
        field('FORM_TYPE', `${MUC}#roomconfig`),
        field('muc#roomconfig_whois', value)
      )
    )
  )
await fails(whois('moderators'), 'not-acceptable')
await whois('anyone')

await Promise.all([ca, cc, cx, cd, cb2].map((cl) => cl.xmpp.stop()))
console.log('groups server check passed')
