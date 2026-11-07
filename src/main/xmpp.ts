// The only module that knows about the XMPP library. One connection for the whole app.
import { createHash, randomUUID } from 'node:crypto'
import { client, jid, xml, type Client } from '@xmpp/client'
import type { Element } from '@xmpp/xml'
import { _, lang } from '../renderer/src/i18n.ts'
import {
  OmemoError,
  type Bundle,
  type Device,
  type DeviceTrust,
  type Encrypted,
  type Omemo,
  type TrustChange
} from './omemo.ts'

// Which server: fixed at build time for releases (MAIN_VITE_* variables, see the release
// workflow), overridable with PALIQUE_* at run time, localhost in development.
const built = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
const config = (name: string, buildName: string): string | undefined =>
  process.env[name] || built[buildName] || undefined

export const DOMAIN = config('PALIQUE_XMPP_DOMAIN', 'MAIN_VITE_XMPP_DOMAIN') ?? 'localhost'
const SERVICE = process.env['PALIQUE_XMPP_SERVICE'] ?? `xmpp://${DOMAIN}:5222`
const ROSTER = 'jabber:iq:roster'
const ATTENTION = 'urn:xmpp:attention:0' // buzz (XEP-0224)
const CARBONS = 'urn:xmpp:carbons:2' // copies from our other devices (XEP-0280)
const CHATSTATES = 'http://jabber.org/protocol/chatstates' // "is typing" (XEP-0085)
const WINK = 'urn:palique:wink:0' // Palique-only: full-screen animation from the bundled catalog

const INVISIBLE = 'urn:xmpp:invisible:0' // XEP-0186, server/modules/mod_palique_invisible.lua
const ACCOUNTS = 'urn:palique:accounts:0' // account service, server/accounts
export const ACCOUNTS_JID = process.env['PALIQUE_ACCOUNTS_JID'] ?? `accounts.${DOMAIN}`
const PUBSUB = 'http://jabber.org/protocol/pubsub'
const AVATAR_DATA = 'urn:xmpp:avatar:data' // avatars (XEP-0084), stored in each user's PEP
const AVATAR_METADATA = 'urn:xmpp:avatar:metadata'
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const AVATAR_MAX_BYTES = 100_000
const NICK = 'http://jabber.org/protocol/nick' // display names (XEP-0172): PEP and presence
export const NICK_MAX = 128 // room for formatting codes
const OMEMO = 'eu.siacs.conversations.axolotl' // end-to-end encryption, OMEMO 0.3
const DEVICELIST = `${OMEMO}.devicelist`
const BUNDLES = `${OMEMO}.bundles:`
const HINTS = 'urn:xmpp:hints'
const DISCO_INFO = 'http://jabber.org/protocol/disco#info'

// Wink ids come from the network and end up in a URL: keep them boring.
export const isWinkId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id)

export type AuthError =
  | 'not-authorized' // wrong email or password
  | 'wait' // too many attempts, try again in a minute
  | 'outdated' // this app is older than the server accepts: update it
  | 'unreachable'
  | 'unknown'

export type AuthResult = { ok: true; jid: string } | { ok: false; error: AuthError }

export type Show = 'online' | 'away' | 'dnd'
export type OwnShow = Show | 'invisible' // contacts never look invisible: they look offline

export type Contact = {
  jid: string
  name: string // display name (a placeholder until we know it)
  show: Show | 'offline'
  status: string // personal message
  subscription: 'none' | 'to' | 'from' | 'both'
  pending: boolean // we asked to see their presence, waiting for approval
  avatar: string // data: URL, '' for the default avatar
  email: string // only for mutual contacts, '' otherwise
}

export type Snapshot = {
  connected: boolean
  jid: string // our own bare JID
  contacts: Contact[]
  requests: { jid: string; name: string }[] // people asking to add us
  name: string // our own display name
  avatar: string // our own avatar, data: URL or ''
  show: OwnShow // our own status
  status: string // our own personal message
}

export type ChatMessage = {
  id: string
  with: string // the contact's bare JID
  mine: boolean
  body: string
  buzz: boolean
  wink: string // catalog id, '' when not a wink
  at: number // ms timestamp
  delayed?: boolean // stored by the server while we were offline (saved, but no effects)
  encrypted: boolean // came (or went) with OMEMO
  undecryptable?: boolean // encrypted, but not for us or broken: no text to show
}

type Presence = { show: Show; status: string }
type RosterEntry = Omit<Contact, 'show' | 'status' | 'avatar' | 'name' | 'email'> & {
  resources: Map<string, Presence>
}
type Avatar = { hash: string; url: string }

let xmpp: Client | null = null
let me = ''
let roster = new Map<string, RosterEntry>()
let requests = new Set<string>()
let own: { show: OwnShow; status: string } = { show: 'online', status: '' }
let avatars = new Map<string, Avatar>() // by bare JID, ours included
let nicks = new Map<string, string>() // display names by bare JID, ours included
let emails = new Map<string, string>() // mutual contacts' emails, from the account service
let listener: (snapshot: Snapshot) => void = () => {}
let messageListener: (message: ChatMessage) => void = () => {}
let typingListener: (contact: string, typing: boolean) => void = () => {}
let emailListener: (email: EmailStatus) => void = () => {}
export type { DeviceTrust }
export type TrustNote = TrustChange & { at: number }
let trustListener: (changes: TrustChange[]) => void = () => {}
let omemo: Omemo | null = null
let omemoOpener: ((account: string) => Promise<Omemo>) | null = null
let devices = new Map<string, number[]>() // OMEMO device ids by bare JID, ours included
let stale = new Set<string>() // `jid/deviceId` whose session broke: start a new one
let bundleTimer: ReturnType<typeof setTimeout> | undefined

// JIDs are random ids: never show them. Other XMPP clients may not send a name.
const nameOf = (bare: string): string => nicks.get(bare) || _('Sin nombre')

// Best presence across the contact's connected devices.
const RANK: Record<Show, number> = { online: 0, dnd: 1, away: 2 }

export function snapshot(): Snapshot {
  const contacts = [...roster.values()].map(({ resources, ...entry }): Contact => {
    const best = [...resources.values()].sort((a, b) => RANK[a.show] - RANK[b.show])[0]
    return {
      ...entry,
      show: best?.show ?? 'offline',
      status: best?.status ?? '',
      avatar: avatars.get(entry.jid)?.url ?? '',
      name: nameOf(entry.jid),
      email: entry.subscription === 'both' ? (emails.get(entry.jid) ?? '') : ''
    }
  })
  return {
    connected: xmpp?.status === 'online',
    jid: me,
    contacts,
    requests: [...requests].map((jid) => ({ jid, name: nameOf(jid) })),
    name: nameOf(me),
    avatar: avatars.get(me)?.url ?? '',
    show: own.show,
    status: own.status
  }
}

export function onChange(callback: (snapshot: Snapshot) => void): void {
  listener = callback
}

const emit = (): void => listener(snapshot())

export function onEmail(callback: (email: EmailStatus) => void): void {
  emailListener = callback
}

export function onTyping(callback: (contact: string, typing: boolean) => void): void {
  typingListener = callback
}

export function onMessage(callback: (message: ChatMessage) => void): void {
  messageListener = callback
}

function send(stanza: Element): Promise<void> {
  return xmpp ? xmpp.send(stanza) : Promise.resolve()
}

// Display names come from the network: one line, no control characters, not too long.
// Joiners and tag characters stay: emoji like 👨‍👩‍👧 and some flags are built with them.
export const cleanNick = (value: unknown): string =>
  String(value ?? '')
    .replace(/(?![\u200d\u{e0020}-\u{e007f}])[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, NICK_MAX)

// Our name goes in every presence (contacts see changes right away) and in PEP (for
// contacts who were offline).
function withNick(presence: Element): Element {
  const name = nicks.get(me)
  if (name) presence.c('nick', { xmlns: NICK }).t(name)
  return presence
}

function presenceStanza(): Element {
  const presence = xml(
    'presence',
    {},
    xml('c', { xmlns: CAPS, hash: 'sha-1', node: CAPS_NODE, ver: CAPS_VER })
  )
  if (own.show === 'away' || own.show === 'dnd') presence.c('show').t(own.show)
  if (own.status) presence.c('status').t(own.status)
  return withNick(presence)
}

const subscribeStanza = (to: string): Element =>
  withNick(xml('presence', { to, type: 'subscribe' }))

function applyRosterItem(item: Element): void {
  const bare = item.attrs.jid as string
  if (item.attrs.subscription === 'remove') {
    roster.delete(bare)
    return
  }
  roster.set(bare, {
    jid: bare,
    subscription: item.attrs.subscription ?? 'none',
    pending: item.attrs.ask === 'subscribe',
    resources: roster.get(bare)?.resources ?? new Map()
  })
}

function parseShow(stanza: Element): Show {
  const show = stanza.getChildText('show')
  if (show === 'away' || show === 'xa') return 'away'
  if (show === 'dnd') return 'dnd'
  return 'online'
}

function handlePresence(stanza: Element): void {
  if (!stanza.attrs.from) return
  const from = jid(stanza.attrs.from)
  const bare = from.bare().toString()
  if (bare === me) return
  const entry = roster.get(bare)

  const nick = cleanNick(stanza.getChildText('nick', NICK))
  if (nick && (entry || stanza.attrs.type === 'subscribe')) nicks.set(bare, nick)

  // The server adds the avatar's hash to presence (XEP-0153 style): fetch it when it changes.
  const photo = stanza.getChild('x', 'vcard-temp:x:update')?.getChild('photo')
  if (entry && photo && !stanza.attrs.type) {
    const hash = photo.text()
    if (!hash) avatars.delete(bare)
    else if (avatars.get(bare)?.hash !== hash) loadAvatar(bare).then(emit, () => {})
  }

  switch (stanza.attrs.type) {
    case undefined:
      entry?.resources.set(from.getResource(), {
        show: parseShow(stanza),
        // From the network: one line, as long as ours can be.
        status: (stanza.getChildText('status') ?? '').replace(/\p{Cc}/gu, ' ').slice(0, 140)
      })
      break
    case 'unavailable':
      entry?.resources.delete(from.getResource())
      break
    case 'subscribe':
      // Someone we already added is adding us back: accept: lists are mutual.
      if (entry && (entry.pending || entry.subscription === 'to')) {
        send(xml('presence', { to: bare, type: 'subscribed' }))
        return
      }
      requests.add(bare)
      break
    case 'unsubscribe':
      requests.delete(bare)
      break
    default:
      return
  }
  emit()
}

async function handleMessage(stanza: Element): Promise<void> {
  // The account service tells us when the email gets verified. Only it, exactly.
  const email = stanza.getChild('email', ACCOUNTS)
  if (email) {
    if (stanza.attrs.from === ACCOUNTS_JID) emailListener(parseEmail(email))
    return
  }
  // PEP notifications: someone's OMEMO devices changed (ours or a contact's).
  const event = stanza.getChild('event', `${PUBSUB}#event`)?.getChild('items')
  if (event) {
    const owner = stanza.attrs.from ? jid(stanza.attrs.from).bare().toString() : me
    if (event.attrs.node === DEVICELIST && (owner === me || roster.has(owner))) {
      await devicesChanged(owner, readDeviceList(event.getChild('item')))
    }
    return
  }
  let message = stanza
  let mine = false
  const carbon = stanza.getChild('received', CARBONS) ?? stanza.getChild('sent', CARBONS)
  if (carbon) {
    // Anyone could wrap a fake message in a carbon: only accept them from our own account.
    const from = stanza.attrs.from
    if (!from || jid(from).bare().toString() !== me) return
    const inner = carbon.getChild('forwarded', 'urn:xmpp:forward:0')?.getChild('message')
    if (!inner) return
    message = inner
    mine = carbon.name === 'sent'
  }
  if (message.attrs.type === 'error' || message.attrs.type === 'groupchat') return

  const other = mine ? message.attrs.to : message.attrs.from
  if (!other) return
  const bare = jid(other).bare().toString()
  // Contacts only: strangers can't message you (no spam).
  if (!roster.has(bare)) return

  const buzz = Boolean(message.getChild('attention', ATTENTION))
  const received = message.getChild('wink', WINK)?.attrs.id
  const wink = isWinkId(received) ? received : ''
  // A wink's body is only the fallback text for other XMPP clients, and so is an
  // encrypted message's.
  let body = wink ? '' : (message.getChildText('body') ?? '')
  const sealed = wink ? undefined : message.getChild('encrypted', OMEMO)
  let undecryptable = false
  if (sealed) {
    // ponytail: key-only messages (no payload, from other clients) are dropped unread;
    // decrypt them too if sessions with those clients go wrong.
    if (!sealed.getChild('payload')) return
    const opened = await decryptBody(sealed, mine ? me : bare, mine)
    if (!opened) return
    body = opened.body
    undecryptable = opened.undecryptable
  }
  // Our own typing on other devices doesn't matter. Any other chat state, or the
  // message itself, means they stopped typing.
  const state = message.getChildElements().find((el) => el.attrs.xmlns === CHATSTATES)?.name
  const content = Boolean(body || buzz || wink || undecryptable)
  if (!mine && (state || content)) typingListener(bare, state === 'composing' && !content)
  if (!content) return
  // Offline messages carry the time they were sent.
  const stamp = message.getChild('delay', 'urn:xmpp:delay')?.attrs.stamp
  messageListener({
    id: message.attrs.id ?? randomUUID(),
    with: bare,
    mine,
    body,
    buzz,
    wink,
    at: stamp ? Date.parse(stamp) : Date.now(),
    ...(stamp ? { delayed: true } : {}),
    encrypted: Boolean(sealed),
    ...(undecryptable ? { undecryptable } : {})
  })
}

function pubsubItems(owner: string | undefined, node: string, itemId?: string): Promise<Element> {
  const items = itemId
    ? xml('items', { node }, xml('item', { id: itemId }))
    : xml('items', { node, max_items: '1' })
  return xmpp!.iqCaller.request(
    xml('iq', { type: 'get', to: owner }, xml('pubsub', { xmlns: PUBSUB }, items))
  )
}

// Latest avatar of `owner` (our own when it's us), checked: it comes from the network.
async function loadAvatar(owner: string): Promise<void> {
  const to = owner === me ? undefined : owner
  const meta = await pubsubItems(to, AVATAR_METADATA)
  const info = meta.getChild('pubsub')?.getChild('items')?.getChild('item')
  const details = info?.getChild('metadata', AVATAR_METADATA)?.getChild('info')
  if (!info || !details) {
    avatars.delete(owner)
    return
  }
  const type = details.attrs.type
  const hash = info.attrs.id
  if (!AVATAR_TYPES.includes(type) || Number(details.attrs.bytes) > AVATAR_MAX_BYTES) return
  const data = await pubsubItems(to, AVATAR_DATA, hash)
  const base64 =
    data.getChild('pubsub')?.getChild('items')?.getChild('item')?.getChildText('data') ?? ''
  const bytes = Buffer.from(base64, 'base64')
  if (!bytes.length || bytes.length > AVATAR_MAX_BYTES) return
  avatars.set(owner, { hash, url: `data:${type};base64,${bytes.toString('base64')}` })
}

// Someone's display name from their PEP (ours when it's us). Contacts who haven't
// accepted us yet can't read it: their subscription request carried it instead.
async function loadNick(owner: string): Promise<void> {
  const res = await pubsubItems(owner === me ? undefined : owner, NICK)
  const nick = cleanNick(
    res.getChild('pubsub')?.getChild('items')?.getChild('item')?.getChildText('nick', NICK)
  )
  if (nick) nicks.set(owner, nick)
}

async function loadRoster(): Promise<void> {
  if (!xmpp) return
  const res = await xmpp.iqCaller.request(
    xml('iq', { type: 'get' }, xml('query', { xmlns: ROSTER }))
  )
  const items = res.getChild('query')?.getChildren('item') ?? []
  const previous = roster
  roster = new Map()
  for (const item of items) {
    applyRosterItem(item)
    const old = previous.get(item.attrs.jid)
    if (old) roster.get(item.attrs.jid)!.resources = old.resources
  }
  emit()
  for (const bare of roster.keys()) loadNick(bare).then(emit, () => {})
}

function toAuthError(e: unknown): AuthError {
  const { condition, code } = (e ?? {}) as { condition?: string; code?: string }
  if (condition === 'not-authorized') return condition
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT') return 'unreachable'
  return unexpected('sign-in', e)
}

// Signs in with the account's JID localpart (see accountFor). Accounts are made on the
// website (the account service), never here. `show` and `status`: status and personal
// message to sign in with, so an invisible user is never briefly visible.
export async function login(
  username: string,
  password: string,
  { show = 'online', status = '' }: { show?: OwnShow; status?: string } = {}
): Promise<AuthResult> {
  await logout()
  own = { show, status: status.trim().slice(0, 140) }
  const entity = client({
    service: SERVICE,
    domain: DOMAIN,
    credentials: async (authenticate, mechanisms) => {
      // The server requires TLS, so its preferred mechanism is safe to use as-is.
      await authenticate(
        { username, password },
        mechanisms[0],
        xml('user-agent', { id: randomUUID() })
      )
    }
  })
  // Without a listener, connection errors would crash the main process.
  entity.on('error', () => {})
  // Messages one at a time and in order: decrypting is async, and each one moves the
  // OMEMO session on.
  let incoming = Promise.resolve()
  entity.on('stanza', (stanza) => {
    if (stanza.is('presence')) handlePresence(stanza)
    else if (stanza.is('message')) {
      incoming = incoming
        .then(() => handleMessage(stanza))
        .catch((e) => {
          unexpected('message', e)
        })
    }
  })
  // What we support, for the server's PEP: `+notify` gets us contacts' device lists.
  entity.iqCallee.get(DISCO_INFO, 'query', (ctx) =>
    discoInfo(ctx.stanza.getChild('query')?.attrs.node)
  )
  // Roster pushes: the server tells us about changes to our contact list.
  entity.iqCallee.set(ROSTER, 'query', (ctx) => {
    // Only trust pushes from our own server (no `from`, or our bare JID). ctx.from can't tell:
    // the library fills it with the domain when `from` is missing.
    const from = ctx.stanza.attrs.from
    if (from && jid(from).bare().toString() !== me) return false
    for (const item of ctx.stanza.getChild('query')?.getChildren('item') ?? []) {
      applyRosterItem(item)
      // Just accepted: now we may read their name.
      const bare = item.attrs.jid as string
      const sub = item.attrs.subscription
      if ((sub === 'to' || sub === 'both') && !nicks.has(bare)) loadNick(bare).then(emit, () => {})
      if (sub === 'both' && !emails.has(bare)) loadEmails().then(emit, () => {})
    }
    emit()
    return true
  })
  // Also fires after automatic reconnects: refresh contacts and re-announce ourselves.
  // The first time, login() waits for it, so we're fully signed in when it returns.
  let ready: Promise<void> = Promise.resolve()
  entity.on('online', (address) => {
    me = address.bare().toString()
    // Roster before presence: offline messages arrive after presence and need the contact list.
    ready = loadRoster()
      .then(() =>
        xmpp?.iqCaller.request(xml('iq', { type: 'set' }, xml('enable', { xmlns: CARBONS })))
      )
      // Invisible must be set before presence goes out. If the server refuses, say so
      // (we'd be visible) rather than pretend.
      .then(() =>
        own.show === 'invisible'
          ? setInvisible(true).catch(() => {
              own = { ...own, show: 'online' }
            })
          : undefined
      )
      // Our name first, so the first presence already carries it.
      .then(() => loadNick(me).catch(() => {}))
      // Before presence, so contacts can write to us encrypted as soon as they see us.
      .then(startOmemo)
      .then(() => send(presenceStanza()))
      .then(emit)
      .then(loadEmails)
      .then(emit)
      .catch(() => {})
    loadAvatar(me).then(emit, () => {})
  })
  // Contacts' presence is only valid while connected.
  entity.on('status', (status) => {
    if (status === 'disconnect') roster.forEach((entry) => entry.resources.clear())
    emit()
  })

  // Set before start(): the first 'online' handler already needs it.
  xmpp = entity
  try {
    await entity.start()
    await ready
    return { ok: true, jid: me }
  } catch (e) {
    xmpp = null
    entity.reconnect.stop()
    await entity.stop().catch(() => {})
    return { ok: false, error: toAuthError(e) }
  }
}

export async function logout(): Promise<void> {
  const entity = xmpp
  xmpp = null
  me = ''
  roster = new Map()
  requests = new Set()
  own = { show: 'online', status: '' }
  avatars = new Map()
  nicks = new Map()
  emails = new Map()
  clearTimeout(bundleTimer)
  omemo?.close()
  omemo = null
  devices = new Map()
  stale = new Set()
  if (!entity) return
  entity.reconnect.stop()
  await entity.stop().catch(() => {})
  emit()
}

function rosterSet(item: Record<string, string>): Promise<Element> {
  return xmpp!.iqCaller.request(
    xml('iq', { type: 'set' }, xml('query', { xmlns: ROSTER }, xml('item', item)))
  )
}

// `bare`: from lookupContact.
export async function addContact(bare: string): Promise<void> {
  if (!xmpp || bare === me) return
  await rosterSet({ jid: bare })
  await send(subscribeStanza(bare))
}

export async function acceptRequest(bare: string): Promise<void> {
  if (!xmpp) return
  requests.delete(bare)
  await send(xml('presence', { to: bare, type: 'subscribed' }))
  // Mutual: we also want to see them.
  const entry = roster.get(bare)
  if (!entry || entry.subscription === 'none' || entry.subscription === 'from') {
    if (!entry) await rosterSet({ jid: bare })
    await send(subscribeStanza(bare))
  }
  emit()
}

export async function rejectRequest(bare: string): Promise<void> {
  requests.delete(bare)
  await send(xml('presence', { to: bare, type: 'unsubscribed' }))
  emit()
}

// The server also cancels the subscriptions in both directions.
export async function removeContact(bare: string): Promise<void> {
  if (!xmpp) return
  await rosterSet({ jid: bare, subscription: 'remove' })
}

function setInvisible(on: boolean): Promise<Element> {
  return xmpp!.iqCaller.request(
    xml('iq', { type: 'set' }, xml(on ? 'invisible' : 'visible', { xmlns: INVISIBLE }))
  )
}

// Rejects (status unchanged) if the server doesn't support being invisible.
export async function setPresence(show: OwnShow, status: string): Promise<void> {
  if (!xmpp) return
  const wasInvisible = own.show === 'invisible'
  if (show === 'invisible' && !wasInvisible) await setInvisible(true)
  if (show !== 'invisible' && wasInvisible) await setInvisible(false)
  own = { show, status: status.trim().slice(0, 140) }
  await send(presenceStanza())
  emit()
}

async function sendStanza(
  to: string,
  stanza: Element,
  content: Pick<ChatMessage, 'body' | 'buzz' | 'wink' | 'encrypted'>
): Promise<ChatMessage> {
  const id = randomUUID()
  stanza.attrs.to = to
  stanza.attrs.id = id
  await send(stanza)
  return { id, with: to, mine: true, ...content, at: Date.now() }
}

// Always encrypted, for every device of the contact and our other ones. Rejects with
// 'no-devices' when the contact has no OMEMO device we can reach, 'offline' if signed out.
export async function sendMessage(to: string, body: string): Promise<ChatMessage> {
  const store = omemo
  if (!xmpp || !store) throw new Error('offline')
  const theirs = await reachable(to)
  if (!theirs.length) throw new Error('no-devices')
  const encrypted = await store.encrypt(body, [...theirs, ...(await reachable(me))])
  trust(store.takeChanges())
  // Blocked devices are skipped: if that was all of theirs, it would reach only us.
  if (!encrypted.keys.some((k) => theirs.some((d) => d.deviceId === k.rid))) {
    throw new Error('no-devices')
  }
  const stanza = xml(
    'message',
    { type: 'chat' },
    encryptedElement(encrypted),
    xml('body', {}, _('Mensaje cifrado con OMEMO')),
    xml('store', { xmlns: HINTS }),
    xml('active', { xmlns: CHATSTATES })
  )
  return sendStanza(to, stanza, { body, buzz: false, wink: '', encrypted: true })
}

export function sendBuzz(to: string): Promise<ChatMessage> {
  const stanza = xml('message', { type: 'headline' }, xml('attention', { xmlns: ATTENTION }))
  return sendStanza(to, stanza, { body: '', buzz: true, wink: '', encrypted: false })
}

export function sendWink(to: string, wink: string): Promise<ChatMessage> {
  const stanza = xml(
    'message',
    { type: 'chat' },
    xml('body', {}, _('😉 Te he enviado un guiño ({wink}). Para verlo, usa Palique.', { wink })),
    xml('wink', { xmlns: WINK, id: wink }),
    xml('active', { xmlns: CHATSTATES })
  )
  return sendStanza(to, stanza, { body: '', buzz: false, wink, encrypted: false })
}

export function sendTyping(to: string, typing: boolean): Promise<void> {
  const state = typing ? 'composing' : 'paused'
  return send(xml('message', { to, type: 'chat' }, xml(state, { xmlns: CHATSTATES })))
}

// Used to mute notifications while busy.
export const ownShow = (): OwnShow => own.show
export const ownStatus = (): string => own.status

// Publish a PNG as our avatar, then re-send presence so the server tells our contacts
// the new hash right away.
export async function setAvatar(png: Uint8Array): Promise<void> {
  if (!xmpp) return
  const bytes = Buffer.from(png)
  const hash = createHash('sha1').update(bytes).digest('hex')
  const publish = (node: string, payload: Element): Promise<Element> =>
    xmpp!.iqCaller.request(
      xml(
        'iq',
        { type: 'set' },
        xml(
          'pubsub',
          { xmlns: PUBSUB },
          xml('publish', { node }, xml('item', { id: hash }, payload))
        )
      )
    )
  await publish(AVATAR_DATA, xml('data', { xmlns: AVATAR_DATA }, bytes.toString('base64')))
  await publish(
    AVATAR_METADATA,
    xml(
      'metadata',
      { xmlns: AVATAR_METADATA },
      xml('info', { id: hash, bytes: String(bytes.length), type: 'image/png' })
    )
  )
  avatars.set(me, { hash, url: `data:image/png;base64,${bytes.toString('base64')}` })
  await send(presenceStanza())
  emit()
}

// Our display name, published to PEP (readable by contacts, like the avatar).
async function publishNick(name: string): Promise<void> {
  await xmpp!.iqCaller.request(
    xml(
      'iq',
      { type: 'set' },
      xml(
        'pubsub',
        { xmlns: PUBSUB },
        xml('publish', { node: NICK }, xml('item', {}, xml('nick', { xmlns: NICK }, name)))
      )
    )
  )
  nicks.set(me, name)
}

// Changes our display name; contacts online see it with the next presence.
export async function setNick(value: string): Promise<void> {
  const name = cleanNick(value)
  if (!xmpp || !name) return
  await publishNick(name)
  await send(presenceStanza())
  emit()
}

// --- OMEMO: end-to-end encryption (keys and sessions in omemo.ts) ----------------------

// Entity capabilities (XEP-0115): the server asks once per `ver` what we support.
const CAPS = 'http://jabber.org/protocol/caps'
const CAPS_NODE = 'https://github.com/pauferr/palique'
const FEATURES = [DISCO_INFO, `${DEVICELIST}+notify`].sort()
const CAPS_VER = createHash('sha1')
  .update(`client/pc//Palique<${FEATURES.join('<')}<`)
  .digest('base64')

const discoInfo = (node?: string): Element =>
  xml(
    'query',
    { xmlns: DISCO_INFO, ...(node ? { node } : {}) },
    xml('identity', { category: 'client', type: 'pc', name: 'Palique' }),
    ...FEATURES.map((v) => xml('feature', { var: v }))
  )

// The store is opened per account on signing in (index.ts says where, and how it's sealed).
export function setOmemoOpener(open: ((account: string) => Promise<Omemo>) | null): void {
  omemoOpener = open
}

export function onTrust(callback: (changes: TrustChange[]) => void): void {
  trustListener = callback
}

const trust = (changes: TrustChange[]): void => {
  if (changes.length) trustListener(changes)
}

export const deviceTrust = (contact: string): DeviceTrust[] => omemo?.devices(contact) ?? []
export const ownFingerprint = (): string => omemo?.fingerprint() ?? ''

export function setVerified(contact: string, deviceId: number, verified: boolean): void {
  omemo?.setVerified({ jid: contact, deviceId }, verified)
}

// The user accepts a verified device's new key: a new session with it, from its bundle.
export async function acceptKey(contact: string, deviceId: number): Promise<void> {
  const store = omemo
  if (!xmpp || !store) return
  const device = { jid: contact, deviceId }
  store.acceptKey(device)
  await store.startSession(device, await fetchBundle(device))
  trust(store.takeChanges())
}

const base64 = (b: Uint8Array): string => Buffer.from(b).toString('base64')
const fromBase64 = (text: string | null | undefined): Uint8Array | null => {
  const b = Buffer.from(text ?? '', 'base64')
  return b.length ? new Uint8Array(b) : null
}
// Ids from the network: plain decimal numbers. Device ids are 31 bits, never 0.
const keyId = (v: unknown): number | null =>
  typeof v === 'string' && /^\d{1,10}$/.test(v) && Number(v) < 2 ** 32 ? Number(v) : null
const deviceId = (v: unknown): number | null => {
  const id = keyId(v)
  return id && id < 2 ** 31 ? id : null
}

export function encryptedElement(e: Encrypted): Element {
  return xml(
    'encrypted',
    { xmlns: OMEMO },
    xml(
      'header',
      { sid: String(e.sid) },
      ...e.keys.map((k) =>
        xml(
          'key',
          k.prekey ? { rid: String(k.rid), prekey: 'true' } : { rid: String(k.rid) },
          base64(k.data)
        )
      ),
      xml('iv', {}, base64(e.iv))
    ),
    xml('payload', {}, base64(e.payload))
  )
}

// null when it can't be an OMEMO message; keys that make no sense are left out.
export function readEncrypted(el: Element): Encrypted | null {
  const header = el.getChild('header')
  const sid = deviceId(header?.attrs.sid)
  const iv = fromBase64(header?.getChildText('iv'))
  const payload = fromBase64(el.getChildText('payload'))
  if (!header || !sid || !iv || (iv.length !== 12 && iv.length !== 16) || !payload) return null
  const keys: Encrypted['keys'] = []
  for (const k of header.getChildren('key')) {
    const rid = deviceId(k.attrs.rid)
    const data = fromBase64(k.text())
    if (rid && data)
      keys.push({ rid, prekey: k.attrs.prekey === 'true' || k.attrs.prekey === '1', data })
  }
  return { sid, iv, keys, payload }
}

export function bundleElement(b: Bundle): Element {
  return xml(
    'bundle',
    { xmlns: OMEMO },
    xml(
      'signedPreKeyPublic',
      { signedPreKeyId: String(b.signedPreKey.id) },
      base64(b.signedPreKey.publicKey)
    ),
    xml('signedPreKeySignature', {}, base64(b.signedPreKey.signature)),
    xml('identityKey', {}, base64(b.identityKey)),
    xml(
      'prekeys',
      {},
      ...b.preKeys.map((k) => xml('preKeyPublic', { preKeyId: String(k.id) }, base64(k.publicKey)))
    )
  )
}

// The bundle element doesn't say whose device it is: the node name does. Throws when
// it isn't usable (keys are 33 bytes: type byte + 32, signatures 64).
export function readBundle(el: Element, device: number): Bundle {
  const key = (child: Element | undefined): Uint8Array | null => {
    const b = fromBase64(child?.text())
    return b?.length === 33 ? b : null
  }
  const signed = el.getChild('signedPreKeyPublic')
  const signedId = keyId(signed?.attrs.signedPreKeyId)
  const signedKey = key(signed)
  const signature = fromBase64(el.getChildText('signedPreKeySignature'))
  const identityKey = key(el.getChild('identityKey'))
  const preKeys: Bundle['preKeys'] = []
  for (const k of el.getChild('prekeys')?.getChildren('preKeyPublic') ?? []) {
    const id = keyId(k.attrs.preKeyId)
    const publicKey = key(k)
    if (id !== null && publicKey) preKeys.push({ id, publicKey })
  }
  if (signedId === null || !signedKey || signature?.length !== 64 || !identityKey) {
    throw new Error('bad-bundle')
  }
  return {
    deviceId: device,
    identityKey,
    signedPreKey: { id: signedId, publicKey: signedKey, signature },
    preKeys
  }
}

export const deviceListElement = (ids: number[]): Element =>
  xml('list', { xmlns: OMEMO }, ...ids.map((id) => xml('device', { id: String(id) })))

// ponytail: 32 devices at most, so a list can't make us fetch bundles forever.
const readDeviceList = (item: Element | undefined): number[] => {
  const ids = (item?.getChild('list', OMEMO)?.getChildren('device') ?? []).map((d) =>
    deviceId(d.attrs.id)
  )
  return [...new Set(ids.filter((id) => id !== null))].slice(0, 32)
}

// Device lists and bundles are readable by anyone (not only contacts), so someone who
// just added us can write to us encrypted.
function publishOpen(node: string, payload: Element): Promise<Element> {
  const field = (name: string, value: string, type?: string): Element =>
    xml('field', type ? { var: name, type } : { var: name }, xml('value', {}, value))
  return xmpp!.iqCaller.request(
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
            field('FORM_TYPE', `${PUBSUB}#publish-options`, 'hidden'),
            field('pubsub#access_model', 'open')
          )
        )
      )
    )
  )
}

async function publishBundle(): Promise<void> {
  const store = omemo
  if (!xmpp || !store) return
  if (store.needsRefill()) await store.refill()
  await publishOpen(`${BUNDLES}${store.deviceId}`, bundleElement(await store.bundle()))
}

// After one-time keys get used, the bundle goes out again without them: once, after
// a batch (e.g. the messages kept while we were offline), not once per message.
function publishBundleSoon(): void {
  clearTimeout(bundleTimer)
  bundleTimer = setTimeout(() => publishBundle().catch((e) => unexpected('omemo bundle', e)), 2000)
}

async function devicesChanged(bare: string, ids: number[]): Promise<void> {
  const store = omemo
  devices.set(bare, ids)
  if (!store) return
  // Before any session or message to them, so a new device of a contact gets noticed.
  // Our own list always counts this device: with it known, any other one is news, even
  // the first extra device of a one-computer account (someone else signing in).
  trust(store.seen(bare, bare === me ? [...new Set([store.deviceId, ...ids])] : ids))
  // Another client may have dropped this device from our list: contacts couldn't reach it.
  // First, so the 32-device cut (readDeviceList) never drops it and we republish forever.
  if (bare === me && !ids.includes(store.deviceId)) {
    const all = [store.deviceId, ...ids]
    await publishOpen(DEVICELIST, deviceListElement(all))
    devices.set(me, all)
  }
}

async function loadDevices(bare: string): Promise<number[]> {
  let ids: number[] = []
  try {
    ids = readDeviceList(
      (await pubsubItems(bare, DEVICELIST)).getChild('pubsub')?.getChild('items')?.getChild('item')
    )
  } catch (e) {
    if (condition(e) !== 'item-not-found') throw e // never used OMEMO: no devices
  }
  await devicesChanged(bare, ids)
  return devices.get(bare) ?? ids
}

async function fetchBundle(d: Device): Promise<Bundle> {
  const res = await pubsubItems(d.jid, `${BUNDLES}${d.deviceId}`)
  const bundle = res
    .getChild('pubsub')
    ?.getChild('items')
    ?.getChild('item')
    ?.getChild('bundle', OMEMO)
  if (!bundle) throw new Error('bad-bundle')
  return readBundle(bundle, d.deviceId)
}

// The devices of `bare` (but this one) we can encrypt for, starting sessions where
// there are none. One that fails (no bundle, blocked) is left out.
async function reachable(bare: string): Promise<Device[]> {
  const store = omemo!
  const ids = devices.get(bare) ?? (await loadDevices(bare))
  const ready: Device[] = []
  for (const id of ids.filter((id) => id !== store.deviceId)) {
    const device = { jid: bare, deviceId: id }
    const name = `${bare}/${id}`
    try {
      if (stale.has(name) || !(await store.hasSession(device))) {
        await store.startSession(device, await fetchBundle(device))
        stale.delete(name)
      }
      ready.push(device)
    } catch (e) {
      console.warn('omemo session:', e instanceof OmemoError ? e.code : (condition(e) ?? 'failed'))
    }
  }
  trust(store.takeChanges())
  return ready
}

// The text of an OMEMO message from `from`'s device. null: our own copy, sent from
// another device of ours before this one existed (nothing to show).
async function decryptBody(
  el: Element,
  from: string,
  mine: boolean
): Promise<{ body: string; undecryptable: boolean } | null> {
  const store = omemo
  const message = readEncrypted(el)
  const key = message?.keys.find((k) => k.rid === store?.deviceId)
  if (!store || !message || !key)
    return mine && store && message ? null : { body: '', undecryptable: true }
  // Before decrypting, which trusts an unknown device on first use: a new device of a
  // contact that writes before its list reaches us still gets noticed.
  trust(store.seen(from, [message.sid]))
  try {
    const body = await store.decrypt(from, message)
    if (key.prekey) publishBundleSoon()
    return { body, undecryptable: false }
  } catch (e) {
    // Only the code: never the message or keys in the log.
    console.warn('omemo decrypt:', e instanceof OmemoError ? e.code : 'failed')
    // Their session and ours no longer match (e.g. they lost it): our next message starts
    // a new one.
    if (e instanceof OmemoError && e.code === 'bad-message') stale.add(`${from}/${message.sid}`)
    return { body: '', undecryptable: true }
  } finally {
    trust(store.takeChanges())
  }
}

// On signing in: our store, our bundle, and this device in our list.
async function startOmemo(): Promise<void> {
  if (!omemoOpener) return
  try {
    if (!omemo) {
      // Signed out (or in again) while opening: that store isn't this session's.
      const entity = xmpp
      const opened = await omemoOpener(me)
      if (xmpp !== entity || omemo) {
        opened.close()
        return
      }
      omemo = opened
    }
    await publishBundle()
    await loadDevices(me)
  } catch (e) {
    unexpected('omemo start', e)
  }
}

// --- account service (email, invites, contacts by email) -------------------------------

const condition = (e: unknown): string | undefined => (e as { condition?: string }).condition

// A failure the UI can only call 'unknown': logged first, so palique.log (see index.ts)
// keeps the real cause.
function unexpected(what: string, e: unknown): 'unknown' {
  console.error(`${what} failed:`, e)
  return 'unknown'
}

function accountsIq(type: 'get' | 'set', child: Element): Promise<Element> {
  return xmpp!.iqCaller.request(xml('iq', { type, to: ACCOUNTS_JID }, child))
}

// Who our mutual contacts are is the server's call: it only gives us their emails.
async function loadEmails(): Promise<void> {
  try {
    const res = await accountsIq('get', xml('contacts', { xmlns: ACCOUNTS }))
    emails = new Map()
    for (const c of res.getChild('contacts', ACCOUNTS)?.getChildren('contact') ?? []) {
      if (typeof c.attrs.jid === 'string' && typeof c.attrs.email === 'string') {
        emails.set(c.attrs.jid, c.attrs.email.slice(0, 254))
      }
    }
  } catch (e) {
    unexpected('contact emails', e)
  }
}

export type InviteStatus = { max: number; used: number }

function parseInvites(el: Element | undefined): InviteStatus {
  return { max: Number(el?.attrs.max ?? 0), used: Number(el?.attrs.used ?? 0) }
}

export async function inviteStatus(): Promise<InviteStatus> {
  const res = await accountsIq('get', xml('invites', { xmlns: ACCOUNTS }))
  return parseInvites(res.getChild('invites', ACCOUNTS))
}

// Emails an invite (with our display name, for the email). Rejects with 'limit' (none
// left), 'registered' (that address already has an account) or 'invalid'.
export async function inviteByEmail(address: string): Promise<InviteStatus> {
  try {
    const res = await accountsIq(
      'set',
      xml('invite-email', { xmlns: ACCOUNTS, address, name: nicks.get(me) ?? '', lang })
    )
    return parseInvites(res.getChild('invites', ACCOUNTS))
  } catch (e) {
    const errors: Record<string, string> = {
      'resource-constraint': 'limit',
      conflict: 'registered',
      'bad-request': 'invalid'
    }
    throw new Error(errors[condition(e) ?? ''] ?? unexpected('invite', e))
  }
}

// The JID of whoever has this email, '' if nobody. Rejects with 'invalid', 'wait' or
// 'offline' (not connected right now).
export async function lookupContact(address: string): Promise<string> {
  if (!xmpp) throw new Error('offline')
  try {
    const res = await accountsIq('get', xml('lookup', { xmlns: ACCOUNTS, address }))
    return res.getChild('lookup', ACCOUNTS)?.attrs.jid ?? ''
  } catch (e) {
    const c = condition(e)
    throw new Error(
      c === 'bad-request'
        ? 'invalid'
        : c === 'resource-constraint'
          ? 'wait'
          : unexpected('lookup', e)
    )
  }
}

// `pending`: a new address waiting to be confirmed from its inbox ('' if none).
// `language`: the one chosen in Options, kept with the account ('' = the computer's).
export type EmailStatus = {
  address: string
  pending: string
  newsletter: boolean
  language: string
}

function parseEmail(el: Element): EmailStatus {
  return {
    address: el.attrs.address ?? '',
    pending: el.attrs.pending ?? '',
    newsletter: el.attrs.newsletter === 'true',
    language: el.attrs.language ?? ''
  }
}

export async function emailStatus(): Promise<EmailStatus> {
  const res = await accountsIq('get', xml('email', { xmlns: ACCOUNTS }))
  return parseEmail(res.getChild('email', ACCOUNTS)!)
}

// Asks to change the address: a link goes to the new one. Rejects with 'invalid'.
export async function changeEmail(address: string): Promise<EmailStatus> {
  try {
    const res = await accountsIq('set', xml('email', { xmlns: ACCOUNTS, address, lang }))
    return parseEmail(res.getChild('email', ACCOUNTS)!)
  } catch (e) {
    throw new Error(condition(e) === 'bad-request' ? 'invalid' : unexpected('email change', e))
  }
}

// Another link for the pending address; rejects with 'wait' within a minute of the last.
export async function resendVerification(): Promise<void> {
  try {
    await accountsIq('set', xml('resend', { xmlns: ACCOUNTS, lang }))
  } catch (e) {
    throw new Error(condition(e) === 'resource-constraint' ? 'wait' : unexpected('resend', e))
  }
}

export async function setNewsletter(subscribe: boolean): Promise<EmailStatus> {
  const res = await accountsIq(
    'set',
    xml('newsletter', { xmlns: ACCOUNTS, subscribe: String(subscribe) })
  )
  return parseEmail(res.getChild('email', ACCOUNTS)!)
}

export async function setAccountLanguage(code: string): Promise<EmailStatus> {
  const res = await accountsIq('set', xml('language', { xmlns: ACCOUNTS, code }))
  return parseEmail(res.getChild('email', ACCOUNTS)!)
}

// --- signed out: over HTTP to the account service --------------------------------------

const ACCOUNTS_URL =
  config('PALIQUE_ACCOUNTS_URL', 'MAIN_VITE_ACCOUNTS_URL') ?? 'http://localhost:8080'

// Sent with every request to the account service, which turns away apps that are too old.
let appVersion = ''
export function setAppVersion(version: string): void {
  appVersion = version
}

// Errors: 'unreachable', 'wait' (too many requests), or the service's own (e.g. 'outdated').
async function accountsPost<T>(path: string, body: Record<string, string>): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${ACCOUNTS_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-palique-version': appVersion },
      body: JSON.stringify(body)
    })
  } catch {
    throw new Error('unreachable')
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (res.status === 429) throw new Error('wait')
  if (!res.ok) throw new Error(data.error ?? 'unreachable')
  return data
}

// The JID localpart to sign in with. Addresses without an account get one too (that
// just fails to sign in), so this never tells whether an address is registered.
export async function accountFor(email: string): Promise<string> {
  return (await accountsPost<{ username: string }>('/account', { email })).username
}

// "Forgot your password?" is a page of the account service, in the app's language.
export const recoverUrl = (): string => `${ACCOUNTS_URL}/recover?l=${lang}`
