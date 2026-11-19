import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { OverlayApi } from '@shared/types'

function on<T>(channel: string, cb: (v: T) => void): void {
  ipcRenderer.on(channel, (_e, v: T) => cb(v))
}

const api: OverlayApi = {
  platform: process.platform,
  onInit: (cb) => on('w:init', cb),
  onPerches: (cb) => on('w:perches', cb),
  onInput: (cb) => on('w:input', cb),
  onSettings: (cb) => on('w:settings', cb),
  onPet: (cb) => on('w:pet', cb),
  onLive: (cb) => on('w:live', cb),
  onCommand: (cb) => on('w:command', cb),
  setHot: (rects, all) => ipcRenderer.send('o:hot', rects, all),
  report: (r) => ipcRenderer.send('o:report', r),
  pathsOf: (files) => files.map((f) => webUtils.getPathForFile(f)).filter(Boolean),
  ready: () => ipcRenderer.send('o:ready')
}

contextBridge.exposeInMainWorld('overlayApi', api)
