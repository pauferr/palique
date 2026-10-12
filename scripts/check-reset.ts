// Password recovery: Prosody + account service + Mailpit (`docker compose up -d`).
// Run: npm run check:reset
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import * as A from '../src/main/xmpp.ts'
import { register } from './invite.ts'
import { lastMail, mailCount } from './mailpit.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const name = `rsta${id}`
const email = `${name}@correo.test`
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const a = await register(name, 'old-password')
await A.logout()

// The request always "works"; only the account's address gets an email, with an app link
// (carrying the address) and the code.
await A.requestPasswordReset(email)
await A.requestPasswordReset(`nadie${id}@correo.test`)
// It's sent after answering (so timing reveals nothing): wait for it.
const deadline = Date.now() + 5000
while ((await mailCount(email)) < 2) {
  assert.ok(Date.now() < deadline, 'recovery email arrives')
  await sleep(100)
}
const recovery = await lastMail(email)
assert.equal(recovery.subject, 'Recupera tu contraseña de Palique')
const link = recovery.text.match(/palique:\/\/recuperar\?e=([^&\s]+)&t=(\S+)/)
assert.ok(link, 'palique:// link in the email')
assert.equal(decodeURIComponent(link[1]), email)
const code = decodeURIComponent(link[2])
assert.ok(
  recovery.text.replace(/\r/g, '').includes(`\n\n${code}\n\n`),
  'the code is also written out'
)
await sleep(500)
assert.equal(await mailCount(`nadie${id}@correo.test`), 0)

// A second request within 5 minutes sends nothing new.
await A.requestPasswordReset(email)
await sleep(500)
assert.equal(await mailCount(email), 2)

// The code sets a new password once (the app finds the account by email); the old one
// stops working.
assert.equal(await A.accountFor(email), a)
assert.deepEqual(await A.login(a, 'new-password', { invite: code }), {
  ok: true,
  jid: `${a}@localhost`
})
await A.logout()
assert.deepEqual(await A.login(a, 'old-password'), { ok: false, error: 'not-authorized' })
assert.equal((await A.login(a, 'new-password')).ok, true)
await A.logout()
assert.deepEqual(await A.login(a, 'third-password', { invite: code }), {
  ok: false,
  error: 'invalid-invite'
})

console.log('reset check passed')
process.exit(0)
