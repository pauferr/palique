// Changing the account's email: Prosody + account service + Mailpit (`docker compose up -d`).
// Run: npm run check:email
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import * as A from '../src/main/xmpp.ts'
import { register } from './invite.ts'
import { lastMail, mailCount } from './mailpit.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const [aName, bName] = [`maila${id}`, `mailb${id}`]
const pass = 'check-password'
const email = `${aName}@correo.test`
const newEmail = `nuevo.${aName}@correo.test`
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const pushes: A.EmailStatus[] = []
A.onEmail((e) => pushes.push(e))

const b = await register(bName, pass)
await A.logout()
const a = await register(aName, pass)

// Every account starts with the invited address (verified: the invite reached it).
assert.deepEqual(await A.emailStatus(), { address: email, pending: '', newsletter: false })
await assert.rejects(A.changeEmail('no-es-un-correo'), /invalid/)

// Changing it sends a link to the new address; until then, the old one still signs in.
assert.deepEqual(await A.changeEmail(` ${newEmail.toUpperCase()} `), {
  address: email,
  pending: newEmail,
  newsletter: false
})
const mail = await lastMail(newEmail)
assert.equal(mail.subject, 'Confirma tu nuevo correo de Palique')
const link = mail.text.match(/http:\/\/localhost:8080\/verificar\?t=\S+/)?.[0]
assert.ok(link, 'verification link in the email')
assert.equal(await A.accountFor(email), a)
assert.notEqual(await A.accountFor(newEmail), a)

// A resend is allowed only after a minute.
await assert.rejects(A.resendVerification(), /wait/)

// Someone else's address: same answer, nothing changes, and nothing is sent.
const before = await mailCount(`${bName}@correo.test`)
assert.deepEqual(await A.changeEmail(`${bName}@correo.test`), {
  address: email,
  pending: newEmail,
  newsletter: false
})
await new Promise((r) => setTimeout(r, 1000))
assert.equal(await mailCount(`${bName}@correo.test`), before)
assert.equal(await A.accountFor(`${bName}@correo.test`), b)

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
    xml('email', { xmlns: 'urn:palique:cuentas:0', address: 'falso@x.test' })
  )
)
await B.stop()
await sleep(500)
assert.equal(pushes.length, 0, 'forged status ignored')

// Opening the link switches the address and the app hears about it right away.
const page = await fetch(link)
assert.equal(page.status, 200)
assert.match(await page.text(), /Correo cambiado/)
const deadline = Date.now() + 5000
while (!pushes.length && Date.now() < deadline) await sleep(50)
assert.deepEqual(pushes, [{ address: newEmail, pending: '', newsletter: false }])
assert.equal((await fetch(link)).status, 404, 'links work once')

// Same account (same JID, contacts and history), new address to sign in with; the old
// address is free again.
assert.equal(await A.accountFor(newEmail), a)
assert.notEqual(await A.accountFor(email), a)

await A.logout()
console.log('email check passed')
process.exit(0)
