// Password recovery: Prosody + account service + Mailpit (`docker compose up -d`).
// Run: npm run check:reset
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import * as A from '../src/main/xmpp.ts'
import { adminInvite } from './invite.ts'
import { lastMail, mailCount } from './mailpit.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const [a, unverified] = [`rsta${id}`, `rstu${id}`]
const mail = (user: string): string => `${user}@correo.test`
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// A: verified email. U: email set but never confirmed.
assert.equal((await A.login(a, 'old-password', { invite: adminInvite() })).ok, true)
await A.setEmail(mail(a), false)
const verify = (await lastMail(mail(a))).text.match(/http:\/\/localhost:8080\/verificar\?t=\S+/)![0]
assert.equal((await fetch(verify)).status, 200)
await A.logout()
assert.equal((await A.login(unverified, 'old-password', { invite: adminInvite() })).ok, true)
await A.setEmail(mail(unverified), false)
await A.logout()

// The request always "works"; only A gets an email, with an app link and the code.
await A.requestPasswordReset(a.toUpperCase())
await A.requestPasswordReset(unverified)
await A.requestPasswordReset(`nadie${id}`)
// It's sent after answering (so timing reveals nothing): wait for it.
const deadline = Date.now() + 5000
while ((await mailCount(mail(a))) < 2) {
  assert.ok(Date.now() < deadline, 'recovery email arrives')
  await sleep(100)
}
const recovery = await lastMail(mail(a))
assert.equal(recovery.subject, 'Recupera tu contraseña de Palique')
const link = recovery.text.match(/palique:\/\/recuperar\?u=([^&\s]+)&t=(\S+)/)
assert.ok(link, 'palique:// link in the email')
assert.equal(decodeURIComponent(link[1]), a)
const code = decodeURIComponent(link[2])
assert.ok(
  recovery.text.replace(/\r/g, '').includes(`\n\n${code}\n\n`),
  'the code is also written out'
)
await sleep(500)
assert.equal(await mailCount(mail(unverified)), 1, 'unverified: only the verification email')

// A second request within 5 minutes sends nothing new.
await A.requestPasswordReset(a)
await sleep(500)
assert.equal(await mailCount(mail(a)), 2)

// The code sets a new password once; the old one stops working.
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
