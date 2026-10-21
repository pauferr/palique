// Palique account service: an XMPP component (so the server vouches for who's asking)
// plus a small website for the links in its emails and the signed-out app.
// People sign in with their email; behind it, each account has a random JID that never
// changes (so contacts and chats don't care if the email does). Only this service knows
// which email goes with which JID.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import { mkdirSync } from 'node:fs'
import { component, xml } from '@xmpp/component'
import { brevo } from './brevo.ts'
import { openDb, type Account } from './db.ts'
import { BUTTERFLY, escape, mailer } from './mail.ts'

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback
  if (value === undefined) throw new Error(`missing ${name}`)
  return value
}

const NS = 'urn:palique:accounts:0'
const USER_DOMAIN = env('USER_DOMAIN', 'localhost') // accounts we serve: user@USER_DOMAIN
const PUBLIC_URL = env('PUBLIC_URL', 'http://localhost:8080')
const SECRET = env('XMPP_SECRET')
const MAX_INVITES = 3 // per user (the admin's have no limit)

mkdirSync(env('DATA_DIR', '/data'), { recursive: true })
const db = openDb(`${env('DATA_DIR', '/data')}/accounts.sqlite`)
const send = mailer({
  host: env('SMTP_HOST'),
  port: Number(env('SMTP_PORT', '587')),
  from: env('MAIL_FROM', 'Palique <no-responder@palique.localhost>'),
  replyTo: process.env['MAIL_REPLY_TO'] || undefined,
  user: process.env['SMTP_USER'],
  pass: process.env['SMTP_PASS']
})

// Newsletter list (Brevo). Prepared but optional: without these it just doesn't sync.
const newsletter = brevo({
  apiKey: process.env['BREVO_API_KEY'],
  listId: Number(process.env['BREVO_LIST_ID']) || undefined,
  baseUrl: process.env['BREVO_API_URL']
})
if (!newsletter) console.log('brevo not configured: newsletter choices are stored, not synced')

// Failures are logged; sync-brevo.ts can catch up.
function syncNewsletter(email: string, subscribed: boolean): void {
  if (!newsletter) return
  const action = subscribed ? newsletter.subscribe(email) : newsletter.unsubscribe(email)
  action.catch((e) => console.error('brevo', e.message))
}

const xmpp = component({
  service: env('XMPP_SERVICE'),
  domain: env('XMPP_DOMAIN'),
  password: SECRET
})
xmpp.on('error', (e) => console.error('xmpp', e.message))
xmpp.on('online', (address) => console.log('online as', address.toString()))

function stanzaError(condition: string, text?: string): ReturnType<typeof xml> {
  const error = xml(
    'error',
    { type: 'modify' },
    xml(condition, { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' })
  )
  if (text) error.c('text', { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' }).t(text)
  return error
}

// Only local users, as bare JIDs. The server sets `from`, so it can be trusted.
function user(from: { local: string; domain: string } | null): string | undefined {
  return from && from.local && from.domain === USER_DOMAIN
    ? `${from.local}@${from.domain}`
    : undefined
}

const validEmail = (value: string): boolean =>
  value.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value)
const cleanEmail = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()

// JIDs look like "k3f9x2ab7q": 10 characters out of 32, from random bytes (or, for
// addresses without an account, from the address itself, see /cuenta).
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const toLocalpart = (bytes: Buffer): string =>
  [...bytes.subarray(0, 10)].map((b) => ALPHABET[b % 32]).join('')
const newLocalpart = (): string => toLocalpart(randomBytes(10))
const fakeLocalpart = (email: string): string =>
  toLocalpart(createHmac('sha256', SECRET).update(email).digest())

// --- talking to Prosody (server/modules/mod_palique_invites.lua) ------------------------

const INVITES = 'urn:palique:invite:0'

function prosodyIq(child: ReturnType<typeof xml>): Promise<ReturnType<typeof xml>> {
  return xmpp.iqCaller.request(xml('iq', { type: 'set', to: USER_DOMAIN }, child))
}

// Someone just created their account with an invite: from now on it's theirs (if we miss
// this, their first request here does the same, see db.account).
xmpp.on('stanza', (stanza) => {
  const registered = stanza.is('message') && stanza.getChild('registered', INVITES)
  if (registered && stanza.attrs.from === USER_DOMAIN) {
    db.account(`${registered.attrs.username}@${USER_DOMAIN}`)
  }
})

// --- signed-in users (over XMPP) --------------------------------------------------------

const status = (account: Account | undefined): ReturnType<typeof xml> =>
  xml('email', {
    xmlns: NS,
    address: account?.email ?? '',
    pending: account?.pending ?? '',
    newsletter: String(account?.newsletter ?? false)
  })

function sendVerification(email: string, token: string): Promise<unknown> {
  return send({
    to: email,
    subject: 'Confirma tu nuevo correo de Palique',
    paragraphs: [
      '¡Correo nuevo! Has pedido entrar en Palique con esta dirección.',
      'Pulsa el botón para confirmarla. Hasta que lo hagas, seguirás entrando con la de antes.'
    ],
    link: { href: `${PUBLIC_URL}/verify?t=${token}`, label: 'Confirmar mi correo' },
    footer: 'Si no has sido tú, ignora este correo y aquí no ha pasado nada.'
  })
}

xmpp.iqCallee.get(NS, 'email', (ctx) => {
  const jid = user(ctx.from)
  return jid ? status(db.account(jid)) : stanzaError('forbidden')
})

// <email address='…'/>: change the address. It needs confirming from the new inbox. The
// answer is the same if the address belongs to someone else (nothing is sent then), so
// nobody learns who has an account this way. The email goes out in the background, so
// both answers take the same time too.
xmpp.iqCallee.set(NS, 'email', async (ctx) => {
  const jid = user(ctx.from)
  const account = jid && db.account(jid)
  if (!jid || !account) return stanzaError('forbidden')
  const address = cleanEmail(ctx.stanza.getChild('email', NS)!.attrs.address)
  if (!validEmail(address)) return stanzaError('bad-request', 'invalid email')
  if (address === account.email || address === account.pending) return status(account)
  const token = db.changeEmail(jid, address)
  if (token) sendVerification(address, token).catch((e) => console.error('verify', e.message))
  return status(db.account(jid))
})

// <resend/>: another link for the pending address (at most once a minute).
xmpp.iqCallee.set(NS, 'resend', async (ctx) => {
  const jid = user(ctx.from)
  const account = jid && db.account(jid)
  if (!jid || !account) return stanzaError('forbidden')
  const token = db.resendToken(jid)
  if (!token) return stanzaError('resource-constraint')
  await sendVerification(account.pending, token)
  return true
})

// <newsletter subscribe='true|false'/>: the user's choice, any time.
xmpp.iqCallee.set(NS, 'newsletter', (ctx) => {
  const jid = user(ctx.from)
  if (!jid || !db.account(jid)) return stanzaError('forbidden')
  const wanted = ctx.stanza.getChild('newsletter', NS)!.attrs.subscribe === 'true'
  const account = db.setNewsletter(jid, wanted)!
  syncNewsletter(account.email, account.newsletter)
  return status(account)
})

// <lookup address='…'/>: who has this address (adding a contact). Knowing someone's email
// tells you whether they're on Palique, like other messengers; limited per user.
const LOOKUP_WINDOW = 60 * 60_000
const LOOKUP_MAX = 30
const lookups = new Map<string, { since: number; count: number }>()

function allowLookup(jid: string): boolean {
  const now = Date.now()
  const seen = lookups.get(jid)
  const window = seen && now - seen.since < LOOKUP_WINDOW ? seen : { since: now, count: 0 }
  window.count++
  lookups.set(jid, window)
  return window.count <= LOOKUP_MAX
}

xmpp.iqCallee.get(NS, 'lookup', (ctx) => {
  const jid = user(ctx.from)
  if (!jid || !db.account(jid)) return stanzaError('forbidden')
  const address = cleanEmail(ctx.stanza.getChild('lookup', NS)!.attrs.address)
  if (!validEmail(address)) return stanzaError('bad-request', 'invalid email')
  if (!allowLookup(jid)) return stanzaError('resource-constraint')
  return xml('lookup', { xmlns: NS, jid: db.accountByEmail(address)?.jid ?? '' })
})

// --- invites (by email only) ------------------------------------------------------------

const inviteStatus = (jid: string): ReturnType<typeof xml> =>
  xml('invites', { xmlns: NS, max: String(MAX_INVITES), used: String(db.invitesUsed(jid)) })

xmpp.iqCallee.get(NS, 'invites', (ctx) => {
  const jid = user(ctx.from)
  return jid && db.account(jid) ? inviteStatus(jid) : stanzaError('forbidden')
})

// Picks the new account's JID, asks Prosody for an invite that can only create it, and
// emails it. `inviter`: bare JID, null for the admin's.
async function invite(email: string, inviter: string | null, inviterName: string): Promise<void> {
  const local = newLocalpart()
  const res = await prosodyIq(
    xml('account', {
      xmlns: INVITES,
      username: local,
      ...(inviter ? { inviter: inviter.split('@')[0] } : {})
    })
  )
  const token = res.getChild('account', INVITES)!.attrs.token as string
  const optout = db.addInvite({ token, email, jid: `${local}@${USER_DOMAIN}`, inviter })
  const who = inviterName || 'Alguien'
  await send({
    to: email,
    subject: inviter
      ? `${who} quiere agregarte en Palique`
      : '¡Tienes una invitación para Palique!',
    sender: inviter ? who : undefined,
    paragraphs: [
      inviter
        ? '¡Ey! Quiero tenerte en mi lista de contactos de Palique 🙂'
        : '¡Ey! Te hemos guardado un sitio 🙂❤️',
      '¿Te acuerdas de llegar a casa, encender el ordenador y mirar quién estaba conectado? Palique va de eso: tu lista de contactos, zumbidos, guiños y el sonidito cuando alguien se conecta.',
      'Abre Palique, pulsa «¿Tienes una invitación? Crea tu cuenta» y pega este código:'
    ],
    code: token,
    link: {
      href: `palique://signup?t=${encodeURIComponent(token)}`,
      label: 'Abrir Palique y crear mi cuenta'
    },
    note: `Entrarás con esta dirección (${email}). La invitación caduca en una semana, así que no lo dejes para luego.${inviter ? ` Cuando entres, ${who} ya estará en tu lista.` : ''}`,
    footer: '¿Prefieres que no te invitemos más?',
    footerLink: {
      href: `${PUBLIC_URL}/no-invites?t=${optout}`,
      label: 'No quiero más invitaciones'
    }
  })
}

// Messenger Plus! codes a display name may carry ([b], [c=#hex]…): plain text in emails.
// Same pattern as `tag` in src/renderer/src/plus.ts.
const PLUS_CODES = /\[\/?(?:b|i|u|s|c|a)(?:=(?:#[0-9a-f]{6}|#[0-9a-f]{3}))?\]/gi

// <invite-email address='…' name='…'/>: the user explicitly invites someone. `name` is
// the inviter's display name, for the email. Errors: 'resource-constraint' (no invites
// left), 'conflict' (that address already has an account: add them instead).
// Addresses invited in the last week, or that opted out, silently get nothing and cost
// nothing.
xmpp.iqCallee.set(NS, 'invite-email', async (ctx) => {
  const jid = user(ctx.from)
  if (!jid || !db.account(jid)) return stanzaError('forbidden')
  const request = ctx.stanza.getChild('invite-email', NS)!
  const address = cleanEmail(request.attrs.address)
  if (!validEmail(address)) return stanzaError('bad-request', 'invalid email')
  if (db.invitesUsed(jid) >= MAX_INVITES) return stanzaError('resource-constraint')
  if (db.accountByEmail(address)) return stanzaError('conflict')
  if (db.mayInvite(address) && !db.taken(address)) {
    await invite(
      address,
      jid,
      String(request.attrs.name ?? '')
        .replace(PLUS_CODES, '')
        .trim()
        .slice(0, 64)
    )
  }
  return inviteStatus(jid)
})

// --- signed out (over HTTP) -------------------------------------------------------------

// Behind a reverse proxy (production: Caddy) every request comes from the proxy, which
// passes the real client in X-Forwarded-For. Take the last entry: the one the proxy added
// (earlier ones could be made up by the client).
const TRUST_PROXY = process.env['TRUST_PROXY'] === 'true'
function clientIp(req: IncomingMessage): string {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
  const last = forwarded.split(',').at(-1)?.trim()
  return (TRUST_PROXY && last) || req.socket.remoteAddress || ''
}

// At most `max` requests per IP every `windowMs` (in memory).
function ipLimit(max: number, windowMs: number): (ip: string) => boolean {
  const seen = new Map<string, { since: number; count: number }>()
  return (ip) => {
    const now = Date.now()
    const entry = seen.get(ip)
    const window = entry && now - entry.since < windowMs ? entry : { since: now, count: 0 }
    window.count++
    seen.set(ip, window)
    return window.count <= max
  }
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 2048) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve({})
      }
    })
  })
}

// Password recovery. The answer is always the same (it doesn't reveal whether the
// address has an account); requests are limited per address and per IP.
const RESET_GAP = 5 * 60_000 // per address
const lastReset = new Map<string, number>()
const resetIps = ipLimit(10, 15 * 60_000)

function allowReset(email: string, ip: string): boolean {
  if (!resetIps(ip)) return false
  const now = Date.now()
  if (now - (lastReset.get(email) ?? 0) < RESET_GAP) return false
  lastReset.set(email, now)
  return true
}

async function sendReset(email: string): Promise<void> {
  const account = db.accountByEmail(email)
  if (!account) return
  const username = account.jid.split('@')[0]
  const res = await prosodyIq(xml('reset', { xmlns: INVITES, for: username }))
  const token = res.getChild('reset', INVITES)!.attrs.token
  await send({
    to: email,
    subject: '¿Se te ha olvidado la contraseña de Palique?',
    paragraphs: [
      'Tranqui, nos ha pasado a todos 😉',
      'Abre Palique, pulsa «¿Olvidaste tu contraseña?», luego «Ya tengo un código» y pega este:'
    ],
    code: token,
    link: {
      href: `palique://reset?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`,
      label: 'Abrir Palique y elegir contraseña'
    },
    note: 'El código caduca en una hora y solo vale una vez.',
    footer: 'Si no lo has pedido tú, pasa de este correo: tu contraseña sigue igual.'
  })
}

// Signing in: the app asks which JID goes with the email. Unknown addresses get a made-up
// one that's always the same, so the sign-in just fails like a wrong password.
// Per IP a minute; development raises it so the checks can run back to back.
const signInIps = ipLimit(Number(env('SIGNIN_LIMIT', '30')), 60_000)

// Brevo's webhook (configure it with ?token=BREVO_WEBHOOK_TOKEN): someone left the list
// from a newsletter's own link, or the address bounced or complained. Mirror it here.
const WEBHOOK_TOKEN = process.env['BREVO_WEBHOOK_TOKEN'] ?? ''
const LEAVE_EVENTS = new Set(['unsubscribed', 'spam', 'hard_bounce', 'hardBounce', 'blocked'])

function sameSecret(given: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(WEBHOOK_TOKEN)
  return WEBHOOK_TOKEN !== '' && a.length === b.length && timingSafeEqual(a, b)
}

const pushStatus = (account: Account): void => {
  xmpp.send(xml('message', { to: account.jid }, status(account))).catch(() => {})
}

// Same look as the emails: a conversation window with the butterfly colors on top.
function page(title: string, message: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(title)} · Palique</title>
<style>
:root{--bg:#f7f7f6;--card:#fff;--line:#e7e7e5;--fg:#18181b;--muted:#71717a;--acc:#2563eb;--tint:#eef3ff;--tint-line:#c9d8fd}
@media (prefers-color-scheme:dark){:root{--bg:#0c0c0d;--card:#18181b;--line:#2a2a2e;--fg:#f4f4f5;--muted:#a1a1aa;--acc:#6b9bff;--tint:#1b2540;--tint-line:#2f3b5c}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
main{width:min(420px,100% - 32px);background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.stripe{height:5px;background:linear-gradient(90deg,${BUTTERFLY.map((c, i) => `${c} ${i * 25}% ${(i + 1) * 25}%`).join(',')})}
.bar{padding:10px 20px;background:var(--tint);border-bottom:1px solid var(--tint-line);font-size:13px;font-weight:700;color:var(--acc)}.bar span{color:#22c55e}
.body{padding:20px 28px 26px}h1{font-size:20px;margin:0 0 6px}p{margin:0;color:var(--muted)}
</style></head>
<body><main><div class="stripe"></div><div class="bar"><span>&#9679;</span>&nbsp;palique</div><div class="body"><h1>${escape(title)}</h1><p>${escape(message)}</p></div></main></body></html>`
}

const isLoopback = (req: IncomingMessage): boolean =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', PUBLIC_URL)
  const json = (code: number, body: unknown): void => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  if (req.method === 'POST' && url.pathname === '/account') {
    if (!signInIps(clientIp(req))) return json(429, { error: 'wait' })
    const email = cleanEmail((await readJson(req)).email)
    if (!validEmail(email)) return json(400, { error: 'invalid' })
    const jid = db.signInJid(email)
    return json(200, { username: jid ? jid.split('@')[0] : fakeLocalpart(email) })
  }
  // The sign-up screen, with the invite's token: which account it creates.
  if (req.method === 'POST' && url.pathname === '/signup') {
    if (!signInIps(clientIp(req))) return json(429, { error: 'wait' })
    const invite = db.invite(String((await readJson(req)).token ?? ''))
    if (!invite) return json(404, { error: 'invalid-invite' })
    return json(200, { email: invite.email, username: invite.jid.split('@')[0] })
  }
  if (req.method === 'POST' && url.pathname === '/recover') {
    const email = cleanEmail((await readJson(req)).email)
    if (validEmail(email) && allowReset(email, clientIp(req))) {
      sendReset(email).catch((e) => console.error('reset', e.message))
    }
    return json(202, { ok: true })
  }
  // The admin's invites (src/invite.ts), only from inside the container.
  if (req.method === 'POST' && url.pathname === '/admin/invite' && isLoopback(req)) {
    const email = cleanEmail((await readJson(req)).email)
    if (!validEmail(email)) return json(400, { error: 'invalid' })
    if (db.taken(email)) return json(409, { error: 'taken' })
    try {
      await invite(email, null, '')
      return json(200, { ok: true })
    } catch (e) {
      return json(500, { error: (e as Error).message })
    }
  }
  if (req.method === 'POST' && url.pathname === '/brevo') {
    if (!sameSecret(url.searchParams.get('token') ?? '')) {
      res.writeHead(403)
      return res.end()
    }
    const event = await readJson(req)
    const email = cleanEmail(event.email)
    if (LEAVE_EVENTS.has(String(event.event)) && email) {
      for (const account of db.unsubscribeEmail(email)) pushStatus(account)
    }
    res.writeHead(200)
    return res.end()
  }

  const reply = (code: number, title: string, message: string): void => {
    res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page(title, message))
  }
  if (req.method === 'GET' && url.pathname === '/verify') {
    const result = db.verify(url.searchParams.get('t') ?? '')
    if (!result) return reply(404, 'Enlace no válido', 'Este enlace ya se ha usado o no existe.')
    const { account, previous } = result
    if (account.newsletter) {
      syncNewsletter(previous, false)
      syncNewsletter(account.email, true)
    }
    // Let the app know right away (it also asks on every sign-in).
    pushStatus(account)
    return reply(
      200,
      'Correo cambiado',
      `¡Hecho! A partir de ahora entrarás en Palique con ${account.email}.`
    )
  }
  if (req.method === 'GET' && url.pathname === '/no-invites') {
    if (!db.optOut(url.searchParams.get('t') ?? '')) {
      return reply(404, 'Enlace no válido', 'Este enlace no existe.')
    }
    return reply(200, 'Listo', 'Vale, no te invitaremos más a Palique en esta dirección.')
  }
  reply(404, 'Página no encontrada', 'Por aquí no hay nada.')
}).listen(Number(env('HTTP_PORT', '8080')), () => console.log('http ready'))

// Prosody may not be up yet (or restarting): keep trying instead of crashing. Later
// disconnects are handled by the library's own reconnect.
for (;;) {
  try {
    await xmpp.start()
    break
  } catch (e) {
    console.error('waiting for prosody:', (e as Error).message)
    await new Promise((r) => setTimeout(r, 2000))
  }
}
