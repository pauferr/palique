// Translations, gettext style: the Spanish text is the key, so Spanish needs no file and a
// missing translation shows the Spanish. Shared by the renderer and the main process.
// Catalogs are flat JSON in locales/; `npm run check:i18n -- --write` adds new strings.
import en from './locales/en.json' with { type: 'json' }

export const LANGUAGES = ['es', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

const catalogs: Record<string, Record<string, string>> = { en }

let dict: Record<string, string> = {}
let plurals = new Intl.PluralRules('es')
export let lang: Language = 'es'

// Other languages ('fr', 'pt-BR'…) get English, the one more people can read.
export function setLanguage(code: string): void {
  lang = LANGUAGES.find((l) => code.toLowerCase().startsWith(l)) ?? 'en'
  dict = catalogs[lang] ?? {}
  plurals = new Intl.PluralRules(lang)
}

type Vars = Record<string, string | number>

const fill = (text: string, vars?: Vars): string =>
  vars ? text.replace(/\{(\w+)\}/g, (all, key) => (key in vars ? String(vars[key]) : all)) : text

// _('Hola, {name}', { name })
export function _(text: string, vars?: Vars): string {
  return fill(dict[text] || text, vars)
}

// The same Spanish text with a different meaning: _p('tema', 'Cristal') vs
// _p('sonidos', 'Cristal'). Stored as "tema::Cristal"; also for lone words a translator
// can't place (a letter on a button). The context is never shown.
export function _p(context: string, text: string, vars?: Vars): string {
  return fill(dict[`${context}::${text}`] || text, vars)
}

// Marks a text for translation where it's defined (lists, constants) without translating
// it yet; it's translated with _() where it's shown.
export const N_ = (text: string): string => text

// _n('Un mensaje', '{n} mensajes', n). Stored in the catalog under "one|other", translated
// the same way ("A message|{n} messages").
// ponytail: one/other only; languages with more forms (Polish, Arabic…) need a form per
// Intl.PluralRules category.
export function _n(one: string, other: string, n: number, vars?: Vars): string {
  const forms = (dict[`${one}|${other}`] || `${one}|${other}`).split('|')
  return fill(plurals.select(n) === 'one' ? forms[0] : forms[1] || forms[0], { n, ...vars })
}
