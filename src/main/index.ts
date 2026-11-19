import { app, BrowserWindow, clipboard, ClipboardItem, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, powerMonitor, shell, Tray } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { earnedBetween, today, type WorkSettings } from '@shared/money'
import { BUILTIN_PETS } from '@shared/pet'
import type { LiveInfo, LupangKind, OverlayReport, PanelTab, PetData, PrankName, Settings } from '@shared/types'
import { PRANKS } from '@shared/types'
import type { ToolRequest } from '@shared/tools'
import { toolsFor } from '@shared/tools'
import { PetBrowser } from './browser'
import { env, isHeadless, loadRenderer, now, preloadPath } from './env'
import { trayIcon } from './icons'
import { Overlays } from './overlays'
import { Store } from './store'
import { disposeTools, inspectFiles, runTool } from './tools'
import { setupUpdater } from './updater'
import { listWindows } from './windows'
import { createButtonReader } from './windows/buttons'

if (process.platform === 'win32') app.setAppUserModelId('com.monitorfriends.app')
const headless = isHeadless()
if (env.MYPET_USERDATA) app.setPath('userData', env.MYPET_USERDATA)
else if (headless) app.setPath('userData', join(app.getPath('temp'), 'monitor-friends-test'))
const labMode = env.MYPET_LAB

if (!headless && !labMode && !app.requestSingleInstanceLock()) app.quit()

let panel: BrowserWindow | null = null
let tray: Tray | null = null
let store: Store
let overlays: Overlays
let browser: PetBrowser
let quitting = false
let locked = false
let toldAboutTray = false
let live: LiveInfo = { lupangOn: null, lupangKind: 'button', lupangToday: 0, toiletToday: 0, lupangSecToday: 0, away: false, idle: 0, browserOpen: false, browserHidden: false }
/** 보스 키로 펫도 숨겼는지 */
let bossHidPet = false
/** 자리 비운 걸 알아챈 시각 (돌아오면 루팡으로 적을지 묻는다) */
let awaySince: number | null = null
let toolBusy = false
const startHidden = process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)

const S = (): Settings => store.state.settings
const petHidden = (): boolean => locked || S().hidden || bossHidPet

// ───────── 상태 알림 ─────────

let liveKey = ''
function pushLive(): void {
  live = {
    lupangOn: store.state.lupangOn,
    lupangKind: store.state.lupangKind,
    lupangToday: todayLupang(),
    toiletToday: todayLupang('toilet'),
    lupangSecToday: todaySec(),
    away: live.away,
    idle: live.idle,
    browserOpen: browser.isOpen,
    browserHidden: browser.isOpen && browser.hidden
  }
  const key = JSON.stringify({ ...live, idle: Math.min(live.idle, 600) > 3 ? 'i' : 'a' })
  if (panel && !panel.isDestroyed() && panel.isVisible()) panel.webContents.send('live:changed', live)
  if (key !== liveKey) {
    liveKey = key
    overlays.setLive(live)
    buildTrayMenu()
  }
}

/** 1초마다: 입력이 없는 시간으로 자리비움을 보고, 돌아오면 루팡으로 적을지 묻는다 */
function tickPresence(): void {
  const idle = headless ? 0 : powerMonitor.getSystemIdleTime()
  const away = locked || idle >= 180
  live.away = away
  live.idle = idle
  const min = S().autoLupangMin
  if (min > 0 && !store.state.lupangOn) {
    if (!awaySince && (idle >= min * 60 || locked)) awaySince = now() - idle * 1000
    else if (awaySince && idle < 3 && !locked) {
      const start = awaySince
      const end = now() - idle * 1000
      awaySince = null
      const earned = earnedBetween(S().work, start, end)
      // 근무 시간에 비운 것만 (점심·퇴근 뒤는 묻지 않음)
      if (earned > 0 && end - start >= min * 60_000) overlays.command({ type: 'askLupang', start, end, earned })
    }
  } else awaySince = null
  pushLive()
}

// ───────── 루팡 ─────────

function setLupang(on: boolean, kind: LupangKind = 'button'): void {
  if (on) {
    if (store.state.lupangOn) store.lupangEnd()
    store.lupangStart(now(), kind)
    overlays.command({ type: 'say', text: kind === 'toilet' ? '화장실 다녀와~ 그동안 똥값 세고 있을게 💩' : '자리비움 시작! 루팡 금액 세는 중 🕶', ms: 3500 })
  } else {
    const s = store.lupangEnd()
    if (s) overlays.command({ type: 'lupangDone', session: s, todayTotal: todayLupang(), toiletToday: todayLupang('toilet') })
    else overlays.command({ type: 'say', text: '근무 시간이 아니라 루팡은 0원… 다음 기회에!', ms: 3500 })
  }
  pushLive()
}

function todaySec(): number {
  const d = new Date(now())
  d.setHours(0, 0, 0, 0)
  return store.state.lupang.filter((s) => s.end >= d.getTime()).reduce((a, s) => a + s.sec, 0)
}

function todayLupang(kind?: LupangKind): number {
  const d = new Date(now())
  d.setHours(0, 0, 0, 0)
  const t0 = d.getTime()
  return store.state.lupang.filter((s) => s.end >= t0 && (!kind || s.kind === kind)).reduce((a, s) => a + s.earned, 0)
}

// ───────── 펫 그림 ─────────

let petKey = ''
function pushPet(force = false): void {
  const ids = [S().petId, ...S().extraPets]
  const key = ids.join('|')
  if (!force && key === petKey) return
  petKey = key
  const data: PetData[] = ids.map((id) => {
    const d: PetData = { id, atlas: BUILTIN_PETS.some((p) => p.id === id) ? null : store.readPet(id) }
    if (!d.atlas && !id.startsWith('builtin:')) d.id = BUILTIN_PETS[0].id
    return d
  })
  overlays.setPet(data)
}

// ───────── 파일 도우미 ─────────

async function runToolFor(req: ToolRequest, target: 'pet' | 'panel'): Promise<Awaited<ReturnType<typeof runTool>>> {
  toolBusy = true
  try {
    const r = await runTool(req, (p) => {
      if (target === 'pet') overlays.command({ type: 'toolProgress', p })
      else panel?.webContents.send('helper:progress', p)
    })
    if (r.ok || r.outputs.length) store.bump(req.tool === 'trash' ? 'filesEaten' : 'filesHelped', Math.max(1, req.files.length - r.failed.length))
    // 패널에서 했어도 펫이 결과를 말해 준다
    overlays.command({ type: 'toolDone', r, tool: req.tool })
    return r
  } finally {
    toolBusy = false
  }
}

function onReport(_displayId: number, r: OverlayReport): void {
  switch (r.type) {
    case 'lupang':
      setLupang(r.on, r.kind === 'toilet' ? 'toilet' : 'button')
      break
    case 'lupangAnswer':
      if (r.yes) {
        const s = store.lupangEnd(r.end, r.kind === 'toilet' ? 'toilet' : 'auto', r.start)
        if (s) overlays.command({ type: 'lupangDone', session: s, todayTotal: todayLupang(), toiletToday: todayLupang('toilet') })
        pushLive()
      }
      break
    case 'openPanel':
      showPanel(r.tab)
      break
    case 'browser':
      browser.open()
      break
    case 'share':
      showPanel('home')
      panel?.webContents.send('panel:share')
      break
    case 'hidePet':
      store.setSettings({ hidden: true })
      break
    case 'dropped': {
      const files = inspectFiles(r.paths.filter((p) => typeof p === 'string').slice(0, 500))
      overlays.command({ type: 'files', files, tools: toolsFor(files, process.platform) })
      break
    }
    case 'tool':
      if (!toolBusy) void runToolFor(r.req, 'pet')
      break
    case 'spot':
      {
        const d = overlays.ownerDisplay
        if (d) store.setSpot({ displayId: d.id, x: d.bounds.x + r.x, y: d.bounds.y + r.y })
      }
      break
    case 'stat':
      if (r.key in store.state.stats) store.bump(r.key)
      break
    case 'reveal':
      if (typeof r.path === 'string') shell.showItemInFolder(r.path)
      break
    case 'copy':
      clipboard.writeText(String(r.text ?? '').slice(0, 100_000))
      break
  }
}

// ───────── 단축키 ─────────

let bossOn = ''
function registerBossKey(): boolean {
  if (bossOn) {
    try {
      globalShortcut.unregister(bossOn)
    } catch {
      /* 이미 없음 */
    }
    bossOn = ''
  }
  const k = S().bossKey
  if (!k || headless) return true
  try {
    const ok = globalShortcut.register(k, bossToggle)
    if (ok) bossOn = k
    return ok
  } catch {
    return false
  }
}

function bossToggle(): void {
  const willHide = browser.isOpen && !browser.hidden
  browser.bossToggle()
  if (S().bossHidesPet) {
    bossHidPet = willHide
    overlays.refreshAll()
  }
  pushLive()
}

// ───────── 패널 창 ─────────

function showPanel(tab?: PanelTab): void {
  if (!panel || panel.isDestroyed()) createPanel()
  if (!panel) return
  if (process.platform === 'darwin') void app.dock?.show()
  if (panel.isMinimized()) panel.restore()
  panel.show()
  panel.focus()
  if (tab) panel.webContents.send('panel:tab', tab)
}

function createPanel(): void {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 460,
    height: 780,
    minWidth: 420,
    minHeight: 560,
    useContentSize: true,
    acceptFirstMouse: true,
    show: false,
    title: '모니터 프렌즈',
    backgroundColor: '#fbf7f0',
    autoHideMenuBar: true,
    maximizable: false,
    fullscreenable: false,
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 16 } } : {}),
    webPreferences: { preload: preloadPath('panel'), sandbox: true, contextIsolation: true, offscreen: headless }
  })
  win.once('ready-to-show', () => {
    if (!headless && (!startHidden || !store.state.onboarded)) showPanel()
  })
  win.on('show', () => win.webContents.send('live:changed', live))
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.hide()
    if (process.platform === 'darwin') app.dock?.hide()
    else if (!toldAboutTray && Notification.isSupported()) {
      toldAboutTray = true
      new Notification({ title: '모니터 프렌즈는 계속 실행 중이에요', body: '작업 표시줄 트레이의 발바닥 아이콘에서 다시 열 수 있어요.', silent: true }).show()
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.on('console-message', (e) => {
    if (env.MYPET_LOG === '1') console.log(`[panel:${e.level}] ${e.message}`)
  })
  loadRenderer(win, 'panel')
  panel = win
}

// ───────── 트레이 ─────────

function buildTrayMenu(): void {
  if (!tray || !store) return
  const s = S()
  const t = today(s.work, now())
  const lup = store.state.lupangOn
  const menu = Menu.buildFromTemplate([
    { label: '모니터 프렌즈 열기', click: () => showPanel() },
    { type: 'separator' },
    { label: lup ? (store.state.lupangKind === 'toilet' ? '💩 화장실 다녀옴 (똥값 정산)' : '🕶 자리비움 끝내기 (루팡 정산)') : '🕶 자리비움 시작 (루팡)', click: () => setLupang(!lup) },
    ...(lup ? [] : [{ label: '💩 화장실 (똥값 루팡)', click: () => setLupang(true, 'toilet') }]),
    { label: browser.isOpen ? (browser.hidden ? '🌐 인터넷 창 다시 보이기' : '🌐 인터넷 창 숨기기') : '🌐 인터넷 열기', click: () => (browser.isOpen ? bossToggle() : browser.open()) },
    { label: '🎲 장난치기', submenu: PRANKS.map((p) => ({ label: `${p.emoji} ${p.label}`, click: () => prank(p.id) })) },
    { label: '📂 파일 도우미', click: () => showPanel('tools') },
    { type: 'separator' },
    { label: s.hidden ? '🐾 펫 다시 보이기' : '🐾 펫 숨기기', click: () => store.setSettings({ hidden: !s.hidden }) },
    { label: '효과음', type: 'checkbox', checked: s.sound, click: (i) => store.setSettings({ sound: i.checked }) },
    { label: '혼잣말', type: 'checkbox', checked: s.chatter, click: (i) => store.setSettings({ chatter: i.checked }) },
    { type: 'separator' },
    { label: t.status === 'working' || t.status === 'lunch' ? `오늘 일당 ${Math.round(t.daily).toLocaleString('ko-KR')}원` : '오늘은 근무 시간이 아니에요', enabled: false },
    {
      label: '종료',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.setToolTip('모니터 프렌즈')
}

function createTray(): void {
  tray = new Tray(trayIcon())
  tray.on('click', () => {
    if (process.platform !== 'darwin') showPanel()
  })
  tray.on('double-click', () => showPanel())
  buildTrayMenu()
}

function prank(name: PrankName): void {
  if (S().hidden) store.setSettings({ hidden: false })
  overlays.command({ type: 'prank', name })
}

// ───────── IPC ─────────

async function askSavePath(opts: Electron.SaveDialogOptions): Promise<string | null> {
  if (env.MYPET_SAVE_DIR && opts.defaultPath) {
    mkdirSync(env.MYPET_SAVE_DIR, { recursive: true })
    return join(env.MYPET_SAVE_DIR, opts.defaultPath.split(/[\\/]/).pop()!)
  }
  const r = panel && !panel.isDestroyed() ? await dialog.showSaveDialog(panel, opts) : await dialog.showSaveDialog(opts)
  return r.canceled || !r.filePath ? null : r.filePath
}

function safeName(name: unknown, fallback: string): string {
  const s = typeof name === 'string' ? name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 60) : ''
  return s || fallback
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => store.state)
  ipcMain.handle('state:setSettings', (_e, patch: Partial<Settings>) => {
    store.setSettings(patch)
  })
  ipcMain.handle('state:setWork', (_e, patch: Partial<WorkSettings>) => {
    store.setWork(patch)
  })
  ipcMain.handle('state:setOnboarded', () => {
    store.setOnboarded()
  })
  ipcMain.handle('live:get', () => live)
  ipcMain.handle('lupang:set', (_e, on: boolean, kind?: LupangKind) => setLupang(!!on, kind === 'toilet' ? 'toilet' : 'button'))
  ipcMain.handle('lupang:delete', (_e, start: number) => store.deleteLupang(Number(start)))
  ipcMain.handle('browser:open', () => browser.open())
  ipcMain.handle('pet:prank', (_e, name: PrankName) => {
    if (PRANKS.some((p) => p.id === name)) prank(name)
  })
  ipcMain.handle('pet:atlas', (_e, id: string) => store.readPet(String(id)))
  ipcMain.handle('pet:save', (_e, name: string, png: Uint8Array, id?: string) => {
    if (!(png instanceof Uint8Array) || png.length < 100 || png.length > 30 * 1024 * 1024) throw new Error('잘못된 이미지')
    const meta = store.savePet(name, png, id)
    pushPet(true)
    return meta
  })
  ipcMain.handle('pet:rename', (_e, id: string, name: string) => store.renamePet(id, name))
  ipcMain.handle('pet:delete', (_e, id: string) => store.deletePet(id))
  ipcMain.handle('pet:export', async (_e, id: string) => {
    const png = store.readPet(id)
    if (!png) return 'cancel'
    const meta = store.state.pets.find((p) => p.id === id)
    const file = await askSavePath({ defaultPath: join(app.getPath('desktop'), `${safeName(meta?.name, '내-펫')}.프렌즈.png`), filters: [{ name: 'PNG 이미지', extensions: ['png'] }] })
    if (!file) return 'cancel'
    writeFileSync(file, png)
    return 'saved'
  })
  ipcMain.handle('helper:inspect', (_e, paths: string[]) => {
    const files = inspectFiles(Array.isArray(paths) ? paths.filter((p) => typeof p === 'string').slice(0, 500) : [])
    return { files, tools: toolsFor(files, process.platform) }
  })
  ipcMain.handle('helper:run', (_e, req: ToolRequest) => runToolFor(req, 'panel'))
  ipcMain.handle('app:reveal', (_e, p: string) => {
    if (typeof p === 'string') shell.showItemInFolder(p)
  })
  ipcMain.handle('app:pickFiles', async () => {
    const opts: Electron.OpenDialogOptions = { properties: ['openFile', 'multiSelections'] }
    const r = panel && !panel.isDestroyed() ? await dialog.showOpenDialog(panel, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('app:saveImage', async (_e, dataUrl: string, name?: string) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return 'cancel'
    const png = nativeImage.createFromDataURL(dataUrl).toPNG()
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]).catch((err) => console.warn('[clipboard]', err))
    const file = await askSavePath({ defaultPath: join(app.getPath('desktop'), `${safeName(name, '모니터 프렌즈')}.png`), filters: [{ name: 'PNG 이미지', extensions: ['png'] }] })
    if (!file) return 'copied'
    writeFileSync(file, png)
    return 'saved'
  })
  ipcMain.handle('app:copyText', (_e, t: string) => clipboard.writeText(String(t ?? '')))
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) void shell.openExternal(url)
  })
  ipcMain.handle('app:checkShortcut', (_e, accel: string) => {
    if (typeof accel !== 'string' || !accel) return false
    if (accel === bossOn) return true
    try {
      const ok = globalShortcut.register(accel, () => undefined)
      if (ok) globalShortcut.unregister(accel)
      return ok
    } catch {
      return false
    }
  })
}

// ───────── 테스트 자동화 (환경변수로만) ─────────

interface Step {
  at: number
  /** 가짜 커서·버튼 [x, y, 왼쪽 눌림(0/1)] (디스플레이 좌표) */
  input?: [number, number, number]
  /** 가짜 커서로 끌기 [x0, y0, x1, y1, ms] */
  drag?: [number, number, number, number, number]
  shot?: string
  windows?: { id: number; pid: number; x: number; y: number; w: number; h: number }[]
  /** 오버레이·패널에서 JS 실행 */
  js?: string
  panelJs?: string
  panelShot?: string
  panel?: PanelTab
  command?: Parameters<Overlays['command']>[0]
  settings?: Partial<Settings>
  lupang?: boolean
  browser?: boolean
  browserShot?: string
  boss?: boolean
  dropped?: string[]
  quit?: boolean
}

function runScript(): void {
  if (!env.MYPET_SCRIPT) return
  const steps = JSON.parse(readFileSync(env.MYPET_SCRIPT, 'utf8')) as Step[]
  const dir = env.MYPET_SHOT_DIR ?? 'shots'
  mkdirSync(dir, { recursive: true })
  let cur = { x: -100, y: -100, l: false }
  const setIn = (x: number, y: number, l: boolean): void => {
    cur = { x, y, l }
    overlays.setFakeInput({ x, y, l, r: false })
  }
  for (const s of steps) {
    setTimeout(async () => {
      try {
        if (s.settings) store.setSettings(s.settings)
        if (s.windows) overlays.setFakeWindows(s.windows)
        if (s.input) setIn(s.input[0], s.input[1], !!s.input[2])
        if (s.drag) {
          const [x0, y0, x1, y1, ms] = s.drag
          const n = Math.max(2, Math.round(ms / 16))
          setIn(x0, y0, true)
          for (let i = 1; i <= n; i++) setTimeout(() => setIn(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, true), i * 16)
          setTimeout(() => setIn(cur.x, cur.y, false), n * 16 + 40)
        }
        if (s.command) overlays.command(s.command)
        if (s.lupang !== undefined) setLupang(s.lupang)
        if (s.browser) browser.open()
        if (s.boss) bossToggle()
        if (s.dropped) onReport(0, { type: 'dropped', paths: s.dropped })
        if (s.panel) showPanel(s.panel)
        if (s.js) {
          const r = await overlays.ownerWin?.webContents.executeJavaScript(s.js).catch((err: Error) => `ERR ${err.message}`)
          console.log('[js]', JSON.stringify(r))
        }
        if (s.panelJs && panel) {
          const r = await panel.webContents.executeJavaScript(s.panelJs).catch((err: Error) => `ERR ${err.message}`)
          console.log('[panelJs]', JSON.stringify(r))
        }
        if (s.panelShot && panel) {
          const img = await panel.webContents.capturePage()
          writeFileSync(join(dir, `${s.panelShot}.png`), img.toPNG())
          console.log('[shot]', join(dir, `${s.panelShot}.png`))
        }
        if (s.shot) {
          const w = overlays.ownerWin
          if (w) {
            const img = await w.webContents.capturePage()
            writeFileSync(join(dir, `${s.shot}.png`), img.toPNG())
            console.log('[shot]', join(dir, `${s.shot}.png`))
          }
        }
        if (s.quit) {
          quitting = true
          app.quit()
        }
      } catch (err) {
        console.error('[script]', err)
      }
    }, s.at)
  }
}

function runLab(name: string): void {
  const [w, h] = (env.MYPET_SIZE ?? '1500x1000').split('x').map(Number)
  const win = new BrowserWindow({ width: w, height: h, show: !env.MYPET_SHOT, transparent: name === 'icon', frame: name !== 'icon', webPreferences: { offscreen: !!env.MYPET_SHOT } })
  loadRenderer(win, 'lab', { hash: name })
  if (env.MYPET_SHOT) {
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        if (name === 'icon' || name === 'example' || name === 'atlas') {
          const url = (await win.webContents.executeJavaScript(`document.querySelector('canvas').toDataURL('image/png')`)) as string
          writeFileSync(env.MYPET_SHOT!, Buffer.from(url.split(',')[1], 'base64'))
        } else {
          const img = await win.webContents.capturePage()
          writeFileSync(env.MYPET_SHOT!, img.toPNG())
        }
        app.quit()
      }, Number(env.MYPET_SHOT_DELAY ?? 1200))
    )
  }
}

// ───────── 시작 ─────────

app.on('second-instance', () => showPanel())

app.whenReady().then(() => {
  if (labMode) return runLab(labMode)
  if (env.MYPET_SELFTEST === '1') {
    const t0 = Date.now()
    const wins = listWindows()
    const b = createButtonReader()
    console.log(`[selftest] windows=${wins.length} ms=${Date.now() - t0} buttons=${b ? JSON.stringify(b()) : 'none'} resources=${process.resourcesPath}`)
    app.exit(0)
    return
  }
  store = new Store()
  browser = new PetBrowser(
    () => store.state.settings,
    () => pushLive(),
    (p) => store.setSettings(p)
  )
  overlays = new Overlays({ settings: () => store.state.settings, hidden: petHidden }, onReport)
  registerIpc()
  const spot = store.state.lastSpot
  overlays.setSpawn(spot ? { x: spot.x, y: spot.y } : null)
  overlays.sync()
  pushPet(true)
  if (!headless || env.MYPET_PANEL === '1' || (env.MYPET_SCRIPT && /"panel/.test(readFileSync(env.MYPET_SCRIPT, 'utf8')))) createPanel()
  if (!headless) createTray()
  if (process.platform === 'darwin' && startHidden && store.state.onboarded) app.dock?.hide()

  let lastSettings = JSON.stringify(store.state.settings)
  let lastBoss = S().bossKey
  store.onChange((s) => {
    panel?.webContents.send('state:changed', s)
    const js = JSON.stringify(s.settings)
    if (js !== lastSettings) {
      lastSettings = js
      overlays.setSettings(s.settings)
      browser.applySettings()
      pushPet()
      if (s.settings.bossKey !== lastBoss) {
        lastBoss = s.settings.bossKey
        registerBossKey()
      }
      if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.settings.openAtLogin, args: ['--hidden'] })
    }
    buildTrayMenu()
  })
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: S().openAtLogin, args: ['--hidden'] })
  registerBossKey()

  powerMonitor.on('lock-screen', () => {
    locked = true
    overlays.refreshAll()
    tickPresence()
  })
  powerMonitor.on('unlock-screen', () => {
    locked = false
    overlays.refreshAll()
    tickPresence()
  })
  setInterval(tickPresence, 1000)
  tickPresence()
  // 트레이 메뉴의 오늘 일당 표시를 가끔 새로
  setInterval(buildTrayMenu, 60_000)

  runScript()
  setupUpdater()
  app.on('activate', () => showPanel())
})

app.on('before-quit', () => {
  quitting = true
  store?.flush()
  overlays?.destroy()
  browser?.close()
  disposeTools()
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (headless || labMode) app.quit()
})
