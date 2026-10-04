// Local history check (no server needed). Run: npm run check:history
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openHistory } from '../src/main/history.ts'

const file = join(mkdtempSync(join(tmpdir(), 'palique-')), 'history.sqlite')
const msg = (
  id: string,
  at: number,
  extra = {}
): Parameters<ReturnType<typeof openHistory>['save']>[1] => ({
  id,
  with: 'lolo@localhost',
  mine: false,
  body: `mensaje ${id}`,
  buzz: false,
  at,
  ...extra
})

let history = openHistory(file)
history.save('tere@localhost', msg('1', 1000))
history.save('tere@localhost', msg('2', 2000, { mine: true }))
history.save('tere@localhost', msg('3', 3000, { buzz: true, body: '' }))
history.save('tere@localhost', msg('2', 2000, { mine: true })) // duplicate: ignored
history.save('fina@localhost', msg('9', 1500)) // another account on this computer

// Survives reopening (app restart).
history = openHistory(file)
const loaded = history.load('tere@localhost', 'lolo@localhost')
assert.deepEqual(
  loaded.map((m) => [m.id, m.mine, m.buzz]),
  [
    ['1', false, false],
    ['2', true, false],
    ['3', false, true]
  ]
)
assert.deepEqual(loaded[0], msg('1', 1000))
assert.deepEqual(
  history.load('fina@localhost', 'lolo@localhost').map((m) => m.id),
  ['9']
)
assert.deepEqual(history.load('tere@localhost', 'nadie@localhost'), [])

// Only the latest 200, oldest first.
for (let i = 0; i < 250; i++) history.save('tere@localhost', msg(`bulk${i}`, 10_000 + i))
const latest = history.load('tere@localhost', 'lolo@localhost')
assert.equal(latest.length, 200)
assert.equal(latest[0].id, 'bulk50')
assert.equal(latest.at(-1)?.id, 'bulk249')

console.log('history check passed')
