// Invites (by email only): Prosody + account service + Mailpit (`docker compose up -d`).
// Run: npm run check:invites
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import * as A from '../src/main/xmpp.ts'
import { inviteCode, register, signUp } from './invite.ts'
import { lastMail, mailCount } from './mailpit.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const pass = 'check-password'
const mail = (name: string): string => `${name}@correo.test`
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function until<T>(get: () => T | undefined | false, label: string): Promise<T> {
  const deadline = Date.now() + 5000
  for (;;) {
    const value = get()
    if (value) return value
    assert.ok(Date.now() < deadline, `timeout: ${label}`)
    await sleep(50)
  }
}

// Plain in-band registration without any invite is refused by the server.
const noInvite = client({
  service: 'xmpp://localhost:5222',
  domain: 'localhost',
  credentials: async (_auth, _mechs, _f, conn) => {
    const res = await conn.sendReceive(
      xml(
        'iq',
        { type: 'set', id: 'r' },
        xml(
          'query',
          { xmlns: 'jabber:iq:register' },
          xml('username', {}, `nobody${id}`),
          xml('password', {}, pass)
        )
      )
    )
    assert.equal(res.attrs.type, 'error', 'registration without invite must fail')
    throw new Error('done')
  }
})
noInvite.on('error', () => {})
await noInvite.start().catch(() => {})
await noInvite.stop().catch(() => {})

// A wrong code is rejected before anything is created.
assert.deepEqual(await A.login(`nobody${id}`, pass, { invite: 'nope' }), {
  ok: false,
  error: 'invalid-invite'
})

const [aName, memberName, newbieName] = ['inva', 'invm', 'invn'].map((n) => `${n}${id}`)
const member = await register(memberName, pass)
await A.logout()
const a = await register(aName, pass)
assert.deepEqual(await A.inviteStatus(), { max: 3, used: 0 })

// New address: an invite email with a working code, costing one invite.
assert.deepEqual(await A.inviteByEmail(` ${mail(newbieName).toUpperCase()} `), { max: 3, used: 1 })
const invite = await lastMail(mail(newbieName))
assert.equal(invite.subject, `${aName} quiere agregarte en Palique`)
const code = inviteCode(invite.text)
const optout = invite.text.match(/http:\/\/localhost:8080\/no-invitaciones\?t=\S+/)?.[0]
assert.ok(optout, 'opt-out link in the email')

// Same address again this week: nothing goes out and no invite is used.
assert.deepEqual(await A.inviteByEmail(mail(newbieName)), { max: 3, used: 1 })
await sleep(500)
assert.equal(await mailCount(mail(newbieName)), 1)

// An address that already has an account: add them instead.
await assert.rejects(A.inviteByEmail(mail(memberName)), /registered/)
await assert.rejects(A.inviteByEmail('nada'), /invalid/)

// Opting out works (and the link only means something once known).
assert.equal((await fetch(optout)).status, 200)
assert.equal((await fetch('http://localhost:8080/no-invitaciones?t=inventado')).status, 404)

// The emailed code creates the account; inviter and newbie become contacts, by name.
await A.logout()
const newbie = await signUp(code, pass, 'Novata')
await until(
  () =>
    A.snapshot().contacts.find(
      (c) => c.jid === `${a}@localhost` && c.subscription === 'both' && c.name === aName
    ),
  'newbie has the inviter as contact'
)
await A.logout()
await A.login(a, pass)
await until(
  () =>
    A.snapshot().contacts.find(
      (c) => c.jid === `${newbie}@localhost` && c.subscription === 'both' && c.name === 'Novata'
    ),
  'inviter has the newbie as contact'
)

// A used invite can't create a second account.
await A.logout()
assert.deepEqual(await A.login(`other${id}`, pass, { invite: code }), {
  ok: false,
  error: 'invalid-invite'
})

// Three per person. At the limit, the answer is "limit" even for a registered address.
await A.login(a, pass)
await A.inviteByEmail(mail(`invx${id}`))
assert.deepEqual(await A.inviteByEmail(mail(`invy${id}`)), { max: 3, used: 3 })
await assert.rejects(A.inviteByEmail(mail(`invz${id}`)), /limit/)
await assert.rejects(A.inviteByEmail(mail(memberName)), /limit/)
assert.ok(member)

await A.logout()
console.log('invites check passed')
process.exit(0)
