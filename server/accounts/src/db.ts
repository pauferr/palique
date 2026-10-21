// What the account service remembers (SQLite). Chats never come here.
// The email is how people sign in; the JID behind it is random and never changes, so
// changing the email touches nothing else (contacts, history, avatars).
import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

export type Account = {
  jid: string
  email: string
  pending: string // new address waiting for its verification link, '' if none
  newsletter: boolean
}

export type Invite = { token: string; email: string; jid: string; inviter: string | null }

const WEEK = 7 * 24 * 60 * 60 * 1000
const token = (): string => randomBytes(24).toString('base64url')

type AccountRow = {
  jid: string
  email: string
  pending_email: string | null
  newsletter: number
  token_sent_at: number | null
}

// Its return type is inferred on purpose: it is `Db`, below.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function openDb(file: string) {
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      jid TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,  -- verified: the invite reached it
      newsletter INTEGER NOT NULL DEFAULT 0,
      newsletter_at INTEGER,       -- when the choice was made (proof of consent)
      pending_email TEXT,          -- changing the address: waits for its link
      token TEXT UNIQUE,           -- that link
      token_sent_at INTEGER
    );
    -- Invites by email. The account's JID is chosen when inviting: registering with the
    -- token can only create that account. Until someone signs in with it, the address
    -- is reserved for it.
    CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,      -- the Prosody invite token
      email TEXT NOT NULL,
      jid TEXT NOT NULL,
      inviter TEXT,                -- bare JID, NULL for the admin's invites
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      optout_token TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS invites_by_email ON invites (email);
    CREATE INDEX IF NOT EXISTS invites_by_inviter ON invites (inviter);
    CREATE TABLE IF NOT EXISTS invite_optout (email TEXT PRIMARY KEY);
  `)

  const toAccount = (row: AccountRow): Account => ({
    jid: row.jid,
    email: row.email,
    pending: row.pending_email ?? '',
    newsletter: row.newsletter === 1
  })
  const get = (jid: string): AccountRow | undefined =>
    db.prepare('SELECT * FROM accounts WHERE jid = ?').get(jid) as AccountRow | undefined
  const openInvite = (email: string): Invite | undefined =>
    db
      .prepare(
        'SELECT token, email, jid, inviter FROM invites WHERE email = ? AND used = 0 AND expires_at > ?'
      )
      .get(email, Date.now()) as Invite | undefined

  // Someone signed in with an invited JID: the account exists now, with the invited address.
  function claim(jid: string): void {
    if (get(jid)) return
    const invite = db.prepare('SELECT * FROM invites WHERE jid = ? AND used = 0').get(jid) as
      Invite | undefined
    if (!invite) return
    db.prepare('UPDATE invites SET used = 1 WHERE token = ?').run(invite.token)
    db.prepare('INSERT OR IGNORE INTO accounts (jid, email) VALUES (?, ?)').run(jid, invite.email)
  }

  // An account, or an invite still waiting to be used, has this address.
  const taken = (email: string): boolean =>
    Boolean(
      db.prepare('SELECT 1 FROM accounts WHERE email = ? OR pending_email = ?').get(email, email) ||
      openInvite(email)
    )

  return {
    // Every request from a signed-in user goes through here first.
    account(jid: string): Account | undefined {
      claim(jid)
      const row = get(jid)
      return row && toAccount(row)
    },

    // The JID to sign in with: the account's, or the one an open invite reserved.
    signInJid(email: string): string | undefined {
      const row = db.prepare('SELECT jid FROM accounts WHERE email = ?').get(email) as
        { jid: string } | undefined
      return row?.jid ?? openInvite(email)?.jid
    },

    // Existing accounts only (adding contacts, password recovery).
    accountByEmail(email: string): Account | undefined {
      const row = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email) as
        AccountRow | undefined
      return row && toAccount(row)
    },

    taken,

    // --- invites ---

    // Invites that still count against the user's limit: used, or not expired yet.
    invitesUsed(inviter: string): number {
      const row = db
        .prepare(
          'SELECT count(*) AS n FROM invites WHERE inviter = ? AND (used = 1 OR expires_at > ?)'
        )
        .get(inviter, Date.now()) as { n: number }
      return row.n
    },

    // May this address get an invite email now? (not opted out, none in the last week)
    mayInvite(email: string): boolean {
      if (db.prepare('SELECT 1 FROM invite_optout WHERE email = ?').get(email)) return false
      const sent = db
        .prepare('SELECT 1 FROM invites WHERE email = ? AND expires_at > ?')
        .get(email, Date.now())
      return !sent
    },

    // Records an invite; returns the token for its "no more invites" link.
    addInvite(invite: Invite, expiresAt = Date.now() + WEEK): string {
      const optout = token()
      db.prepare(
        'INSERT INTO invites (token, email, jid, inviter, expires_at, optout_token) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(invite.token, invite.email, invite.jid, invite.inviter, expiresAt, optout)
      return optout
    },

    // An unused, unexpired invite (the sign-up screen asks with its token).
    invite(t: string): Invite | undefined {
      return db
        .prepare(
          'SELECT token, email, jid, inviter FROM invites WHERE token = ? AND used = 0 AND expires_at > ?'
        )
        .get(t, Date.now()) as Invite | undefined
    },

    optOut(t: string): boolean {
      const row = db.prepare('SELECT email FROM invites WHERE optout_token = ?').get(t) as
        { email: string } | undefined
      if (!row) return false
      db.prepare('INSERT OR IGNORE INTO invite_optout (email) VALUES (?)').run(row.email)
      return true
    },

    // --- changing the address ---

    // Returns the verification token, or '' if the address is someone else's.
    changeEmail(jid: string, email: string): string {
      if (taken(email)) return ''
      const t = token()
      db.prepare(
        'UPDATE accounts SET pending_email = ?, token = ?, token_sent_at = ? WHERE jid = ?'
      ).run(email, t, Date.now(), jid)
      return t
    },

    // A fresh link for the pending address, at most once a minute. '' if not allowed.
    resendToken(jid: string): string {
      const row = get(jid)
      if (!row?.pending_email || Date.now() - (row.token_sent_at ?? 0) < 60_000) return ''
      const t = token()
      db.prepare('UPDATE accounts SET token = ?, token_sent_at = ? WHERE jid = ?').run(
        t,
        Date.now(),
        jid
      )
      return t
    },

    // The pending address becomes the account's. Undefined if the link is unknown or used
    // (or, in a race, someone else got the address first).
    verify(t: string): Account | undefined {
      const row = db.prepare('SELECT * FROM accounts WHERE token = ?').get(t) as
        AccountRow | undefined
      if (!row?.pending_email) return undefined
      try {
        db.prepare(
          'UPDATE accounts SET email = pending_email, pending_email = NULL, token = NULL WHERE jid = ?'
        ).run(row.jid)
      } catch {
        return undefined
      }
      return toAccount(get(row.jid)!)
    },

    // --- newsletter ---

    setNewsletter(jid: string, newsletter: boolean): Account | undefined {
      if (!get(jid)) return undefined
      db.prepare('UPDATE accounts SET newsletter = ?, newsletter_at = ? WHERE jid = ?').run(
        Number(newsletter),
        Date.now(),
        jid
      )
      return toAccount(get(jid)!)
    }
  }
}

export type Db = ReturnType<typeof openDb>
