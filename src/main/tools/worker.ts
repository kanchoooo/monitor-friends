// 숨은 작업 창 — 처음 쓸 때 만들고 1분 쉬면 닫는다. 멈추거나 죽으면 다음 일 때 다시 만든다
import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import type { WorkerJob, WorkerOut, WorkerProgress, WorkerReply } from '@shared/toolJobs'

/**
 * 테스트용 환경변수
 *  MYPET_TOOLS_HTML=경로     작업 창 html (기본: dev 서버 / out/renderer/tools.html)
 *  MYPET_TOOLS_PRELOAD=경로  작업 창 preload (기본: out/preload/tools.js)
 *  MYPET_TOOLS_SHOW=1        작업 창을 보이게 (디버그)
 */
const IDLE_MS = 60_000
const READY_MS = 20_000

interface Pending {
  resolve: (o: WorkerOut) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
  onProgress?: (p: WorkerProgress) => void
}

let win: BrowserWindow | null = null
let ready: Promise<void> | null = null
let markReady: (() => void) | null = null
let idleTimer: NodeJS.Timeout | null = null
let seq = 0
let chain: Promise<unknown> = Promise.resolve()
let ipcOn = false
const pending = new Map<number, Pending>()

function preloadPath(): string {
  return process.env.MYPET_TOOLS_PRELOAD || join(__dirname, '../preload/tools.js')
}

function loadPage(w: BrowserWindow): Promise<void> {
  const file = process.env.MYPET_TOOLS_HTML
  if (file) return w.loadFile(file)
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) return w.loadURL(`${dev}/tools.html`)
  return w.loadFile(join(__dirname, '../renderer/tools.html'))
}

function fromWorker(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return !!win && !win.isDestroyed() && e.sender === win.webContents
}

function setupIpc(): void {
  if (ipcOn) return
  ipcOn = true
  ipcMain.handle('tools:ready', (e) => {
    if (fromWorker(e)) markReady?.()
  })
  ipcMain.handle('tools:result', (e, id: number, r: WorkerReply) => {
    if (!fromWorker(e)) return
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    clearTimeout(p.timer)
    if (r.ok) p.resolve(r.out)
    else p.reject(new Error(r.error))
  })
  ipcMain.on('tools:progress', (e, id: number, pr: WorkerProgress) => {
    if (fromWorker(e)) pending.get(id)?.onProgress?.(pr)
  })
}

function failAll(reason: string): void {
  for (const [id, p] of pending) {
    clearTimeout(p.timer)
    p.reject(new Error(reason))
    pending.delete(id)
  }
}

function kill(reason = '작업 창이 닫혔어'): void {
  failAll(reason)
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  const w = win
  win = null
  ready = null
  markReady = null
  if (w && !w.isDestroyed()) w.destroy()
}

function ensure(): Promise<void> {
  if (win && !win.isDestroyed() && ready) return ready
  setupIpc()
  const w = new BrowserWindow({
    show: process.env.MYPET_TOOLS_SHOW === '1',
    width: 480,
    height: 360,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  })
  win = w
  w.webContents.on('render-process-gone', (_e, d) => {
    if (win === w) kill(`작업 창이 멈췄어 (${d.reason}) — 너무 큰 파일인가 봐`)
  })
  w.on('closed', () => {
    if (win === w) kill()
  })
  ready = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('작업 창을 못 띄웠어')), READY_MS)
    markReady = () => {
      clearTimeout(t)
      resolve()
    }
    loadPage(w).catch((e: unknown) => {
      clearTimeout(t)
      reject(new Error(`작업 창을 못 띄웠어 (${e instanceof Error ? e.message : String(e)})`))
    })
  })
  const r = ready
  r.catch(() => {
    if (win === w) kill()
  })
  return r
}

function touchIdle(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (pending.size === 0) kill()
  }, IDLE_MS)
}

async function runNow(job: WorkerJob, timeoutMs: number, onProgress?: (p: WorkerProgress) => void): Promise<WorkerOut> {
  if (idleTimer) clearTimeout(idleTimer)
  await ensure()
  const w = win
  if (!w || w.isDestroyed()) throw new Error('작업 창이 닫혔어')
  const id = ++seq
  try {
    return await new Promise<WorkerOut>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('시간이 너무 오래 걸려서 그만뒀어'))
        // 멈춘 창일 수 있으니 버리고 다음에 새로 만든다
        kill('시간이 너무 오래 걸려서 그만뒀어')
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer, onProgress })
      w.webContents.send('tools:job', id, job)
    })
  } finally {
    touchIdle()
  }
}

/** 작업 창에 일을 맡긴다 (한 번에 하나씩 차례로) */
export function workerRun(job: WorkerJob, timeoutMs = 60_000, onProgress?: (p: WorkerProgress) => void): Promise<WorkerOut> {
  const next = chain.then(() => runNow(job, timeoutMs, onProgress))
  chain = next.catch(() => undefined)
  return next
}

export function disposeWorker(): void {
  kill()
  if (ipcOn) {
    ipcMain.removeHandler('tools:ready')
    ipcMain.removeHandler('tools:result')
    ipcMain.removeAllListeners('tools:progress')
    ipcOn = false
  }
}
