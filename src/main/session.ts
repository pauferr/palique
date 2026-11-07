import type { ChatMessage } from './xmpp'

// A conversation's messages by time. Group messages can arrive out of order (live ones
// before the archive's catch-up); a tie keeps arrival order. Already there (same id): as is.
export function insertSorted(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  if (list.some((m) => m.id === message.id)) return list
  const next = [...list]
  let i = next.length
  while (i > 0 && next[i - 1].at > message.at) i--
  next.splice(i, 0, message)
  return next
}
