// Group chats: rooms on groups.<domain> (XEP-0045, server/modules/mod_palique_groups.lua),
// over xmpp.ts's connection. Rooms we're in are bookmarks (XEP-0402) in our PEP, joined at
// every sign-in; what we missed comes from the room's archive (XEP-0313). Messages are
// OMEMO, for every device of every member. Palique's "admin" is the XMPP owner.
import { randomBytes, randomUUID } from 'node:crypto'
import { jid as parseJid, xml } from '@xmpp/client'
import type { Element } from '@xmpp/xml'
import { _ } from '../renderer/src/i18n.ts'
import type { Device } from './omemo.ts'
import * as X from './xmpp.ts'

export type Member = { jid: string; name: string; owner: boolean; contact: boolean; since: number }
export type Group = { jid: string; name: string; photo: string; members: Member[]; owner: boolean }
export type GroupEvent = {
  kind: 'created' | 'added' | 'left' | 'removed' | 'name' | 'photo' | 'owner' | 'unowner' | 'kicked'
  actor: string
  actorName: string
  jid: string
  name: string
}

const G = 'urn:palique:groups:0'
const MUC = 'http://jabber.org/protocol/muc'
const MUC_USER = `${MUC}#user`
const MUC_ADMIN = `${MUC}#admin`
const MUC_OWNER = `${MUC}#owner`
const PUBSUB = 'http://jabber.org/protocol/pubsub'
const BOOKMARKS = 'urn:xmpp:bookmarks:1'
const MAM = 'urn:xmpp:mam:2'
const RSM = 'http://jabber.org/protocol/rsm'
const NICK = 'http://jabber.org/protocol/nick'
const OMEMO = 'eu.siacs.conversations.axolotl'
const WINK = 'urn:palique:wink:0'
const HINTS = 'urn:xmpp:hints'
const NAME_MAX = 40
const KINDS = ['created', 'added', 'left', 'removed', 'name', 'photo', 'owner', 'unowner']
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
// Joining fails like this when we're no longer in the group (removed, or it's gone).
const OUT = ['gone', 'registration-required', 'forbidden', 'item-not-found']

type Room = {
  jid: string
  name: string
  photo: string
  members: Map<string, { name: string; owner: boolean; since: number }>
}

let account = '' // whose rooms these are
let rooms = new Map<string, Room>()
let lastId = new Map<string, string>() // newest room stanza-id seen, to catch up from
let delivered = new Set<string>() // `room stanza-id` already passed on: archive and live overlap
let leaving = new Set<string>() // rooms we're leaving ourselves: not "removed"
const joins = new Map<string, { resolve: () => void; reject: (e: Error) => void }>()
let sentIds = new Set<string>() // our own messages, which the room sends back
let joining: Promise<void> | null = null

const localpart = (bare: string): string => bare.split('@')[0]
const nick = (): string => localpart(X.ownJid())
const bare = (address: string): string => parseJid(address).bare().toString()
const isRoom = (room: string): boolean =>
  /^[^@/]+@[^@/]+$/.test(room) && room.endsWith(`@${X.GROUPS_DOMAIN}`)

// A new account signed in: nothing of the last one's stays.
function forAccount(): void {
  if (account === X.ownJid()) return
  account = X.ownJid()
  rooms = new Map()
  lastId = new Map()
  delivered = new Set()
  leaving = new Set()
  sentIds = new Set()
}

export function groups(): Group[] {
  if (!account || account !== X.ownJid()) return []
  const me = X.ownJid()
  return [...rooms.values()].map((r) => ({
    jid: r.jid,
    name: r.name,
    photo: r.photo,
    owner: Boolean(r.members.get(me)?.owner),
    members: [...r.members].map(([jid, m]) => ({ jid, ...m, contact: X.isContact(jid) }))
  }))
}

X.setGroupList(groups)
X.onGroupStanza(handle)
X.onOnline(() => {
  joinAll().catch((e) => X.unexpectedError('groups', e))
})

const iq = (type: 'get' | 'set', to: string | undefined, child: Element): Promise<Element> =>
  X.request(xml('iq', to ? { type, to } : { type }, child))

function roomOf(room: string): Room {
  const r = rooms.get(room)
  if (!r) throw new Error('no-group')
  return r
}

// --- bookmarks (XEP-0402): one private item per room ------------------------------------

function field(name: string, value: string, type?: string): Element {
  return xml('field', type ? { var: name, type } : { var: name }, xml('value', {}, value))
}

async function bookmark(room: string, name: string): Promise<void> {
  await iq(
    'set',
    undefined,
    xml(
      'pubsub',
      { xmlns: PUBSUB },
      xml(
        'publish',
        { node: BOOKMARKS },
        xml(
          'item',
          { id: room },
          xml('conference', { xmlns: BOOKMARKS, autojoin: 'true', name }, xml('nick', {}, nick()))
        )
      ),
      xml(
        'publish-options',
        {},
        xml(
          'x',
          { xmlns: 'jabber:x:data', type: 'submit' },
          field('FORM_TYPE', `${PUBSUB}#publish-options`, 'hidden'),
          field('pubsub#persist_items', 'true'),
          field('pubsub#max_items', 'max'),
          field('pubsub#access_model', 'whitelist')
        )
      )
    )
  )
}

async function unbookmark(room: string): Promise<void> {
  await iq(
    'set',
    undefined,
    xml(
      'pubsub',
      { xmlns: PUBSUB },
      xml('retract', { node: BOOKMARKS, notify: 'true' }, xml('item', { id: room }))
    )
  ).catch((e) => {
    if (X.errorCondition(e) !== 'item-not-found') throw e
  })
}

async function bookmarks(): Promise<{ jid: string; name: string }[]> {
  let res: Element
  try {
    res = await iq(
      'get',
      undefined,
      xml('pubsub', { xmlns: PUBSUB }, xml('items', { node: BOOKMARKS }))
    )
  } catch (e) {
    if (X.errorCondition(e) === 'item-not-found') return [] // no groups yet
    throw e
  }
  return (res.getChild('pubsub')?.getChild('items')?.getChildren('item') ?? [])
    .filter((i) => isRoom(i.attrs.id))
    .map((i) => ({
      jid: i.attrs.id as string,
      name: cleanName(i.getChild('conference', BOOKMARKS)?.attrs.name)
    }))
}

// --- the room: joining, members, name, photo --------------------------------------------

const cleanName = (value: unknown): string => [...X.cleanNick(value)].slice(0, NAME_MAX).join('')

// Enters the room (creating it if it's new), as our localpart and with our display name.
// Rejects with the error presence's condition.
function enter(room: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const done = new Promise<void>((resolve, reject) => {
    joins.set(room, { resolve, reject })
    timer = setTimeout(() => reject(new Error('timeout')), 10_000)
  })
  const presence = xml(
    'presence',
    { to: `${room}/${nick()}` },
    xml('x', { xmlns: MUC }, xml('history', { maxstanzas: '0' }))
  )
  if (X.ownNick()) presence.c('nick', { xmlns: NICK }).t(X.ownNick())
  X.send(presence).catch(() => {})
  return done.finally(() => {
    clearTimeout(timer)
    joins.delete(room)
  })
}

async function loadMembers(r: Room): Promise<void> {
  const res = await iq('get', r.jid, xml('members', { xmlns: G }))
  r.members = new Map()
  for (const m of res.getChild('members', G)?.getChildren('member') ?? []) {
    if (typeof m.attrs.jid !== 'string' || !m.attrs.jid.includes('@')) continue
    r.members.set(m.attrs.jid, {
      name: X.cleanNick(m.attrs.name),
      owner: m.attrs.affiliation === 'owner',
      since: Date.parse(m.attrs.since) || 0
    })
  }
}

async function loadName(r: Room): Promise<void> {
  const res = await iq(
    'get',
    r.jid,
    xml('query', { xmlns: 'http://jabber.org/protocol/disco#info' })
  )
  const name = cleanName(res.getChild('query')?.getChild('identity')?.attrs.name)
  if (name) r.name = name
}

// The room's vCard photo, checked like an avatar: it comes from the network.
async function loadPhoto(r: Room): Promise<void> {
  const res = await iq('get', r.jid, xml('vCard', { xmlns: 'vcard-temp' }))
  const photo = res.getChild('vCard')?.getChild('PHOTO')
  const type = photo?.getChildText('TYPE') ?? ''
  const bytes = Buffer.from(photo?.getChildText('BINVAL') ?? '', 'base64')
  r.photo =
    PHOTO_TYPES.includes(type) && bytes.length && bytes.length <= X.AVATAR_MAX_BYTES
      ? `data:${type};base64,${bytes.toString('base64')}`
      : ''
}

const loadRoom = (r: Room): Promise<unknown> =>
  Promise.all([loadMembers(r), loadName(r), loadPhoto(r).catch(() => {})])

// We're out of `room` (removed, or it's gone): forget it and say so, once.
async function dropped(room: string): Promise<void> {
  const r = rooms.get(room)
  if (!r) return
  rooms.delete(room)
  await unbookmark(room).catch((e) => X.unexpectedError('group bookmark', e))
  X.deliver({
    id: randomUUID(),
    with: room,
    mine: false,
    body: '',
    buzz: false,
    wink: '',
    at: Date.now(),
    encrypted: false,
    event: { kind: 'kicked', actor: '', actorName: '', jid: X.ownJid(), name: r.name }
  })
  X.changed()
}

// Joins, refreshes the room and catches up from its archive. Out of the group: dropped,
// or just forgotten when `invited` (a group we were never shown).
async function join(room: string, name: string, invited = false): Promise<void> {
  const r = rooms.get(room) ?? { jid: room, name, photo: '', members: new Map() }
  rooms.set(room, r)
  // Read before entering: live messages start right after, and move it on.
  const after = lastId.get(room)
  try {
    await enter(room)
  } catch (e) {
    if (invited) rooms.delete(room)
    if (OUT.includes(X.errorCondition(e) ?? '')) return invited ? undefined : dropped(room)
    throw e
  }
  await loadRoom(r)
  X.changed()
  await catchUp(room, after)
}

// Everything in the archive after the newest message we've seen (all of it, the first
// time). Results come in as messages, in order with the live ones (see handle).
// What arrives live meanwhile is in the archive too: `delivered` drops the second copy.
async function catchUp(room: string, after: string | undefined): Promise<void> {
  for (let page = 0; page < 100; page++) {
    const set = xml('set', { xmlns: RSM }, xml('max', {}, '50'))
    if (after) set.c('after').t(after)
    let fin: Element | undefined
    try {
      fin = (
        await iq('set', room, xml('query', { xmlns: MAM, queryid: randomUUID() }, set))
      ).getChild('fin', MAM)
    } catch (e) {
      // That message has left the archive (a week): start from what's there.
      if (page === 0 && after && X.errorCondition(e) === 'item-not-found') {
        after = undefined
        continue
      }
      throw e
    }
    after = fin?.getChild('set', RSM)?.getChildText('last') ?? undefined
    if (!fin || fin.attrs.complete === 'true' || !after) break
  }
  await X.inOrder(() => {})
}

// Rooms from our bookmarks, joined: at every sign-in, and when asked while it runs, the
// same run.
export function joinAll(): Promise<void> {
  joining ??= (async () => {
    forAccount()
    const marks = await bookmarks()
    for (const room of rooms.keys()) if (!marks.some((m) => m.jid === room)) rooms.delete(room)
    X.changed()
    await Promise.all(
      marks.map((m) => join(m.jid, m.name).catch((e) => X.unexpectedError('group join', e)))
    )
  })().finally(() => {
    joining = null
  })
  return joining
}

async function configure(room: string, name: string): Promise<void> {
  await iq(
    'set',
    room,
    xml(
      'query',
      { xmlns: MUC_OWNER },
      xml(
        'x',
        { xmlns: 'jabber:x:data', type: 'submit' },
        field('FORM_TYPE', `${MUC}#roomconfig`),
        field('muc#roomconfig_roomname', name)
      )
    )
  )
}

// Rooms get a random address, like accounts: nobody guesses it.
const randomRoom = (): string => {
  const letters = 'abcdefghijklmnopqrstuvwxyz234567'
  const local = [...randomBytes(16)].map((b) => letters[b % 32]).join('')
  return `${local}@${X.GROUPS_DOMAIN}`
}

export async function createGroup(name: string, members: string[]): Promise<string> {
  forAccount()
  const title = cleanName(name)
  if (!title) throw new Error('invalid')
  const room = randomRoom()
  const r: Room = { jid: room, name: title, photo: '', members: new Map() }
  rooms.set(room, r)
  try {
    await enter(room)
    await configure(room, title)
    await bookmark(room, title)
  } catch (e) {
    rooms.delete(room)
    throw e
  }
  await loadMembers(r)
  X.changed()
  if (members.length) await addMembers(room, members)
  return room
}

// Contacts only (others are left out). Through mediated invites, which make them members
// (the room tells everyone who added them). Rejects with 'full' when some didn't fit (50).
export async function addMembers(room: string, members: string[]): Promise<void> {
  const r = roomOf(room)
  const adding = members.filter((m) => X.isContact(m) && !r.members.has(m))
  for (const to of adding) {
    await X.send(xml('message', { to: room }, xml('x', { xmlns: MUC_USER }, xml('invite', { to }))))
  }
  // Answered after the invites: the server handles our stanzas in order.
  await loadMembers(r)
  X.changed()
  if (adding.some((m) => !r.members.has(m))) throw new Error('full')
}

async function affiliate(room: string, member: string, affiliation: string): Promise<void> {
  const r = roomOf(room)
  await iq(
    'set',
    room,
    xml('query', { xmlns: MUC_ADMIN }, xml('item', { jid: member, affiliation }))
  )
  await loadMembers(r)
  X.changed()
}

export const removeMember = (room: string, member: string): Promise<void> =>
  affiliate(room, member, 'none')

export const setOwner = (room: string, member: string, owner: boolean): Promise<void> =>
  affiliate(room, member, owner ? 'owner' : 'member')

export async function setName(room: string, name: string): Promise<void> {
  const r = roomOf(room)
  const title = cleanName(name)
  if (!title) throw new Error('invalid')
  await configure(room, title)
  r.name = title
  await bookmark(room, title)
  X.changed()
}

// A PNG up to the avatar's size; null removes it (the app then shows the members' faces).
export async function setPhoto(room: string, png: Uint8Array | null): Promise<void> {
  const r = roomOf(room)
  const bytes = png && Buffer.from(png)
  if (bytes) {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (bytes.length > X.AVATAR_MAX_BYTES || !bytes.subarray(0, 8).equals(signature)) {
      throw new Error('invalid')
    }
  }
  const vcard = xml('vCard', { xmlns: 'vcard-temp' })
  if (bytes) {
    vcard.c('PHOTO').c('TYPE').t('image/png').up().c('BINVAL').t(bytes.toString('base64'))
  }
  await iq('set', room, vcard)
  r.photo = bytes ? `data:image/png;base64,${bytes.toString('base64')}` : ''
  X.changed()
}

export async function leaveGroup(room: string): Promise<void> {
  roomOf(room)
  leaving.add(room)
  try {
    await iq('set', room, xml('leave', { xmlns: G }))
  } catch (e) {
    leaving.delete(room) // still in it: a later removal is a real one
    throw e
  }
  rooms.delete(room)
  await unbookmark(room)
  X.changed()
}

// --- messages ---------------------------------------------------------------------------

async function sendToRoom(
  room: string,
  stanza: Element,
  content: Pick<X.ChatMessage, 'body' | 'wink' | 'encrypted'>
): Promise<X.ChatMessage> {
  const id = randomUUID()
  stanza.attrs.to = room
  stanza.attrs.id = id
  sentIds.add(id)
  await X.send(stanza)
  const me = X.ownJid()
  return {
    id,
    with: room,
    mine: true,
    buzz: false,
    ...content,
    at: Date.now(),
    sender: me,
    senderName: X.ownNick() || _('Sin nombre')
  }
}

// Encrypted for every device of every member, and our other ones. Rejects with 'offline'.
export async function sendGroupMessage(room: string, body: string): Promise<X.ChatMessage> {
  const r = roomOf(room)
  const store = X.omemoStore()
  if (!store) throw new Error('offline')
  const me = X.ownJid()
  const targets: Device[] = []
  for (const member of new Set([...r.members.keys(), me])) {
    for (const deviceId of await X.devicesOf(member)) {
      const device = { jid: member, deviceId }
      if (deviceId !== store.deviceId && (await X.ensureSession(device))) targets.push(device)
    }
  }
  const encrypted = await store.encrypt(body, targets)
  const stanza = xml(
    'message',
    { type: 'groupchat' },
    X.encryptedElement(encrypted),
    xml('body', {}, _('Mensaje cifrado con OMEMO')),
    xml('store', { xmlns: HINTS })
  )
  return sendToRoom(room, stanza, { body, wink: '', encrypted: true })
}

export function sendGroupWink(room: string, wink: string): Promise<X.ChatMessage> {
  roomOf(room)
  if (!X.isWinkId(wink)) return Promise.reject(new Error('invalid'))
  const stanza = xml(
    'message',
    { type: 'groupchat' },
    xml('body', {}, _('😉 Te he enviado un guiño ({wink}). Para verlo, usa Palique.', { wink })),
    xml('wink', { xmlns: WINK, id: wink })
  )
  return sendToRoom(room, stanza, { body: '', wink, encrypted: false })
}

// --- incoming ---------------------------------------------------------------------------

function handlePresence(stanza: Element): void {
  const from = stanza.attrs.from as string
  const room = bare(from)
  if (from !== `${room}/${nick()}`) return // only our own occupant matters
  const waiting = joins.get(room)
  if (stanza.attrs.type === 'error') {
    const error = stanza.getChild('error')?.getChildElements()[0]?.name ?? 'error'
    waiting?.reject(Object.assign(new Error(error), { condition: error }))
    return
  }
  const user = stanza.getChild('x', MUC_USER)
  const codes = user?.getChildren('status').map((s) => s.attrs.code) ?? []
  if (!codes.includes('110')) return
  if (stanza.attrs.type !== 'unavailable') {
    waiting?.resolve()
    return
  }
  // Removed (321), banned (301) or the room destroyed, unless we left ourselves.
  if (codes.includes('321') || codes.includes('301') || user?.getChild('destroy')) {
    if (leaving.delete(room)) return
    dropped(room).catch((e) => X.unexpectedError('group', e))
  }
}

// Room messages, in order (xmpp.ts queues them with everyone else's).
async function handle(stanza: Element): Promise<void> {
  if (stanza.is('presence')) return handlePresence(stanza)
  const room = bare(stanza.attrs.from)
  if (!rooms.has(room) && !stanza.getChild('x', MUC_USER)?.getChild('invite')) return
  // From the archive: the room forwards what it kept.
  const result = stanza.getChild('result', MAM)
  if (result) {
    if (stanza.attrs.from !== room) return
    const forwarded = result.getChild('forwarded', 'urn:xmpp:forward:0')
    const inner = forwarded?.getChild('message')
    const stamp = forwarded?.getChild('delay', 'urn:xmpp:delay')?.attrs.stamp
    if (inner && typeof result.attrs.id === 'string') {
      await roomMessage(room, inner, result.attrs.id, stamp ? Date.parse(stamp) : Date.now())
    }
    return
  }
  if (stanza.attrs.type === 'error') return
  // An invite: the inviter has already made us a member. Only from contacts (no spam).
  // Its body names the inviter's address: never shown.
  const invite = stanza.getChild('x', MUC_USER)?.getChild('invite')
  if (invite) {
    const inviter = typeof invite.attrs.from === 'string' ? bare(invite.attrs.from) : ''
    if (stanza.attrs.from !== room || rooms.has(room) || !X.isContact(inviter)) return
    // Not awaited: joining waits for messages queued after this one.
    accept(room).catch((e) => X.unexpectedError('group invite', e))
    return
  }
  if (stanza.attrs.type !== 'groupchat') return
  const sid = stanza.getChildren('stanza-id', 'urn:xmpp:sid:0').find((s) => s.attrs.by === room)
  // Live: any <delay> is the writer's (rooms send no join history), so it's ignored.
  await roomMessage(room, stanza, sid?.attrs.id)
}

async function accept(room: string): Promise<void> {
  forAccount()
  await join(room, '', true)
  const r = rooms.get(room)
  if (r) await bookmark(room, r.name)
}

// One message of the room, live or archived (`archivedAt`). `id`: the room's stanza-id.
async function roomMessage(
  room: string,
  message: Element,
  id: string | undefined,
  archivedAt?: number
): Promise<void> {
  const r = rooms.get(room)
  if (!r || message.attrs.type !== 'groupchat') return
  if (id) {
    if (delivered.has(`${room} ${id}`)) return
    delivered.add(`${room} ${id}`)
    lastId.set(room, id)
  }
  const timing = archivedAt ? { at: archivedAt, delayed: true } : { at: Date.now() }
  const from = String(message.attrs.from ?? '')

  // The room's own announcements: only from the room itself.
  const event = message.getChild('event', G)
  if (event) {
    if (from !== room || !KINDS.includes(event.attrs.kind)) return
    const e = await groupEvent(r, event)
    if (!archivedAt && e.kind !== 'name' && e.kind !== 'photo') await loadMembers(r).catch(() => {})
    if (!archivedAt && e.kind === 'name' && e.name) r.name = e.name
    if (!archivedAt && e.kind === 'photo') await loadPhoto(r).catch(() => {})
    X.changed()
    X.deliver({
      id: id ?? message.attrs.id ?? randomUUID(),
      with: room,
      mine: false,
      body: '',
      buzz: false,
      wink: '',
      ...timing,
      encrypted: false,
      event: e
    })
    return
  }

  // Someone in the room: their nick is their localpart (the server makes sure).
  const writer = parseJid(from).getResource()
  if (!writer || bare(from) !== room) return
  if (!archivedAt && sentIds.delete(message.attrs.id)) return // our own, back from the room
  // No buzzing groups.
  if (message.getChild('attention', 'urn:xmpp:attention:0')) return
  const sender = `${writer}@${X.ownJid().split('@')[1]}`
  const mine = sender === X.ownJid()
  const received = message.getChild('wink', WINK)?.attrs.id
  const wink = X.isWinkId(received) ? received : ''
  let body = wink ? '' : (message.getChildText('body') ?? '')
  const sealed = wink ? undefined : message.getChild('encrypted', OMEMO)
  let undecryptable = false
  if (sealed) {
    if (!sealed.getChild('payload')) return
    // A member we don't know yet (not a contact, just came in): their devices first.
    if (!mine) await X.devicesOf(sender).catch(() => {})
    const opened = await X.decryptBody(sealed, sender, mine, Boolean(archivedAt))
    if (!opened) return
    body = opened.body
    undecryptable = opened.undecryptable
  }
  if (!body && !wink && !undecryptable) return
  X.deliver({
    id: id ?? message.attrs.id ?? randomUUID(),
    with: room,
    mine,
    body,
    buzz: false,
    wink,
    ...timing,
    encrypted: Boolean(sealed),
    ...(undecryptable ? { undecryptable } : {}),
    sender,
    senderName: await nameOf(r, sender)
  })
}

// A member's display name, from the room's list (asked again for someone new to us).
async function nameOf(r: Room, member: string): Promise<string> {
  if (member === X.ownJid() && X.ownNick()) return X.ownNick()
  if (!r.members.get(member)?.name) await loadMembers(r).catch(() => {})
  return r.members.get(member)?.name || _('Sin nombre')
}

async function groupEvent(r: Room, el: Element): Promise<GroupEvent> {
  const actor = typeof el.attrs.actor === 'string' ? el.attrs.actor : ''
  const target = typeof el.attrs.jid === 'string' ? el.attrs.jid : ''
  const kind = el.attrs.kind as GroupEvent['kind']
  const name = kind === 'name' ? cleanName(el.attrs.name) : X.cleanNick(el.attrs.name)
  const actorName = X.cleanNick(el.attrs['actor-name']) || (actor ? await nameOf(r, actor) : '')
  return { kind, actor, actorName, jid: target, name }
}
