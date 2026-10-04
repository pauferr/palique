// Settings check (no server needed). Run: npm run check:settings
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSettings } from '../src/main/settings.ts'

const dir = mkdtempSync(join(tmpdir(), 'palique-'))
const file = join(dir, 'settings.json')

assert.deepEqual(openSettings(file).get(), { winks: true, show: 'online' }, 'defaults on first run')
openSettings(file).set({ winks: false })
openSettings(file).set({ show: 'invisible' })
assert.deepEqual(
  openSettings(file).get(),
  { winks: false, show: 'invisible' },
  'persists across restarts'
)

writeFileSync(file, '{ broken')
assert.deepEqual(
  openSettings(file).get(),
  { winks: true, show: 'online' },
  'corrupt file falls back to defaults'
)

console.log('settings check passed')
