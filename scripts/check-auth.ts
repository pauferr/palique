// Sign-up and sign-in by email against the local server (`docker compose up -d` first).
// Run: npm run check:auth
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import { accountFor, login, logout, snapshot } from '../src/main/xmpp.ts'
import { adminInvite, inviteInfo, page } from './invite.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const email = `check${Date.now()}@correo.test`
const pass = 'Check-pass1'

// The invite says which address it's for and which (random) account it creates.
const token = await adminInvite(email)
const invite = await inviteInfo(token)
assert.equal(invite.email, email)
assert.match(invite.username, /^[a-z2-7]{10}$/)
assert.equal((await page('/join?t=not-a-real-code')).status, 404)

// Until it's used, signing in with that address points at the reserved account.
assert.equal(await accountFor(email), invite.username)

// The sign-up page shows the address, and asks for a name and the password twice.
const form = await page(`/join?t=${token}`)
assert.equal(form.status, 200)
assert.ok(form.text.includes(email), 'the page shows the address')
const join = (fields: Record<string, string>): ReturnType<typeof page> =>
  page(`/join?t=${token}&l=es`, fields)
// Only strong passwords (8+ characters, lowercase, uppercase, digit and symbol): the
// server refuses weak ones, and the invite stays usable. ñ counts as a symbol.
for (const weak of ['Corta1!', 'sinmayus1!', 'SINMINUS1!', 'SinNumero!', 'SinSimbolo1']) {
  const res = await join({ nick: 'Tere', password: weak, confirm: weak })
  assert.equal(res.status, 400, weak)
  assert.match(res.text, /no es segura/, weak)
}
assert.match(
  (await join({ nick: 'Tere', password: pass, confirm: 'Otra-pass1' })).text,
  /no coinciden/
)
assert.match((await join({ nick: ' ', password: pass, confirm: pass })).text, /Escribe tu nombre/)

const created = await join({ nick: 'Tere', password: 'Contraseña1', confirm: 'Contraseña1' })
assert.equal(created.status, 200)
assert.match(created.text, /Cuenta creada/)

// Used: it's gone, and can't create the account again.
assert.equal((await page(`/join?t=${token}`)).status, 404)
assert.equal((await join({ nick: 'Otra', password: pass, confirm: pass })).status, 404)

// The name chosen on the website is the account's display name from the start.
const reg = await login(invite.username, 'Contraseña1')
assert.deepEqual(reg, { ok: true, jid: `${invite.username}@localhost` })
await new Promise((r) => setTimeout(r, 300))
assert.equal(snapshot().name, 'Tere')
await logout()

// Signing in by email, case and spaces don't matter (the app cleans them up).
assert.equal(await accountFor(email), invite.username)
assert.deepEqual(await login(await accountFor(email), 'Contraseña1'), {
  ok: true,
  jid: `${invite.username}@localhost`
})
await new Promise((r) => setTimeout(r, 300))
assert.equal(snapshot().name, 'Tere', 'the name comes back from the server')
await logout()

// A wrong password and an unknown address fail the same way. The unknown address still
// gets an account name (always the same one), so the service doesn't tell them apart.
assert.deepEqual(await login(invite.username, 'wrong'), { ok: false, error: 'not-authorized' })
const ghost = await accountFor('nadie@correo.test')
assert.match(ghost, /^[a-z2-7]{10}$/)
assert.equal(await accountFor('nadie@correo.test'), ghost)
assert.deepEqual(await login(ghost, pass), { ok: false, error: 'not-authorized' })

// Changing the password while signed in (other clients can): weak ones are refused too.
const signedIn = client({
  service: 'xmpp://localhost:5222',
  domain: 'localhost',
  username: invite.username,
  password: 'Contraseña1'
})
signedIn.on('error', () => {})
await signedIn.start()
const change = (password: string): Promise<string> =>
  signedIn.iqCaller
    .set(
      xml(
        'query',
        { xmlns: 'jabber:iq:register' },
        xml('username', {}, invite.username),
        xml('password', {}, password)
      )
    )
    .then(
      () => 'ok',
      (e: { condition?: string }) => e.condition ?? 'error'
    )
assert.equal(await change('debil'), 'not-acceptable')
assert.equal(await change('Otra-pass2'), 'ok')
await signedIn.stop()

console.log('auth check passed')
