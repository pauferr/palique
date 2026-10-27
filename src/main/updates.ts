// New releases, from GitHub. Windows and Linux download them in the background and install
// on quit (or "Reiniciar ahora"). macOS can't: the app is only ad-hoc signed, and installing
// an update needs an Apple Developer ID, so there it only tells the user to download it.
// Drafts are invisible until published. The only module that knows electron-updater.
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

// 'available': macOS, download it by hand. 'ready': downloaded, installs on quit.
export type UpdateStatus = { state: 'available' | 'ready'; version: string }

const CHECK_EVERY = 6 * 60 * 60_000

export function startUpdates(onStatus: (status: UpdateStatus) => void): void {
  if (!app.isPackaged) return
  const manual = process.platform === 'darwin'
  autoUpdater.autoDownload = !manual
  // With a stage (v0.15.0-beta), pre-releases count too: an alpha moves up to the beta.
  autoUpdater.allowPrerelease = app.getVersion().includes('-')
  // Problems go to palique.log (see index.ts); routine progress stays out.
  autoUpdater.logger = { info: () => {}, debug: () => {}, warn: console.warn, error: () => {} }
  autoUpdater.on('error', (e) => console.error('update failed:', e))
  if (manual) {
    autoUpdater.on('update-available', ({ version }) => onStatus({ state: 'available', version }))
  } else {
    autoUpdater.on('update-downloaded', ({ version }) => onStatus({ state: 'ready', version }))
  }
  const check = (): void => void autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, CHECK_EVERY)
}

// Windows and Linux: restart into the downloaded version.
export const installNow = (): void => autoUpdater.quitAndInstall()
