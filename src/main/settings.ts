// App preferences for this computer, as a small JSON file.
import { readFileSync, writeFileSync } from 'node:fs'
import type { OwnShow } from './xmpp'

export const THEMES = ['xp', 'win98', 'aero'] as const
export type Theme = (typeof THEMES)[number]

export type Settings = {
  theme: Theme
  winks: boolean // play winks full screen
  show: OwnShow // last status, used at the next sign-in (like MSN)
  email: string // last account signed in, pre-filled on the sign-in screen
  away: number // minutes without using the computer before showing as Away; 0 = never
  startup: boolean // open Palique when the computer starts
  autoLogin: boolean // sign in by itself at start (the password is kept encrypted apart)
  alertOnline: boolean // toast when a contact comes online
  alertMessages: boolean // toast when a message arrives
  sounds: boolean
  emoticons: boolean // show (L), :) … as emoji
  shake: boolean // buzzes shake the conversation window
  typing: boolean // show "está escribiendo…"
}

export const AWAY_MINUTES = [0, 5, 10, 15, 30]

const DEFAULTS: Settings = {
  theme: 'xp',
  winks: true,
  show: 'online',
  email: '',
  away: 10,
  startup: false,
  autoLogin: false,
  alertOnline: true,
  alertMessages: true,
  sounds: true,
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
  return {
    get: () => current,
    set(patch) {
      current = { ...current, ...patch }
      writeFileSync(file, JSON.stringify(current, null, 2))
      return current
    }
  }
}
