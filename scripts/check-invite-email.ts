// Invites by email: Prosody + account service + Mailpit (`docker compose up -d`).
// Run: npm run check:invite-email
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
const [a, member, newbie] = ['iema', 'iemm', 'iemn'].map((n) => `${n}${id}`)
const pass = 'check-password'
const mail = (user: string): string => `${user}@correo.test`
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Signs in, sets and verifies the user's email through the real link.
async function verifiedUser(user: string): Promise<void> {
  assert.equal((await A.login(user, pass, { invite: adminInvite() })).ok, true)
  await A.setEmail(mail(user), false)
  const link = (await lastMail(mail(user))).text.match(
    /http:\/\/localhost:8080\/verificar\?t=\S+/
  )![0]
  assert.equal((await fetch(link)).status, 200)
  await A.logout()
}
await verifiedUser(member)

assert.equal((await A.login(a, pass, { invite: adminInvite() })).ok, true)
const active = async (): Promise<number> => (await A.listInvites()).invites.length

// New address: an invite email with a working code, costing one invite.
await A.inviteByEmail(` ${mail(newbie).toUpperCase()} `)
const invite = await lastMail(mail(newbie))
assert.equal(invite.subject, `${a} te invita a Palique`)
const code = invite.text.match(/código de invitación: (\S+)/)?.[1]
assert.ok(code, 'code in the email')
const optout = invite.text.match(/http:\/\/localhost:8080\/no-invitaciones\?t=\S+/)?.[0]
assert.ok(optout, 'opt-out link in the email')
assert.equal(await active(), 1)

// Same address again this week: "sent", but nothing goes out and no invite is used.
await A.inviteByEmail(mail(newbie))
await sleep(500)
assert.equal(await mailCount(mail(newbie)), 1)
assert.equal(await active(), 1)

// An address that already has an account: same answer, no email, no invite used.
await A.inviteByEmail(mail(member))
await sleep(500)
assert.equal(await mailCount(mail(member)), 1, 'only their own verification email')
assert.equal(await active(), 1)

await assert.rejects(A.inviteByEmail('nada'), /invalid/)

// Opting out works (and the link only means something once known).
assert.equal((await fetch(optout)).status, 200)
assert.equal((await fetch('http://localhost:8080/no-invitaciones?t=inventado')).status, 404)

// The emailed code creates the account, and inviter and newbie become contacts.
await A.logout()
assert.equal((await A.login(newbie, pass, { invite: code })).ok, true)
const deadline = Date.now() + 5000
while (
  !A.snapshot().contacts.some((c) => c.jid === `${a}@localhost` && c.subscription === 'both')
) {
  assert.ok(Date.now() < deadline, 'newbie has the inviter as contact')
  await sleep(50)
}
await A.logout()

// At the limit, the answer is "limit" even for a registered address: nothing leaks.
await A.login(a, pass)
while ((await active()) < 5) await A.createInvite()
await assert.rejects(A.inviteByEmail(mail(member)), /limit/)
await assert.rejects(A.inviteByEmail(`otra${id}@correo.test`), /limit/)

await A.logout()
console.log('invite-email check passed')
process.exit(0)
