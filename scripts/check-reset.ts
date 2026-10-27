// Password recovery: Prosody + account service + Mailpit (`docker compose up -d`).
// Run: npm run check:reset
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import * as A from '../src/main/xmpp.ts'
import { page, register } from './invite.ts'
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

// «¿Olvidaste tu contraseña?» in the app opens the website's form. The request always
// "works"; only the account's address gets an email, with a link to set a new password.
const recover = (address: string, lang = 'es'): ReturnType<typeof page> =>
  page(`/recover?l=${lang}`, { email: address })
assert.match(A.recoverUrl(), /^http:\/\/localhost:8080\/recover\?l=/)
assert.equal((await page('/recover')).status, 200)
const answer = await recover(email)
assert.equal(answer.status, 200)
const nobody = `nadie${id}@correo.test`
assert.equal((await recover(nobody)).text.replaceAll(nobody, email), answer.text, 'the same answer')
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
const resetPath = `${link[0].replace('http://localhost:8080', '')}&l=es`
assert.equal((await page(resetPath)).status, 200)
await sleep(500)
assert.equal(await mailCount(nobody), 0)

// A second request within 5 minutes sends nothing new.
await recover(email)
await sleep(500)
assert.equal(await mailCount(email), 2)

// A weak new password is refused, and the link stays usable.
const reset = (password: string): ReturnType<typeof page> =>
  page(resetPath, { password, confirm: password })
const weak = await reset('debil')
assert.equal(weak.status, 400)
assert.match(weak.text, /no es segura/)

// The link sets a new password once; the old one stops working.
assert.match((await reset('New-pass1')).text, /Contraseña cambiada/)
assert.deepEqual(await A.login(a, 'Old-pass1'), { ok: false, error: 'not-authorized' })
assert.equal((await A.login(a, 'New-pass1')).ok, true)
await A.logout()
assert.equal((await reset('Third-pass1')).status, 404)

// The email goes out in the language the app is in.
const english = `rstb${id}@correo.test`
await register(`rstb${id}`, 'Old-pass1')
await A.logout()
await recover(english, 'en')
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
