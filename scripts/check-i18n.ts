// Translations check (no server needed). Run: npm run check:i18n
// Finds every _('…'), N_('…'), _p('context', '…') and _n('…', '…') in the app (src) and
// the account service (server/accounts/src), then, for each catalog of theirs: fails on keys no longer used and on translations whose
// {placeholders} differ from the Spanish; lists the strings still missing.
// With --write (npm run check:i18n -- --write) it adds the missing ones as "" for the
// translator, drops the unused ones and lists what's left to translate with where each
// string is used, so it's translated knowing what it is. An empty translation shows the
// Spanish.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { _, _n, _p, setLanguage } from '../src/renderer/src/i18n.ts'

const write = process.argv.includes('--write')

// A quoted string, in either quotes, with escapes.
const single = /\bN?_\(\s*(['"])((?:\\.|(?!\1).)*)\1/g
const pair = String.raw`\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(['"])((?:\\.|(?!\3).)*)\3`
const plural = new RegExp(String.raw`\b_n` + pair, 'g')
const context = new RegExp(String.raw`\b_p` + pair, 'g')
const unescape = (text: string): string => text.replace(/\\(.)/g, '$1')

// Each key with the offset where it's written.
function found(source: string): [string, number][] {
  return [
    ...[...source.matchAll(single)].map((m): [string, number] => [unescape(m[2]), m.index]),
    ...[...source.matchAll(plural)].map((m): [string, number] => [
      `${unescape(m[2])}|${unescape(m[4])}`,
      m.index
    ]),
    ...[...source.matchAll(context)].map((m): [string, number] => [
      `${unescape(m[2])}::${unescape(m[4])}`,
      m.index
    ])
  ]
}
const keysIn = (source: string): string[] => found(source).map(([key]) => key)

const placeholders = (text: string): string =>
  [...new Set(text.match(/\{\w+\}/g) ?? [])].sort().join()

// The extractor reads every way a string gets written.
assert.deepEqual(
  keysIn(`_('Hola') N_("Qu'tal") _n('Un mensaje',\n  '{n} mensajes', n) _p('tema', 'Cristal')`),
  ['Hola', "Qu'tal", 'Un mensaje|{n} mensajes', 'tema::Cristal']
)
assert.deepEqual(keysIn(`foo_('x') get_('y') a._('z')`), ['z'])
assert.deepEqual(keysIn(String.raw`_('L\'ola')`), ["L'ola"])

// Lookups: Spanish without a catalog, translations and their plurals, fallbacks.
setLanguage('es')
assert.equal(_('Hola, {name}', { name: 'Ana' }), 'Hola, Ana')
assert.equal(_n('Un mensaje', '{n} mensajes', 1), 'Un mensaje')
assert.equal(_n('Un mensaje', '{n} mensajes', 3), '3 mensajes')
assert.equal(_p('tema', 'Cristal'), 'Cristal', 'the context is never shown')
setLanguage('fr-FR')
assert.equal(_('Salir'), 'Quit', 'other languages get English')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'locales' ? [] : files(path)
    // i18n.ts itself only has examples in its comments.
    return /\.(ts|svelte)$/.test(entry.name) && entry.name !== 'i18n.ts' ? [path] : []
  })
}

// The app and the account service (emails, pages) each have their own catalogs.
const PARTS = [
  { code: 'src', locales: 'src/renderer/src/locales' },
  { code: 'server/accounts/src', locales: 'server/accounts/src/locales' }
]
let failed = false

for (const { code, locales } of PARTS) {
  // Where each key is used, as file:line.
  const where = new Map<string, string[]>()
  for (const file of files(code)) {
    const source = readFileSync(file, 'utf8')
    for (const [key, index] of found(source)) {
      const line = source.slice(0, index).split('\n').length
      where.set(key, [...(where.get(key) ?? []), `${file}:${line}`])
    }
  }
  const used = new Set(where.keys())

  for (const name of readdirSync(locales).filter((f) => f.endsWith('.json'))) {
    const file = join(locales, name)
    const catalog: Record<string, string> = JSON.parse(readFileSync(file, 'utf8'))
    const unused = Object.keys(catalog).filter((key) => !used.has(key))
    const missing = [...used].filter((key) => !(key in catalog))
    const untranslated = Object.keys(catalog).filter((key) => used.has(key) && !catalog[key])
    const mismatched = Object.keys(catalog).filter(
      (key) => catalog[key] && placeholders(key) !== placeholders(catalog[key])
    )
    for (const key of mismatched)
      console.error(`${file}: placeholders differ in ${JSON.stringify(key)}`)
    if (mismatched.length) failed = true

    if (write) {
      const next: Record<string, string> = {}
      for (const key of [...used].sort((a, b) => a.localeCompare(b, 'es')))
        next[key] = catalog[key] ?? ''
      writeFileSync(file, JSON.stringify(next, null, 2) + '\n')
      console.log(`${file}: ${missing.length} added, ${unused.length} removed`)
      for (const key of Object.keys(next).filter((key) => !next[key]))
        console.log(`  ${JSON.stringify(key)}  ${where.get(key)!.join(' ')}`)
      continue
    }
    for (const key of unused) console.error(`${file}: unused ${JSON.stringify(key)}`)
    if (unused.length) failed = true
    if (missing.length || untranslated.length)
      console.warn(
        `${file}: ${missing.length} missing, ${untranslated.length} untranslated (npm run check:i18n -- --write)`
      )
  }
}

assert(!failed, 'translation catalogs need fixing (see above)')
console.log('i18n check passed')
