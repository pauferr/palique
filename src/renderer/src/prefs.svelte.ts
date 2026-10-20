// The app preferences, shared by every component of a window and kept in sync when the
// Options window changes them.
import type { Settings } from '../../main/settings'

export const prefs: Pick<Settings, 'winks' | 'sounds' | 'emoticons' | 'shake' | 'typing'> = $state({
  winks: true,
  sounds: true,
  emoticons: true,
  shake: true,
  typing: true
})

const update = (settings: Settings): void => {
  prefs.winks = settings.winks
  prefs.sounds = settings.sounds
  prefs.emoticons = settings.emoticons
  prefs.shake = settings.shake
  prefs.typing = settings.typing
}
window.api.getSettings().then(update)
window.api.onSettings(update)
