import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AuthResult, Show, Snapshot } from '../main/xmpp'

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
  addContact: (address: string): Promise<void> => ipcRenderer.invoke('roster:add', address),
  acceptRequest: (jid: string): Promise<void> => ipcRenderer.invoke('roster:accept', jid),
  rejectRequest: (jid: string): Promise<void> => ipcRenderer.invoke('roster:reject', jid),
  removeContact: (jid: string): Promise<void> => ipcRenderer.invoke('roster:remove', jid),
  setPresence: (show: Show, status: string): Promise<void> =>
    ipcRenderer.invoke('presence:set', show, status),
  playWink: (id: string): void => ipcRenderer.send('wink:play', id),
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
