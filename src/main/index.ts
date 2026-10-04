import { app, shell, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import tls from 'node:tls'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import devCert from '../../server/certs/localhost.crt?raw'
import { DOMAIN, login, logout } from './xmpp'

// Native Wayland clients can't stay on top in every compositor (GNOME refuses),
// which would break the full-screen wink overlay. XWayland handles it everywhere.
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform', 'x11')

// The local Prosody uses a dev-only self-signed cert: trust exactly that one, keep verification on.
if (DOMAIN === 'localhost') {
  tls.setDefaultCACertificates([...tls.getCACertificates('default'), devCert])
}

const preload = join(__dirname, '../preload/index.js')

// Every window loads the same renderer; the hash picks the view.
function loadRenderer(win: BrowserWindow, hash = ''): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload, sandbox: false }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)
}

// Transparent, click-through window over the whole primary display.
function showWink(id: string): void {
  const win = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload, sandbox: false, autoplayPolicy: 'no-user-gesture-required' }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true)
  win.once('ready-to-show', () => win.showInactive())
  loadRenderer(win, `wink=${encodeURIComponent(id)}`)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.palique.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('wink:play', (_, id: string) => showWink(id))
  ipcMain.handle('auth:login', (_, username: string, password: string, register: boolean) =>
    login(String(username), String(password), Boolean(register))
  )
  ipcMain.handle('auth:logout', () => logout())
  ipcMain.on('wink:done', (event) => BrowserWindow.fromWebContents(event.sender)?.close())

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
