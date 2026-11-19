import { BaseWindow, ipcMain, screen, shell, WebContentsView } from 'electron'
import type { BrowserState, Settings } from '@shared/types'
import { env, isHeadless, loadRenderer, preloadPath } from './env'

/**
 * 펫이 열어 주는 작은 인터넷 창.
 * 위쪽 막대(우리 화면) + 아래 웹 페이지 두 겹. 단축키 한 번에 이 창만 숨기고(소리도 끔) 다시 누르면 그대로 돌아온다.
 */
const BAR_H = 40

export class PetBrowser {
  private win: BaseWindow | null = null
  private bar: WebContentsView | null = null
  private page: WebContentsView | null = null
  private bounds: Electron.Rectangle | null = null
  hidden = false

  constructor(
    private settings: () => Settings,
    private onChange: () => void,
    private setSettings: (p: Partial<Settings>) => void
  ) {
    ipcMain.on('b:go', (_e, url: string) => this.go(url))
    ipcMain.on('b:back', () => this.page?.webContents.navigationHistory.goBack())
    ipcMain.on('b:forward', () => this.page?.webContents.navigationHistory.goForward())
    ipcMain.on('b:reload', () => this.page?.webContents.reload())
    ipcMain.on('b:home', () => this.go(this.settings().browserHome))
    ipcMain.on('b:hide', () => this.toggleHidden(true))
    ipcMain.on('b:onTop', (_e, on: boolean) => this.setSettings({ browserOnTop: !!on }))
    ipcMain.on('b:opacity', (_e, v: number) => this.setSettings({ browserOpacity: Number(v) }))
    ipcMain.on('b:zoom', (_e, dir: number) => {
      const wc = this.page?.webContents
      if (!wc) return
      wc.setZoomLevel(dir === 0 ? 0 : Math.max(-4, Math.min(5, wc.getZoomLevel() + (dir > 0 ? 0.5 : -0.5))))
    })
  }

  get isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  /** 열기 (숨겨져 있으면 다시 보이기) */
  open(near?: { x: number; y: number }): void {
    if (this.isOpen) {
      this.toggleHidden(false)
      this.win!.focus()
      return
    }
    const s = this.settings()
    const wa = screen.getDisplayNearestPoint(near ?? screen.getCursorScreenPoint()).workArea
    const w = Math.min(1100, wa.width - 80)
    const h = Math.min(760, wa.height - 80)
    const b = this.bounds ?? { x: Math.round(wa.x + (wa.width - w) / 2), y: Math.round(wa.y + (wa.height - h) / 2), width: w, height: h }
    const win = new BaseWindow({
      ...b,
      minWidth: 360,
      minHeight: 240,
      show: false,
      title: '모니터 프렌즈 인터넷',
      backgroundColor: '#ffffff',
      ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 13 } } : { autoHideMenuBar: true })
    })
    const bar = new WebContentsView({ webPreferences: { preload: preloadPath('browser'), sandbox: true, contextIsolation: true, offscreen: isHeadless() } })
    const page = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, offscreen: isHeadless() } })
    win.contentView.addChildView(page)
    win.contentView.addChildView(bar)
    this.win = win
    this.bar = bar
    this.page = page
    this.hidden = false
    const layout = (): void => {
      const [cw, ch] = win.getContentSize()
      bar.setBounds({ x: 0, y: 0, width: cw, height: BAR_H })
      page.setBounds({ x: 0, y: BAR_H, width: cw, height: Math.max(0, ch - BAR_H) })
    }
    layout()
    win.on('resize', layout)
    win.on('resized', () => (this.bounds = win.getBounds()))
    win.on('moved', () => (this.bounds = win.getBounds()))
    win.on('closed', () => {
      this.win = null
      this.bar = null
      this.page = null
      this.hidden = false
      this.onChange()
    })
    const wc = page.webContents
    // 새 창 열기 → 같은 창에서 (창이 여러 개면 숨기기가 의미 없음)
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void wc.loadURL(url)
      else if (/^mailto:/.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'] as const) {
      wc.on(ev as 'did-start-loading', () => this.push())
    }
    wc.on('page-title-updated', (_e, title) => win.setTitle(title || '모니터 프렌즈 인터넷'))
    bar.webContents.on('did-finish-load', () => this.push())
    bar.webContents.on('console-message', (e) => {
      if (env.MYPET_LOG === '1') console.log(`[browser-bar:${e.level}] ${e.message}`)
    })
    loadRenderer(bar.webContents, 'browser')
    void wc.loadURL(s.browserHome)
    this.applySettings()
    win.show()
    this.onChange()
  }

  go(raw: string): void {
    if (!this.page) return
    const t = String(raw ?? '').trim()
    if (!t) return
    let url: string
    if (/^https?:\/\//i.test(t)) url = t
    else if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) url = 'https://' + t
    else url = 'https://www.google.com/search?q=' + encodeURIComponent(t)
    void this.page.webContents.loadURL(url)
  }

  /** 단축키: 숨기기 ↔ 보이기. 창이 없으면 연다 */
  bossToggle(): void {
    if (!this.isOpen) return this.open()
    this.toggleHidden(!this.hidden)
  }

  toggleHidden(hide: boolean): void {
    if (!this.isOpen) return
    const s = this.settings()
    const win = this.win!
    if (hide) {
      this.hidden = true
      if (s.bossMute) this.page?.webContents.setAudioMuted(true)
      win.hide()
    } else {
      this.hidden = false
      this.page?.webContents.setAudioMuted(false)
      win.show()
      win.focus()
    }
    this.onChange()
  }

  applySettings(): void {
    if (!this.isOpen) return
    const s = this.settings()
    const win = this.win!
    win.setAlwaysOnTop(s.browserOnTop, 'floating')
    win.setOpacity(s.browserOpacity)
    this.push()
  }

  private push(): void {
    if (!this.bar || !this.page || this.bar.webContents.isDestroyed()) return
    const wc = this.page.webContents
    const s = this.settings()
    const st: BrowserState = {
      url: wc.getURL(),
      title: wc.getTitle(),
      canBack: wc.navigationHistory.canGoBack(),
      canForward: wc.navigationHistory.canGoForward(),
      loading: wc.isLoading(),
      onTop: s.browserOnTop,
      opacity: s.browserOpacity,
      bossKey: s.bossKey,
      platform: process.platform
    }
    this.bar.webContents.send('b:state', st)
  }

  close(): void {
    if (this.isOpen) this.win!.destroy()
  }
}
