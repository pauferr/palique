// Newsletter: the Brevo client against a fake Brevo, then the account service end to end
// (Prosody + account service + Mailpit, `docker compose up -d`). Run: npm run check:newsletter
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import tls from 'node:tls'
import { brevo } from '../server/cuentas/src/brevo.ts'
import * as A from '../src/main/xmpp.ts'
import { adminInvite } from './invite.ts'
import { lastMail } from './mailpit.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

// --- Brevo client against a fake Brevo ------------------------------------------------

type Seen = { path: string; key: string; body: unknown }
const seen: Seen[] = []
let answer = 201
const fake = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    seen.push({ path: req.url ?? '', key: String(req.headers['api-key']), body: JSON.parse(body) })
    res.writeHead(answer)
    res.end('{}')
  })
})
await new Promise<void>((r) => fake.listen(0, r))
const baseUrl = `http://localhost:${(fake.address() as { port: number }).port}`

assert.equal(brevo({ listId: 7 }), undefined, 'no key: no sync')
assert.equal(brevo({ apiKey: 'k' }), undefined, 'no list: no sync')

const list = brevo({ apiKey: 'secret-key', listId: 7, baseUrl })!
await list.subscribe('tere@correo.test')
assert.deepEqual(seen.at(-1), {
  path: '/contacts',
  key: 'secret-key',
  body: { email: 'tere@correo.test', listIds: [7], updateEnabled: true, emailBlacklisted: false }
})
await list.unsubscribe('tere@correo.test')
assert.deepEqual(seen.at(-1), {
  path: '/contacts/lists/7/contacts/remove',
  key: 'secret-key',
  body: { emails: ['tere@correo.test'] }
})
answer = 400 // not on the list: fine
await list.unsubscribe('nadie@correo.test')
answer = 500
await assert.rejects(list.subscribe('tere@correo.test'), /brevo subscribe 500/)
await assert.rejects(list.unsubscribe('tere@correo.test'), /brevo unsubscribe 500/)
fake.close()

// --- account service ------------------------------------------------------------------

const user = `news${Date.now()}`
const address = `${user}@correo.test`
const pushes: A.EmailStatus[] = []
A.onEmail((e) => pushes.push(e))

assert.equal((await A.login(user, 'check-password', { invite: adminInvite() })).ok, true)
await assert.rejects(A.setNewsletter(true), /no-email/)

await A.setEmail(address, false)
const link = (await lastMail(address)).text.match(/http:\/\/localhost:8080\/verificar\?t=\S+/)![0]
assert.equal((await fetch(link)).status, 200)

assert.equal((await A.setNewsletter(true)).newsletter, true)
assert.equal((await A.emailStatus()).newsletter, true)
assert.equal((await A.setNewsletter(false)).newsletter, false)
await A.setNewsletter(true)

// Brevo's webhook: wrong token refused; an unsubscribe there turns it off here, live.
const webhook = (token: string, body: unknown): Promise<Response> =>
  fetch(`http://localhost:8080/brevo?token=${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
assert.equal((await webhook('wrong', { event: 'unsubscribed', email: address })).status, 403)
assert.equal((await A.emailStatus()).newsletter, true)
pushes.length = 0
assert.equal(
  (await webhook('dev-only-brevo-webhook-token', { event: 'unsubscribed', email: address })).status,
  200
)
const deadline = Date.now() + 5000
while (!pushes.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
assert.deepEqual(pushes.at(-1), { address, verified: true, newsletter: false })
assert.equal((await A.emailStatus()).newsletter, false)

// Other events (e.g. an open) change nothing.
await A.setNewsletter(true)
await webhook('dev-only-brevo-webhook-token', { event: 'opened', email: address })
assert.equal((await A.emailStatus()).newsletter, true)

await A.logout()
console.log('newsletter check passed')
process.exit(0)
