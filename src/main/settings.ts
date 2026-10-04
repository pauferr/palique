// App preferences for this computer, as a small JSON file.
import { readFileSync, writeFileSync } from 'node:fs'
import type { OwnShow } from './xmpp'

export type Settings = {
  winks: boolean // play winks full screen
  show: OwnShow // last status, used at the next sign-in (like MSN)
}

const DEFAULTS: Settings = { winks: true, show: 'online' }

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
