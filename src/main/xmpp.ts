// The only module that knows about the XMPP library. One connection for the whole app.
import { createHash, randomUUID } from 'node:crypto'
import { client, jid, xml, type Client } from '@xmpp/client'
import type { Element } from '@xmpp/xml'

export const DOMAIN = process.env['PALIQUE_XMPP_DOMAIN'] ?? 'localhost'
const SERVICE = process.env['PALIQUE_XMPP_SERVICE'] ?? `xmpp://${DOMAIN}:5222`
const ROSTER = 'jabber:iq:roster'
const ATTENTION = 'urn:xmpp:attention:0' // buzz (XEP-0224)
const CARBONS = 'urn:xmpp:carbons:2' // copies from our other devices (XEP-0280)
const CHATSTATES = 'http://jabber.org/protocol/chatstates' // "is typing" (XEP-0085)
const WINK = 'urn:palique:wink:0' // Palique-only: full-screen animation from the bundled catalog

const INVISIBLE = 'urn:xmpp:invisible:0' // XEP-0186, server/modules/mod_palique_invisible.lua
const INVITES = 'urn:palique:invite:0' // server/modules/mod_palique_invites.lua
const ACCOUNTS = 'urn:palique:cuentas:0' // account service, server/cuentas
export const ACCOUNTS_JID = process.env['PALIQUE_ACCOUNTS_JID'] ?? `cuentas.${DOMAIN}`
const PUBSUB = 'http://jabber.org/protocol/pubsub'
const AVATAR_DATA = 'urn:xmpp:avatar:data' // avatars (XEP-0084), stored in each user's PEP
const AVATAR_METADATA = 'urn:xmpp:avatar:metadata'
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const AVATAR_MAX_BYTES = 100_000

// Wink ids come from the network and end up in a URL: keep them boring.
export const isWinkId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id)

export type AuthError =
  | 'conflict' // username taken
  | 'not-acceptable' // username or password rejected by the server
  | 'not-authorized' // wrong username or password
  | 'invalid-invite' // missing, wrong, used or expired invite code
  | 'unreachable'
  | 'unknown'

export type AuthResult = { ok: true; jid: string } | { ok: false; error: AuthError }

export type Show = 'online' | 'away' | 'dnd'
export type OwnShow = Show | 'invisible' // contacts never look invisible: they look offline

export type Contact = {
  jid: string
  show: Show | 'offline'
  status: string // personal message
  subscription: 'none' | 'to' | 'from' | 'both'
  pending: boolean // we asked to see their presence, waiting for approval
  avatar: string // data: URL, '' for the default avatar
}

export type Snapshot = {
  connected: boolean
  contacts: Contact[]
  requests: string[] // people asking to add us
  avatar: string // our own avatar, data: URL or ''
  show: OwnShow // our own status
}

export type ChatMessage = {
  id: string
  with: string // the contact's bare JID
  mine: boolean
  body: string
  buzz: boolean
  wink: string // catalog id, '' when not a wink
  at: number // ms timestamp
  delayed?: boolean // stored by the server while we were offline (not saved in history)
}

type Presence = { show: Show; status: string }
type RosterEntry = Omit<Contact, 'show' | 'status' | 'avatar'> & {
  resources: Map<string, Presence>
}
type Avatar = { hash: string; url: string }

let xmpp: Client | null = null
let me = ''
let roster = new Map<string, RosterEntry>()
let requests = new Set<string>()
let own: { show: OwnShow; status: string } = { show: 'online', status: '' }
let avatars = new Map<string, Avatar>() // by bare JID, ours included
let listener: (snapshot: Snapshot) => void = () => {}
let messageListener: (message: ChatMessage) => void = () => {}
let typingListener: (contact: string, typing: boolean) => void = () => {}
let emailListener: (email: EmailStatus) => void = () => {}

// Best presence across the contact's connected devices.
const RANK: Record<Show, number> = { online: 0, dnd: 1, away: 2 }

export function snapshot(): Snapshot {
  const contacts = [...roster.values()].map(({ resources, ...entry }): Contact => {
    const best = [...resources.values()].sort((a, b) => RANK[a.show] - RANK[b.show])[0]
    return {
      ...entry,
      show: best?.show ?? 'offline',
      status: best?.status ?? '',
      avatar: avatars.get(entry.jid)?.url ?? ''
    }
  })
  return {
    connected: xmpp?.status === 'online',
    contacts,
    requests: [...requests],
    avatar: avatars.get(me)?.url ?? '',
    show: own.show
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

function presenceStanza(): Element {
  const presence = xml('presence')
  if (own.show === 'away' || own.show === 'dnd') presence.c('show').t(own.show)
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
  // The account service tells us when the email gets verified. Only it, exactly.
  const email = stanza.getChild('email', ACCOUNTS)
  if (email) {
    if (stanza.attrs.from === ACCOUNTS_JID) emailListener(parseEmail(email))
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
  const winkId = message.getChild('wink', WINK)?.attrs.id
  const wink = isWinkId(winkId) ? winkId : ''
  // A wink's body is only the fallback text for other XMPP clients.
  const body = wink ? '' : (message.getChildText('body') ?? '')
  // Our own typing on other devices doesn't matter. Any other chat state, or the
  // message itself, means they stopped typing.
  const state = message.getChildElements().find((el) => el.attrs.xmlns === CHATSTATES)?.name
  const content = Boolean(body || buzz || wink)
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
    ...(stamp ? { delayed: true } : {})
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
// The code can be pasted bare or as the whole invite link (xmpp:…;preauth=CODE;…).
export function inviteToken(input: string): string {
  const value = input.trim()
  return value.match(/preauth=([^;&]+)/)?.[1] ?? value
}

// Registration is invite-only: hand the code to the server first (XEP-0401).
async function registerAccount(
  entity: Client,
  username: string,
  password: string,
  invite: string
): Promise<void> {
  const preauth = await entity.sendReceive(
    xml(
      'iq',
      { type: 'set', id: randomUUID() },
      xml('preauth', { xmlns: 'urn:xmpp:pars:0', token: inviteToken(invite) })
    )
  )
  if (preauth.attrs.type !== 'result') {
    throw Object.assign(new Error('invalid invite'), { condition: 'invalid-invite' })
  }
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
    condition === 'not-authorized' ||
    condition === 'invalid-invite'
  ) {
    return condition
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT') return 'unreachable'
  return 'unknown'
}

// Passing an invite code creates the account first. `show`: status to sign in with, so
// an invisible user is never briefly visible.
export async function login(
  username: string,
  password: string,
  { invite, show = 'online' }: { invite?: string; show?: OwnShow } = {}
): Promise<AuthResult> {
  await logout()
  own = { show, status: '' }
  const entity = client({
    service: SERVICE,
    domain: DOMAIN,
    credentials: async (authenticate, mechanisms, _fast, conn) => {
      if (invite !== undefined) await registerAccount(conn, username, password, invite)
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
      // Invisible must be set before presence goes out. If the server refuses, say so
      // (we'd be visible) rather than pretend.
      .then(() =>
        own.show === 'invisible'
          ? setInvisible(true).catch(() => {
              own = { ...own, show: 'online' }
            })
          : undefined
      )
      .then(() => send(presenceStanza()))
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
  content: Pick<ChatMessage, 'body' | 'buzz' | 'wink'>
): Promise<ChatMessage> {
  const id = randomUUID()
  stanza.attrs.to = to
  stanza.attrs.id = id
  await send(stanza)
  return { id, with: to, mine: true, ...content, at: Date.now() }
}

export function sendMessage(to: string, body: string): Promise<ChatMessage> {
  const stanza = xml(
    'message',
    { type: 'chat' },
    xml('body', {}, body),
    xml('active', { xmlns: CHATSTATES })
  )
  return sendStanza(to, stanza, { body, buzz: false, wink: '' })
}

export function sendBuzz(to: string): Promise<ChatMessage> {
  const stanza = xml('message', { type: 'headline' }, xml('attention', { xmlns: ATTENTION }))
  return sendStanza(to, stanza, { body: '', buzz: true, wink: '' })
}

export function sendWink(to: string, wink: string): Promise<ChatMessage> {
  const stanza = xml(
    'message',
    { type: 'chat' },
    xml('body', {}, `😉 Te he enviado un guiño (${wink}). Para verlo, usa Palique.`),
    xml('wink', { xmlns: WINK, id: wink }),
    xml('active', { xmlns: CHATSTATES })
  )
  return sendStanza(to, stanza, { body: '', buzz: false, wink })
}

export function sendTyping(to: string, typing: boolean): Promise<void> {
  const state = typing ? 'composing' : 'paused'
  return send(xml('message', { to, type: 'chat' }, xml(state, { xmlns: CHATSTATES })))
}

// Used to mute notifications while busy.
export const ownShow = (): OwnShow => own.show

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

export type Invite = { token: string; expires: string }

function parseInvite(el: Element): Invite {
  return { token: el.attrs.token, expires: el.attrs.expires }
}

// "Invite a friend". Rejects with 'limit' when the user already has the maximum active.
export async function createInvite(): Promise<Invite> {
  try {
    const res = await xmpp!.iqCaller.request(
      xml('iq', { type: 'set' }, xml('invite', { xmlns: INVITES }))
    )
    return parseInvite(res.getChild('invite', INVITES)!)
  } catch (e) {
    const condition = (e as { condition?: string }).condition
    throw new Error(condition === 'resource-constraint' ? 'limit' : 'unknown')
  }
}

export async function listInvites(): Promise<{ invites: Invite[]; max: number }> {
  const res = await xmpp!.iqCaller.request(
    xml('iq', { type: 'get' }, xml('invite', { xmlns: INVITES }))
  )
  const list = res.getChild('invites', INVITES)
  return {
    invites: (list?.getChildren('invite') ?? []).map(parseInvite),
    max: Number(list?.attrs.max ?? 0)
  }
}

// --- email (account service) ---------------------------------------------------------

export type EmailStatus = { address: string; verified: boolean; newsletter: boolean }

function parseEmail(el: Element): EmailStatus {
  return {
    address: el.attrs.address ?? '',
    verified: el.attrs.verified === 'true',
    newsletter: el.attrs.newsletter === 'true'
  }
}

function accountsIq(type: 'get' | 'set', child: Element): Promise<Element> {
  return xmpp!.iqCaller.request(xml('iq', { type, to: ACCOUNTS_JID }, child))
}

// Sends a verification link to the address. Rejects with 'invalid' for a bad address.
export async function setEmail(address: string, newsletter: boolean): Promise<EmailStatus> {
  try {
    const res = await accountsIq(
      'set',
      xml('email', { xmlns: ACCOUNTS, address, newsletter: String(newsletter) })
    )
    return parseEmail(res.getChild('email', ACCOUNTS)!)
  } catch (e) {
    const condition = (e as { condition?: string }).condition
    throw new Error(condition === 'bad-request' ? 'invalid' : 'unknown')
  }
}

export async function emailStatus(): Promise<EmailStatus> {
  const res = await accountsIq('get', xml('email', { xmlns: ACCOUNTS }))
  return parseEmail(res.getChild('email', ACCOUNTS)!)
}

// Another verification link; rejects with 'wait' if one was sent less than a minute ago.
export async function resendVerification(): Promise<void> {
  try {
    await accountsIq('set', xml('resend', { xmlns: ACCOUNTS }))
  } catch (e) {
    const condition = (e as { condition?: string }).condition
    throw new Error(condition === 'resource-constraint' ? 'wait' : 'unknown')
  }
}

// Emails an invite. Resolves the same way whether or not the address already has an
// account (the service doesn't say, on purpose). Rejects with 'limit' or 'invalid'.
export async function inviteByEmail(address: string): Promise<void> {
  try {
    await accountsIq('set', xml('invite-email', { xmlns: ACCOUNTS, address }))
  } catch (e) {
    const condition = (e as { condition?: string }).condition
    throw new Error(
      condition === 'resource-constraint'
        ? 'limit'
        : condition === 'bad-request'
          ? 'invalid'
          : 'unknown'
    )
  }
}
