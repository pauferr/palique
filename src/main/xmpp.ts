// The only module that knows about the XMPP library. One connection for the whole app.
import { randomUUID } from 'node:crypto'
import { client, jid, xml, type Client } from '@xmpp/client'
import type { Element } from '@xmpp/xml'

export const DOMAIN = process.env['PALIQUE_XMPP_DOMAIN'] ?? 'localhost'
const SERVICE = process.env['PALIQUE_XMPP_SERVICE'] ?? `xmpp://${DOMAIN}:5222`
const ROSTER = 'jabber:iq:roster'
const ATTENTION = 'urn:xmpp:attention:0' // buzz (XEP-0224)
const CARBONS = 'urn:xmpp:carbons:2' // copies from our other devices (XEP-0280)

export type AuthError =
  | 'conflict' // username taken
  | 'not-acceptable' // username or password rejected by the server
  | 'not-authorized' // wrong username or password
  | 'unreachable'
  | 'unknown'

export type AuthResult = { ok: true; jid: string } | { ok: false; error: AuthError }

export type Show = 'online' | 'away' | 'dnd'

export type Contact = {
  jid: string
  show: Show | 'offline'
  status: string // personal message
  subscription: 'none' | 'to' | 'from' | 'both'
  pending: boolean // we asked to see their presence, waiting for approval
}

export type Snapshot = {
  connected: boolean
  contacts: Contact[]
  requests: string[] // people asking to add us
}

export type ChatMessage = {
  id: string
  with: string // the contact's bare JID
  mine: boolean
  body: string
  buzz: boolean
  at: number // ms timestamp
}

type Presence = { show: Show; status: string }
type RosterEntry = Omit<Contact, 'show' | 'status'> & { resources: Map<string, Presence> }

let xmpp: Client | null = null
let me = ''
let roster = new Map<string, RosterEntry>()
let requests = new Set<string>()
let own: Presence = { show: 'online', status: '' }
let listener: (snapshot: Snapshot) => void = () => {}
let messageListener: (message: ChatMessage) => void = () => {}

// Best presence across the contact's connected devices.
const RANK: Record<Show, number> = { online: 0, dnd: 1, away: 2 }

export function snapshot(): Snapshot {
  const contacts = [...roster.values()].map(({ resources, ...entry }): Contact => {
    const best = [...resources.values()].sort((a, b) => RANK[a.show] - RANK[b.show])[0]
    return { ...entry, show: best?.show ?? 'offline', status: best?.status ?? '' }
  })
  return { connected: xmpp?.status === 'online', contacts, requests: [...requests] }
}

export function onChange(callback: (snapshot: Snapshot) => void): void {
  listener = callback
}

const emit = (): void => listener(snapshot())

export function onMessage(callback: (message: ChatMessage) => void): void {
  messageListener = callback
}

function send(stanza: Element): Promise<void> {
  return xmpp ? xmpp.send(stanza) : Promise.resolve()
}

function presenceStanza(): Element {
  const presence = xml('presence')
  if (own.show !== 'online') presence.c('show').t(own.show)
  if (own.status) presence.c('status').t(own.status)
  return presence
}

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

  switch (stanza.attrs.type) {
    case undefined:
      entry?.resources.set(from.getResource(), {
        show: parseShow(stanza),
        status: stanza.getChildText('status') ?? ''
      })
      break
    case 'unavailable':
      entry?.resources.delete(from.getResource())
      break
    case 'subscribe':
      // Someone we already added is adding us back: accept, like MSN's mutual lists.
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

function handleMessage(stanza: Element): void {
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
  const body = message.getChildText('body') ?? ''
  if (!buzz && !body) return
  // Offline messages carry the time they were sent.
  const stamp = message.getChild('delay', 'urn:xmpp:delay')?.attrs.stamp
  messageListener({
    id: message.attrs.id ?? randomUUID(),
    with: bare,
    mine,
    body,
    buzz,
    at: stamp ? Date.parse(stamp) : Date.now()
  })
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
}

// In-band registration (XEP-0077) on the already-encrypted stream, before SASL.
async function registerAccount(entity: Client, username: string, password: string): Promise<void> {
  const res = await entity.sendReceive(
    xml(
      'iq',
      { type: 'set', id: randomUUID() },
      xml(
        'query',
        { xmlns: 'jabber:iq:register' },
        xml('username', {}, username),
        xml('password', {}, password)
      )
    )
  )
  if (res.attrs.type !== 'result') {
    const condition = res
      .getChild('error')
      ?.getChildElements()
      .find((el) => el.name !== 'text')?.name
    throw Object.assign(new Error('registration failed'), { condition })
  }
}

function toAuthError(e: unknown): AuthError {
  const { condition, code } = (e ?? {}) as { condition?: string; code?: string }
  if (
    condition === 'conflict' ||
    condition === 'not-acceptable' ||
    condition === 'not-authorized'
  ) {
    return condition
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT') return 'unreachable'
  return 'unknown'
}

export async function login(
  username: string,
  password: string,
  register = false
): Promise<AuthResult> {
  await logout()
  const entity = client({
    service: SERVICE,
    domain: DOMAIN,
    credentials: async (authenticate, mechanisms, _fast, conn) => {
      if (register) await registerAccount(conn, username, password)
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
  entity.on('stanza', (stanza) => {
    if (stanza.is('presence')) handlePresence(stanza)
    else if (stanza.is('message')) handleMessage(stanza)
  })
  // Roster pushes: the server tells us about changes to our contact list.
  entity.iqCallee.set(ROSTER, 'query', (ctx) => {
    // Only trust pushes from our own server (no `from`, or our bare JID). ctx.from can't tell:
    // the library fills it with the domain when `from` is missing.
    const from = ctx.stanza.attrs.from
    if (from && jid(from).bare().toString() !== me) return false
    ctx.stanza.getChild('query')?.getChildren('item').forEach(applyRosterItem)
    emit()
    return true
  })
  // Also fires after automatic reconnects: refresh contacts and re-announce ourselves.
  entity.on('online', (address) => {
    me = address.bare().toString()
    // Roster before presence: offline messages arrive after presence and need the contact list.
    loadRoster()
      .then(() =>
        xmpp?.iqCaller.request(xml('iq', { type: 'set' }, xml('enable', { xmlns: CARBONS })))
      )
      .then(() => send(presenceStanza()))
      .catch(() => {})
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
  if (!entity) return
  entity.reconnect.stop()
  await entity.stop().catch(() => {})
  emit()
}

// "fina" → "fina@<domain>"; full addresses are kept for other XMPP servers.
function toBare(address: string): string {
  const value = address.trim().toLowerCase()
  return jid(value.includes('@') ? value : `${value}@${DOMAIN}`)
    .bare()
    .toString()
}

function rosterSet(item: Record<string, string>): Promise<Element> {
  return xmpp!.iqCaller.request(
    xml('iq', { type: 'set' }, xml('query', { xmlns: ROSTER }, xml('item', item)))
  )
}

export async function addContact(address: string): Promise<void> {
  const bare = toBare(address)
  if (!xmpp || bare === me) return
  await rosterSet({ jid: bare })
  await send(xml('presence', { to: bare, type: 'subscribe' }))
}

export async function acceptRequest(bare: string): Promise<void> {
  if (!xmpp) return
  requests.delete(bare)
  await send(xml('presence', { to: bare, type: 'subscribed' }))
  // Mutual: we also want to see them.
  const entry = roster.get(bare)
  if (!entry || entry.subscription === 'none' || entry.subscription === 'from') {
    if (!entry) await rosterSet({ jid: bare })
    await send(xml('presence', { to: bare, type: 'subscribe' }))
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

export async function setPresence(show: Show, status: string): Promise<void> {
  own = { show, status: status.trim().slice(0, 140) }
  await send(presenceStanza())
}

async function sendStanza(to: string, buzz: boolean, body: string): Promise<ChatMessage> {
  const id = randomUUID()
  const stanza = buzz
    ? xml('message', { to, id, type: 'headline' }, xml('attention', { xmlns: ATTENTION }))
    : xml('message', { to, id, type: 'chat' }, xml('body', {}, body))
  await send(stanza)
  return { id, with: to, mine: true, body, buzz, at: Date.now() }
}

export function sendMessage(to: string, body: string): Promise<ChatMessage> {
  return sendStanza(to, false, body)
}

export function sendBuzz(to: string): Promise<ChatMessage> {
  return sendStanza(to, true, '')
}
