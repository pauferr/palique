import { N_ } from './i18n.ts'

// Classic emoticon shortcuts, shown as emoji. The text sent stays as typed, so other XMPP
// clients still see ":)". ponytail: system emoji for now; themes can swap in images later.
export const EMOTICONS: { codes: string[]; emoji: string; name: string }[] = [
  { codes: [':)', ':-)'], emoji: '🙂', name: N_('Sonrisa') },
  { codes: [':D', ':-D'], emoji: '😃', name: N_('Carcajada') },
  { codes: [';)', ';-)'], emoji: '😉', name: N_('Guiño') },
  { codes: [':P', ':-P'], emoji: '😛', name: N_('Lengua') },
  { codes: [':O', ':-O'], emoji: '😮', name: N_('Sorpresa') },
  { codes: [':(', ':-('], emoji: '🙁', name: N_('Triste') },
  { codes: [":'("], emoji: '😢', name: N_('Llorando') },
  { codes: [':S', ':-S'], emoji: '😕', name: N_('Confundido') },
  { codes: [':|', ':-|'], emoji: '😐', name: N_('Serio') },
  { codes: [':@', ':-@'], emoji: '😠', name: N_('Enfadado') },
  { codes: ['(H)'], emoji: '😎', name: N_('Chulo') },
  { codes: ['(L)'], emoji: '❤️', name: N_('Corazón') },
  { codes: ['(U)'], emoji: '💔', name: N_('Corazón roto') },
  { codes: ['(K)'], emoji: '💋', name: N_('Beso') },
  { codes: ['(Y)'], emoji: '👍', name: N_('Sí') },
  { codes: ['(N)'], emoji: '👎', name: N_('No') },
  { codes: ['(F)'], emoji: '🌹', name: N_('Rosa') },
  { codes: ['(*)'], emoji: '⭐', name: N_('Estrella') },
  { codes: ['(8)'], emoji: '🎵', name: N_('Música') },
  { codes: ['(^)'], emoji: '🎂', name: N_('Tarta') },
  { codes: ['(C)'], emoji: '☕', name: N_('Café') }
]

const byCode = new Map(
  EMOTICONS.flatMap(({ codes, emoji }) => codes.map((code) => [code.toUpperCase(), emoji]))
)
// Longest first, so ":-)" wins over ":)"-like prefixes. Case-insensitive.
const pattern = new RegExp(
  [...byCode.keys()]
    .sort((a, b) => b.length - a.length)
    .map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'gi'
)

export type Part = { text: string } | { emoji: string; code: string }

export function parseEmoticons(text: string): Part[] {
  const parts: Part[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ emoji: byCode.get(match[0].toUpperCase())!, code: match[0] })
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
