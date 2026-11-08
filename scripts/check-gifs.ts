// GIF search through the account service (`gifs` iq), against a fake Klipy on this machine.
// Needs the development stack (`docker compose up -d`); restarts the account service with a
// test key and puts it back as it was at the end. Run: npm run check:gifs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import tls from 'node:tls'
import { xml } from '@xmpp/client'
import * as A from '../src/main/xmpp.ts'
import { register } from './invite.ts'

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(new URL('../server/certs/localhost.crt', import.meta.url), 'utf8')
])

const NS = 'urn:palique:accounts:0'
const KEY = 'test-key-123'
const cwd = fileURLToPath(new URL('..', import.meta.url))

// Recorded shape of Klipy's answer, plus a GIF from another domain and one without `sm`.
const file = (name: string, size: string, w: number, h: number): Record<string, unknown> => ({
  webp: { url: `https://static.klipy.com/ii/${name}/${size}.webp`, width: w, height: h, size: 1 },
  gif: { url: `https://static.klipy.com/ii/${name}/${size}.gif`, width: w, height: h, size: 1 }
})
const item = (id: number, name: string): Record<string, unknown> => ({
  id,
  slug: name,
  title: `Gif ${name}`,
  file: {
    hd: file(name, 'hd', 400, 300),
    md: file(name, 'md', 200, 150),
    sm: file(name, 'sm', 100, 75)
  }
})
const evil = item(3, 'evil')
;(evil.file as Record<string, Record<string, { url: string }>>).md.webp.url =
  'https://evil.example/x.webp'
const incomplete = item(4, 'incomplete')
delete (incomplete.file as Record<string, unknown>).sm
const badSize = item(5, 'badsize')
;(badSize.file as Record<string, Record<string, { width: number }>>).sm.webp.width = 0
const fraction = item(6, 'fraction')
;(fraction.file as Record<string, Record<string, { height: number }>>).sm.webp.height = 1e308
const dirty = item(7, 'dirty')
dirty.title = 'a\u0000b' + 'x'.repeat(97) + '😀tail'
const recorded = {
  result: true,
  data: {
    data: [item(1, 'one'), evil, incomplete, badSize, fraction, dirty, item(2, 'two')],
    current_page: 1,
    per_page: 24,
    has_next: true
  }
}

const seen: URL[] = []
let broken = false
let redirect = false
let leaked = false
const target = createServer((_req, res) => {
  leaked = true
  res.end('{}')
})
await new Promise<void>((r) => target.listen(0, '0.0.0.0', r))
const targetPort = (target.address() as AddressInfo).port
const fake = createServer((req, res) => {
  if (redirect) {
    res.writeHead(302, { location: `http://host.docker.internal:${targetPort}/x` })
    return void res.end()
  }
  seen.push(new URL(req.url!, 'http://fake'))
  res.writeHead(broken ? 500 : 200, { 'content-type': 'application/json' })
  res.end(broken ? '{}' : JSON.stringify(recorded))
})
await new Promise<void>((r) => fake.listen(0, '0.0.0.0', r))
const port = (fake.address() as AddressInfo).port

// The account service is rebuilt with these variables (compose's own interpolation).
function restart(vars: Record<string, string>): void {
  execFileSync('docker', ['compose', 'up', '-d', '--build', 'accounts'], {
    cwd,
    env: { ...process.env, ...vars },
    stdio: 'ignore'
  })
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function disco(): Promise<string[]> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await A.request(
        xml(
          'iq',
          { type: 'get', to: A.ACCOUNTS_JID },
          xml('query', { xmlns: 'http://jabber.org/protocol/disco#info' })
        )
      )
      return res
        .getChild('query')!
        .getChildren('feature')
        .map((f) => f.attrs.var as string)
    } catch {
      await sleep(500) // the component is still coming online
    }
  }
  throw new Error('account service did not come back')
}

const gifs = (q = '', page = '1', locale = 'es'): Promise<ReturnType<typeof xml>> =>
  A.request(
    xml('iq', { type: 'get', to: A.ACCOUNTS_JID }, xml('gifs', { xmlns: NS, q, page, locale }))
  )
const failure = async (q = ''): Promise<string | undefined> => {
  try {
    await gifs(q)
  } catch (e) {
    return A.errorCondition(e)
  }
}

try {
  const name = `gifs${Date.now()}`
  await register(name, 'Check-pass1')
  const jid = A.ownJid().split('/')[0]

  restart({ KLIPY_API_KEY: KEY, KLIPY_BASE_URL: `http://host.docker.internal:${port}/api/v1` })
  assert.ok((await disco()).includes(`${NS}#gifs`), 'disco announces gifs')

  // Trending: valid GIFs with every field; the foreign and the incomplete one are dropped.
  const res = (await gifs('', '1', 'en')).getChild('gifs', NS)!
  assert.equal(res.attrs.more, 'true')
  const list = res.getChildren('gif').map((g) => g.attrs)
  // Bad sizes, foreign links and missing sizes are dropped; the dirty title comes back clean.
  const dirtyGif = list.find((g) => g.id === '7')!
  assert.equal(dirtyGif.title, 'ab' + 'x'.repeat(97) + '😀')
  assert.deepEqual(
    list.filter((g) => g.id !== '7'),
    [
      {
        id: '1',
        title: 'Gif one',
        preview: 'https://static.klipy.com/ii/one/sm.webp',
        url: 'https://static.klipy.com/ii/one/md.webp',
        width: '100',
        height: '75'
      },
      {
        id: '2',
        title: 'Gif two',
        preview: 'https://static.klipy.com/ii/two/sm.webp',
        url: 'https://static.klipy.com/ii/two/md.webp',
        width: '100',
        height: '75'
      }
    ]
  )
  // The app's side: numbers as numbers, only Klipy links.
  const app = await A.searchGifs('', 1, 'en')
  assert.equal(app.more, true)
  assert.deepEqual(
    app.gifs.map((g) => [g.id, g.width, g.height]),
    [
      ['1', 100, 75],
      ['7', 100, 75],
      ['2', 100, 75]
    ]
  )
  const trending = seen.at(-1)!
  assert.equal(trending.pathname, `/api/v1/${KEY}/gifs/trending`)
  assert.equal(trending.searchParams.get('locale'), 'en')
  assert.equal(trending.searchParams.get('per_page'), '24')

  // Anonymous but stable id: an HMAC of the JID, not the JID.
  const customer = trending.searchParams.get('customer_id')!
  assert.match(customer, /^[0-9a-f]{64}$/)
  assert.equal(customer, createHmac('sha256', 'dev-only-accounts-secret').update(jid).digest('hex'))
  assert.notEqual(customer, jid)
  await gifs()
  assert.equal(seen.at(-1)!.searchParams.get('customer_id'), customer)

  // Search goes to /search with the words.
  await gifs('jaja', '2')
  const search = seen.at(-1)!
  assert.equal(search.pathname, `/api/v1/${KEY}/gifs/search`)
  assert.equal(search.searchParams.get('q'), 'jaja')
  assert.equal(search.searchParams.get('page'), '2')

  // Klipy down.
  broken = true
  assert.equal(await failure(), 'service-unavailable')
  broken = false

  // A redirect is an error, and the key never goes to the other host.
  redirect = true
  assert.equal(await failure(), 'service-unavailable')
  redirect = false
  assert.equal(leaked, false, 'the redirect target got no request')

  // 60 requests a minute per user: the 61st is refused (restart cleared the count).
  const used = seen.length + 1 // every request so far reached the fake, but the redirected one
  for (let i = used; i < 60; i++) await gifs()
  assert.equal(await failure(), 'resource-constraint')

  // No key, no feature.
  restart({ KLIPY_API_KEY: '' })
  assert.ok(!(await disco()).includes(`${NS}#gifs`), 'disco does not announce gifs')
  assert.equal(await failure(), 'feature-not-implemented')
  console.log('gifs check passed')
} finally {
  fake.close()
  target.close()
  restart({}) // as it was: no test variables
  await disco() // wait for the component to be back, for the next check
}
await A.logout()
process.exit(0)
