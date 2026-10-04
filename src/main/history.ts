// Local chat history (SQLite). Conversations are never archived on the server.
import { DatabaseSync } from 'node:sqlite'
import type { ChatMessage } from './xmpp'

// ponytail: only the latest messages are loaded; add paging when scroll-back is needed.
const LIMIT = 200

export type History = {
  save(account: string, message: ChatMessage): void
  load(account: string, contact: string): ChatMessage[]
  all(account: string): ChatMessage[] // every conversation, by contact then time
}

type Row = {
  id: string
  contact: string
  mine: number
  body: string
  buzz: number
  wink: string
  at: number
}

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
  // Columns added after the first release.
  const columns = (db.prepare('PRAGMA table_info(messages)').all() as { name: string }[]).map(
    (c) => c.name
  )
  if (!columns.includes('wink')) {
    db.exec("ALTER TABLE messages ADD COLUMN wink TEXT NOT NULL DEFAULT ''")
  }
  const insert = db.prepare(
    'INSERT OR IGNORE INTO messages (account, contact, id, mine, body, buzz, wink, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const latest = db.prepare(
    `SELECT * FROM (
       SELECT rowid AS seq, id, contact, mine, body, buzz, wink, at FROM messages
       WHERE account = ? AND contact = ? ORDER BY at DESC, seq DESC LIMIT ?
     ) ORDER BY at, seq`
  )

  const everything = db.prepare(
    'SELECT id, contact, mine, body, buzz, wink, at FROM messages WHERE account = ? ORDER BY contact, at, rowid'
  )
  const toMessage = (row: Row): ChatMessage => ({
    id: row.id,
    with: row.contact,
    mine: row.mine === 1,
    body: row.body,
    buzz: row.buzz === 1,
    wink: row.wink,
    at: row.at
  })

  return {
    save(account, m) {
      insert.run(account, m.with, m.id, Number(m.mine), m.body, Number(m.buzz), m.wink, m.at)
    },
    load(account, contact) {
      return (latest.all(account, contact, LIMIT) as Row[]).map(toMessage)
    },
    all(account) {
      return (everything.all(account) as Row[]).map(toMessage)
    }
  }
}
