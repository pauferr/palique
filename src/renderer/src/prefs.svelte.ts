// The app preferences, shared by every component of a window and kept in sync when the
// Options window changes them.
import type { Settings } from '../../main/settings'

export const prefs: Pick<Settings, 'sounds' | 'soundPack' | 'emoticons' | 'shake' | 'typing'> =
  $state({
    sounds: true,
    soundPack: 'classic',
    emoticons: true,
    shake: true,
    typing: true
  })

const update = (settings: Settings): void => {
  prefs.sounds = settings.sounds
  prefs.soundPack = settings.soundPack
  prefs.emoticons = settings.emoticons
  prefs.shake = settings.shake
  prefs.typing = settings.typing
}
window.api.getSettings().then(update)
window.api.onSettings(update)
