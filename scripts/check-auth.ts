// Sign-up and sign-in by email against the local server (`docker compose up -d` first).
// Run: npm run check:auth
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { accountFor, inviteInfo, login, logout, snapshot } from '../src/main/xmpp.ts'
import { adminInvite } from './invite.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const email = `check${Date.now()}@correo.test`
const pass = 'check-password'

// The invite says which address it's for and which (random) account it creates.
const token = await adminInvite(email)
const invite = await inviteInfo(token)
assert.equal(invite.email, email)
assert.match(invite.username, /^[a-z2-7]{10}$/)
await assert.rejects(inviteInfo('not-a-real-code'), /invalid-invite/)

// Until it's used, signing in with that address points at the reserved account.
assert.equal(await accountFor(email), invite.username)

// The invite can only create its own account.
assert.deepEqual(await login('someoneelse', pass, { invite: token }), {
  ok: false,
  error: 'not-acceptable'
})

const reg = await login(invite.username, pass, { invite: token, nick: 'Tere' })
assert.deepEqual(reg, { ok: true, jid: `${invite.username}@localhost` })
await new Promise((r) => setTimeout(r, 300))
assert.equal(snapshot().name, 'Tere')
await logout()

// Used: it's gone, and can't create the account again.
await assert.rejects(inviteInfo(token), /invalid-invite/)
assert.deepEqual(await login(invite.username, pass, { invite: token }), {
  ok: false,
  error: 'invalid-invite'
})

// Signing in by email, case and spaces don't matter (the app cleans them up).
assert.equal(await accountFor(email), invite.username)
assert.deepEqual(await login(await accountFor(email), pass), {
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

console.log('auth check passed')
