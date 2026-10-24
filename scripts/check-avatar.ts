// Avatar check against the local Prosody (`docker compose up -d` first).
// "A" uses the app's xmpp module; "B" is a plain client. Run: npm run check:avatar
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import tls from 'node:tls'
import { client, xml } from '@xmpp/client'
import type { Element } from '@xmpp/xml'
import * as A from '../src/main/xmpp.ts'
import { register } from './invite.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const id = Date.now()
const pass = 'Check-pass1'
const at = (user: string): string => `${user}@localhost`
const PUBSUB = 'http://jabber.org/protocol/pubsub'
// 1×1 PNGs (red and blue).
const red = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const blue = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

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

const accounts: string[] = []
for (const name of ['ava', 'avb']) {
  accounts.push(await register(`${name}${id}`, pass))
  await A.logout()
}
const [a, b] = accounts

const B = client({
  service: 'xmpp://localhost:5222',
  domain: 'localhost',
  username: b,
  password: pass
})
const photos: string[] = []
B.on('error', () => {})
B.on('stanza', (s) => {
  if (s.is('presence') && s.attrs.type === 'subscribe') {
    B.send(xml('presence', { to: s.attrs.from, type: 'subscribed' }))
    B.send(xml('presence', { to: s.attrs.from, type: 'subscribe' }))
  }
  const photo = s.getChild('x', 'vcard-temp:x:update')?.getChildText('photo')
  if (s.is('presence') && photo) photos.push(photo)
})
await B.start()
await B.iqCaller.request(xml('iq', { type: 'get' }, xml('query', { xmlns: 'jabber:iq:roster' })))
await B.send(xml('presence'))

// B publishes an avatar (optionally lying about it) and re-announces presence.
async function publishB(
  bytes: Buffer,
  type = 'image/png',
  claimedBytes = bytes.length
): Promise<void> {
  const hash = createHash('sha1').update(bytes).digest('hex')
  const publish = (node: string, payload: Element): Promise<Element> =>
    B.iqCaller.request(
      xml(
        'iq',
        { type: 'set' },
        xml(
          'pubsub',
          { xmlns: PUBSUB },
          xml('publish', { node }, xml('item', { id: hash }, payload))
        )
      )
    )
  await publish(
    'urn:xmpp:avatar:data',
    xml('data', { xmlns: 'urn:xmpp:avatar:data' }, bytes.toString('base64'))
  )
  await publish(
    'urn:xmpp:avatar:metadata',
    xml(
      'metadata',
      { xmlns: 'urn:xmpp:avatar:metadata' },
      xml('info', { id: hash, bytes: String(claimedBytes), type })
    )
  )
  await B.send(xml('presence'))
}

const contact = (): A.Contact | undefined => A.snapshot().contacts.find((c) => c.jid === at(b))

assert.equal((await A.login(a, pass)).ok, true)
await A.addContact(`${b}@localhost`)
await until(() => contact()?.subscription === 'both', 'mutual')
assert.equal(contact()?.avatar, '', 'no avatar yet')

// B's avatar reaches A, and changes are picked up.
await publishB(red)
await until(() => contact()?.avatar === `data:image/png;base64,${red.toString('base64')}`, 'red')
await publishB(blue)
await until(() => contact()?.avatar === `data:image/png;base64,${blue.toString('base64')}`, 'blue')

// Unsafe ones are ignored: not an image, or too big.
await publishB(red, 'text/html')
await new Promise((r) => setTimeout(r, 800))
assert.ok(contact()?.avatar.includes(blue.toString('base64')), 'text/html ignored')
await publishB(red, 'image/png', A.AVATAR_MAX_BYTES + 1)
await new Promise((r) => setTimeout(r, 800))
assert.ok(contact()?.avatar.includes(blue.toString('base64')), 'oversized ignored')

// A publishes: B sees the new hash in presence and can download it.
await A.setAvatar(red)
const redHash = createHash('sha1').update(red).digest('hex')
await until(() => photos.includes(redHash), 'B sees hash')
const res = await B.iqCaller.request(
  xml(
    'iq',
    { type: 'get', to: at(a) },
    xml(
      'pubsub',
      { xmlns: PUBSUB },
      xml('items', { node: 'urn:xmpp:avatar:data' }, xml('item', { id: redHash }))
    )
  )
)
assert.equal(
  res.getChild('pubsub')?.getChild('items')?.getChild('item')?.getChildText('data'),
  red.toString('base64')
)
assert.equal(A.snapshot().avatar, `data:image/png;base64,${red.toString('base64')}`)

// After signing in again, A gets its own avatar back.
await A.logout()
assert.equal(A.snapshot().avatar, '')
await A.login(a, pass)
await until(() => A.snapshot().avatar.includes(red.toString('base64')), 'own avatar after login')

await B.stop()
await A.logout()
console.log('avatar check passed')
process.exit(0)
