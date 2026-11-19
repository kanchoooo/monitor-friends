import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { PanelApi } from '@shared/types'

function on<T>(channel: string, cb: (v: T) => void): void {
  ipcRenderer.on(channel, (_e, v: T) => cb(v))
}

const api: PanelApi = {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('state:get'),
  setSettings: (p) => ipcRenderer.invoke('state:setSettings', p),
  setWork: (p) => ipcRenderer.invoke('state:setWork', p),
  setOnboarded: () => ipcRenderer.invoke('state:setOnboarded'),
  onState: (cb) => on('state:changed', cb),
  getLive: () => ipcRenderer.invoke('live:get'),
  onLive: (cb) => on('live:changed', cb),
  onTab: (cb) => on('panel:tab', cb),
  onShare: (cb) => on('panel:share', cb),
  lupang: (v, k) => ipcRenderer.invoke('lupang:set', v, k),
  deleteLupang: (s) => ipcRenderer.invoke('lupang:delete', s),
  browser: () => ipcRenderer.invoke('browser:open'),
  prank: (n) => ipcRenderer.invoke('pet:prank', n),
  getPetAtlas: (id) => ipcRenderer.invoke('pet:atlas', id),
  savePet: (name, png, id) => ipcRenderer.invoke('pet:save', name, png, id),
  renamePet: (id, name) => ipcRenderer.invoke('pet:rename', id, name),
  deletePet: (id) => ipcRenderer.invoke('pet:delete', id),
  exportPet: (id) => ipcRenderer.invoke('pet:export', id),
  pathsOf: (files) => files.map((f) => webUtils.getPathForFile(f)).filter(Boolean),
  inspect: (paths) => ipcRenderer.invoke('helper:inspect', paths),
  runTool: (req) => ipcRenderer.invoke('helper:run', req),
  onToolProgress: (cb) => on('helper:progress', cb),
  reveal: (p) => ipcRenderer.invoke('app:reveal', p),
  pickFiles: () => ipcRenderer.invoke('app:pickFiles'),
  saveImage: (d, n) => ipcRenderer.invoke('app:saveImage', d, n),
  copyText: (t) => ipcRenderer.invoke('app:copyText', t),
  openExternal: (u) => ipcRenderer.invoke('app:openExternal', u),
  version: () => ipcRenderer.invoke('app:version'),
  checkShortcut: (a) => ipcRenderer.invoke('app:checkShortcut', a)
}

contextBridge.exposeInMainWorld('api', api)
