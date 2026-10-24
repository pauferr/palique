// Newsletter choice, stored by the account service (Prosody + account service + Mailpit,
// `docker compose up -d`). Run: npm run check:newsletter
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import * as A from '../src/main/xmpp.ts'
import { register } from './invite.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const user = `news${Date.now()}`

// The account comes with its (invited) address; the newsletter is off until chosen.
await register(user, 'Check-pass1')
assert.equal((await A.emailStatus()).newsletter, false)

assert.equal((await A.setNewsletter(true)).newsletter, true)
assert.equal((await A.emailStatus()).newsletter, true)
assert.equal((await A.setNewsletter(false)).newsletter, false)

await A.logout()
console.log('newsletter check passed')
process.exit(0)
