import { BrowserWindow, ipcMain, screen, type Display, type IpcMainEvent } from 'electron'
import type { InputState, LiveInfo, OverlayCommand, OverlayReport, PerchUpdate, PetData, Rect, Settings } from '@shared/types'
import { env, isHeadless, loadRenderer, NOW_OFFSET, preloadPath } from './env'
import { computePerches } from './perches'
import { listWindows, type WinRect } from './windows'
import { createButtonReader, type Buttons } from './windows/buttons'

/**
 * 디스플레이마다 하나씩 띄우는 투명 전체화면 창. 펫은 그중 한 화면(owner)에 산다.
 * 평소에는 클릭이 아래로 통과하고(setIgnoreMouseEvents), 커서가 펫·말풍선·메뉴(hot 영역) 위에 있을 때만 클릭을 받는다.
 * 커서·버튼은 메인이 60Hz 로 읽어 보낸다 (windows/buttons.ts 참고).
 */
interface Item {
  id: number
  display: Display
  win: BrowserWindow
  ready: boolean
  nativeId: number
  perchKey: string
  hot: Rect[]
  hotAll: boolean
  interactive: boolean
  fullscreen: boolean
  inputKey: string
}

export interface OverlayEnv {
  settings: () => Settings
  /** 화면 잠금 · 펫 숨김 등으로 지금 안 보여야 하면 true */
  hidden: () => boolean
}

const HEADLESS_SIZE = { width: 1440, height: 900 }

export class Overlays {
  private items = new Map<number, Item>()
  private owner = 0
  private tickTimer: NodeJS.Timeout | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private fakeWins: WinRect[] | null = null
  private exclude = new Set<number>()
  private buttons: (() => Buttons) | null | undefined
  private fakeInput: InputState | null = null
  private pet: PetData[] | null = null
  private live: LiveInfo | null = null
  /** 처음 펫이 나타날 자리 (전역 좌표) */
  private spawnAt: { x: number; y: number } | null = null

  constructor(
    private envx: OverlayEnv,
    private onReport: (displayId: number, r: OverlayReport) => void
  ) {
    ipcMain.on('o:ready', (e) => {
      const it = this.itemOf(e)
      if (!it) return
      it.ready = true
      this.sendInit(it)
    })
    ipcMain.on('o:hot', (e, rects: Rect[], all: boolean) => {
      const it = this.itemOf(e)
      if (!it) return
      it.hot = Array.isArray(rects) ? rects.slice(0, 40) : []
      it.hotAll = !!all
    })
    ipcMain.on('o:report', (e, r: OverlayReport) => {
      const it = this.itemOf(e)
      if (!it || !r || typeof r !== 'object') return
      if (r.type === 'leave') return this.transfer(it, it.display.bounds.x + r.gx, it.display.bounds.y + r.gy, r.drag)
      this.onReport(it.id, r)
    })
    if (isHeadless()) {
      try {
        this.fakeWins = env.MYPET_FAKE_WINDOWS ? (JSON.parse(env.MYPET_FAKE_WINDOWS) as WinRect[]) : DEFAULT_FAKE_WINDOWS
      } catch {
        this.fakeWins = DEFAULT_FAKE_WINDOWS
      }
    } else {
      screen.on('display-added', () => this.sync())
      screen.on('display-removed', () => this.sync())
      screen.on('display-metrics-changed', () => this.sync())
    }
  }

  private itemOf(e: IpcMainEvent): Item | undefined {
    for (const it of this.items.values()) if (!it.win.isDestroyed() && it.win.webContents.id === e.sender.id) return it
    return undefined
  }

  /** 테스트 자동화용 */
  get ownerWin(): BrowserWindow | null {
    return this.items.get(this.owner)?.win ?? null
  }

  get ownerDisplay(): Display | null {
    return this.items.get(this.owner)?.display ?? null
  }

  displays(): Display[] {
    if (isHeadless()) {
      const b = { x: 0, y: 0, ...HEADLESS_SIZE }
      return [{ id: 1, bounds: b, workArea: { ...b, height: b.height - 48 }, size: HEADLESS_SIZE, workAreaSize: HEADLESS_SIZE, scaleFactor: 1 } as unknown as Display]
    }
    return screen.getAllDisplays()
  }

  setSpawn(p: { x: number; y: number } | null): void {
    this.spawnAt = p
  }

  /** 디스플레이 구성에 맞춰 창을 만들고 없앤다 */
  sync(): void {
    const ds = this.displays()
    const ids = new Set(ds.map((d) => d.id))
    for (const [id, it] of this.items) {
      if (!ids.has(id)) {
        if (!it.win.isDestroyed()) it.win.destroy()
        this.items.delete(id)
      }
    }
    for (const d of ds) {
      const it = this.items.get(d.id)
      if (!it) this.create(d)
      else {
        const moved = JSON.stringify(it.display.bounds) !== JSON.stringify(d.bounds)
        it.display = d
        if (moved && !it.win.isDestroyed()) {
          it.win.setBounds(d.bounds)
          this.sendInit(it)
        }
      }
    }
    // 펫이 살던 화면이 없어졌으면 주 화면으로
    if (!this.items.has(this.owner)) {
      const p = this.spawnAt
      const d = p ? this.displayAt(p.x, p.y) : null
      this.owner = (d ?? (isHeadless() ? ds[0] : screen.getPrimaryDisplay())).id
      for (const it of this.items.values()) if (it.ready) this.sendOwn(it)
    }
    this.refreshAll()
    this.startLoops()
  }

  private displayAt(x: number, y: number): Display | null {
    for (const it of this.items.values()) {
      const b = it.display.bounds
      if (x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height) return it.display
    }
    return null
  }

  private create(d: Display): void {
    const isMac = process.platform === 'darwin'
    const headless = isHeadless()
    const b = d.bounds
    const win = new BrowserWindow({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      enableLargerThanScreen: true,
      roundedCorners: false,
      acceptFirstMouse: true,
      ...(isMac ? { type: 'panel' } : { type: 'toolbar' }),
      webPreferences: {
        preload: preloadPath('overlay'),
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        offscreen: headless
      }
    })
    win.setIgnoreMouseEvents(true, { forward: true })
    win.setAlwaysOnTop(true, 'screen-saver')
    if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    win.webContents.on('console-message', (e) => {
      if (env.MYPET_LOG === '1') console.log(`[overlay ${d.id}:${e.level}] ${e.message}`)
    })
    // 오버레이에 파일을 떨어뜨렸을 때 그 파일로 이동하지 않게
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    const it: Item = { id: d.id, display: d, win, ready: false, nativeId: 0, perchKey: '', hot: [], hotAll: false, interactive: false, fullscreen: false, inputKey: '' }
    it.nativeId = nativeWindowId(win)
    if (it.nativeId) this.exclude.add(it.nativeId)
    win.on('closed', () => {
      this.exclude.delete(it.nativeId)
      if (this.items.get(d.id) === it) this.items.delete(d.id)
    })
    loadRenderer(win, 'overlay', { query: headless || env.MYPET_DEBUG_BG === '1' ? { debug: '1' } : undefined })
    this.items.set(d.id, it)
  }

  private sendInit(it: Item): void {
    if (!it.ready || it.win.isDestroyed()) return
    const b = it.display.bounds
    it.win.webContents.send('w:init', { width: b.width, height: b.height, displayId: it.id, platform: process.platform, debug: isHeadless() || env.MYPET_DEBUG_BG === '1', nowOffset: NOW_OFFSET })
    it.win.webContents.send('w:settings', this.envx.settings())
    if (this.pet) it.win.webContents.send('w:pet', this.pet)
    if (this.live) it.win.webContents.send('w:live', this.live)
    it.perchKey = ''
    this.poll()
    this.sendOwn(it)
  }

  /** 펫이 이 화면에 있으면 나타나게 */
  private sendOwn(it: Item, drag = false): void {
    if (!it.ready || it.id !== this.owner) return
    const b = it.display.bounds
    let x = b.width / 2 + (Math.random() - 0.5) * b.width * 0.4
    let y = b.height * 0.4
    const p = this.spawnAt
    if (p && p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height) {
      x = p.x - b.x
      y = p.y - b.y
    }
    this.spawnAt = null
    it.win.webContents.send('w:command', { type: 'spawn', x, y, drag } satisfies OverlayCommand)
  }

  /** 펫을 끌고 다른 화면으로 넘어감 */
  private transfer(from: Item, gx: number, gy: number, drag: boolean): void {
    const d = this.displayAt(gx, gy)
    if (!d || d.id === from.id) return
    const to = this.items.get(d.id)
    if (!to?.ready) return
    from.win.webContents.send('w:command', { type: 'despawn' } satisfies OverlayCommand)
    from.hot = []
    from.hotAll = false
    this.owner = to.id
    this.spawnAt = { x: gx, y: gy }
    this.sendOwn(to, drag)
    // 끌던 중이면 새 화면이 바로 클릭을 받게
    if (drag) {
      to.hotAll = true
      this.setInteractive(to, true)
    }
  }

  setSettings(s: Settings): void {
    for (const it of this.items.values()) if (it.ready && !it.win.isDestroyed()) it.win.webContents.send('w:settings', s)
    this.refreshAll()
    this.poll()
  }

  setPet(p: PetData[]): void {
    this.pet = p
    for (const it of this.items.values()) if (it.ready && !it.win.isDestroyed()) it.win.webContents.send('w:pet', p)
  }

  setLive(l: LiveInfo): void {
    this.live = l
    for (const it of this.items.values()) if (it.ready && !it.win.isDestroyed()) it.win.webContents.send('w:live', l)
  }

  /** 펫이 있는 화면에 명령 */
  command(cmd: OverlayCommand): void {
    const it = this.items.get(this.owner)
    if (it?.ready && !it.win.isDestroyed()) it.win.webContents.send('w:command', cmd)
  }

  commandAll(cmd: OverlayCommand): void {
    for (const it of this.items.values()) if (it.ready && !it.win.isDestroyed()) it.win.webContents.send('w:command', cmd)
  }

  // ───────── 보이기·숨기기 ─────────

  private wants(it: Item): boolean {
    if (this.envx.hidden()) return false
    if (this.envx.settings().hideOnFullscreen && it.fullscreen) return false
    return true
  }

  refreshAll(): void {
    for (const it of this.items.values()) {
      if (it.win.isDestroyed()) continue
      const want = this.wants(it)
      const visible = it.win.isVisible()
      if (want && !visible) {
        if (!isHeadless()) {
          it.win.setBounds(it.display.bounds)
          it.win.setAlwaysOnTop(true, 'screen-saver')
        }
        it.win.showInactive()
        if (!isHeadless()) it.win.moveTop()
      } else if (!want && visible) {
        this.setInteractive(it, false)
        it.win.hide()
      }
    }
  }

  // ───────── 입력 (60Hz) ─────────

  private startLoops(): void {
    if (!this.tickTimer) this.tickTimer = setInterval(() => this.tick(), 16)
    if (!this.pollTimer) this.pollTimer = setInterval(() => this.poll(), 150)
  }

  private setInteractive(it: Item, on: boolean): void {
    if (it.interactive === on || it.win.isDestroyed()) return
    it.interactive = on
    if (on) it.win.setIgnoreMouseEvents(false)
    else it.win.setIgnoreMouseEvents(true, { forward: true })
  }

  /** 테스트 자동화: 가짜 커서·버튼 */
  setFakeInput(i: InputState | null): void {
    this.fakeInput = i
  }

  private tick(): void {
    let gx: number, gy: number, l: boolean, r: boolean
    if (this.fakeInput) {
      ;({ x: gx, y: gy, l, r } = this.fakeInput)
    } else if (isHeadless()) {
      return
    } else {
      const c = screen.getCursorScreenPoint()
      gx = c.x
      gy = c.y
      if (this.buttons === undefined) this.buttons = createButtonReader()
      const b = this.buttons?.() ?? { left: false, right: false }
      l = b.left
      r = b.right
    }
    for (const it of this.items.values()) {
      if (!it.ready || it.win.isDestroyed() || !it.win.isVisible()) continue
      const b = it.display.bounds
      const x = gx - b.x
      const y = gy - b.y
      const inside = x >= 0 && y >= 0 && x < b.width && y < b.height
      // 클릭 받기: hot 영역 위 (끌고 있으면 화면 전체)
      const hot = inside && (it.hotAll || it.hot.some((h) => x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h))
      // 버튼을 누른 채 hot 영역에 들어오면 (다른 앱에서 끌던 중) 받지 않는다 — 파일 끌어오기는 OS 끌기라 상관없음
      this.setInteractive(it, hot)
      // 펫이 사는 화면에는 늘, 다른 화면에는 커서가 그 위에 있을 때만
      if (it.id !== this.owner && !inside) continue
      const key = `${x},${y},${l ? 1 : 0}${r ? 1 : 0}`
      if (key === it.inputKey) continue
      it.inputKey = key
      it.win.webContents.send('w:input', { x, y, l, r } satisfies InputState)
    }
  }

  // ───────── 창 위치 → 앉을 자리 ─────────

  /** 테스트 자동화: 가짜 창 바꾸기 */
  setFakeWindows(list: WinRect[]): void {
    this.fakeWins = list
    this.poll()
  }

  poll(): void {
    if (this.envx.hidden()) return
    const wins = this.fakeWins ?? listWindows()
    let changed = false
    for (const it of this.items.values()) {
      if (it.win.isDestroyed()) continue
      const { perches, fullscreen } = computePerches(wins, it.display, this.exclude, this.envx.settings().petSize)
      if (fullscreen !== it.fullscreen) {
        it.fullscreen = fullscreen
        changed = true
      }
      const upd: PerchUpdate = { perches, blocked: fullscreen }
      const key = JSON.stringify(upd)
      if (key !== it.perchKey && it.ready) {
        it.perchKey = key
        it.win.webContents.send('w:perches', upd)
      }
    }
    if (changed) this.refreshAll()
  }

  /** 다른 창(패널·인터넷 창)도 앉을 자리로 쓰려면 그대로 두고, 빼야 할 창만 */
  excludeWindow(win: BrowserWindow): void {
    const id = nativeWindowId(win)
    if (id) this.exclude.add(id)
  }

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    if (this.pollTimer) clearInterval(this.pollTimer)
    for (const it of this.items.values()) if (!it.win.isDestroyed()) it.win.destroy()
    this.items.clear()
  }
}

/** 창 목록에서 이 창을 찾기 위한 번호 (맥: CGWindowID, 윈도우: HWND) */
export function nativeWindowId(win: BrowserWindow): number {
  try {
    if (process.platform === 'win32') {
      const h = win.getNativeWindowHandle()
      return Number(h.length >= 8 ? h.readBigUInt64LE(0) : h.readUInt32LE(0))
    }
    const m = /^window:(\d+):/.exec(win.getMediaSourceId())
    return m ? Number(m[1]) : 0
  } catch {
    return 0
  }
}

/** 헤드리스 테스트용 가짜 창 (앞 → 뒤) */
const DEFAULT_FAKE_WINDOWS: WinRect[] = [
  { id: 101, pid: 1, x: 860, y: 300, w: 460, h: 380 },
  { id: 102, pid: 1, x: 120, y: 220, w: 620, h: 460 },
  { id: 103, pid: 1, x: 600, y: 160, w: 520, h: 300 }
]
