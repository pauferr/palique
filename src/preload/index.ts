import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ExportFormat, ExportResult } from '../main/export'
import type { Settings } from '../main/settings'
import type { AuthResult, ChatMessage, OwnShow, Snapshot } from '../main/xmpp'

// Custom APIs for renderer
const api = {
  login: (username: string, password: string): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:login', username, password, false),
  register: (username: string, password: string): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:login', username, password, true),
  logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
  getRoster: (): Promise<Snapshot> => ipcRenderer.invoke('roster:snapshot'),
  // Returns an unsubscribe function.
  onRoster: (callback: (snapshot: Snapshot) => void): (() => void) => {
    const listener = (_: unknown, snapshot: Snapshot): void => callback(snapshot)
    ipcRenderer.on('roster:changed', listener)
    return () => ipcRenderer.off('roster:changed', listener)
  },
  onContactOnline: (callback: (jid: string) => void): (() => void) => {
    const listener = (_: unknown, jid: string): void => callback(jid)
    ipcRenderer.on('contact:online', listener)
    return () => ipcRenderer.off('contact:online', listener)
  },
  addContact: (address: string): Promise<void> => ipcRenderer.invoke('roster:add', address),
  acceptRequest: (jid: string): Promise<void> => ipcRenderer.invoke('roster:accept', jid),
  rejectRequest: (jid: string): Promise<void> => ipcRenderer.invoke('roster:reject', jid),
  removeContact: (jid: string): Promise<void> => ipcRenderer.invoke('roster:remove', jid),
  setPresence: (show: OwnShow, status: string): Promise<void> =>
    ipcRenderer.invoke('presence:set', show, status),
  openChat: (contact: string): Promise<void> => ipcRenderer.invoke('chat:open', contact),
  getChatHistory: (contact: string): Promise<ChatMessage[]> =>
    ipcRenderer.invoke('chat:history', contact),
  onChatMessage: (callback: (message: ChatMessage) => void): (() => void) => {
    const listener = (_: unknown, message: ChatMessage): void => callback(message)
    ipcRenderer.on('chat:message', listener)
    return () => ipcRenderer.off('chat:message', listener)
  },
  sendMessage: (contact: string, body: string): Promise<void> =>
    ipcRenderer.invoke('chat:send', contact, body),
  sendBuzz: (contact: string): Promise<void> => ipcRenderer.invoke('chat:buzz', contact),
  setTyping: (contact: string, typing: boolean): Promise<void> =>
    ipcRenderer.invoke('chat:typing', contact, typing),
  onTyping: (callback: (contact: string, typing: boolean) => void): (() => void) => {
    const listener = (_: unknown, contact: string, typing: boolean): void =>
      callback(contact, typing)
    ipcRenderer.on('chat:typing', listener)
    return () => ipcRenderer.off('chat:typing', listener)
  },
  openOptions: (): Promise<void> => ipcRenderer.invoke('options:open'),
  exportHistory: (format: ExportFormat): Promise<ExportResult> =>
    ipcRenderer.invoke('history:export', format),
  sendWink: (contact: string, wink: string): Promise<void> =>
    ipcRenderer.invoke('chat:wink', contact, wink),
  setAvatar: (png: Uint8Array): Promise<void> => ipcRenderer.invoke('avatar:set', png),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
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
