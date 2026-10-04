import { app, shell, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import tls from 'node:tls'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import devCert from '../../server/certs/localhost.crt?raw'
import { openHistory, type History } from './history'
import {
  DOMAIN,
  acceptRequest,
  addContact,
  login,
  logout,
  onChange,
  onMessage,
  rejectRequest,
  removeContact,
  sendBuzz,
  sendMessage,
  setPresence,
  snapshot,
  type ChatMessage,
  type Show
} from './xmpp'

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
    width: 360,
    height: 620,
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

// One window per conversation, like MSN.
const chats = new Map<string, BrowserWindow>()
let history: History
let account = '' // bare JID of the signed-in user

function openChat(contact: string, focus: boolean): BrowserWindow {
  const existing = chats.get(contact)
  if (existing) {
    if (focus) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    }
    return existing
  }
  const win = new BrowserWindow({
    width: 440,
    height: 520,
    minWidth: 320,
    minHeight: 360,
    show: false,
    autoHideMenuBar: true,
    title: contact.split('@')[0],
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload, sandbox: false, autoplayPolicy: 'no-user-gesture-required' }
  })
  chats.set(contact, win)
  win.on('closed', () => chats.delete(contact))
  win.on('focus', () => win.flashFrame(false))
  win.once('ready-to-show', () => (focus ? win.show() : win.showInactive()))
  loadRenderer(win, `chat=${encodeURIComponent(contact)}`)
  return win
}

// Incoming messages open the conversation without stealing focus, and flash it
// (taskbar on Linux, dock bounce on macOS).
function deliver(message: ChatMessage): void {
  if (account) history.save(account, message)
  const win = openChat(message.with, false)
  win.webContents.send('chat:message', message)
  if (!message.mine && !win.isFocused()) win.flashFrame(true)
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
  history = openHistory(join(app.getPath('userData'), 'history.sqlite'))

  ipcMain.handle('auth:login', async (_, username: string, password: string, register: boolean) => {
    const result = await login(String(username), String(password), Boolean(register))
    if (result.ok) account = result.jid
    return result
  })
  ipcMain.handle('auth:logout', async () => {
    await logout()
    account = ''
    chats.forEach((win) => win.close())
  })

  // Every window gets the full contact list on each change.
  onChange((state) => {
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('roster:changed', state))
  })
  const shows: Show[] = ['online', 'away', 'dnd']
  ipcMain.handle('roster:snapshot', () => snapshot())
  ipcMain.handle('roster:add', (_, address: string) => addContact(String(address)))
  ipcMain.handle('roster:accept', (_, jid: string) => acceptRequest(String(jid)))
  ipcMain.handle('roster:reject', (_, jid: string) => rejectRequest(String(jid)))
  ipcMain.handle('roster:remove', (_, jid: string) => removeContact(String(jid)))
  ipcMain.handle('presence:set', (_, show: Show, status: string) =>
    setPresence(shows.includes(show) ? show : 'online', String(status))
  )
  onMessage(deliver)
  ipcMain.handle('chat:open', (_, contact: string) => {
    openChat(String(contact), true)
  })
  ipcMain.handle('chat:history', (_, contact: string) =>
    account ? history.load(account, String(contact)) : []
  )
  ipcMain.handle('chat:send', async (_, contact: string, body: string) => {
    const text = String(body).trim().slice(0, 4000)
    if (text) deliver(await sendMessage(String(contact), text))
  })
  ipcMain.handle('chat:buzz', async (_, contact: string) =>
    deliver(await sendBuzz(String(contact)))
  )
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
