import { N_ } from './i18n.ts'

// Classic emoticon shortcuts, drawn as our own little animations (emoticons/draw.ts, by
// id). The text sent stays as typed, so other XMPP clients still see ":)". The emoji stands
// in where only plain text fits (window titles, notifications).
export const EMOTICONS: { id: string; codes: string[]; emoji: string; name: string }[] = [
  { id: 'smile', codes: [':)', ':-)'], emoji: '🙂', name: N_('Sonrisa') },
  { id: 'grin', codes: [':D', ':-D'], emoji: '😃', name: N_('Carcajada') },
  { id: 'wink', codes: [';)', ';-)'], emoji: '😉', name: N_('Guiño') },
  { id: 'tongue', codes: [':P', ':-P'], emoji: '😛', name: N_('Lengua') },
  { id: 'surprise', codes: [':O', ':-O'], emoji: '😮', name: N_('Sorpresa') },
  { id: 'sad', codes: [':(', ':-('], emoji: '🙁', name: N_('Triste') },
  { id: 'crying', codes: [":'("], emoji: '😢', name: N_('Llorando') },
  { id: 'confused', codes: [':S', ':-S'], emoji: '😕', name: N_('Confundido') },
  { id: 'neutral', codes: [':|', ':-|'], emoji: '😐', name: N_('Serio') },
  { id: 'angry', codes: [':@', ':-@'], emoji: '😠', name: N_('Enfadado') },
  { id: 'cool', codes: ['(H)'], emoji: '😎', name: N_('Chulo') },
  { id: 'heart', codes: ['(L)'], emoji: '❤️', name: N_('Corazón') },
  { id: 'broken', codes: ['(U)'], emoji: '💔', name: N_('Corazón roto') },
  { id: 'kiss', codes: ['(K)'], emoji: '💋', name: N_('Beso') },
  { id: 'yes', codes: ['(Y)'], emoji: '👍', name: N_('Sí') },
  { id: 'no', codes: ['(N)'], emoji: '👎', name: N_('No') },
  { id: 'rose', codes: ['(F)'], emoji: '🌹', name: N_('Rosa') },
  { id: 'star', codes: ['(*)'], emoji: '⭐', name: N_('Estrella') },
  { id: 'music', codes: ['(8)'], emoji: '🎵', name: N_('Música') },
  { id: 'cake', codes: ['(^)'], emoji: '🎂', name: N_('Tarta') },
  { id: 'coffee', codes: ['(C)'], emoji: '☕', name: N_('Café') }
]

const byCode = new Map(
  EMOTICONS.flatMap(({ id, codes, emoji }) =>
    codes.map((code) => [code.toUpperCase(), { id, emoji }])
  )
)
// Longest first, so ":-)" wins over ":)"-like prefixes. Case-insensitive.
const pattern = new RegExp(
  [...byCode.keys()]
    .sort((a, b) => b.length - a.length)
    .map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'gi'
)

export type Part = { text: string } | { id: string; emoji: string; code: string }

export function parseEmoticons(text: string): Part[] {
  const parts: Part[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ ...byCode.get(match[0].toUpperCase())!, code: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

// For plain-text places (window titles, notifications, dialogs).
export const emojify = (text: string): string =>
  parseEmoticons(text)
    .map((p) => ('emoji' in p ? p.emoji : p.text))
    .join('')
