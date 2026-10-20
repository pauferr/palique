// Local history check (no server needed). Run: npm run check:history
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openHistory } from '../src/main/history.ts'
import { winkId } from '../src/main/xmpp.ts'

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
  wink: '',
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

// Winks are stored too.
history.save('tere@localhost', msg('w1', 99_999, { wink: 'bubble', body: '' }))
assert.equal(history.load('tere@localhost', 'lolo@localhost').at(-1)?.wink, 'bubble')

// A database from before winks existed gets the new column, keeping old messages.
const old = join(mkdtempSync(join(tmpdir(), 'palique-')), 'history.sqlite')
const legacy = new DatabaseSync(old)
legacy.exec(`CREATE TABLE messages (account TEXT NOT NULL, contact TEXT NOT NULL, id TEXT NOT NULL,
  mine INTEGER NOT NULL, body TEXT NOT NULL, buzz INTEGER NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (account, contact, id));
  INSERT INTO messages VALUES ('tere@localhost', 'lolo@localhost', 'old', 0, 'antiguo', 0, 1);`)
legacy.close()
const migrated = openHistory(old)
assert.deepEqual(migrated.load('tere@localhost', 'lolo@localhost'), [
  msg('old', 1, { body: 'antiguo' })
])
migrated.save('tere@localhost', msg('new', 2, { wink: 'wave', body: '' }))
assert.equal(openHistory(old).load('tere@localhost', 'lolo@localhost')[1].wink, 'wave')

// Winks saved with their old Spanish ids (up to 0.4) read as the English ones.
assert.equal(winkId('burbuja'), 'bubble')
assert.equal(winkId('in-love'), 'in-love')
assert.equal(winkId('constructor'), 'constructor', 'only real entries, not inherited ones')

console.log('history check passed')
