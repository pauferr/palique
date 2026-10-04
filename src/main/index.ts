import { app, shell, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import { join } from 'path'
import { writeFile } from 'node:fs/promises'
import tls from 'node:tls'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import devCert from '../../server/certs/localhost.crt?raw'
import { FORMATS, exportHistory, type ExportFormat, type ExportResult } from './export'
import { openHistory, type History } from './history'
import { openSettings, type SettingsStore } from './settings'
import {
  DOMAIN,
  acceptRequest,
  addContact,
  login,
  logout,
  onChange,
  onMessage,
  onTyping,
  isWinkId,
  rejectRequest,
  removeContact,
  sendBuzz,
  sendMessage,
  sendTyping,
  sendWink,
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
let settings: SettingsStore
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

let options: BrowserWindow | null = null

function openOptions(): void {
  if (options) {
    options.focus()
    return
  }
  options = new BrowserWindow({
    width: 420,
    height: 600,
    show: false,
    resizable: false,
    autoHideMenuBar: true,
    title: 'Opciones',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload, sandbox: false }
  })
  options.on('closed', () => (options = null))
  options.once('ready-to-show', () => options?.show())
  loadRenderer(options, 'options')
}

async function exportChats(win: BrowserWindow | null, format: ExportFormat): Promise<ExportResult> {
  const messages = account ? history.all(account) : []
  if (!messages.length) return 'empty'
  const day = new Date().toISOString().slice(0, 10)
  const save = { defaultPath: `palique-historial-${day}.${format}` }
  const { canceled, filePath } = win
    ? await dialog.showSaveDialog(win, save)
    : await dialog.showSaveDialog(save)
  if (canceled || !filePath) return 'canceled'
  await writeFile(filePath, exportHistory(format, account, messages), 'utf8')
  return 'saved'
}

// Incoming messages open the conversation without stealing focus, and flash it
// (taskbar on Linux, dock bounce on macOS).
function deliver(message: ChatMessage): void {
  if (account) history.save(account, message)
  const win = openChat(message.with, false)
  win.webContents.send('chat:message', message)
  if (!message.mine && !win.isFocused()) win.flashFrame(true)
}

// Protections: winks can be turned off, and each contact gets at most one
// full-screen wink per interval. Old ones (offline delivery) only show as text.
const WINK_INTERVAL = 20_000
const lastWink = new Map<string, number>()

function playWink(message: ChatMessage): void {
  if (!settings.get().winks || Date.now() - message.at > 60_000) return
  if (!message.mine) {
    if (Date.now() - (lastWink.get(message.with) ?? 0) < WINK_INTERVAL) return
    lastWink.set(message.with, Date.now())
  }
  showWink(message.wink)
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

  history = openHistory(join(app.getPath('userData'), 'history.sqlite'))
  settings = openSettings(join(app.getPath('userData'), 'settings.json'))

  ipcMain.handle('auth:login', async (_, username: string, password: string, register: boolean) => {
    const result = await login(String(username), String(password), Boolean(register))
    if (result.ok) account = result.jid
    return result
  })
  ipcMain.handle('auth:logout', async () => {
    await logout()
    account = ''
    chats.forEach((win) => win.close())
    options?.close()
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
  onMessage((message) => {
    deliver(message)
    // Our own winks sent from another device aren't replayed here.
    if (message.wink && !message.mine) playWink(message)
  })
  ipcMain.handle('chat:wink', async (_, contact: string, wink: string) => {
    if (!isWinkId(wink)) return
    const message = await sendWink(String(contact), wink)
    deliver(message)
    playWink(message)
  })
  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:set', (_, patch: { winks?: unknown }) =>
    typeof patch?.winks === 'boolean' ? settings.set({ winks: patch.winks }) : settings.get()
  )
  // Typing only matters if the conversation is open; it never opens a window.
  onTyping((contact, typing) =>
    chats.get(contact)?.webContents.send('chat:typing', contact, typing)
  )
  ipcMain.handle('chat:typing', (_, contact: string, typing: boolean) =>
    sendTyping(String(contact), Boolean(typing))
  )
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
  ipcMain.handle('options:open', () => openOptions())
  ipcMain.handle('history:export', (event, format: ExportFormat) =>
    exportChats(
      BrowserWindow.fromWebContents(event.sender),
      FORMATS.includes(format) ? format : 'html'
    )
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
