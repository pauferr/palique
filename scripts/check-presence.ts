// "Came online" detection check (no server needed). Run: npm run check:presence
import assert from 'node:assert/strict'
import { cameOnline } from '../src/main/presence.ts'
import type { Contact, Snapshot } from '../src/main/xmpp.ts'

const contact = (jid: string, show: Contact['show']): Contact => ({
  jid,
  show,
  status: '',
  subscription: 'both',
  pending: false,
  avatar: ''
})
const snap = (...contacts: Contact[]): Snapshot => ({
  connected: true,
  contacts,
  requests: [],
  avatar: '',
  show: 'online'
})

const before = snap(
  contact('lolo', 'offline'),
  contact('chusa', 'online'),
  contact('fina', 'offline'),
  contact('yeray', 'offline')
)
const after = snap(
  contact('lolo', 'away'), // offline → away: counts
  contact('chusa', 'dnd'), // already connected: doesn't
  contact('fina', 'offline'), // still offline: doesn't
  contact('nacho', 'online') // new contact, never seen offline: doesn't
)
assert.deepEqual(cameOnline(before, after), ['lolo'])
assert.deepEqual(cameOnline(after, after), [])

console.log('presence check passed')
