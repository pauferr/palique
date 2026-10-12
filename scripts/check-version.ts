// Next release version from the commits (no server needed). Run: npm run check:version
import assert from 'node:assert/strict'
import { latest, nextVersion } from './next-version.ts'

const next = (last: string | undefined, commits: string[], stage = 'alpha'): string =>
  nextVersion({ last, commits, stage })

// First release.
assert.equal(next(undefined, []), '0.3.0-alpha')
assert.equal(next(undefined, [], ''), '0.3.0')

// Anything that isn't a feature or breaking: patch. The old suffix doesn't matter.
assert.equal(next('v0.3.0-alpha', ['fix(chat): keep scroll', 'docs: typo']), '0.3.1-alpha')
assert.equal(next('v0.3.0-alpha', ['chore: tidy', 'Merge branch x']), '0.3.1-alpha')

// A feature: minor.
assert.equal(next('v0.3.1-alpha', ['fix: a', 'feat(auth): b']), '0.4.0-alpha')

// Breaking: minor while 0.x, major after.
assert.equal(next('v0.4.0-alpha', ['feat(xmpp)!: new winks']), '0.5.0-alpha')
assert.equal(next('v0.4.0-alpha', ['fix: x\n\nBREAKING CHANGE: old clients break']), '0.5.0-alpha')
assert.equal(next('v1.2.3', ['refactor!: drop api'], ''), '2.0.0')
assert.equal(next('v1.2.3', ['feat: b'], ''), '1.3.0')

// Going stable drops the suffix.
assert.equal(next('v0.9.2-alpha', ['fix: last bug'], ''), '0.9.3')

// "feat" must be the type, not just a word in the message.
assert.equal(next('v0.3.0', ['fix: feat flag ignored', 'docs: feat: notes'], ''), '0.3.1')

// Nothing new: no release.
assert.throws(() => next('v0.3.0-alpha', []), /no changes since v0.3.0-alpha/)

// Picking the last tag: by number, stable over pre-release, junk ignored.
assert.equal(latest(['v0.3.0-alpha', 'v0.10.0-alpha', 'v0.9.1']), 'v0.10.0-alpha')
assert.equal(latest(['v1.0.0', 'v1.0.0-beta']), 'v1.0.0')
assert.equal(latest(['v2026.10.12x', 'nope']), undefined)
assert.equal(latest([]), undefined)

console.log('version check passed')
