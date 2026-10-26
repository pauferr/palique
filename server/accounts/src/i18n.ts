// Translations for emails and pages, as in the app (src/renderer/src/i18n.ts): the Spanish
// text is the key and a missing translation shows the Spanish. A copy, not shared, because
// this service is built on its own. Each email goes out in the language the app asked in.
import en from './locales/en.json' with { type: 'json' }

export type Language = 'es' | 'en'

const catalogs: Partial<Record<Language, Record<string, string>>> = { en }

// Like the app: anything other than Spanish gets English.
export const language = (code: unknown): Language =>
  String(code ?? '')
    .toLowerCase()
    .startsWith('es')
    ? 'es'
    : 'en'

// The language an email was asked in. Apps from before translations don't say, and
// they were Spanish only.
export const requested = (code: unknown): Language => language(code || 'es')

type Vars = Record<string, string | number>
export type Translate = (text: string, vars?: Vars) => string

// const _ = translator(lang); _('Hola, {name}', { name })
export function translator(lang: Language): Translate {
  const dict = catalogs[lang] ?? {}
  return (text, vars) =>
    (dict[text] || text).replace(/\{(\w+)\}/g, (all, key) =>
      vars && key in vars ? String(vars[key]) : all
    )
}
