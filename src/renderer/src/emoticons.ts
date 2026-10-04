// Classic MSN shortcuts, shown as emoji. The text sent stays as typed, so other XMPP
// clients still see ":)". ponytail: system emoji for now; themes can swap in images later.
export const EMOTICONS: { codes: string[]; emoji: string; name: string }[] = [
  { codes: [':)', ':-)'], emoji: '🙂', name: 'Sonrisa' },
  { codes: [':D', ':-D'], emoji: '😃', name: 'Carcajada' },
  { codes: [';)', ';-)'], emoji: '😉', name: 'Guiño' },
  { codes: [':P', ':-P'], emoji: '😛', name: 'Lengua' },
  { codes: [':O', ':-O'], emoji: '😮', name: 'Sorpresa' },
  { codes: [':(', ':-('], emoji: '🙁', name: 'Triste' },
  { codes: [":'("], emoji: '😢', name: 'Llorando' },
  { codes: [':S', ':-S'], emoji: '😕', name: 'Confundido' },
  { codes: [':|', ':-|'], emoji: '😐', name: 'Serio' },
  { codes: [':@', ':-@'], emoji: '😠', name: 'Enfadado' },
  { codes: ['(H)'], emoji: '😎', name: 'Chulo' },
  { codes: ['(L)'], emoji: '❤️', name: 'Corazón' },
  { codes: ['(U)'], emoji: '💔', name: 'Corazón roto' },
  { codes: ['(K)'], emoji: '💋', name: 'Beso' },
  { codes: ['(Y)'], emoji: '👍', name: 'Sí' },
  { codes: ['(N)'], emoji: '👎', name: 'No' },
  { codes: ['(F)'], emoji: '🌹', name: 'Rosa' },
  { codes: ['(*)'], emoji: '⭐', name: 'Estrella' },
  { codes: ['(8)'], emoji: '🎵', name: 'Música' },
  { codes: ['(^)'], emoji: '🎂', name: 'Tarta' },
  { codes: ['(C)'], emoji: '☕', name: 'Café' }
]

const byCode = new Map(
  EMOTICONS.flatMap(({ codes, emoji }) => codes.map((code) => [code.toUpperCase(), emoji]))
)
// Longest first, so ":-)" wins over ":)"-like prefixes. Case-insensitive like MSN.
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
