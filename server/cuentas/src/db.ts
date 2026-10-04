// What the account service remembers (SQLite). Chats never come here.
import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

export type Account = { jid: string; email: string; verified: boolean; newsletter: boolean }

const WEEK = 7 * 24 * 60 * 60 * 1000
const token = (): string => randomBytes(24).toString('base64url')

type AccountRow = {
  jid: string
  email: string
  verified: number
  newsletter: number
  token_sent_at: number | null
}

export function openDb(file: string) {
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      jid TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      newsletter INTEGER NOT NULL DEFAULT 0,
      token TEXT UNIQUE,          -- pending email verification link
      token_sent_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS accounts_by_email ON accounts (email);
    -- Invites sent by email: at most one per address per week, and a way out.
    CREATE TABLE IF NOT EXISTS invite_emails (
      email TEXT PRIMARY KEY,
      sent_at INTEGER NOT NULL,
      optout_token TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS invite_optout (email TEXT PRIMARY KEY);
  `)

  const toAccount = (row: AccountRow): Account => ({
    jid: row.jid,
    email: row.email,
    verified: row.verified === 1,
    newsletter: row.newsletter === 1
  })
  const get = (jid: string): AccountRow | undefined =>
    db.prepare('SELECT * FROM accounts WHERE jid = ?').get(jid) as AccountRow | undefined

  return {
    account(jid: string): Account | undefined {
      const row = get(jid)
      return row && toAccount(row)
    },

    // New or changed address: needs (re)verifying. Returns the verification token.
    setEmail(jid: string, email: string, newsletter: boolean): string {
      const current = get(jid)
      if (current && current.email === email && current.verified === 1) {
        db.prepare('UPDATE accounts SET newsletter = ? WHERE jid = ?').run(Number(newsletter), jid)
        return ''
      }
      const t = token()
      db.prepare(
        `INSERT INTO accounts (jid, email, verified, newsletter, token, token_sent_at)
         VALUES (?, ?, 0, ?, ?, ?)
         ON CONFLICT (jid) DO UPDATE SET email = excluded.email, verified = 0,
           newsletter = excluded.newsletter, token = excluded.token, token_sent_at = excluded.token_sent_at`
      ).run(jid, email, Number(newsletter), t, Date.now())
      return t
    },

    // A fresh link for an unverified address, at most once a minute. '' if not allowed.
    resendToken(jid: string): string {
      const row = get(jid)
      if (!row || row.verified === 1 || Date.now() - (row.token_sent_at ?? 0) < 60_000) return ''
      const t = token()
      db.prepare('UPDATE accounts SET token = ?, token_sent_at = ? WHERE jid = ?').run(
        t,
        Date.now(),
        jid
      )
      return t
    },

    // The account whose link this was, now verified; undefined if unknown or used.
    verify(t: string): Account | undefined {
      const row = db.prepare('SELECT * FROM accounts WHERE token = ?').get(t) as
        AccountRow | undefined
      if (!row) return undefined
      db.prepare('UPDATE accounts SET verified = 1, token = NULL WHERE jid = ?').run(row.jid)
      return { ...toAccount(row), verified: true }
    },

    isRegistered(email: string): boolean {
      return Boolean(
        db.prepare('SELECT 1 FROM accounts WHERE email = ? AND verified = 1').get(email)
      )
    },

    // May this address get an invite email now? (not opted out, none in the last week)
    mayInvite(email: string): boolean {
      if (db.prepare('SELECT 1 FROM invite_optout WHERE email = ?').get(email)) return false
      const sent = db.prepare('SELECT sent_at FROM invite_emails WHERE email = ?').get(email) as
        { sent_at: number } | undefined
      return !sent || Date.now() - sent.sent_at > WEEK
    },

    // Records an invite email; returns the token for its "no more invites" link.
    invited(email: string): string {
      const t = token()
      db.prepare(
        `INSERT INTO invite_emails (email, sent_at, optout_token) VALUES (?, ?, ?)
         ON CONFLICT (email) DO UPDATE SET sent_at = excluded.sent_at, optout_token = excluded.optout_token`
      ).run(email, Date.now(), t)
      return t
    },

    optOut(t: string): boolean {
      const row = db.prepare('SELECT email FROM invite_emails WHERE optout_token = ?').get(t) as
        { email: string } | undefined
      if (!row) return false
      db.prepare('INSERT OR IGNORE INTO invite_optout (email) VALUES (?)').run(row.email)
      return true
    }
  }
}

export type Db = ReturnType<typeof openDb>
