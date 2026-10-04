// Rate limit check (no server needed). Run: npm run check:cooldown
import assert from 'node:assert/strict'
import { cooldown } from '../src/main/cooldown.ts'

const buzz = cooldown(10_000)
assert.equal(buzz.take('lolo', 0), 0, 'first one goes through')
assert.equal(buzz.take('lolo', 4_000), 6_000, 'too soon: ms left')
assert.equal(buzz.take('lolo', 9_999), 1, 'still too soon')
assert.equal(buzz.take('chusa', 5_000), 0, 'each contact has its own limit')
assert.equal(buzz.take('lolo', 10_000), 0, 'allowed again after the interval')
assert.equal(buzz.take('lolo', 12_000), 8_000, 'a refused try does not restart the interval')

console.log('cooldown check passed')
