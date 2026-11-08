// Which messages are GIFs (no server needed). Run: npm run check:gif
import assert from 'node:assert/strict'
import { ByteCache } from '../src/main/bytecache.ts'
import { gifSrc, isGifUrl } from '../src/renderer/src/gif.ts'

// Real Klipy links.
assert.ok(isGifUrl('https://static.klipy.com/ii/abc/de/fg.webp'))
assert.ok(isGifUrl('https://static.klipy.com/ii/4e7bea9f7a3371424e6c16ebc93252fe/8a/27/x_Ab-9.gif'))

// Anything else is text.
for (const text of [
  'https://evil.example/ii/a.webp', // another domain
  'https://static.klipy.com.evil.example/a.webp',
  'https://evil.example/https://static.klipy.com/a.webp',
  'http://static.klipy.com/ii/a.webp', // not https
  'https://static.klipy.com/ii/a.webp?x=1', // query
  'https://static.klipy.com/ii/a.webp#x', // fragment
  'https://static.klipy.com/ii/a b.webp', // spaces
  'https://static.klipy.com/ii/a.webp ',
  ' https://static.klipy.com/ii/a.webp',
  'mira https://static.klipy.com/ii/a.webp', // text around it
  'https://static.klipy.com/ii/a.webp\nhola',
  'https://static.klipy.com/ii/a.webp\n', // trailing newline
  'https://static.klipy.com@evil.com/a.webp',
  'https://static.klipy.com/ii\\a.webp', // backslash
  'https://static.klipy.ｃom/a.webp', // full-width letter in the host
  'https://static.klipy.com/ii/../a.webp', // ..
  'https://static.klipy.com/..',
  'https://static.klipy.com/ii/%2e%2e/a.webp', // escapes
  'https://user@static.klipy.com/a.webp',
  'https://static.klipy.com:8443/a.webp',
  'https://static.klipy.com/',
  'https://STATIC.KLIPY.COM/a.webp',
  '',
  'https://static.klipy.com/' + 'a'.repeat(300) // over 300 characters
]) {
  assert.equal(isGifUrl(text), false, text)
}
// Exactly 300 is fine.
const longest = 'https://static.klipy.com/' + 'a'.repeat(300 - 25)
assert.equal(longest.length, 300)
assert.ok(isGifUrl(longest))

// What the renderer loads: our protocol, same path.
assert.equal(
  gifSrc('https://static.klipy.com/ii/abc/de/fg.webp'),
  'palique-gif://static.klipy.com/ii/abc/de/fg.webp'
)

// The image cache: bytes counted right when replacing, oldest out first, use refreshes.
const entry = (n: number): { type: string; body: Uint8Array } => ({
  type: 'image/webp',
  body: new Uint8Array(n)
})
const cache = new ByteCache(10)
cache.set('a', entry(4))
cache.set('a', entry(4)) // the same GIF again: replaced, not counted twice
assert.equal(cache.bytes, 4)
cache.set('b', entry(4))
assert.ok(cache.get('a')) // a used: b is now the oldest
cache.set('c', entry(4))
assert.equal(cache.bytes, 8)
assert.equal(cache.get('b'), undefined)
assert.ok(cache.get('a') && cache.get('c'))
cache.set('big', entry(11)) // bigger than the whole cache: doesn't stay
assert.equal(cache.bytes, 0)

console.log('check:gif ok')
