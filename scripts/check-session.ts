// Session ordering check (no server needed). Run: npm run check:session
import assert from 'node:assert/strict'
import { insertSorted } from '../src/main/session.ts'
import type { ChatMessage } from '../src/main/xmpp.ts'

const m = (id: string, at: number): ChatMessage => ({
  id,
  with: 'room@groups.localhost',
  mine: false,
  body: id,
  buzz: false,
  wink: '',
  at,
  encrypted: true
})
const ids = (list: ChatMessage[]): string => list.map((x) => x.id).join(',')

let list: ChatMessage[] = []
for (const x of [m('b', 20), m('c', 30), m('a', 10), m('b2', 20)]) list = insertSorted(list, x)
assert.equal(ids(list), 'a,b,b2,c', 'sorted by time, ties keep arrival order')
assert.equal(insertSorted(list, m('b', 99)), list, 'same id twice: unchanged')

console.log('session check passed')
