// 숨은 작업 창(tools.html) preload — 메인이 보낸 일을 받고 결과를 돌려준다
import { contextBridge, ipcRenderer } from 'electron'
import type { ToolsWorkerApi, WorkerJob } from '@shared/toolJobs'

const api: ToolsWorkerApi = {
  onJob: (cb) => {
    ipcRenderer.on('tools:job', (_e, id: number, job: WorkerJob) => cb(id, job))
  },
  progress: (id, p) => ipcRenderer.send('tools:progress', id, p),
  result: async (id, r) => {
    await ipcRenderer.invoke('tools:result', id, r)
  },
  ready: async () => {
    await ipcRenderer.invoke('tools:ready')
  }
}

contextBridge.exposeInMainWorld('toolsWorker', api)
