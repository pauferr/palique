// Local chat history (SQLite). Conversations are never archived on the server.
import { DatabaseSync } from 'node:sqlite'
import type { ChatMessage } from './xmpp'

// ponytail: only the latest messages are loaded; add paging when scroll-back is needed.
const LIMIT = 200

export type History = {
  save(account: string, message: ChatMessage): void
  load(account: string, contact: string): ChatMessage[]
}

type Row = { id: string; contact: string; mine: number; body: string; buzz: number; at: number }

export function openHistory(file: string): History {
  const db = new DatabaseSync(file)
  // `account` keeps several Palique users on the same computer apart.
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      account TEXT NOT NULL,
      contact TEXT NOT NULL,
      id TEXT NOT NULL,
      mine INTEGER NOT NULL,
      body TEXT NOT NULL,
      buzz INTEGER NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (account, contact, id)
    );
    CREATE INDEX IF NOT EXISTS messages_by_time ON messages (account, contact, at);
  `)
  const insert = db.prepare(
    'INSERT OR IGNORE INTO messages (account, contact, id, mine, body, buzz, at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const latest = db.prepare(
    `SELECT * FROM (
       SELECT rowid AS seq, id, contact, mine, body, buzz, at FROM messages
       WHERE account = ? AND contact = ? ORDER BY at DESC, seq DESC LIMIT ?
     ) ORDER BY at, seq`
  )

  return {
    save(account, m) {
      insert.run(account, m.with, m.id, Number(m.mine), m.body, Number(m.buzz), m.at)
    },
    load(account, contact) {
      return (latest.all(account, contact, LIMIT) as Row[]).map((row) => ({
        id: row.id,
        with: row.contact,
        mine: row.mine === 1,
        body: row.body,
        buzz: row.buzz === 1,
        at: row.at
      }))
    }
  }
}
