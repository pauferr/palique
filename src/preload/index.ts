import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ExportResult } from '../main/export'
import type { Settings } from '../main/settings'
import type { UpdateStatus } from '../main/updates'
import type {
  AuthError,
  AuthLink,
  AuthResult,
  ChatMessage,
  EmailStatus,
  InviteStatus,
  OwnShow,
  Snapshot
} from '../main/xmpp'

// Custom APIs for renderer
const api = {
  // `remember`: sign in by itself next time (keeps the password, encrypted).
  login: (email: string, password: string, remember: boolean): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:login', email, password, remember),
  // Signs in by itself if "Iniciar sesión automáticamente" is on (once per launch).
  autoLogin: (): Promise<AuthResult | null> => ipcRenderer.invoke('auth:auto'),
  remembered: (): Promise<{ available: boolean; saved: boolean }> =>
    ipcRenderer.invoke('auth:remembered'),
  // Opening at startup isn't available on Linux.
  platform: process.platform,
  inviteEmail: (
    token: string
  ): Promise<{ ok: true; email: string } | { ok: false; error: AuthError }> =>
    ipcRenderer.invoke('auth:invite', token),
  register: (signup: {
    token: string
    nick: string
    password: string
    newsletter: boolean
  }): Promise<AuthResult> => ipcRenderer.invoke('auth:register', signup),
  forgotPassword: (email: string): Promise<void> => ipcRenderer.invoke('auth:forgot', email),
  resetPassword: (email: string, token: string, password: string): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:reset', email, token, password),
  lastEmail: (): Promise<string> => ipcRenderer.invoke('auth:last-email'),
  pendingLink: (): Promise<AuthLink | null> => ipcRenderer.invoke('auth:pending-link'),
  onLink: (callback: (link: AuthLink) => void): (() => void) => {
    const listener = (_: unknown, link: AuthLink): void => callback(link)
    ipcRenderer.on('auth:link', listener)
    return () => ipcRenderer.off('auth:link', listener)
  },
  getEmail: (): Promise<EmailStatus> => ipcRenderer.invoke('account:email'),
  changeEmail: (address: string): Promise<EmailStatus> =>
    ipcRenderer.invoke('account:set-email', address),
  resendVerification: (): Promise<void> => ipcRenderer.invoke('account:resend'),
  setNewsletter: (subscribe: boolean): Promise<EmailStatus> =>
    ipcRenderer.invoke('account:newsletter', subscribe),
  onEmail: (callback: (email: EmailStatus) => void): (() => void) => {
    const listener = (_: unknown, email: EmailStatus): void => callback(email)
    ipcRenderer.on('account:email', listener)
    return () => ipcRenderer.off('account:email', listener)
  },
  setNick: (name: string): Promise<void> => ipcRenderer.invoke('account:nick', name),
  inviteStatus: (): Promise<InviteStatus> => ipcRenderer.invoke('invites:status'),
  inviteByEmail: (address: string): Promise<InviteStatus> =>
    ipcRenderer.invoke('invites:email', address),
  logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
  getRoster: (): Promise<Snapshot> => ipcRenderer.invoke('roster:snapshot'),
  // Returns an unsubscribe function.
  onRoster: (callback: (snapshot: Snapshot) => void): (() => void) => {
    const listener = (_: unknown, snapshot: Snapshot): void => callback(snapshot)
    ipcRenderer.on('roster:changed', listener)
    return () => ipcRenderer.off('roster:changed', listener)
  },
  // A new release: null until there is one (see main/updates.ts).
  update: (): Promise<UpdateStatus | null> => ipcRenderer.invoke('update:get'),
  onUpdate: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_: unknown, status: UpdateStatus): void => callback(status)
    ipcRenderer.on('update:changed', listener)
    return () => ipcRenderer.off('update:changed', listener)
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  onContactOnline: (callback: (jid: string) => void): (() => void) => {
    const listener = (_: unknown, jid: string): void => callback(jid)
    ipcRenderer.on('contact:online', listener)
    return () => ipcRenderer.off('contact:online', listener)
  },
  addContact: (address: string): Promise<'added' | 'not-found' | 'self'> =>
    ipcRenderer.invoke('roster:add', address),
  acceptRequest: (jid: string): Promise<void> => ipcRenderer.invoke('roster:accept', jid),
  rejectRequest: (jid: string): Promise<void> => ipcRenderer.invoke('roster:reject', jid),
  removeContact: (jid: string): Promise<void> => ipcRenderer.invoke('roster:remove', jid),
  setPresence: (show: OwnShow, status: string): Promise<void> =>
    ipcRenderer.invoke('presence:set', show, status),
  openChat: (contact: string): Promise<void> => ipcRenderer.invoke('chat:open', contact),
  // Tell the main process this chat window is listening for live messages.
  chatReady: (contact: string): void => ipcRenderer.send('chat:ready', contact),
  // Unread messages per contact (bare JID → count), for the contact list.
  getUnread: (): Promise<Record<string, number>> => ipcRenderer.invoke('chat:unread'),
  onUnread: (callback: (unread: Record<string, number>) => void): (() => void) => {
    const listener = (_: unknown, unread: Record<string, number>): void => callback(unread)
    ipcRenderer.on('chat:unread', listener)
    return () => ipcRenderer.off('chat:unread', listener)
  },
  // A message arrived for a conversation that isn't open (the list plays the sound).
  onIncoming: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('chat:incoming', listener)
    return () => ipcRenderer.off('chat:incoming', listener)
  },
  replayWink: (wink: string): void => ipcRenderer.send('chat:replay-wink', wink),
  // On Wayland winks play inside the conversation window (no full-screen overlay).
  onWinkPlay: (callback: (wink: string) => void): (() => void) => {
    const listener = (_: unknown, wink: string): void => callback(wink)
    ipcRenderer.on('chat:wink-play', listener)
    return () => ipcRenderer.off('chat:wink-play', listener)
  },
  getChatHistory: (contact: string): Promise<ChatMessage[]> =>
    ipcRenderer.invoke('chat:history', contact),
  onChatMessage: (callback: (message: ChatMessage, quiet: boolean) => void): (() => void) => {
    const listener = (_: unknown, message: ChatMessage, quiet: boolean): void =>
      callback(message, quiet)
    ipcRenderer.on('chat:message', listener)
    return () => ipcRenderer.off('chat:message', listener)
  },
  sendMessage: (contact: string, body: string): Promise<void> =>
    ipcRenderer.invoke('chat:send', contact, body),
  // Resolve to the ms until the next one is allowed.
  sendBuzz: (contact: string): Promise<number> => ipcRenderer.invoke('chat:buzz', contact),
  setTyping: (contact: string, typing: boolean): Promise<void> =>
    ipcRenderer.invoke('chat:typing', contact, typing),
  onTyping: (callback: (contact: string, typing: boolean) => void): (() => void) => {
    const listener = (_: unknown, contact: string, typing: boolean): void =>
      callback(contact, typing)
    ipcRenderer.on('chat:typing', listener)
    return () => ipcRenderer.off('chat:typing', listener)
  },
  openOptions: (): Promise<void> => ipcRenderer.invoke('options:open'),
  openNick: (): Promise<void> => ipcRenderer.invoke('nick:open'),
  openAbout: (): Promise<void> => ipcRenderer.invoke('about:open'),
  // The format is chosen in the save dialog.
  exportHistory: (): Promise<ExportResult> => ipcRenderer.invoke('history:export'),
  sendWink: (contact: string, wink: string): Promise<number> =>
    ipcRenderer.invoke('chat:wink', contact, wink),
  setAvatar: (png: Uint8Array): Promise<void> => ipcRenderer.invoke('avatar:set', png),
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  // Shows palique.log in the file manager.
  openLogs: (): Promise<void> => ipcRenderer.invoke('logs:open'),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  onSettings: (callback: (settings: Settings) => void): (() => void) => {
    const listener = (_: unknown, settings: Settings): void => callback(settings)
    ipcRenderer.on('settings:changed', listener)
    return () => ipcRenderer.off('settings:changed', listener)
  },
  setSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:set', patch),
  winkDone: (): void => ipcRenderer.send('wink:done')
}

export type Api = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
