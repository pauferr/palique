// Palique account service: an XMPP component (so the server vouches for who's asking)
// plus a small website for the links in its emails.
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { component, xml } from '@xmpp/component'
import { openDb } from './db.ts'
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
  const token = db.setEmail(jid, address, request.attrs.newsletter === 'true')
  if (token) await sendVerification(address, token)
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

// --- website for the email links -----------------------------------------------------

function page(title: string, message: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Palique</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#eaf0fb;font-family:'Noto Sans',Verdana,sans-serif;color:#1b2a4a">
<main style="width:min(420px,100% - 32px);background:#fff;border:1px solid #c6d5ee;border-radius:8px;overflow:hidden">
<div style="padding:14px 20px;background:linear-gradient(#e3edfd,#c3d7f7);color:#0b3c9e;font-size:22px;font-weight:bold;font-style:italic">Palique</div>
<div style="padding:16px 20px"><h1 style="font-size:18px;color:#0b3c9e;margin:0 0 8px">${title}</h1><p>${message}</p></div>
</main></body></html>`
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', PUBLIC_URL)
  const reply = (code: number, title: string, message: string): void => {
    res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page(title, message))
  }
  if (req.method === 'GET' && url.pathname === '/verificar') {
    const account = db.verify(url.searchParams.get('t') ?? '')
    if (!account) return reply(404, 'Enlace no válido', 'Este enlace ya se usó o no existe.')
    // Let the app know right away (it also asks on every sign-in).
    xmpp.send(xml('message', { to: account.jid }, status(account.jid))).catch(() => {})
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

await xmpp.start()
