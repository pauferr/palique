// App preferences for this computer, as a small JSON file.
import { readFileSync, writeFileSync } from 'node:fs'
import type { OwnShow } from './xmpp'

export const THEMES = ['classic', 'retro', 'glass'] as const
export type Theme = (typeof THEMES)[number]

// 'theme' = the theme's own font; the rest are bundled (themes/fonts.css).
export const FONTS = [
  'theme',
  'comic',
  'nunito',
  'fira',
  'hand',
  'legible',
  'serif',
  'typewriter'
] as const
export type Font = (typeof FONTS)[number]

// Sound collections, drawn in the renderer (sounds.ts).
export const SOUND_PACKS = ['classic', 'velvet', 'crystal', 'bubble'] as const
export type SoundPack = (typeof SOUND_PACKS)[number]

export type Settings = {
  theme: Theme
  font: Font
  winks: boolean // play winks full screen
  show: OwnShow // last status, used at the next sign-in (like MSN)
  email: string // last account signed in, pre-filled on the sign-in screen
  away: number // minutes without using the computer before showing as Away; 0 = never
  startup: boolean // open Palique when the computer starts
  autoLogin: boolean // sign in by itself at start (the password is kept encrypted apart)
  alertOnline: boolean // toast when a contact comes online
  alertMessages: boolean // toast when a message arrives
  sounds: boolean
  soundPack: SoundPack
  emoticons: boolean // show (L), :) … as emoji
  shake: boolean // buzzes shake the conversation window
  typing: boolean // show "está escribiendo…"
}

export const AWAY_MINUTES = [0, 5, 10, 15, 30]

const DEFAULTS: Settings = {
  theme: 'classic',
  font: 'theme',
  winks: true,
  show: 'online',
  email: '',
  away: 10,
  startup: false,
  autoLogin: false,
  alertOnline: true,
  alertMessages: true,
  sounds: true,
  soundPack: 'classic',
  emoticons: true,
  shake: true,
  typing: true
}

// What the Options window may change: only known keys with valid values.
const SWITCHES = [
  'winks',
  'startup',
  'autoLogin',
  'alertOnline',
  'alertMessages',
  'sounds',
  'emoticons',
  'shake',
  'typing'
] as const

export function validPatch(patch: unknown): Partial<Settings> {
  const given = (patch ?? {}) as Record<string, unknown>
  const valid: Partial<Settings> = {}
  for (const key of SWITCHES) if (typeof given[key] === 'boolean') valid[key] = given[key]
  if (THEMES.includes(given.theme as Theme)) valid.theme = given.theme as Theme
  if (FONTS.includes(given.font as Font)) valid.font = given.font as Font
  if (SOUND_PACKS.includes(given.soundPack as SoundPack))
    valid.soundPack = given.soundPack as SoundPack
  if (AWAY_MINUTES.includes(given.away as number)) valid.away = given.away as number
  return valid
}

export type SettingsStore = {
  get(): Settings
  set(patch: Partial<Settings>): Settings
}

export function openSettings(file: string): SettingsStore {
  let current = DEFAULTS
  try {
    current = { ...DEFAULTS, ...JSON.parse(readFileSync(file, 'utf8')) }
  } catch {
    // First run or unreadable file: defaults.
  }
  if (!THEMES.includes(current.theme)) current = { ...current, theme: DEFAULTS.theme }
  if (!FONTS.includes(current.font)) current = { ...current, font: DEFAULTS.font }
  return {
    get: () => current,
    set(patch) {
      current = { ...current, ...patch }
      writeFileSync(file, JSON.stringify(current, null, 2))
      return current
    }
  }
}
