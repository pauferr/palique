// Registration/login check against the local Prosody (`docker compose up -d` first).
// Run: npm run check:auth
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { login, logout } from '../src/main/xmpp.ts'
import { adminInvite } from './invite.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const user = `check${Date.now()}`
const pass = 'check-password'

const reg = await login(user, pass, { invite: adminInvite() })
assert.deepEqual(reg, { ok: true, jid: `${user}@localhost` })
await logout()

assert.deepEqual(await login(user, pass, { invite: adminInvite() }), {
  ok: false,
  error: 'conflict'
})
assert.deepEqual(await login(user, 'wrong'), { ok: false, error: 'not-authorized' })
assert.deepEqual(await login(`${user}x`, pass, { invite: 'not-a-real-code' }), {
  ok: false,
  error: 'invalid-invite'
})
assert.deepEqual(await login(user, pass), { ok: true, jid: `${user}@localhost` })
await logout()

console.log('auth check passed')
