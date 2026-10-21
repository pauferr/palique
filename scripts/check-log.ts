// Error log check (no server needed). Run: npm run check:log
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLog } from '../src/main/log.ts'

const dir = mkdtempSync(join(tmpdir(), 'palique-'))
const file = join(dir, 'palique.log')
const log = openLog(file, 200)

log.write('info', 'started', { version: '0.0.0-dev' })
log.write('error', 'lookup failed:', new Error('boom'))
const text = readFileSync(file, 'utf8')
assert.match(text, /^\d{4}-\d\d-\d\dT[\d:.]+Z info started \{ version: '0\.0\.0-dev' \}\n/)
assert.match(text, /Z error lookup failed: Error: boom\n\s+at /, 'errors keep their stack')

// Past the limit: the current file becomes palique.old.log and a new one starts.
log.write('warn', 'after the limit')
assert.ok(existsSync(join(dir, 'palique.old.log')), 'rotated')
assert.match(readFileSync(join(dir, 'palique.old.log'), 'utf8'), /lookup failed/)
assert.match(readFileSync(file, 'utf8'), /^\S+ warn after the limit\n$/)

// Nothing personal: addresses, JIDs, link codes and the home folder are masked, and an
// error's extra fields (an XMPP error's stanza) are left out.
const privy = join(dir, 'privy.log')
const xmppError = Object.assign(new Error('item-not-found'), {
  condition: 'item-not-found',
  element: '<iq to="k3f9x2ab7q@palique.test"><lookup address="tere@correo.test"/></iq>'
})
openLog(privy).write(
  'error',
  'lookup failed:',
  xmppError,
  'tere@correo.test k3f9x2ab7q@palique.test/abc palique://reset?e=tere%40correo.test&t=SECRET',
  join(homedir(), 'palique', 'x.ts')
)
const written = readFileSync(privy, 'utf8')
for (const leak of ['tere', 'k3f9x2ab7q', 'SECRET', homedir()]) {
  assert.ok(!written.includes(leak), `leaked ${leak}: ${written}`)
}
assert.match(written, /Error: item-not-found\n[\s\S]* \[item-not-found\]/)
assert.match(written, /<dirección> <dirección> palique:\/\/reset\?e=…&t=… ~\/palique\/x\.ts\n$/)

// A log that can't be written doesn't throw.
openLog(join(dir, 'missing', 'palique.log')).write('error', 'nowhere')

console.log('log check passed')
