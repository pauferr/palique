// Settings check (no server needed). Run: npm run check:settings
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSettings, validPatch } from '../src/main/settings.ts'

const dir = mkdtempSync(join(tmpdir(), 'palique-'))
const file = join(dir, 'settings.json')

const defaults = {
  theme: 'xp',
  winks: true,
  show: 'online',
  email: '',
  away: 10,
  startup: false,
  autoLogin: false,
  alertOnline: true,
  alertMessages: true,
  sounds: true,
  emoticons: true,
  shake: true,
  typing: true
}
assert.deepEqual(openSettings(file).get(), defaults, 'defaults on first run')
openSettings(file).set({ winks: false })
openSettings(file).set({ show: 'invisible' })
assert.deepEqual(
  openSettings(file).get(),
  { ...defaults, winks: false, show: 'invisible' },
  'persists across restarts'
)

writeFileSync(file, '{ broken')
assert.deepEqual(openSettings(file).get(), defaults, 'corrupt file falls back to defaults')

// The Options window can only change known keys, with valid values.
assert.deepEqual(validPatch({ sounds: false, theme: 'aero', away: 15 }), {
  sounds: false,
  theme: 'aero',
  away: 15
})
assert.deepEqual(
  validPatch({ sounds: 'no', theme: 'neon', away: 7, email: 'x@y.z', show: 'dnd' }),
  {},
  'wrong types, unknown values and other keys are dropped'
)
assert.deepEqual(validPatch(null), {})

console.log('settings check passed')
