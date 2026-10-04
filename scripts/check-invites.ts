// Invite check against the local Prosody (`docker compose up -d` first).
// Run: npm run check:invites
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import * as A from '../src/main/xmpp.ts'
import { adminInvite } from './invite.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const [a, friend, other] = ['inva', 'invf', 'invo'].map((n) => `${n}${id}`)
const pass = 'check-password'
const at = (user: string): string => `${user}@localhost`

function until<T>(get: () => T | undefined | false, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = setInterval(() => {
      const value = get()
      if (value) {
        clearInterval(poll)
        resolve(value)
      } else if (Date.now() - started > 5000) {
        clearInterval(poll)
        reject(new Error(`timeout: ${label}`))
      }
    }, 50)
  })
}

// Plain in-band registration without any invite is refused by the server.
const noInvite = client({
  service: 'xmpp://localhost:5222',
  domain: 'localhost',
  credentials: async (auth, mechs, _f, conn) => {
    const res = await conn.sendReceive(
      xml(
        'iq',
        { type: 'set', id: 'r' },
        xml(
          'query',
          { xmlns: 'jabber:iq:register' },
          xml('username', {}, other),
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
assert.deepEqual(await A.login(other, pass, { invite: 'nope' }), {
  ok: false,
  error: 'invalid-invite'
})

// A user can create up to 5 invites, then gets "limit".
assert.equal((await A.login(a, pass, { invite: adminInvite() })).ok, true)
const created: A.Invite[] = []
for (let i = 0; i < 5; i++) created.push(await A.createInvite())
await assert.rejects(A.createInvite(), /limit/)
const listed = await A.listInvites()
assert.equal(listed.max, 5)
assert.deepEqual(new Set(listed.invites.map((i) => i.token)), new Set(created.map((i) => i.token)))
assert.ok(
  Date.parse(listed.invites[0].expires) > Date.now() + 6 * 86400_000,
  'expires in about a week'
)

// A friend joins with one (the whole link works too) and both become contacts.
const link = `xmpp:${at(a)}?roster;preauth=${created[0].token};ibr=y`
await A.logout()
assert.deepEqual(await A.login(friend, pass, { invite: link }), { ok: true, jid: at(friend) })
await until(
  () => A.snapshot().contacts.find((c) => c.jid === at(a) && c.subscription === 'both'),
  'friend has inviter'
)
await A.logout()
await A.login(a, pass)
await until(
  () => A.snapshot().contacts.find((c) => c.jid === at(friend) && c.subscription === 'both'),
  'inviter has friend'
)
assert.equal((await A.listInvites()).invites.length, 4, 'the used invite is gone, freeing a slot')
await A.createInvite()

// A used invite can't create a second account.
await A.logout()
assert.deepEqual(await A.login(other, pass, { invite: created[0].token }), {
  ok: false,
  error: 'invalid-invite'
})

console.log('invites check passed')
process.exit(0)
