// OMEMO keys, sessions and trust check (no server needed). Run: npm run check:omemo
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fingerprintOf, OmemoError, openOmemo, type Seal } from '../src/main/omemo.ts'

const dir = mkdtempSync(join(tmpdir(), 'palique-'))
// Test seal: reversing the bytes is enough to tell sealed from raw on disk.
const reverse = (data: Uint8Array): Uint8Array => Uint8Array.from(data).reverse()
const seal: Seal = { seal: reverse, open: reverse }
const open = (name: string, account: string): ReturnType<typeof openOmemo> =>
  openOmemo(join(dir, `${name}.sqlite`), account, seal)
const rejects = async (promise: Promise<unknown>, code: OmemoError['code']): Promise<void> => {
  await assert.rejects(promise, (e) => e instanceof OmemoError && e.code === code)
}

let alice = await open('alice', 'a@x')
const bob = await open('bob', 'b@x')
const toBob = { jid: 'b@x', deviceId: bob.deviceId }
const toAlice = { jid: 'a@x', deviceId: alice.deviceId }

// Session and first message, with a one-time key.
const first = await bob.bundle()
assert.equal(first.preKeys.length, 100)
await alice.startSession(toBob, first)
assert.ok(await alice.hasSession(toBob))
const m = await alice.encrypt('hola', [toBob])
assert.equal(m.sid, alice.deviceId)
assert.equal(m.iv.length, 12)
assert.equal(m.keys.length, 1)
assert.equal(m.keys[0].rid, bob.deviceId)
assert.equal(m.keys[0].prekey, true)
assert.equal(await bob.decrypt('a@x', m), 'hola')

// The reply needs no one-time key.
const reply = await bob.encrypt('qué tal', [toAlice])
assert.equal(reply.keys[0].prekey, false)
assert.equal(await alice.decrypt('b@x', reply), 'qué tal')

// A tampered payload.
const fromBob = await bob.encrypt('hola', [toAlice])
const payload = Uint8Array.from(fromBob.payload)
payload[0] ^= 1
await rejects(alice.decrypt('b@x', { ...fromBob, payload }), 'bad-message')

// A message is never decrypted twice.
await rejects(bob.decrypt('a@x', m), 'bad-message')

// The used one-time key doesn't come back.
const after = await bob.bundle()
assert.equal(after.preKeys.length, 99)
const gone = first.preKeys.filter((k) => !after.preKeys.some((p) => p.id === k.id))
assert.equal(gone.length, 1)

// A message without a key for this device.
await rejects(alice.decrypt('b@x', { ...m, keys: [] }), 'no-key')

// Refill: below 25 one-time keys it's due, and refill brings back 100.
assert.equal(bob.needsRefill(), false)
for (let i = 0; i < 75; i++) {
  await alice.startSession(toBob, await bob.bundle())
  assert.equal(await bob.decrypt('a@x', await alice.encrypt(`${i}`, [toBob])), `${i}`)
}
assert.equal((await bob.bundle()).preKeys.length, 24)
assert.equal(bob.needsRefill(), true)
await bob.refill()
const refilled = await bob.bundle()
assert.equal(refilled.preKeys.length, 100)
assert.equal(bob.needsRefill(), false)
assert.ok(!refilled.preKeys.some((k) => gone[0].id === k.id), 'used ids are never reused')

// New device: silent for a first contact, noticed for a known one.
const bob2 = await open('bob2', 'b@x')
const toBob2 = { jid: 'b@x', deviceId: bob2.deviceId }
assert.deepEqual(alice.seen('b@x', [bob.deviceId]), [])
assert.deepEqual(alice.seen('c@x', [123]), [], 'first contact')
assert.deepEqual(alice.seen('b@x', [bob.deviceId, bob2.deviceId]), [
  { jid: 'b@x', deviceId: bob2.deviceId, kind: 'new-device' }
])
assert.deepEqual(alice.seen('b@x', [bob.deviceId, bob2.deviceId]), [], 'only once')
await alice.startSession(toBob2, await bob2.bundle())
assert.deepEqual(alice.takeChanges(), [])

// Key change: same device id, another identity, not verified: replaced and noted.
const reinstalled = await open('bob-reinstalled', 'b@x')
await alice.startSession(toBob, { ...(await reinstalled.bundle()), deviceId: bob.deviceId })
assert.deepEqual(alice.takeChanges(), [{ jid: 'b@x', deviceId: bob.deviceId, kind: 'key-changed' }])
assert.deepEqual(alice.takeChanges(), [], 'taken')
const fresh = await alice.encrypt('otra vez', [toBob])
assert.equal(fresh.keys[0].prekey, true)
assert.equal(
  await reinstalled.decrypt('a@x', {
    ...fresh,
    keys: [{ ...fresh.keys[0], rid: reinstalled.deviceId }]
  }),
  'otra vez'
)

// Blocked: a verified device whose key changes is left out until accepted.
alice.setVerified(toBob2, true)
assert.equal(alice.devices('b@x').find((d) => d.deviceId === bob2.deviceId)?.verified, true)
const bob2b = await open('bob2-reinstalled', 'b@x')
const newBundle = { ...(await bob2b.bundle()), deviceId: bob2.deviceId }
await rejects(alice.startSession(toBob2, newBundle), 'blocked')
assert.deepEqual(alice.takeChanges(), [
  { jid: 'b@x', deviceId: bob2.deviceId, kind: 'key-changed' }
])
const skipped = await alice.encrypt('sin bob2', [toBob, toBob2])
assert.deepEqual(
  skipped.keys.map((k) => k.rid),
  [bob.deviceId]
)
const trust = alice.devices('b@x').find((d) => d.deviceId === bob2.deviceId)
assert.equal(trust?.blocked, true)
assert.equal(trust?.verified, false, 'the new key shows as not verified while blocked')
alice.acceptKey(toBob2)
const accepted = alice.devices('b@x').find((d) => d.deviceId === bob2.deviceId)
assert.equal(accepted?.blocked, false)
assert.equal(accepted?.verified, false, 'a new key is not verified')
// The old session goes with the old key: nothing is sent until there's a new one.
await rejects(alice.encrypt('aún no', [toBob2]), 'no-key')
await alice.startSession(toBob2, newBundle)
const both = await alice.encrypt('con bob2', [toBob, toBob2])
assert.deepEqual(both.keys.map((k) => k.rid).sort(), [bob.deviceId, bob2.deviceId].sort())
const forBob2 = both.keys.find((k) => k.rid === bob2.deviceId)!
assert.equal(
  await bob2b.decrypt('a@x', { ...both, keys: [{ ...forBob2, rid: bob2b.deviceId }] }),
  'con bob2'
)
assert.equal(
  alice.devices('b@x').find((d) => d.deviceId === bob2.deviceId)?.fingerprint,
  fingerprintOf(newBundle.identityKey),
  'the new key stays'
)
assert.deepEqual(alice.takeChanges(), [], 'no flip back to the old key')

// Persistence: same device id and sessions after a restart.
const deviceId = alice.deviceId
const fp = alice.fingerprint()
alice.close()
alice = await open('alice', 'a@x')
assert.equal(alice.deviceId, deviceId)
assert.equal(alice.fingerprint(), fp)
assert.ok(await alice.hasSession(toBob))
const later = await alice.encrypt('sigo aquí', [toBob2])
assert.equal(
  await bob2b.decrypt('a@x', { ...later, keys: [{ ...later.keys[0], rid: bob2b.deviceId }] }),
  'sigo aquí'
)

// At rest: the identity private key is only on disk sealed.
alice.close()
const db = new DatabaseSync(join(dir, 'alice.sqlite'))
const blob = (sql: string): Uint8Array => Object.values(db.prepare(sql).get()!)[0] as Uint8Array
const identityBlob = blob("SELECT keypair FROM identity WHERE account = 'a@x'")
const sealed = [
  identityBlob,
  blob("SELECT keypair FROM prekeys WHERE account = 'a@x' LIMIT 1"),
  blob("SELECT record FROM sessions WHERE account = 'a@x' LIMIT 1")
]
db.close()
for (const raw of sealed) assert.ok(!Buffer.from(raw).equals(seal.open(raw)), 'stored sealed')
assert.equal(seal.open(identityBlob)[0], 5, 'unsealed, it starts with the public key')
const privKey = Buffer.from(seal.open(identityBlob)).subarray(33)
assert.equal(privKey.length, 32)
assert.ok(!readFileSync(join(dir, 'alice.sqlite')).includes(privKey), 'private key on disk')

// A store written with the seal can't be opened without it, nor the other way round,
// and the attempt leaves it untouched.
for (const [name, withSeal] of [
  ['alice', false],
  ['plain', true]
] as const) {
  const file = join(dir, `${name}.sqlite`)
  if (name === 'plain') (await openOmemo(file, 'p@x')).close()
  const before = readFileSync(file)
  await assert.rejects(
    openOmemo(file, name === 'plain' ? 'p@x' : 'a@x', withSeal ? seal : undefined)
  )
  assert.ok(readFileSync(file).equals(before), `${name} store unchanged`)
}

// Verification code: Conversations' format.
assert.match(fp, /^([0-9a-f]{8} ){7}[0-9a-f]{8}$/)
assert.equal(fp.length, 71)

for (const o of [bob, bob2, reinstalled, bob2b]) o.close()
console.log('omemo check passed')
