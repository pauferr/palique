// Messenger Plus! code parsing check (no server needed). Run: npm run check:plus
import assert from 'node:assert/strict'
import { parsePlus, stripPlus, tidyPlus } from '../src/renderer/src/plus.ts'

// Plain text keeps the words and drops the codes.
assert.equal(stripPlus('[c=#e8344e]Tere[/c] (L)'), 'Tere (L)')
assert.equal(stripPlus('[b][i]hola[/i][/b]'), 'hola')
assert.equal(stripPlus('sin códigos'), 'sin códigos')

// Formats and colors (#hex, short or long); nesting adds up.
const [run] = parsePlus('[b][u][c=#f00]x[/c][/u][/b]')
assert.deepEqual(
  { bold: run.bold, underline: run.underline, color: run.color },
  { bold: true, underline: true, color: '#f00' }
)
assert.equal(parsePlus('[c=#00A2FF]x[/c]')[0].color, '#00a2ff')
assert.equal(parsePlus('[a=#fff3a0]x[/a]')[0].background, '#fff3a0')

// [c=A]…[/c=B] is a gradient over everything in between, split across runs.
const gradient = parsePlus('[c=#ff0000]ab[b]cd[/b][/c=#0000ff]')
assert.equal(gradient.length, 2)
assert.equal(gradient[0].gradient![0], '#ff0000')
assert.equal(gradient[1].gradient![1], '#0000ff')
assert.equal(gradient[1].bold, true)

// Anything that isn't a valid code stays as typed: color names, numbers, bad hex.
assert.equal(stripPlus('[c=red]x[/c]'), '[c=red]x')
assert.equal(stripPlus('a [c=4]b[/c]'), 'a [c=4]b')
assert.equal(stripPlus('[c=#12]x[/c]'), '[c=#12]x')

// Untrusted names: colors are only ever valid CSS colors, text is only text.
for (const r of parsePlus('[c=red;background:url(x)]a[/c][c=#fff]<b onclick=x>[/c]')) {
  assert.ok(!r.color || /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/.test(r.color), r.color)
}
// And a name stuffed with codes stops being parsed after 40 of them.
assert.equal(stripPlus('[b]'.repeat(50) + 'x'), '[b]'.repeat(10) + 'x')

// Tidying drops closing codes with nothing to close, and keeps everything else.
assert.equal(tidyPlus('[c=#ff4fa3]Ter[/c=#7a5cff]e[/b]'), '[c=#ff4fa3]Ter[/c=#7a5cff]e')
assert.equal(tidyPlus('Tere la del insti[/c]'), 'Tere la del insti')
assert.equal(tidyPlus('[b]a[/b][/b] [i]b'), '[b]a[/b] [i]b')

console.log('plus check passed')
