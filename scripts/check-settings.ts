// Settings check (no server needed). Run: npm run check:settings
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSettings, validPatch } from '../src/main/settings.ts'

const dir = mkdtempSync(join(tmpdir(), 'palique-'))
const file = join(dir, 'settings.json')

const defaults = {
  language: 'auto',
  theme: 'light',
  font: 'theme',
  winks: true,
  show: 'online',
  status: '',
  email: '',
  away: 10,
  startup: false,
  autoLogin: false,
  alertOnline: true,
  alertMessages: true,
  sounds: true,
  soundPack: 'classic',
  emoticons: true,
  shake: true,
  typing: true
}
assert.deepEqual(openSettings(file).get(), defaults, 'defaults on first run')
openSettings(file).set({ winks: false })
openSettings(file).set({ show: 'invisible', status: 'De vacaciones' })
assert.deepEqual(
  openSettings(file).get(),
  { ...defaults, winks: false, show: 'invisible', status: 'De vacaciones' },
  'persists across restarts'
)

writeFileSync(file, '{ broken')
assert.deepEqual(openSettings(file).get(), defaults, 'corrupt file falls back to defaults')

writeFileSync(file, JSON.stringify({ theme: 'xp', font: 'wingdings', winks: false }))
assert.deepEqual(
  openSettings(file).get(),
  { ...defaults, winks: false },
  'a theme or font that no longer exists falls back to the default'
)

// The Options window can only change known keys, with valid values.
assert.deepEqual(
  validPatch({
    sounds: false,
    theme: 'warm',
    font: 'comic',
    away: 15,
    soundPack: 'bubble',
    language: 'en'
  }),
  {
    language: 'en',
    font: 'comic',
    sounds: false,
    soundPack: 'bubble',
    theme: 'warm',
    away: 15
  }
)
assert.deepEqual(
  validPatch({
    sounds: 'no',
    soundPack: 'neon',
    language: 'fr',
    font: 'wingdings',
    theme: 'neon',
    away: 7,
    email: 'x@y.z',
    show: 'dnd'
  }),
  {},
  'wrong types, unknown values and other keys are dropped'
)
assert.deepEqual(validPatch(null), {})

assert.deepEqual(validPatch({ theme: 'dark' }), { theme: 'dark' }, 'the dark theme')
console.log('settings check passed')
