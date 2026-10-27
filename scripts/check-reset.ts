// Password recovery: Prosody + account service + Mailpit (`docker compose up -d`).
// Run: npm run check:reset
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import * as A from '../src/main/xmpp.ts'
import { setLanguage } from '../src/renderer/src/i18n.ts'
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

const a = await register(name, 'Old-pass1')
await A.logout()

// The request always "works"; only the account's address gets an email, with a link to
// the page that opens the app (carrying the address) and the code.
await A.requestPasswordReset(email)
await A.requestPasswordReset(`nadie${id}@correo.test`)
// It's sent after answering (so timing reveals nothing): wait for it.
const deadline = Date.now() + 5000
while ((await mailCount(email)) < 2) {
  assert.ok(Date.now() < deadline, 'recovery email arrives')
  await sleep(100)
}
const recovery = await lastMail(email)
assert.equal(recovery.subject, 'Cambia tu contraseña de Palique')
const link = recovery.text.match(/http:\/\/localhost:8080\/reset\?e=([^&\s]+)&t=([^&\s]+)/)
assert.ok(link, 'link in the email')
assert.equal(decodeURIComponent(link[1]), email)
const code = decodeURIComponent(link[2])
assert.ok(
  recovery.text.replace(/\r/g, '').includes(`\n\n${code}\n\n`),
  'the code is also written out'
)
const resetPage = await (await fetch(link[0])).text()
assert.ok(
  resetPage.includes(`palique://reset?e=${link[1]}&#38;t=${link[2]}`),
  'the page opens the app'
)
await sleep(500)
assert.equal(await mailCount(`nadie${id}@correo.test`), 0)

// A second request within 5 minutes sends nothing new.
await A.requestPasswordReset(email)
await sleep(500)
assert.equal(await mailCount(email), 2)

// A weak new password is refused, and the code stays usable.
assert.deepEqual(await A.login(a, 'debil', { invite: code }), {
  ok: false,
  error: 'not-acceptable'
})

// The code sets a new password once (the app finds the account by email); the old one
// stops working.
assert.equal(await A.accountFor(email), a)
assert.deepEqual(await A.login(a, 'New-pass1', { invite: code }), {
  ok: true,
  jid: `${a}@localhost`
})
await A.logout()
assert.deepEqual(await A.login(a, 'Old-pass1'), { ok: false, error: 'not-authorized' })
assert.equal((await A.login(a, 'New-pass1')).ok, true)
await A.logout()
assert.deepEqual(await A.login(a, 'Third-pass1', { invite: code }), {
  ok: false,
  error: 'invalid-invite'
})

// The email goes out in the language the app is in.
const english = `rstb${id}@correo.test`
await register(`rstb${id}`, 'Old-pass1')
await A.logout()
setLanguage('en')
await A.requestPasswordReset(english)
setLanguage('es')
while ((await mailCount(english)) < 2) {
  assert.ok(Date.now() < deadline + 10_000, 'English recovery email arrives')
  await sleep(100)
}
const inEnglish = await lastMail(english)
assert.equal(inEnglish.subject, 'Change your Palique password')
assert.match(inEnglish.text, /Choose a new password: http:\/\/localhost:8080\/reset\?e=.*&l=en/)

// Apps from before translations don't say which language: Spanish, as they were.
const older = `rstc${id}@correo.test`
await register(`rstc${id}`, 'Old-pass1')
await A.logout()
await fetch('http://localhost:8080/recover', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: older })
})
while ((await mailCount(older)) < 2) {
  assert.ok(Date.now() < deadline + 20_000, 'recovery email for an older app arrives')
  await sleep(100)
}
assert.equal((await lastMail(older)).subject, 'Cambia tu contraseña de Palique')

console.log('reset check passed')
process.exit(0)
