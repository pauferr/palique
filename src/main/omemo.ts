// OMEMO 0.3 (eu.siacs.conversations.axolotl) without the XMPP part: our keys, the Signal
// sessions with each contact's device and how much we trust them, in omemo.sqlite.
// Everything private goes through `seal` (safeStorage in the app) before reaching disk.
import { createCipheriv, createDecipheriv, randomBytes, randomInt } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type KeyPairType,
  type StorageType
} from '@privacyresearch/libsignal-protocol-typescript'

export type Seal = { seal(data: Uint8Array): Uint8Array; open(data: Uint8Array): Uint8Array }
export type Device = { jid: string; deviceId: number }
export type Bundle = {
  deviceId: number
  identityKey: Uint8Array
  signedPreKey: { id: number; publicKey: Uint8Array; signature: Uint8Array }
  preKeys: { id: number; publicKey: Uint8Array }[]
}
export type Encrypted = {
  sid: number
  iv: Uint8Array
  keys: { rid: number; prekey: boolean; data: Uint8Array }[]
  payload: Uint8Array
}
export type TrustChange = { jid: string; deviceId: number; kind: 'new-device' | 'key-changed' }
export type DeviceTrust = {
  deviceId: number
  fingerprint: string
  verified: boolean
  blocked: boolean
}
export type Omemo = {
  deviceId: number
  bundle(): Promise<Bundle>
  needsRefill(): boolean // fewer than 25 one-time keys, or signed key older than 30 days
  refill(): Promise<void> // back to 100 one-time keys; rotates the signed key when due
  hasSession(to: Device): Promise<boolean>
  startSession(to: Device, bundle: Bundle): Promise<void>
  encrypt(text: string, to: Device[]): Promise<Encrypted> // blocked devices are skipped
  decrypt(from: string, message: Encrypted): Promise<string> // throws OmemoError
  seen(jid: string, deviceIds: number[]): TrustChange[] // new devices of a known contact
  takeChanges(): TrustChange[] // key changes noticed while decrypting/starting sessions
  devices(jid: string): DeviceTrust[]
  fingerprint(): string
  setVerified(to: Device, verified: boolean): void
  acceptKey(to: Device): void // unblocks a verified device whose key changed
  close(): void
}

export class OmemoError extends Error {
  code: 'no-key' | 'bad-message' | 'blocked'
  constructor(code: OmemoError['code']) {
    super(code)
    this.name = 'OmemoError'
    this.code = code
  }
}

const PREKEYS = 100
const REFILL_BELOW = 25
const DAY = 24 * 60 * 60 * 1000
const SIGNED_EVERY = 30 * DAY

// Conversations' verification code: the identity key without its 0x05 type byte, in
// lowercase hex, 8 groups of 8.
export const fingerprintOf = (identityKey: Uint8Array): string =>
  Buffer.from(identityKey.subarray(identityKey.length - 32))
    .toString('hex')
    .match(/.{8}/g)!
    .join(' ')

const bytes = (b: ArrayBuffer | Uint8Array): Uint8Array => new Uint8Array(b)
const buffer = (b: Uint8Array): ArrayBuffer => Uint8Array.from(b).buffer
const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b))
// Public key is always 33 bytes (0x05 + 32), so a pair is stored as pub ‖ priv.
const packPair = (k: KeyPairType): Uint8Array => Buffer.concat([bytes(k.pubKey), bytes(k.privKey)])
const unpackPair = (b: Uint8Array): KeyPairType => ({
  pubKey: buffer(b.subarray(0, 33)),
  privKey: buffer(b.subarray(33))
})

// The library asks for trust by address name only, so the name carries the device too.
const address = (to: Device): SignalProtocolAddress =>
  new SignalProtocolAddress(`${to.jid}/${to.deviceId}`, to.deviceId)
const parseName = (name: string): Device => {
  const at = name.lastIndexOf('/')
  return { jid: name.slice(0, at), deviceId: Number(name.slice(at + 1)) }
}

type IdentityRow = {
  device_id: number
  registration_id: number
  keypair: Uint8Array
  signed_at: number
  next_prekey: number
  sealed: number
}
type TrustRow = {
  device_id: number
  key: Uint8Array | null
  verified: number
  blocked: number
}

let warnedUnsealed = false

export async function openOmemo(file: string, account: string, seal?: Seal): Promise<Omemo> {
  const lock = seal ? (b: Uint8Array) => seal.seal(b) : (b: Uint8Array) => b
  const unlock = seal ? (b: Uint8Array) => seal.open(b) : (b: Uint8Array) => b
  const db = new DatabaseSync(file)
  // `account` keeps several Palique users on the same computer apart.
  db.exec(`
    CREATE TABLE IF NOT EXISTS identity (
      account TEXT PRIMARY KEY,
      device_id INTEGER NOT NULL,
      registration_id INTEGER NOT NULL,
      keypair BLOB NOT NULL,
      signed_at INTEGER NOT NULL,
      next_prekey INTEGER NOT NULL,
      sealed INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prekeys (
      account TEXT NOT NULL, id INTEGER NOT NULL, keypair BLOB NOT NULL,
      PRIMARY KEY (account, id)
    );
    CREATE TABLE IF NOT EXISTS signed (
      account TEXT NOT NULL, id INTEGER NOT NULL, keypair BLOB NOT NULL,
      signature BLOB NOT NULL, created INTEGER NOT NULL,
      PRIMARY KEY (account, id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      account TEXT NOT NULL, address TEXT NOT NULL, record BLOB NOT NULL,
      PRIMARY KEY (account, address)
    );
    CREATE TABLE IF NOT EXISTS identities (
      account TEXT NOT NULL, jid TEXT NOT NULL, device_id INTEGER NOT NULL, key BLOB,
      verified INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0,
      first_seen INTEGER NOT NULL,
      PRIMARY KEY (account, jid, device_id)
    );
  `)

  const loadIdentity = (): IdentityRow | undefined =>
    db.prepare('SELECT * FROM identity WHERE account = ?').get(account) as IdentityRow | undefined
  const countPreKeys = (): number =>
    (
      db.prepare('SELECT COUNT(*) AS n FROM prekeys WHERE account = ?').get(account) as {
        n: number
      }
    ).n

  async function addPreKeys(): Promise<void> {
    const me = loadIdentity()!
    const missing = PREKEYS - countPreKeys()
    if (missing <= 0) return
    const insert = db.prepare('INSERT INTO prekeys (account, id, keypair) VALUES (?, ?, ?)')
    // Ids only go up, so a contact holding an old bundle never gets someone else's key.
    for (let id = me.next_prekey; id < me.next_prekey + missing; id++) {
      const k = await KeyHelper.generatePreKey(id)
      insert.run(account, id, lock(packPair(k.keyPair)))
    }
    db.prepare('UPDATE identity SET next_prekey = ? WHERE account = ?').run(
      me.next_prekey + missing,
      account
    )
  }

  async function newSignedKey(): Promise<void> {
    const me = loadIdentity()!
    const last = db.prepare('SELECT MAX(id) AS id FROM signed WHERE account = ?').get(account) as {
      id: number | null
    }
    const k = await KeyHelper.generateSignedPreKey(
      unpackPair(unlock(me.keypair)),
      (last.id ?? 0) + 1
    )
    const now = Date.now()
    db.prepare(
      'INSERT INTO signed (account, id, keypair, signature, created) VALUES (?, ?, ?, ?, ?)'
    ).run(account, k.keyId, lock(packPair(k.keyPair)), bytes(k.signature), now)
    db.prepare('UPDATE identity SET signed_at = ? WHERE account = ?').run(now, account)
    // The previous key keeps working 30 more days for messages already on their way.
    // ponytail: keys older than 60 days go; exact per-key retirement times if rotation varies.
    db.prepare('DELETE FROM signed WHERE account = ? AND created < ?').run(
      account,
      now - 2 * SIGNED_EVERY
    )
  }

  // Opened with the seal and without it, the keys would read as garbage and a bad bundle
  // would replace the real one: the store says how it was written, and that must match.
  const existing = loadIdentity()
  if (existing && existing.sealed !== (seal ? 1 : 0)) {
    db.close()
    console.warn(`omemo: keys stored ${existing.sealed ? 'sealed' : 'unsealed'}, not opened`)
    throw new Error(existing.sealed ? 'omemo-store-sealed' : 'omemo-store-unsealed')
  }
  if (!seal && !warnedUnsealed) {
    warnedUnsealed = true
    console.warn('omemo: no system encryption, keys stored unsealed')
  }
  if (!existing) {
    const pair = await KeyHelper.generateIdentityKeyPair()
    db.prepare(
      'INSERT INTO identity (account, device_id, registration_id, keypair, signed_at, next_prekey, sealed) VALUES (?, ?, ?, ?, 0, 1, ?)'
    ).run(
      account,
      randomInt(1, 2 ** 31),
      KeyHelper.generateRegistrationId(),
      lock(packPair(pair)),
      seal ? 1 : 0
    )
    await newSignedKey()
    await addPreKeys()
  }
  const me = loadIdentity()!
  const identityPair = unpackPair(unlock(me.keypair))

  const changes: TrustChange[] = []
  const trustOf = (to: Device): TrustRow | undefined =>
    db
      .prepare(
        'SELECT device_id, key, verified, blocked FROM identities WHERE account = ? AND jid = ? AND device_id = ?'
      )
      .get(account, to.jid, to.deviceId) as TrustRow | undefined
  const remember = (to: Device): void => {
    db.prepare(
      'INSERT OR IGNORE INTO identities (account, jid, device_id, first_seen) VALUES (?, ?, ?, ?)'
    ).run(account, to.jid, to.deviceId, Date.now())
  }
  const setTrust = (to: Device, fields: string, ...values: (number | Uint8Array)[]): void => {
    db.prepare(
      `UPDATE identities SET ${fields} WHERE account = ? AND jid = ? AND device_id = ?`
    ).run(...values, account, to.jid, to.deviceId)
  }

  // Trust on first use. A new key for an unverified device replaces the old one (and is
  // noted); for a verified one, the device is blocked until the user accepts the new key.
  // Synchronous inside: the library calls it once without awaiting.
  function isTrusted(to: Device, key: Uint8Array): boolean {
    remember(to)
    const row = trustOf(to)!
    if (!row.key) {
      setTrust(to, 'key = ?', key)
      return true
    }
    if (same(row.key, key)) return row.blocked === 0
    if (row.blocked) return false
    changes.push({ ...to, kind: 'key-changed' })
    if (row.verified) {
      setTrust(to, 'key = ?, blocked = 1', key)
      return false
    }
    setTrust(to, 'key = ?', key)
    return true
  }

  const storage: StorageType = {
    getIdentityKeyPair: async () => identityPair,
    getLocalRegistrationId: async () => me.registration_id,
    isTrustedIdentity: async (name, key) => isTrusted(parseName(name), bytes(key)),
    saveIdentity: async () => false, // isTrustedIdentity already stored it
    loadPreKey: async (id) => {
      const row = db
        .prepare('SELECT keypair FROM prekeys WHERE account = ? AND id = ?')
        .get(account, Number(id)) as { keypair: Uint8Array } | undefined
      return row && unpackPair(unlock(row.keypair))
    },
    storePreKey: async (id, pair) => {
      db.prepare('INSERT OR REPLACE INTO prekeys (account, id, keypair) VALUES (?, ?, ?)').run(
        account,
        Number(id),
        lock(packPair(pair))
      )
    },
    removePreKey: async (id) => {
      db.prepare('DELETE FROM prekeys WHERE account = ? AND id = ?').run(account, Number(id))
    },
    loadSignedPreKey: async (id) => {
      const row = db
        .prepare('SELECT keypair FROM signed WHERE account = ? AND id = ?')
        .get(account, Number(id)) as { keypair: Uint8Array } | undefined
      return row && unpackPair(unlock(row.keypair))
    },
    storeSignedPreKey: async () => {}, // made only by newSignedKey()
    removeSignedPreKey: async (id) => {
      db.prepare('DELETE FROM signed WHERE account = ? AND id = ?').run(account, Number(id))
    },
    loadSession: async (at) => {
      const row = db
        .prepare('SELECT record FROM sessions WHERE account = ? AND address = ?')
        .get(account, at) as { record: Uint8Array } | undefined
      return row && Buffer.from(unlock(row.record)).toString('utf8')
    },
    storeSession: async (at, record) => {
      db.prepare('INSERT OR REPLACE INTO sessions (account, address, record) VALUES (?, ?, ?)').run(
        account,
        at,
        lock(Buffer.from(record, 'utf8'))
      )
    }
  }

  const blocked = (to: Device): boolean => trustOf(to)?.blocked === 1
  const toDevice = (row: TrustRow): DeviceTrust => ({
    deviceId: row.device_id,
    fingerprint: fingerprintOf(row.key!),
    // A verified device whose key changed keeps the flag for acceptKey, but that key isn't.
    verified: row.verified === 1 && row.blocked === 0,
    blocked: row.blocked === 1
  })

  return {
    deviceId: me.device_id,

    async bundle() {
      const signed = db
        .prepare(
          'SELECT id, keypair, signature FROM signed WHERE account = ? ORDER BY id DESC LIMIT 1'
        )
        .get(account) as { id: number; keypair: Uint8Array; signature: Uint8Array }
      const preKeys = db
        .prepare('SELECT id, keypair FROM prekeys WHERE account = ? ORDER BY id')
        .all(account) as { id: number; keypair: Uint8Array }[]
      return {
        deviceId: me.device_id,
        identityKey: bytes(identityPair.pubKey),
        signedPreKey: {
          id: signed.id,
          publicKey: unlock(signed.keypair).subarray(0, 33),
          signature: signed.signature
        },
        preKeys: preKeys.map((k) => ({ id: k.id, publicKey: unlock(k.keypair).subarray(0, 33) }))
      }
    },

    needsRefill() {
      return countPreKeys() < REFILL_BELOW || Date.now() - loadIdentity()!.signed_at > SIGNED_EVERY
    },

    async refill() {
      if (Date.now() - loadIdentity()!.signed_at > SIGNED_EVERY) await newSignedKey()
      await addPreKeys()
    },

    async hasSession(to) {
      return new SessionCipher(storage, address(to)).hasOpenSession()
    },

    async startSession(to, bundle) {
      // OMEMO: pick one of the contact's one-time keys at random.
      const preKey = bundle.preKeys[randomInt(bundle.preKeys.length)]
      try {
        await new SessionBuilder(storage, address(to)).processPreKey({
          registrationId: 0,
          identityKey: buffer(bundle.identityKey),
          signedPreKey: {
            keyId: bundle.signedPreKey.id,
            publicKey: buffer(bundle.signedPreKey.publicKey),
            signature: buffer(bundle.signedPreKey.signature)
          },
          preKey: preKey && { keyId: preKey.id, publicKey: buffer(preKey.publicKey) }
        })
      } catch (e) {
        if (blocked(to)) throw new OmemoError('blocked')
        throw e
      }
    },

    async encrypt(text, to) {
      const key = randomBytes(16)
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-128-gcm', key, iv)
      const payload = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
      const secret = buffer(Buffer.concat([key, cipher.getAuthTag()]))
      const keys: Encrypted['keys'] = []
      for (const device of to) {
        if (blocked(device)) continue
        const session = new SessionCipher(storage, address(device))
        if (!(await session.hasOpenSession())) throw new OmemoError('no-key')
        try {
          const m = await session.encrypt(secret)
          keys.push({
            rid: device.deviceId,
            prekey: m.type === 3,
            data: bytes(Buffer.from(m.body!, 'latin1'))
          })
        } catch (e) {
          // Its key turned out to be a new one while sending.
          if (!blocked(device)) throw e
        }
      }
      return { sid: me.device_id, iv, keys, payload }
    },

    async decrypt(from, message) {
      const mine = message.keys.find((k) => k.rid === me.device_id)
      if (!mine) throw new OmemoError('no-key')
      const sender = { jid: from, deviceId: message.sid }
      if (blocked(sender)) throw new OmemoError('blocked')
      const session = new SessionCipher(storage, address(sender))
      let secret: Uint8Array
      try {
        secret = bytes(
          mine.prekey
            ? await session.decryptPreKeyWhisperMessage(buffer(mine.data))
            : await session.decryptWhisperMessage(buffer(mine.data))
        )
      } catch {
        throw new OmemoError(blocked(sender) ? 'blocked' : 'bad-message')
      }
      // A one-time key message from a verified device with a new key: the library goes
      // ahead without waiting for our answer, so it's refused here.
      if (blocked(sender)) throw new OmemoError('blocked')
      // Older OMEMO clients put only the key here and the tag after the payload.
      const tagged = secret.length >= 32
      const key = secret.subarray(0, 16)
      const tag = tagged ? secret.subarray(16, 32) : message.payload.subarray(-16)
      const payload = tagged ? message.payload : message.payload.subarray(0, -16)
      try {
        const decipher = createDecipheriv('aes-128-gcm', key, message.iv)
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')
      } catch {
        throw new OmemoError('bad-message')
      }
    },

    seen(jid, deviceIds) {
      const known = (
        db
          .prepare('SELECT device_id FROM identities WHERE account = ? AND jid = ?')
          .all(account, jid) as { device_id: number }[]
      ).map((r) => r.device_id)
      const fresh = deviceIds.filter((id) => !known.includes(id))
      for (const deviceId of fresh) remember({ jid, deviceId })
      // A first contact's devices are all new, and that's no news.
      if (known.length === 0) return []
      return fresh.map((deviceId) => ({ jid, deviceId, kind: 'new-device' }))
    },

    takeChanges() {
      return changes.splice(0)
    },

    devices(jid) {
      const rows = db
        .prepare(
          'SELECT device_id, key, verified, blocked FROM identities WHERE account = ? AND jid = ? AND key IS NOT NULL ORDER BY first_seen, device_id'
        )
        .all(account, jid) as TrustRow[]
      return rows.map(toDevice)
    },

    fingerprint() {
      return fingerprintOf(bytes(identityPair.pubKey))
    },

    setVerified(to, verified) {
      setTrust(to, 'verified = ?', verified ? 1 : 0)
    },

    acceptKey(to) {
      // The new key hasn't been checked by the user, so it isn't verified. The session
      // still belongs to the old key: dropped, so the next send starts one with the new.
      setTrust(to, 'blocked = 0, verified = 0')
      db.prepare('DELETE FROM sessions WHERE account = ? AND address = ?').run(
        account,
        address(to).toString()
      )
    },

    close() {
      db.close()
    }
  }
}
