import { contextBridge, ipcRenderer } from 'electron'
import type { BrowserApi, BrowserState } from '@shared/types'

const api: BrowserApi = {
  onState: (cb) => ipcRenderer.on('b:state', (_e, s: BrowserState) => cb(s)),
  go: (url) => ipcRenderer.send('b:go', url),
  back: () => ipcRenderer.send('b:back'),
  forward: () => ipcRenderer.send('b:forward'),
  reload: () => ipcRenderer.send('b:reload'),
  home: () => ipcRenderer.send('b:home'),
  hide: () => ipcRenderer.send('b:hide'),
  setOnTop: (on) => ipcRenderer.send('b:onTop', on),
  setOpacity: (v) => ipcRenderer.send('b:opacity', v),
  zoom: (d) => ipcRenderer.send('b:zoom', d)
}

contextBridge.exposeInMainWorld('browserApi', api)
