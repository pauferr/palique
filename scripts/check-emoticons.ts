// Emoticon parsing check (no server needed). Run: npm run check:emoticons
import assert from 'node:assert/strict'
import { parseEmoticons } from '../src/renderer/src/emoticons.ts'

// Shown as emoji, spaces kept around them.
const show = (text: string): string =>
  parseEmoticons(text)
    .map((p) => ('emoji' in p ? `[${p.emoji}]` : p.text))
    .join('')

assert.equal(show('hola :) qué tal :-D'), 'hola [🙂] qué tal [😃]')
assert.equal(show(';) (L)(Y)'), '[😉] [❤️][👍]')
assert.equal(show("me voy :'( adiós"), 'me voy [😢] adiós')
assert.equal(show('(y) (l) :p :d'), '[👍] [❤️] [😛] [😃]', 'case-insensitive')
assert.equal(show('sin nada'), 'sin nada')
assert.equal(show(''), '')
assert.equal(show(':-('), '[🙁]', 'longest code wins')
assert.equal(show('<b>:)</b>'), '<b>[🙂]</b>', 'text is left as text')

// The original code is kept, e.g. for tooltips.
assert.deepEqual(parseEmoticons('ok (y)'), [{ text: 'ok ' }, { emoji: '👍', code: '(y)' }])

console.log('emoticons check passed')
