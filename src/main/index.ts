import {
  app,
  shell,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  powerMonitor,
  safeStorage,
  screen
} from 'electron'
import { join, resolve } from 'path'
import { readFile, rm, writeFile } from 'node:fs/promises'
import tls from 'node:tls'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import devCert from '../../server/certs/localhost.crt?raw'
import {
  ARRIVAL_INTERVAL,
  BUZZ_INTERVAL,
  NOTIFY_INTERVAL,
  WINK_INTERVAL,
  cooldown
} from './cooldown'
import { FORMATS, exportHistory, type ExportFormat, type ExportResult } from './export'
import { openHistory, type History } from './history'
import { openLog } from './log'
import { installNow, startUpdates, type UpdateStatus } from './updates'
import { cameOnline } from './presence'
import { emojify } from '../renderer/src/emoticons'
import { stripPlus } from '../renderer/src/plus'
import { versionLabel } from '../renderer/src/version'
import { winkLabel } from '../renderer/src/wink-labels'
import { openSettings, validPatch, type SettingsStore } from './settings'
import {
  AVATAR_MAX_BYTES,
  DOMAIN,
  acceptRequest,
  accountFor,
  addContact,
  changeEmail,
  emailStatus,
  inviteByEmail,
  inviteInfo,
  inviteStatus,
  lookupContact,
  onEmail,
  requestPasswordReset,
  resendVerification,
  setNewsletter,
  setNick,
  login,
  logout,
  onChange,
  onMessage,
  onTyping,
  isWinkId,
  ownShow,
  ownStatus,
  rejectRequest,
  winkId,
  removeContact,
  sendBuzz,
  sendMessage,
  sendTyping,
  sendWink,
  setAppVersion,
  setAvatar,
  setPresence,
  cleanNick,
  snapshot,
  type AuthLink,
  type AuthResult,
  type ChatMessage,
  type OwnShow,
  type Snapshot
} from './xmpp'

// One Palique per user: opening it again (e.g. from the app menu) shows the existing
// window. That's also the way back on desktops without a tray (GNOME by default).
if (!app.requestSingleInstanceLock()) app.exit(0)

// Errors and warnings also go to palique.log (see log.ts), for the user to send us when
// something fails: Ayuda → «Registro de errores…» opens its folder.
const logFile = join(app.getPath('logs'), 'palique.log')
const log = openLog(logFile)
const { error: consoleError, warn: consoleWarn } = console
console.error = (...parts: unknown[]): void => {
  consoleError(...parts)
  // Node's notice that node:sqlite is experimental comes on every start: not an error.
  if (!String(parts[0]).includes('ExperimentalWarning')) log.write('error', ...parts)
}
console.warn = (...parts: unknown[]): void => {
  consoleWarn(...parts)
  log.write('warn', ...parts)
}
log.write(
  'info',
  `start ${app.isPackaged ? app.getVersion() : 'dev'} ${process.platform} ${process.arch}`,
  `electron ${process.versions.electron}${process.env['WAYLAND_DISPLAY'] ? ' wayland' : ''}`
)
process.on('uncaughtException', (e) => log.write('error', 'uncaught:', e))
process.on('unhandledRejection', (e) => log.write('error', 'unhandled rejection:', e))
app.on('render-process-gone', (_, __, details) => log.write('error', 'renderer gone:', details))
app.on('child-process-gone', (_, details) => log.write('error', 'process gone:', details))

// palique:// links (invite and password recovery emails). In development Electron itself
// is the handler, so it needs the app's path to know what to open.
if (process.defaultApp && process.argv[1]) {
  app.setAsDefaultProtocolClient('palique', process.execPath, [resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient('palique')
}

let pendingLink: AuthLink | null = null

// Only palique://signup?t=… and palique://reset?e=…&t=… with sane values; anything
// else is ignored.
function parseLink(value: string | undefined): AuthLink | null {
  if (!value?.startsWith('palique://')) return null
  try {
    const url = new URL(value)
    const token = url.searchParams.get('t') ?? ''
    const email = url.searchParams.get('e') ?? ''
    if (!/^[\w-]{8,64}$/.test(token)) return null
    if (url.hostname === 'signup') return { kind: 'invite', token, email: '' }
    if (url.hostname === 'reset' && email.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(email)) {
      return { kind: 'reset', token, email }
    }
    return null
  } catch {
    return null
  }
}

// Opens the sign-up or "new password" form, filled in (never submitted by itself).
function openLink(link: AuthLink | null): void {
  if (!link) return
  pendingLink = link
  showMain()
  mainWindow?.webContents.send('auth:link', link)
}

// macOS delivers links as an event (possibly before the app is ready)…
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (app.isReady()) openLink(parseLink(url))
  else pendingLink = parseLink(url)
})
// …Linux and Windows as an argument, at launch or to the already running instance.
pendingLink ??= parseLink(process.argv.find((arg) => arg.startsWith('palique://')))

// On Wayland a window can't force itself above the rest in every compositor (GNOME
// refuses), so winks play inside the conversation instead of full screen. (Forcing
// XWayland for the overlay left no window at all where there's no XWayland, like niri.)
const wayland = process.platform === 'linux' && Boolean(process.env['WAYLAND_DISPLAY'])

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

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 680,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload, sandbox: false, autoplayPolicy: 'no-user-gesture-required' }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // If rendering fails (e.g. the GPU process keeps crashing) 'ready-to-show' may never
  // come: show the window anyway rather than run with nothing on screen.
  setTimeout(() => mainWindow?.isVisible() || mainWindow?.show(), 3000)
  // Closing the contact list keeps Palique running (tray, notifications), like MSN.
  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('closed', () => (mainWindow = null))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)
}

function showMain(): void {
  if (!mainWindow) return createWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  const size = process.platform === 'darwin' ? 16 : 22
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: size, height: size }))
  tray.setToolTip('Palique')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Palique', click: showMain },
      { type: 'separator' },
      { label: 'Salir', click: () => app.quit() }
    ])
  )
  tray.on('click', showMain)
}

// Desktop notifications. Silent: the app plays its own sounds. Muted while busy.
// Kept referenced until closed, or the click handler can be garbage-collected.
const notifications = new Set<Notification>()

function notify(title: string, body: string, onClick: () => void): void {
  if (!Notification.isSupported() || ownShow() === 'dnd') return
  const notification = new Notification({ title, body, silent: true })
  notifications.add(notification)
  notification.on('click', () => {
    onClick()
    notifications.delete(notification)
  })
  notification.on('close', () => notifications.delete(notification))
  notification.show()
}

// Native titles can't hold images or colors: emoticon codes become plain emoji, and
// Messenger Plus! codes go.
const contactName = (jid: string): string => {
  const name = stripPlus(snapshot().contacts.find((c) => c.jid === jid)?.name ?? '') || 'Sin nombre'
  return settings.get().emoticons ? emojify(name) : name
}

function notifyMessage(message: ChatMessage): void {
  if (!settings.get().alertMessages) return
  const body = message.buzz
    ? '¡Te ha enviado un zumbido!'
    : message.wink
      ? 'Te ha enviado un guiño'
      : message.body.length > 120
        ? `${message.body.slice(0, 120)}…`
        : message.body
  notify(contactName(message.with), body, () => openChat(message.with, true))
}

// "lolo se ha conectado", except for the burst of presences right after we sign in.
let previous: Snapshot = {
  connected: false,
  jid: '',
  contacts: [],
  requests: [],
  name: '',
  avatar: '',
  show: 'online',
  status: ''
}
let connectedAt = 0
const arrivals = cooldown(ARRIVAL_INTERVAL)

function announceArrivals(state: Snapshot): void {
  if (state.connected && !previous.connected) connectedAt = Date.now()
  if (Date.now() - connectedAt > 5000) {
    for (const jid of cameOnline(previous, state)) {
      // Someone flapping online/offline gets announced once a minute at most.
      if (arrivals.take(jid)) continue
      // Busy: no arrival sound either (the toast is already muted in notify()).
      if (ownShow() !== 'dnd' && settings.get().sounds) {
        mainWindow?.webContents.send('contact:online', jid)
      }
      if (settings.get().alertOnline) {
        notify(`${contactName(jid)} se ha conectado`, '', () => openChat(jid, true))
      }
    }
  }
  previous = state
}

// One window per conversation, like MSN.
const chats = new Map<string, BrowserWindow>()
const pending = new Map<string, [ChatMessage, boolean][]>()
let history: History
let settings: SettingsStore
let account = '' // bare JID of the signed-in user

function openChat(contact: string, focus: boolean): BrowserWindow {
  setUnread(contact, 0)
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
    title: contactName(contact),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload, sandbox: false, autoplayPolicy: 'no-user-gesture-required' }
  })
  chats.set(contact, win)
  // Live messages for a window that isn't listening yet wait here until it says so
  // ('chat:ready'), so it gets them (and whether they're quiet) as live events.
  pending.set(contact, [])
  win.on('closed', () => {
    chats.delete(contact)
    pending.delete(contact)
  })
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
    width: 600,
    height: 500,
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

// Changing our display name, with its Messenger Plus! colors: a small window of its own.
let nickWindow: BrowserWindow | null = null

function openNick(): void {
  if (nickWindow) {
    nickWindow.focus()
    return
  }
  nickWindow = new BrowserWindow({
    width: 480,
    height: 560,
    show: false,
    resizable: false,
    autoHideMenuBar: true,
    title: 'Cambiar tu nombre',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload, sandbox: false }
  })
  nickWindow.on('closed', () => (nickWindow = null))
  nickWindow.once('ready-to-show', () => nickWindow?.show())
  loadRenderer(nickWindow, 'nick')
}

let aboutWindow: BrowserWindow | null = null

function openAbout(): void {
  if (aboutWindow) {
    aboutWindow.focus()
    return
  }
  aboutWindow = new BrowserWindow({
    width: 340,
    height: 280,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    title: 'Acerca de Palique',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload, sandbox: false }
  })
  aboutWindow.on('closed', () => (aboutWindow = null))
  aboutWindow.once('ready-to-show', () => aboutWindow?.show())
  loadRenderer(aboutWindow, 'about')
}

// The format is picked in the save dialog, by file type (HTML unless another one).
const EXPORT_TYPES = [
  { name: 'Página web', extensions: ['html'] },
  { name: 'Texto', extensions: ['txt'] },
  { name: 'Datos (JSON)', extensions: ['json'] }
]

async function exportChats(win: BrowserWindow | null): Promise<ExportResult> {
  const messages = account ? history.all(account).map(currentWink) : []
  if (!messages.length) return 'empty'
  const day = new Date().toISOString().slice(0, 10)
  const save = { defaultPath: `palique-conversaciones-${day}.html`, filters: EXPORT_TYPES }
  const { canceled, filePath } = win
    ? await dialog.showSaveDialog(win, save)
    : await dialog.showSaveDialog(save)
  if (canceled || !filePath) return 'canceled'
  const extension = filePath.split('.').pop()?.toLowerCase() as ExportFormat
  const format = FORMATS.includes(extension) ? extension : 'html'
  const state = snapshot()
  const name = (jid: string): string =>
    jid === account ? state.name : (state.contacts.find((c) => c.jid === jid)?.name ?? jid)
  await writeFile(filePath, exportHistory(format, account, messages, name, winkLabel), 'utf8')
  return 'saved'
}

// "Sign in automatically": the password is kept apart from the settings, encrypted by
// the system (Keychain on macOS, DPAPI on Windows, the keyring on Linux). Without system
// encryption the option isn't offered.
const passwordFile = (): string => join(app.getPath('userData'), 'password.bin')
const canRemember = (): boolean => safeStorage.isEncryptionAvailable()

async function rememberPassword(password: string): Promise<void> {
  if (canRemember()) await writeFile(passwordFile(), safeStorage.encryptString(password))
}

async function savedPassword(): Promise<string> {
  try {
    return safeStorage.decryptString(await readFile(passwordFile()))
  } catch {
    return ''
  }
}

function forgetPassword(): void {
  rm(passwordFile(), { force: true }).catch(() => {})
}

// Away after a while without using the computer, like MSN, and back when you return.
// Only from Conectado: Ocupado or Invisible were chosen on purpose.
let autoAway = false

function checkIdle(): void {
  const minutes = settings.get().away
  const idle = powerMonitor.getSystemIdleTime()
  if (!account) {
    autoAway = false
  } else if (!autoAway && minutes && ownShow() === 'online' && idle >= minutes * 60) {
    autoAway = true
    setPresence('away', ownStatus()).catch(() => {})
  } else if (autoAway && (idle < 5 || ownShow() !== 'away')) {
    if (ownShow() === 'away') setPresence('online', ownStatus()).catch(() => {})
    autoAway = false
  }
}

// Unread messages per contact, MSN style: the contact blinks in the list with a count
// (and the dock icon shows the total) until its conversation is opened.
const unread = new Map<string, number>()
// Winks that came live while their conversation was closed: they play when it opens.
const unseenWinks = new Map<string, string[]>()

function setUnread(contact: string, count: number): void {
  if (count) unread.set(contact, count)
  else if (!unread.delete(contact)) return
  mainWindow?.webContents.send('chat:unread', Object.fromEntries(unread))
  app.setBadgeCount([...unread.values()].reduce((a, b) => a + b, 0))
}

// Messages for an open conversation go to it, and flash it if it isn't focused (taskbar
// on Linux, dock bounce on macOS). With no conversation open they wait in the contact
// list instead, buzzes too.
// `quiet`: no shaking, sounds, flashing or toasts (old messages, e.g. while offline).
// Busy (dnd): no sounds, shaking or toasts, but windows still flash.
function deliver(message: ChatMessage, quiet = false): void {
  if (account) history.save(account, message)
  const dnd = !message.mine && ownShow() === 'dnd'
  const silent = quiet || dnd
  if (!chats.has(message.with)) {
    // Ours from another device are only history.
    if (message.mine) return
    setUnread(message.with, (unread.get(message.with) ?? 0) + 1)
    if (message.wink && !quiet) {
      unseenWinks.set(message.with, [...(unseenWinks.get(message.with) ?? []), message.wink])
    }
    if (!silent && settings.get().sounds)
      mainWindow?.webContents.send('chat:incoming', Boolean(message.buzz))
    if (quiet) return
    if (mainWindow?.isVisible() && !mainWindow.isFocused()) mainWindow.flashFrame(true)
    if (!notified.take(message.with)) notifyMessage(message)
    return
  }
  const win = openChat(message.with, false)
  const queue = pending.get(message.with)
  if (queue) queue.push([message, silent])
  else win.webContents.send('chat:message', message, silent)
  if (message.mine || quiet || win.isFocused()) return
  win.flashFrame(true)
  // A burst of messages from one contact gets one toast.
  if (!notified.take(message.with)) notifyMessage(message)
}

// Anti-spam. Buzzes and winks are limited per contact both ways: we can't send more
// often, and other clients (which may have no limit) can't flood us. Received ones over
// the limit are dropped entirely: a buzz or wink without its effect is just noise.
const sentWinks = cooldown(WINK_INTERVAL)
const sentBuzzes = cooldown(BUZZ_INTERVAL)
const gotWinks = cooldown(WINK_INTERVAL)
const gotBuzzes = cooldown(BUZZ_INTERVAL)
const notified = cooldown(NOTIFY_INTERVAL)

// History may hold winks saved with their old Spanish ids.
const currentWink = (message: ChatMessage): ChatMessage =>
  message.wink ? { ...message, wink: winkId(message.wink) } : message

// Stored by the server while we were offline (or just old): delivered quietly. They wait
// in the contact list at sign-in, with no sounds, flashing or a toast storm.
const isLate = (message: ChatMessage): boolean =>
  Boolean(message.delayed) || Date.now() - message.at > 60_000

function playWink(message: ChatMessage): void {
  // Only in an open conversation (otherwise it waits there, and can be replayed from it).
  // The wink video has sound, so not while busy either.
  const show = !isLate(message) && ownShow() !== 'dnd'
  const chat = chats.get(message.with)
  if (show && chat) showWink(message.wink, chat)
}

// Transparent, click-through window over the whole primary display. Inside the
// conversation window instead on Wayland (see `wayland`) or with full-screen winks off. One at a time: winks that cross (ours
// and theirs) wait and play after it, in the order they came.
let winkWindow: BrowserWindow | null = null
const winkQueue: string[] = []

function showWink(id: string, chat: BrowserWindow | null): void {
  if ((wayland || !settings.get().winks) && chat) {
    return chat.webContents.send('chat:wink-play', id)
  }
  if (winkWindow) return void winkQueue.push(id)
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
  // skipTransformProcessType: otherwise macOS briefly turns Palique into a background app
  // to show the overlay over full-screen spaces, which hides the dock icon and sends every
  // other Palique window behind other apps. (So the wink may not show over another app's
  // native full-screen space on macOS.)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  win.setIgnoreMouseEvents(true)
  win.once('ready-to-show', () => win.showInactive())
  winkWindow = win
  win.on('closed', () => {
    winkWindow = null
    const next = winkQueue.shift()
    if (next) showWink(next, null)
  })
  loadRenderer(win, `wink=${encodeURIComponent(id)}`)
}

app.whenReady().then(() => {
  setAppVersion(app.getVersion())
  electronApp.setAppUserModelId('com.palique.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    // The renderer's errors (exceptions, failed IPC calls) end up in the log too.
    window.webContents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
      if (level === 'error') log.write('error', `renderer: ${message} (${sourceId}:${lineNumber})`)
    })
  })

  history = openHistory(join(app.getPath('userData'), 'history.sqlite'))
  settings = openSettings(join(app.getPath('userData'), 'settings.json'))
  setInterval(checkIdle, 15_000)

  const shows: OwnShow[] = ['online', 'away', 'dnd', 'invisible']
  // Sign in with the last status and personal message, so an invisible user is never
  // briefly visible.
  const lastPresence = (): { show: OwnShow; status: string } => {
    const { show, status } = settings.get()
    return {
      show: shows.includes(show) ? show : 'online',
      status: typeof status === 'string' ? status : ''
    }
  }
  // Errors before reaching the XMPP server (the account service) as sign-in errors.
  const failed = (e: unknown): AuthResult => {
    const error = (e as Error).message
    return {
      ok: false,
      error:
        error === 'wait' || error === 'invalid-invite' || error === 'outdated'
          ? error
          : 'unreachable'
    }
  }
  // Signed in: remember the email for next time (pre-filled on the sign-in screen).
  const signedIn = (result: AuthResult, email: string): AuthResult => {
    if (result.ok) {
      account = result.jid
      pendingLink = null
      settings.set({ email })
    }
    return result
  }
  const clean = (email: unknown): string => String(email).trim().toLowerCase()

  // `remember`: the sign-in screen's "Iniciar sesión automáticamente" box.
  ipcMain.handle('auth:login', async (_, email: string, password: string, remember: unknown) => {
    try {
      const username = await accountFor(clean(email))
      const result = await login(username, String(password), lastPresence())
      if (result.ok && typeof remember === 'boolean') {
        settings.set({ autoLogin: remember && canRemember() })
        if (remember) await rememberPassword(String(password))
        else forgetPassword()
      }
      return signedIn(result, clean(email))
    } catch (e) {
      return failed(e)
    }
  })
  // Once per launch, before the sign-in screen shows: sign in by itself if asked to.
  // After signing out, the screen stays (null means "nothing to do").
  let triedAuto = false
  ipcMain.handle('auth:auto', async () => {
    if (triedAuto) return null
    triedAuto = true
    const { autoLogin, email } = settings.get()
    const password = autoLogin && email ? await savedPassword() : ''
    if (!password) return null
    try {
      const result = await login(await accountFor(email), password, lastPresence())
      // A changed password: forget the old one, the sign-in screen asks.
      if (!result.ok && result.error === 'not-authorized') forgetPassword()
      return signedIn(result, email)
    } catch (e) {
      return failed(e)
    }
  })
  // For the Options window: whether "sign in automatically" can work here, and whether a
  // password is saved for it yet.
  ipcMain.handle('auth:remembered', async () => ({
    available: canRemember(),
    saved: canRemember() && (await savedPassword()) !== ''
  }))
  // Which address an invite is for (the sign-up form shows it).
  ipcMain.handle('auth:invite', async (_, token: string) => {
    try {
      return { ok: true, email: (await inviteInfo(String(token).trim())).email }
    } catch (e) {
      return failed(e)
    }
  })
  type Signup = { token: string; nick: string; password: string; newsletter: boolean }
  ipcMain.handle('auth:register', async (_, signup: Signup) => {
    try {
      const token = String(signup.token).trim()
      const nick = cleanNick(signup.nick)
      if (!nick) return { ok: false, error: 'unknown' }
      const invite = await inviteInfo(token)
      const result = await login(invite.username, String(signup.password), {
        invite: token,
        nick,
        ...lastPresence()
      })
      if (result.ok && signup.newsletter) await setNewsletter(true).catch(() => {})
      return signedIn(result, invite.email)
    } catch (e) {
      return failed(e)
    }
  })
  ipcMain.handle('auth:forgot', (_, email: string) => requestPasswordReset(clean(email)))
  // Sets a new password with the emailed code, then signs in with it.
  ipcMain.handle('auth:reset', async (_, email: string, token: string, password: string) => {
    try {
      const username = await accountFor(clean(email))
      const result = await login(username, String(password), {
        invite: String(token).trim(),
        ...lastPresence()
      })
      if (result.ok && settings.get().autoLogin) await rememberPassword(String(password))
      return signedIn(result, clean(email))
    } catch (e) {
      return failed(e)
    }
  })
  // A link may have opened the app before the sign-in screen was listening.
  ipcMain.handle('auth:pending-link', () => pendingLink)
  ipcMain.handle('auth:last-email', () => settings.get().email)
  ipcMain.handle('auth:logout', async () => {
    await logout()
    account = ''
    for (const contact of [...unread.keys()]) setUnread(contact, 0)
    unseenWinks.clear()
    chats.forEach((win) => win.close())
    options?.close()
    nickWindow?.close()
  })

  // Every window gets the full contact list on each change.
  onChange((state) => {
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('roster:changed', state))
    announceArrivals(state)
  })
  onEmail((email) => {
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('account:email', email))
  })
  ipcMain.handle('account:email', () => emailStatus())
  ipcMain.handle('account:set-email', (_, address: string) =>
    changeEmail(clean(address)).then((email) => {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('account:email', email))
      return email
    })
  )
  ipcMain.handle('account:resend', () => resendVerification())
  ipcMain.handle('account:newsletter', (_, subscribe: boolean) =>
    setNewsletter(Boolean(subscribe)).then((email) => {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('account:email', email))
      return email
    })
  )
  ipcMain.handle('account:nick', (_, name: string) => setNick(String(name)))
  ipcMain.handle('invites:status', () => inviteStatus())
  ipcMain.handle('invites:email', (_, address: string) => inviteByEmail(clean(address)))
  ipcMain.handle('roster:snapshot', () => snapshot())
  // By email. Inviting someone without an account is a separate, explicit step.
  ipcMain.handle(
    'roster:add',
    async (_, address: string): Promise<'added' | 'not-found' | 'self'> => {
      const jid = await lookupContact(clean(address))
      if (!jid) return 'not-found'
      if (jid === account) return 'self'
      await addContact(jid)
      return 'added'
    }
  )
  ipcMain.handle('roster:accept', (_, jid: string) => acceptRequest(String(jid)))
  ipcMain.handle('roster:reject', (_, jid: string) => rejectRequest(String(jid)))
  ipcMain.handle('roster:remove', (_, jid: string) => removeContact(String(jid)))
  ipcMain.handle('presence:set', async (_, show: OwnShow, status: string) => {
    const valid = shows.includes(show) ? show : 'online'
    await setPresence(valid, String(status))
    settings.set({ show: valid, status: snapshot().status })
  })
  onMessage((message) => {
    const effect = !message.mine && (message.buzz || message.wink)
    if (effect && (message.buzz ? gotBuzzes : gotWinks).take(message.with)) return
    deliver(message, isLate(message))
    // Our own winks sent from another device aren't replayed here.
    if (message.wink && !message.mine) playWink(message)
  })
  // Both return the ms until the next one is allowed (refused if that's not 0 yet).
  ipcMain.handle('chat:wink', async (_, contact: string, wink: string) => {
    if (!isWinkId(wink)) return 0
    const wait = sentWinks.take(String(contact))
    if (wait) return wait
    const message = await sendWink(String(contact), wink)
    deliver(message)
    playWink(message)
    return WINK_INTERVAL
  })
  // The renderer resizes the picture to a small PNG; still check it here.
  ipcMain.handle('avatar:set', (_, png: unknown) => {
    const isPng =
      png instanceof Uint8Array &&
      png.length <= AVATAR_MAX_BYTES &&
      Buffer.from(png.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    return isPng ? setAvatar(png) : undefined
  })
  ipcMain.handle('logs:open', () => shell.showItemInFolder(logFile))
  // "v0.3.0 (alpha)". Releases get their version at build time (see release.yml);
  // development shows the next one.
  ipcMain.handle('app:version', () => {
    const version = app.isPackaged ? app.getVersion() : __DEV_VERSION__
    return version ? versionLabel(version) : 'desarrollo'
  })
  ipcMain.handle('settings:get', () => settings.get())
  // Only known keys with valid values; every window hears about the change (e.g. the theme).
  ipcMain.handle('settings:set', (_, patch: unknown) => {
    const valid = validPatch(patch)
    if (valid.startup !== undefined) app.setLoginItemSettings({ openAtLogin: valid.startup })
    if (valid.autoLogin === false) forgetPassword()
    const current = settings.set(valid)
    BrowserWindow.getAllWindows().forEach((win) =>
      win.webContents.send('settings:changed', current)
    )
    return current
  })
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
  ipcMain.on('chat:ready', (_, contact: string) => {
    const win = chats.get(String(contact))
    pending.get(String(contact))?.forEach(([message, quiet]) => {
      win?.webContents.send('chat:message', message, quiet)
    })
    pending.delete(String(contact))
    // Unseen winks play now, in order (not while busy, like live ones).
    const winks = unseenWinks.get(String(contact)) ?? []
    unseenWinks.delete(String(contact))
    if (ownShow() !== 'dnd') winks.forEach((id) => showWink(id, win ?? null))
  })
  ipcMain.handle('chat:unread', () => Object.fromEntries(unread))
  // Clicking a wink in a conversation plays it again.
  ipcMain.on('chat:replay-wink', (event, wink: string) => {
    if (isWinkId(wink)) showWink(wink, BrowserWindow.fromWebContents(event.sender))
  })
  ipcMain.handle('chat:history', (_, contact: string) =>
    account ? history.load(account, String(contact)).map(currentWink) : []
  )
  ipcMain.handle('chat:send', async (_, contact: string, body: string) => {
    const text = String(body).trim().slice(0, 4000)
    if (text) deliver(await sendMessage(String(contact), text))
  })
  ipcMain.handle('chat:buzz', async (_, contact: string) => {
    const wait = sentBuzzes.take(String(contact))
    if (wait) return wait
    deliver(await sendBuzz(String(contact)))
    return BUZZ_INTERVAL
  })
  ipcMain.handle('options:open', () => openOptions())
  ipcMain.handle('nick:open', () => openNick())
  ipcMain.handle('about:open', () => openAbout())
  ipcMain.handle('history:export', (event) =>
    exportChats(BrowserWindow.fromWebContents(event.sender))
  )
  // A buzz shakes the whole conversation window. Not on Wayland, where windows can't move
  // themselves: the conversation shakes its contents instead (false).
  ipcMain.handle('chat:shake', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (wayland || !win) return false
    const [x, y] = win.getPosition()
    for (const [dx, dy] of [
      [-8, 3],
      [8, -3],
      [-8, 3],
      [8, -3],
      [-8, 3],
      [0, 0]
    ]) {
      if (win.isDestroyed()) break
      win.setPosition(x + dx, y + dy)
      await new Promise((resolve) => setTimeout(resolve, 60))
    }
    return true
  })
  // Native menus, so they can reach past the window's edges. The renderer sends labels
  // (an item, a radio with `checked`, or '-'), gets back the index picked, or -1.
  ipcMain.handle('menu:popup', (event, items: unknown, x: number, y: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !Array.isArray(items)) return -1
    return new Promise<number>((resolve) => {
      const template = items.slice(0, 20).map((item, i): Electron.MenuItemConstructorOptions => {
        if (item === '-') return { type: 'separator' }
        const { label, checked } = (item ?? {}) as { label?: unknown; checked?: unknown }
        return {
          label: String(label).slice(0, 100),
          ...(typeof checked === 'boolean' ? { type: 'radio', checked } : {}),
          click: () => resolve(i)
        }
      })
      // ponytail: clicks may land just after the menu closes; 100 ms covers it.
      Menu.buildFromTemplate(template).popup({
        window: win,
        x: Math.round(Number(x)) || 0,
        y: Math.round(Number(y)) || 0,
        callback: () => setTimeout(() => resolve(-1), 100)
      })
    })
  })
  ipcMain.on('wink:done', (event) => BrowserWindow.fromWebContents(event.sender)?.close())

  // New releases: every window shows the notice (sign-in screen and contact list).
  let update: UpdateStatus | null = null
  startUpdates((status) => {
    update = status
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('update:changed', status))
  })
  ipcMain.handle('update:get', () => update)
  ipcMain.handle('update:install', () => {
    if (update?.state === 'ready') installNow()
  })

  createWindow()
  createTray()
  app.on('second-instance', (_, argv) => {
    showMain()
    openLink(parseLink(argv.find((arg) => arg.startsWith('palique://'))))
  })
  // macOS: clicking the dock icon brings the contact list back.
  app.on('activate', showMain)
})

app.on('before-quit', () => (quitting = true))

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
