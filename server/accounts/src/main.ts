// Palique account service: an XMPP component (so the server vouches for who's asking)
// plus a small website for the links in its emails and the signed-out app.
// People sign in with their email; behind it, each account has a random JID that never
// changes (so contacts and chats don't care if the email does). Only this service knows
// which email goes with which JID.
import { createHmac, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import { mkdirSync } from 'node:fs'
import { component, xml } from '@xmpp/component'
import { openDb, WEEK, type Account } from './db.ts'
import { outdated } from './version.ts'
import { escape, mailer } from './mail.ts'
import { language, requested, translator, type Language } from './i18n.ts'

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback
  if (value === undefined) throw new Error(`missing ${name}`)
  return value
}

const NS = 'urn:palique:accounts:0'
const USER_DOMAIN = env('USER_DOMAIN', 'localhost') // accounts we serve: user@USER_DOMAIN
const PUBLIC_URL = env('PUBLIC_URL', 'http://localhost:8080')
// Where an invite sends people who don't have the app yet: the latest release's
// installers, which talk to palique.io. A server of your own needs builds of its own.
const DOWNLOADS = env('DOWNLOADS_URL', 'https://palique.io/downloads/')
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

function prosodyIq(
  child: ReturnType<typeof xml>,
  type: 'get' | 'set' = 'set'
): Promise<ReturnType<typeof xml>> {
  return xmpp.iqCaller.request(xml('iq', { type, to: USER_DOMAIN }, child))
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
    newsletter: String(account?.newsletter ?? false),
    language: account?.language ?? ''
  })

// Emails go out in `lang`, the language the app asking for them is in; the pages their
// links open too (`l` in the link).
function sendVerification(email: string, token: string, lang: Language): Promise<unknown> {
  const _ = translator(lang)
  return send({
    to: email,
    lang,
    subject: _('Confirma tu nuevo correo de Palique'),
    preheader: _('Un clic y entrarás con esta dirección.'),
    window: _('Mensaje de Palique'),
    bubble: _('¿Estrenas correo? 📬'),
    heading: _('Confirma que esta dirección es tuya'),
    intro: _(
      'Has pedido entrar en Palique con {email}. Hasta que la confirmes, seguirás entrando con la de antes.',
      { email }
    ),
    link: { href: `${PUBLIC_URL}/verify?t=${token}&l=${lang}`, label: _('Confirmar mi correo') },
    note: _('Tus contactos verán la nueva dirección en cuanto la confirmes.'),
    footer: _('¿No has sido tú? Ignora este correo y todo sigue igual.')
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
  const request = ctx.stanza.getChild('email', NS)!
  const address = cleanEmail(request.attrs.address)
  if (!validEmail(address)) return stanzaError('bad-request', 'invalid email')
  if (address === account.email || address === account.pending) return status(account)
  const token = db.changeEmail(jid, address)
  if (token)
    sendVerification(address, token, requested(request.attrs.lang)).catch((e) =>
      console.error('verify', e.message)
    )
  return status(db.account(jid))
})

// <resend/>: another link for the pending address (at most once a minute).
xmpp.iqCallee.set(NS, 'resend', async (ctx) => {
  const jid = user(ctx.from)
  const account = jid && db.account(jid)
  if (!jid || !account) return stanzaError('forbidden')
  const token = db.resendToken(jid)
  if (!token) return stanzaError('resource-constraint')
  await sendVerification(
    account.pending,
    token,
    requested(ctx.stanza.getChild('resend', NS)!.attrs.lang)
  )
  return true
})

// <newsletter subscribe='true|false'/>: the user's choice, any time. Only stored (with its
// date, as proof of consent) until there's a newsletter to send.
xmpp.iqCallee.set(NS, 'newsletter', (ctx) => {
  const jid = user(ctx.from)
  if (!jid || !db.account(jid)) return stanzaError('forbidden')
  const wanted = ctx.stanza.getChild('newsletter', NS)!.attrs.subscribe === 'true'
  return status(db.setNewsletter(jid, wanted)!)
})

// <language code='es|en|'/>: the language the user chose in the app ('' = the computer's),
// so it follows them to other computers (and, later, emails go out in it).
const LANGUAGES = ['', 'es', 'en']
xmpp.iqCallee.set(NS, 'language', (ctx) => {
  const jid = user(ctx.from)
  if (!jid || !db.account(jid)) return stanzaError('forbidden')
  const code = ctx.stanza.getChild('language', NS)!.attrs.code ?? ''
  if (!LANGUAGES.includes(code)) return stanzaError('bad-request', 'unknown language')
  return status(db.setLanguage(jid, code)!)
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

// <contacts/>: the emails of the user's mutual contacts. Prosody says who they are (the
// roster lives there); anyone else's address stays hidden.
xmpp.iqCallee.get(NS, 'contacts', async (ctx) => {
  const jid = user(ctx.from)
  if (!jid || !db.account(jid)) return stanzaError('forbidden')
  const res = await prosodyIq(xml('contacts', { xmlns: INVITES, username: ctx.from!.local }), 'get')
  const reply = xml('contacts', { xmlns: NS })
  for (const contact of res.getChild('contacts', INVITES)?.getChildren('contact') ?? []) {
    const other = `${contact.attrs.username}@${USER_DOMAIN}`
    const email = db.account(other)?.email
    if (email) reply.c('contact', { jid: other, email })
  }
  return reply
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
async function invite(
  email: string,
  inviter: string | null,
  inviterName: string,
  lang: Language
): Promise<void> {
  const _ = translator(lang)
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
  const who = inviterName || _('Alguien')
  // The day it runs out, as people say it ("3 de noviembre").
  const expires = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(
    Date.now() + WEEK
  )
  await send({
    to: email,
    lang,
    subject: inviter
      ? _('{name} te ha invitado a Palique', { name: who })
      : _('¡Tienes una invitación para Palique!'),
    preheader: inviter
      ? _('Te quiere en su lista de contactos. Tienes 7 días para aceptar.')
      : _('Te hemos guardado un sitio. Tienes 7 días para aceptar.'),
    window: inviter ? _('Invitación de {name}', { name: who }) : _('Invitación a Palique'),
    sender: inviter ? who : undefined,
    bubble: inviter
      ? _('¡Ey! Quiero tenerte en mi lista de contactos de Palique 🙂')
      : _('¡Ey! Te hemos guardado un sitio 🙂❤️'),
    heading: _('El messenger de siempre, para hablar con los tuyos'),
    intro: _('Palique es una app de chat para el ordenador, como las de antes:'),
    features: [
      _('Ves quién está conectado y le hablas al momento'),
      _('Zumbidos, guiños y el sonidito cuando alguien entra'),
      _('Solo tus contactos: nadie más puede escribirte')
    ],
    steps: [
      {
        title: _('Crea tu cuenta'),
        text: _('Elige tu nombre y tu contraseña. Puedes hacerlo desde el móvil.'),
        link: {
          href: `${PUBLIC_URL}/join?t=${encodeURIComponent(token)}&l=${lang}`,
          label: _('Crear mi cuenta')
        }
      },
      {
        title: _('Descarga Palique y entra con tu correo'),
        text: _('Gratis, para Mac, Windows y Linux.'),
        link: { href: DOWNLOADS, label: _('Descargar Palique') }
      }
    ],
    note: inviter
      ? _('Entrarás con {email} y {name} ya estará en tu lista. La invitación caduca el {date}.', {
          email,
          name: who,
          date: expires
        })
      : _('Entrarás con {email}. La invitación caduca el {date}.', { email, date: expires }),
    footer: _('¿No quieres recibir más invitaciones a Palique?'),
    footerLink: {
      href: `${PUBLIC_URL}/no-invites?t=${optout}&l=${lang}`,
      label: _('No quiero más invitaciones')
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
        .slice(0, 64),
      requested(request.attrs.lang)
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

// The app sends JSON; the website's forms, form fields.
const isForm = (req: IncomingMessage): boolean =>
  (req.headers['content-type'] ?? '').startsWith('application/x-www-form-urlencoded')

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 2048) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(isForm(req) ? Object.fromEntries(new URLSearchParams(body)) : JSON.parse(body))
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

async function sendReset(email: string, lang: Language): Promise<void> {
  const _ = translator(lang)
  const account = db.accountByEmail(email)
  if (!account) return
  const username = account.jid.split('@')[0]
  const res = await prosodyIq(xml('reset', { xmlns: INVITES, for: username }))
  const token = res.getChild('reset', INVITES)!.attrs.token
  await send({
    to: email,
    lang,
    subject: _('Cambia tu contraseña de Palique'),
    preheader: _('El enlace vale durante una hora.'),
    window: _('Mensaje de Palique'),
    bubble: _('Tranqui, nos ha pasado a todos 😉'),
    heading: _('Elige una contraseña nueva'),
    intro: _('Pulsa el botón y elige otra. Tus contactos y conversaciones siguen ahí.'),
    link: {
      href: `${PUBLIC_URL}/reset?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}&l=${lang}`,
      label: _('Elegir contraseña nueva')
    },
    note: _('El enlace caduca en una hora y solo vale una vez.'),
    footer: _('¿No lo has pedido tú? Ignora este correo: tu contraseña no cambia.')
  })
}

// Signing in: the app asks which JID goes with the email. Unknown addresses get a made-up
// one that's always the same, so the sign-in just fails like a wrong password.
// Per IP a minute; development raises it so the checks can run back to back.
const signInIps = ipLimit(Number(env('SIGNIN_LIMIT', '30')), 60_000)

const pushStatus = (account: Account): void => {
  xmpp.send(xml('message', { to: account.jid }, status(account))).catch(() => {})
}

// Uses an invite (creating its account, named `nick`) or a password reset code, with the
// password chosen on the website. Prosody checks both (mod_palique_invites).
async function redeem(
  token: string,
  password: string,
  nick?: string
): Promise<'ok' | 'invalid' | 'weak' | 'error'> {
  try {
    await prosodyIq(
      xml(
        'redeem',
        { xmlns: INVITES, token },
        xml('password', {}, password),
        ...(nick ? [xml('nick', {}, nick)] : [])
      )
    )
    return 'ok'
  } catch (e) {
    const condition = (e as { condition?: string }).condition
    if (condition === 'item-not-found' || condition === 'conflict') return 'invalid'
    if (condition === 'not-acceptable') return 'weak'
    console.error('redeem:', condition ?? (e as Error).message)
    return 'error'
  }
}

// Same look as the emails: a Palique window on the app's sky. `extra` is HTML made here,
// with anything from outside escaped.
function page(lang: Language, title: string, message: string, extra = ''): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(title)} · Palique</title>
<style>
:root{--sky:linear-gradient(180deg,#7cc4ff 0%,#bfe3ff 70%,#f4f9ff 100%);--card:#fff;--bar:#e6f4ff;--line:#cfe3f7;--fg:#13294b;--muted:#4d6584;--acc:#1f6fc4;--soft-line:#bfe3ff}
@media (prefers-color-scheme:dark){:root{--sky:linear-gradient(180deg,#0b1633 0%,#24407a 70%,#111a30 100%);--card:#111a30;--bar:#172a52;--line:#25365e;--fg:#e6eeff;--muted:#a3b4d3;--acc:#8cc2ff;--soft-line:#2f4677}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--sky);color:var(--fg);font:15px/1.55 Nunito,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
main{width:min(440px,100% - 32px);background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgb(19 41 75/12%)}
.bar{padding:12px 18px;background:var(--bar);border-bottom:1px solid var(--line);font-weight:800;font-size:16px}.bar span{color:#2f9a3c}
.body{padding:22px 28px 26px}h1{font-size:21px;font-weight:900;margin:0 0 6px}p{margin:0 0 14px;color:var(--muted)}a{color:var(--acc)}
.btn{display:block;margin:18px 0;padding:13px 20px;border:1px solid #1a5fa8;border-radius:999px;background:linear-gradient(180deg,#5db2ff 0%,#1f6fc4 52%,#1a63b3 100%);box-shadow:inset 0 1px 0 rgb(255 255 255/70%),0 3px 8px rgb(31 111 196/30%);color:#fff;font-weight:800;text-align:center;text-decoration:none}
.btn{width:100%;font:inherit;font-weight:800;cursor:pointer}
label{display:block;margin:0 0 12px;font-weight:700}input{display:block;box-sizing:border-box;width:100%;margin-top:4px;padding:10px 14px;border:2px solid var(--soft-line);border-radius:999px;background:var(--card);color:var(--fg);font:inherit;font-weight:400}input:focus{outline:none;border-color:var(--acc)}input[readonly]{border-style:dashed;color:var(--muted)}.check{display:flex;gap:8px;align-items:center;font-weight:600}.check input{width:18px;height:18px;margin:0;accent-color:#2f9a3c}
.hint{margin:-6px 0 12px;font-size:13px}.error{padding:10px 14px;border-radius:12px;background:#fdecea;color:#b42318;font-weight:700}@media (prefers-color-scheme:dark){.error{background:#3a1d1d;color:#ff9a8c}}
</style></head>
<body><main><div class="bar"><span>&#9679;</span>&nbsp;Palique</div><div class="body"><h1>${escape(title)}</h1><p>${escape(message)}</p>${extra}</div></main></body></html>`
}

const isLoopback = (req: IncomingMessage): boolean =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')

// The app's own requests (sign-in, sign-up, recovery) carry its version: an app older
// than MIN_APP_VERSION is asked to update instead (see version.ts).
const MIN_APP_VERSION = process.env['MIN_APP_VERSION'] ?? ''
const APP_PATHS = new Set(['/account', '/signup', '/recover'])

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', PUBLIC_URL)
  const json = (code: number, body: unknown): void => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  if (req.method === 'POST' && APP_PATHS.has(url.pathname) && !isForm(req)) {
    const version = req.headers['x-palique-version']
    if (outdated(MIN_APP_VERSION, Array.isArray(version) ? version[0] : version)) {
      return json(426, { error: 'outdated' })
    }
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
  if (req.method === 'POST' && url.pathname === '/recover' && !isForm(req)) {
    const body = await readJson(req)
    const email = cleanEmail(body.email)
    if (validEmail(email) && allowReset(email, clientIp(req))) {
      sendReset(email, requested(body.lang)).catch((e) => console.error('reset', e.message))
    }
    return json(202, { ok: true })
  }
  // The admin's invites (src/invite.ts), only from inside the container.
  if (req.method === 'POST' && url.pathname === '/admin/invite' && isLoopback(req)) {
    const body = await readJson(req)
    const email = cleanEmail(body.email)
    if (!validEmail(email)) return json(400, { error: 'invalid' })
    if (db.taken(email)) return json(409, { error: 'taken' })
    try {
      await invite(email, null, '', requested(body.lang))
      return json(200, { ok: true })
    } catch (e) {
      return json(500, { error: (e as Error).message })
    }
  }

  // Pages: the language in the link, else the browser's.
  const lang = language(url.searchParams.get('l') ?? req.headers['accept-language'])
  const _ = translator(lang)
  const reply = (code: number, title: string, message: string, extra = ''): void => {
    res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page(lang, title, message, extra))
  }
  // The website's forms: where the email buttons land. Everything about an account but
  // signing in happens here, not in the app. Each one posts back to its own address.
  const form = (fields: string, submit: string, error: string): string =>
    `${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}<form method="post">${fields}<button class="btn">${escape(submit)}</button></form>`
  const input = (name: string, label: string, type: string, attrs = ''): string =>
    `<label>${escape(label)}<input name="${name}" type="${type}" ${attrs}></label>`
  // The same rule as the app and Prosody (mod_palique_passwords); the browser checks it first.
  const rule = _('Al menos 8 caracteres, con mayúscula, minúscula, número y símbolo.')
  const newPassword = (): string =>
    input(
      'password',
      _('Contraseña'),
      'password',
      `required minlength="8" autocomplete="new-password" pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}" title="${escape(rule)}"`
    ) +
    `<p class="hint">${escape(rule)}</p>` +
    input('confirm', _('Repite la contraseña'), 'password', 'required autocomplete="new-password"')
  const isPage = req.method === 'GET' || req.method === 'POST'
  const body = req.method === 'POST' ? await readJson(req) : {}
  const field = (name: string): string => String(body[name] ?? '')
  // A form sent back: the password must be typed twice alike; too many tries wait.
  const problem = (): string =>
    !signInIps(clientIp(req))
      ? _('Demasiados intentos. Espera un minuto.')
      : field('password') !== field('confirm')
        ? _('Las contraseñas no coinciden.')
        : ''
  const failed = (result: string): string =>
    result === 'weak'
      ? `${_('Esa contraseña no es segura.')} ${rule}`
      : _('Algo ha fallado. Inténtalo de nuevo.')

  // The invite's "Create my account": name and password, then the downloads.
  if (isPage && url.pathname === '/join') {
    const token = url.searchParams.get('t') ?? ''
    const invite = db.invite(token)
    if (!invite) {
      return reply(
        404,
        _('Invitación no válida'),
        _('Esta invitación ya se ha usado o ha caducado. Pide otra a quien te invitó.')
      )
    }
    const nick = field('nick').trim().slice(0, 64)
    let error = ''
    if (req.method === 'POST') {
      error = problem() || (nick ? '' : _('Escribe tu nombre.'))
      if (!error) {
        const result = await redeem(token, field('password'), nick)
        if (result === 'ok') {
          // Claimed now rather than when Prosody's announcement arrives, to keep the choice.
          if (db.account(invite.jid) && field('newsletter')) db.setNewsletter(invite.jid, true)
          return reply(
            200,
            _('¡Cuenta creada!'),
            _('Ya puedes entrar en Palique con {email} y tu contraseña.', { email: invite.email }),
            `<a class="btn" href="${escape(DOWNLOADS)}">${_('Descargar Palique')}</a><p>${_('¿Ya lo tienes? Ábrelo e inicia sesión.')}</p>`
          )
        }
        error =
          result === 'invalid' ? _('Esta invitación ya se ha usado o ha caducado.') : failed(result)
      }
    }
    return reply(
      error ? 400 : 200,
      _('Crea tu cuenta de Palique'),
      _('Elige tu nombre y tu contraseña. Tus amigos te verán con ese nombre.'),
      form(
        input(
          'email',
          _('Correo electrónico'),
          'email',
          `value="${escape(invite.email)}" readonly`
        ) +
          input(
            'nick',
            _('Tu nombre'),
            'text',
            `value="${escape(nick)}" required maxlength="64" autocomplete="nickname"`
          ) +
          newPassword() +
          `<label class="check"><input name="newsletter" type="checkbox"${field('newsletter') ? ' checked' : ''}>${escape(_('Quiero recibir novedades de Palique por correo'))}</label>`,
        _('Crear mi cuenta'),
        error
      )
    )
  }
  // The recovery email's button: a new password for that address.
  if (isPage && url.pathname === '/reset') {
    const email = url.searchParams.get('e') ?? ''
    const token = url.searchParams.get('t') ?? ''
    const expired = (): void =>
      reply(
        404,
        _('Enlace caducado'),
        _('Este enlace ya se ha usado o ha caducado. Pide otro y te lo enviamos.'),
        `<a class="btn" href="/recover?l=${lang}">${_('Pedir otro enlace')}</a>`
      )
    if (!email || !token) return expired()
    let error = ''
    if (req.method === 'POST') {
      error = problem()
      if (!error) {
        const result = await redeem(token, field('password'))
        if (result === 'ok') {
          return reply(
            200,
            _('¡Contraseña cambiada!'),
            _('Ya puedes entrar en Palique con {email} y tu contraseña nueva.', { email })
          )
        }
        if (result === 'invalid') return expired()
        error = failed(result)
      }
    }
    return reply(
      error ? 400 : 200,
      _('Elige una contraseña nueva'),
      _('Para entrar en Palique con {email}.', { email }),
      form(newPassword(), _('Cambiar mi contraseña'), error)
    )
  }
  // "Forgot your password?" from the app: the address to send the link to. Always the
  // same answer, so it doesn't tell whether there's an account.
  if (isPage && url.pathname === '/recover') {
    if (req.method === 'POST') {
      const email = cleanEmail(body.email)
      if (validEmail(email) && allowReset(email, clientIp(req))) {
        sendReset(email, lang).catch((e) => console.error('reset', e.message))
      }
      return reply(
        200,
        _('Mira tu correo'),
        _(
          'Si {email} tiene una cuenta de Palique, te hemos enviado un enlace para elegir otra contraseña. Caduca en una hora.',
          { email }
        )
      )
    }
    return reply(
      200,
      _('¿Olvidaste tu contraseña?'),
      _('Escribe tu correo y te enviaremos un enlace para elegir otra.'),
      form(
        input('email', _('Correo electrónico'), 'email', 'required autocomplete="email"'),
        _('Enviarme el enlace'),
        ''
      )
    )
  }
  if (req.method === 'GET' && url.pathname === '/verify') {
    const account = db.verify(url.searchParams.get('t') ?? '')
    if (!account) {
      return reply(404, _('Enlace no válido'), _('Este enlace ya se ha usado o no existe.'))
    }
    // Let the app know right away (it also asks on every sign-in).
    pushStatus(account)
    return reply(
      200,
      _('Correo cambiado'),
      _('¡Hecho! A partir de ahora entrarás en Palique con {email}.', { email: account.email })
    )
  }
  if (req.method === 'GET' && url.pathname === '/no-invites') {
    if (!db.optOut(url.searchParams.get('t') ?? '')) {
      return reply(404, _('Enlace no válido'), _('Este enlace no existe.'))
    }
    return reply(200, _('Listo'), _('Vale, no te invitaremos más a Palique en esta dirección.'))
  }
  reply(404, _('Página no encontrada'), _('Por aquí no hay nada.'))
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
