// Palique account service: an XMPP component (so the server vouches for who's asking)
// plus a small website for the links in its emails.
import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { component, xml } from '@xmpp/component'
import { brevo } from './brevo.ts'
import { openDb, type Account } from './db.ts'
import { mailer } from './mail.ts'

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback
  if (value === undefined) throw new Error(`missing ${name}`)
  return value
}

const NS = 'urn:palique:cuentas:0'
const USER_DOMAIN = env('USER_DOMAIN', 'localhost') // accounts we serve: user@USER_DOMAIN
const PUBLIC_URL = env('PUBLIC_URL', 'http://localhost:8080')

mkdirSync(env('DATA_DIR', '/data'), { recursive: true })
const db = openDb(`${env('DATA_DIR', '/data')}/cuentas.sqlite`)
const send = mailer({
  host: env('SMTP_HOST'),
  port: Number(env('SMTP_PORT', '587')),
  from: env('MAIL_FROM', 'Palique <no-responder@palique.localhost>'),
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

// Only verified addresses go to the list (the verification link doubles as the opt-in
// confirmation). Failures are logged; sync-brevo.ts can catch up.
function syncNewsletter(account: Account | undefined): void {
  if (!newsletter || !account?.verified) return
  const action = account.newsletter
    ? newsletter.subscribe(account.email)
    : newsletter.unsubscribe(account.email)
  action.catch((e) => console.error('brevo', e.message))
}

const xmpp = component({
  service: env('XMPP_SERVICE'),
  domain: env('XMPP_DOMAIN'),
  password: env('XMPP_SECRET')
})
xmpp.on('error', (e) => console.error('xmpp', e.message))
xmpp.on('online', (address) => console.log('online as', address.toString()))

function stanzaError(condition: string, text?: string) {
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

function sendVerification(email: string, token: string): Promise<unknown> {
  return send({
    to: email,
    subject: 'Confirma tu correo de Palique',
    paragraphs: [
      '¡Hola! Pulsa el botón para confirmar que este correo es tuyo.',
      'Lo usaremos para que puedas recuperar tu contraseña si la olvidas.'
    ],
    link: { href: `${PUBLIC_URL}/verificar?t=${token}`, label: 'Confirmar mi correo' },
    footer: 'Si no has creado una cuenta en Palique, ignora este mensaje.'
  })
}

const status = (jid: string) => {
  const account = db.account(jid)
  return xml('email', {
    xmlns: NS,
    address: account?.email ?? '',
    verified: String(account?.verified ?? false),
    newsletter: String(account?.newsletter ?? false)
  })
}

// <email address='…' newsletter='true|false'/>: set (or change) the account's address.
xmpp.iqCallee.set(NS, 'email', async (ctx) => {
  const jid = user(ctx.from)
  if (!jid) return stanzaError('forbidden')
  const request = ctx.stanza.getChild('email', NS)!
  const address = String(request.attrs.address ?? '')
    .trim()
    .toLowerCase()
  if (!validEmail(address)) return stanzaError('bad-request', 'invalid email')
  const before = db.account(jid)
  const token = db.setEmail(jid, address, request.attrs.newsletter === 'true')
  if (token) {
    // A new address: the old one leaves the list until the new one is verified.
    if (before?.verified && before.newsletter && newsletter) {
      newsletter.unsubscribe(before.email).catch((e) => console.error('brevo', e.message))
    }
    await sendVerification(address, token)
  } else {
    syncNewsletter(db.account(jid))
  }
  return status(jid)
})

// <newsletter subscribe='true|false'/>: the user's choice, any time (Options).
xmpp.iqCallee.set(NS, 'newsletter', (ctx) => {
  const jid = user(ctx.from)
  if (!jid) return stanzaError('forbidden')
  const wanted = ctx.stanza.getChild('newsletter', NS)!.attrs.subscribe === 'true'
  const account = db.setNewsletter(jid, wanted)
  if (!account) return stanzaError('item-not-found', 'no email on file')
  syncNewsletter(account)
  return status(jid)
})

xmpp.iqCallee.get(NS, 'email', (ctx) => {
  const jid = user(ctx.from)
  return jid ? status(jid) : stanzaError('forbidden')
})

// <resend/>: another verification link (at most once a minute).
xmpp.iqCallee.set(NS, 'resend', async (ctx) => {
  const jid = user(ctx.from)
  if (!jid) return stanzaError('forbidden')
  const token = db.resendToken(jid)
  if (!token) return stanzaError('resource-constraint')
  await sendVerification(db.account(jid)!.email, token)
  return true
})

// --- invites by email ---------------------------------------------------------------

const INVITES = 'urn:palique:invite:0' // server/modules/mod_palique_invites.lua

// Ask Prosody (our trusted component may act for a user) about the user's invites.
function invitesIq(type: 'get' | 'set', username: string) {
  return xmpp.iqCaller.request(
    xml('iq', { type, to: USER_DOMAIN }, xml('invite', { xmlns: INVITES, for: username }))
  )
}

// <invite-email address='…'/>. The answer never says whether the address has an account:
// "sent" is the reply either way. Registered, recently invited or opted-out addresses get
// nothing and cost no invite. The limit is checked first so it can't leak that either.
xmpp.iqCallee.set(NS, 'invite-email', async (ctx) => {
  const jid = user(ctx.from)
  if (!jid) return stanzaError('forbidden')
  const username = jid.split('@')[0]
  const address = String(ctx.stanza.getChild('invite-email', NS)!.attrs.address ?? '')
    .trim()
    .toLowerCase()
  if (!validEmail(address)) return stanzaError('bad-request', 'invalid email')

  const usage = (await invitesIq('get', username)).getChild('invites', INVITES)!
  if (Number(usage.attrs.active) >= Number(usage.attrs.max)) {
    return stanzaError('resource-constraint')
  }
  if (db.isRegistered(address) || !db.mayInvite(address)) return true

  const invite = (await invitesIq('set', username)).getChild('invite', INVITES)!
  const optout = db.invited(address)
  await send({
    to: address,
    subject: `${username} te invita a Palique`,
    paragraphs: [
      `${username} quiere chatear contigo en Palique, una app de mensajería con zumbidos, guiños y sonidos de toda la vida.`,
      `Para crear tu cuenta, abre Palique, pulsa «¿No tienes cuenta? Crea una» y pega este código de invitación: ${invite.attrs.token}`,
      `El código caduca en una semana. Al entrar, ${username} ya estará en tus contactos.`
    ],
    footer: `¿No conoces a ${username} o no quieres más invitaciones? No recibirás ninguna más: ${PUBLIC_URL}/no-invitaciones?t=${optout}`
  })
  return true
})

// --- password recovery -----------------------------------------------------------------

// Asked over HTTP: the app is signed out, so there's no XMPP session to vouch for anyone.
// The answer is always the same (it doesn't reveal whether the account or its email
// exist) and requests are limited per username and per address.
const RESET_GAP = 5 * 60_000 // per username
const IP_WINDOW = 15 * 60_000
const IP_MAX = 10
const lastReset = new Map<string, number>()
const ipRequests = new Map<string, { since: number; count: number }>()

function allowReset(username: string, ip: string): boolean {
  const now = Date.now()
  const seen = ipRequests.get(ip)
  const window = seen && now - seen.since < IP_WINDOW ? seen : { since: now, count: 0 }
  window.count++
  ipRequests.set(ip, window)
  if (window.count > IP_MAX) return false
  if (now - (lastReset.get(username) ?? 0) < RESET_GAP) return false
  lastReset.set(username, now)
  return true
}

async function sendReset(username: string): Promise<void> {
  const account = db.account(`${username}@${USER_DOMAIN}`)
  if (!account?.verified) return
  const res = await xmpp.iqCaller.request(
    xml('iq', { type: 'set', to: USER_DOMAIN }, xml('reset', { xmlns: INVITES, for: username }))
  )
  const token = res.getChild('reset', INVITES)!.attrs.token
  await send({
    to: account.email,
    subject: 'Recupera tu contraseña de Palique',
    paragraphs: [
      `Has pedido cambiar la contraseña de tu cuenta «${username}».`,
      'Pulsa el botón para abrir Palique y elegir una nueva. Si el botón no funciona, abre Palique, pulsa «¿Olvidaste tu contraseña?» y luego «Ya tengo un código», y pega este código:',
      token
    ],
    link: {
      href: `palique://recuperar?u=${encodeURIComponent(username)}&t=${encodeURIComponent(token)}`,
      label: 'Abrir Palique y elegir contraseña'
    },
    footer:
      'El código caduca en una hora y solo sirve una vez. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.'
  })
}

function readJson(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
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

// --- website for the email links -----------------------------------------------------

const pushStatus = (jid: string): void => {
  xmpp.send(xml('message', { to: jid }, status(jid))).catch(() => {})
}

// Brevo's webhook (configure it with ?token=BREVO_WEBHOOK_TOKEN): someone left the list
// from a newsletter's own link, or the address bounced or complained. Mirror it here.
const WEBHOOK_TOKEN = process.env['BREVO_WEBHOOK_TOKEN'] ?? ''
const LEAVE_EVENTS = new Set(['unsubscribed', 'spam', 'hard_bounce', 'hardBounce', 'blocked'])

function sameSecret(given: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(WEBHOOK_TOKEN)
  return WEBHOOK_TOKEN !== '' && a.length === b.length && timingSafeEqual(a, b)
}

function page(title: string, message: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Palique</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#eaf0fb;font-family:'Noto Sans',Verdana,sans-serif;color:#1b2a4a">
<main style="width:min(420px,100% - 32px);background:#fff;border:1px solid #c6d5ee;border-radius:8px;overflow:hidden">
<div style="padding:14px 20px;background:linear-gradient(#e3edfd,#c3d7f7);color:#0b3c9e;font-size:22px;font-weight:bold;font-style:italic">Palique</div>
<div style="padding:16px 20px"><h1 style="font-size:18px;color:#0b3c9e;margin:0 0 8px">${title}</h1><p>${message}</p></div>
</main></body></html>`
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', PUBLIC_URL)
  if (req.method === 'POST' && url.pathname === '/brevo') {
    if (!sameSecret(url.searchParams.get('token') ?? '')) {
      res.writeHead(403)
      return res.end()
    }
    const event = await readJson(req)
    const email = String(event.email ?? '')
      .trim()
      .toLowerCase()
    if (LEAVE_EVENTS.has(String(event.event)) && email) {
      for (const account of db.unsubscribeEmail(email)) pushStatus(account.jid)
    }
    res.writeHead(200)
    return res.end()
  }
  if (req.method === 'POST' && url.pathname === '/recuperar') {
    const username = String((await readJson(req)).username ?? '')
      .trim()
      .toLowerCase()
    const ip = req.socket.remoteAddress ?? ''
    if (/^[a-z0-9._-]{1,64}$/.test(username) && allowReset(username, ip)) {
      sendReset(username).catch((e) => console.error('reset', e.message))
    }
    res.writeHead(202, { 'content-type': 'application/json' })
    return res.end('{"ok":true}')
  }
  const reply = (code: number, title: string, message: string): void => {
    res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page(title, message))
  }
  if (req.method === 'GET' && url.pathname === '/verificar') {
    const account = db.verify(url.searchParams.get('t') ?? '')
    if (!account) return reply(404, 'Enlace no válido', 'Este enlace ya se usó o no existe.')
    syncNewsletter(account)
    // Let the app know right away (it also asks on every sign-in).
    pushStatus(account.jid)
    return reply(200, 'Correo confirmado', 'Gracias. Ya puedes volver a Palique.')
  }
  if (req.method === 'GET' && url.pathname === '/no-invitaciones') {
    if (!db.optOut(url.searchParams.get('t') ?? '')) {
      return reply(404, 'Enlace no válido', 'Este enlace no existe.')
    }
    return reply(200, 'Hecho', 'No volverás a recibir invitaciones a Palique en esta dirección.')
  }
  reply(404, 'Página no encontrada', 'Aquí no hay nada.')
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
