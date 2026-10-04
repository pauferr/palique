import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AuthResult } from '../main/xmpp'

// Custom APIs for renderer
const api = {
  login: (username: string, password: string): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:login', username, password, false),
  register: (username: string, password: string): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:login', username, password, true),
  logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
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
