// Email verification check: Prosody + account service + Mailpit (`docker compose up -d`).
// Run: npm run check:email
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import * as A from '../src/main/xmpp.ts'
import { adminInvite } from './invite.ts'
import { lastMail } from './mailpit.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const [a, b] = [`maila${id}`, `mailb${id}`]
const pass = 'check-password'
const address = `${a}@correo.test`

const pushes: A.EmailStatus[] = []
A.onEmail((e) => pushes.push(e))

assert.equal((await A.login(b, pass, { invite: adminInvite() })).ok, true)
await A.logout()
assert.equal((await A.login(a, pass, { invite: adminInvite() })).ok, true)

// Nothing yet; bad addresses are refused.
assert.deepEqual(await A.emailStatus(), { address: '', verified: false, newsletter: false })
await assert.rejects(A.setEmail('no-es-un-correo', false), /invalid/)

// Setting it sends a link; it's pending until opened.
assert.deepEqual(await A.setEmail(` ${address.toUpperCase()} `, true), {
  address,
  verified: false,
  newsletter: true
})
const mail = await lastMail(address)
assert.equal(mail.subject, 'Confirma tu correo de Palique')
const link = mail.text.match(/http:\/\/localhost:8080\/verificar\?t=\S+/)?.[0]
assert.ok(link, 'verification link in the email')

// A resend is allowed only after a minute.
await assert.rejects(A.resendVerification(), /wait/)

// Someone else pretending to be the account service is ignored.
const B = client({
  service: 'xmpp://localhost:5222',
  domain: 'localhost',
  username: b,
  password: pass
})
B.on('error', () => {})
await B.start()
await B.send(
  xml(
    'message',
    { to: `${a}@localhost` },
    xml('email', { xmlns: 'urn:palique:cuentas:0', address: 'falso@x.test', verified: 'true' })
  )
)
await B.stop()
await new Promise((r) => setTimeout(r, 500))
assert.equal(pushes.length, 0, 'forged status ignored')

// Opening the link verifies it and the app hears about it right away.
const page = await fetch(link)
assert.equal(page.status, 200)
assert.match(await page.text(), /Correo confirmado/)
const deadline = Date.now() + 5000
while (!pushes.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
assert.deepEqual(pushes, [{ address, verified: true, newsletter: true }])
assert.equal((await A.emailStatus()).verified, true)
assert.equal((await fetch(link)).status, 404, 'links work once')

// Changing the address needs verifying again.
assert.equal((await A.setEmail(`otro.${address}`, false)).verified, false)

await A.logout()
console.log('email check passed')
process.exit(0)
