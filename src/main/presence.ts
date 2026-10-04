import type { Snapshot } from './xmpp'

// Contacts that were offline in `before` and are connected in `after`.
export function cameOnline(before: Snapshot, after: Snapshot): string[] {
  const offline = new Set(before.contacts.filter((c) => c.show === 'offline').map((c) => c.jid))
  return after.contacts.filter((c) => c.show !== 'offline' && offline.has(c.jid)).map((c) => c.jid)
}
