import type { WorkSettings } from './money'
import type { PetMeta } from './pet'
import type { DroppedFile, ToolDef, ToolProgress, ToolRequest, ToolResult } from './tools'

export const INSTAGRAM_URL = 'https://www.instagram.com/easyticket.co.kr/'
export const INSTAGRAM_HANDLE = '@easyticket.co.kr'
export const MORE_APPS_URL = 'https://easyticket.co.kr/apps/'

/** 펫 머리 위에 보여 줄 것 (고른 것들을 번갈아) */
export type ShowItem = 'today' | 'year' | 'leave' | 'lupang' | 'toilet' | 'food' | 'overtime' | 'dday'

export const SHOW_LABEL: Record<ShowItem, string> = {
  today: '오늘 번 돈 (실시간)',
  year: '올해 번 돈',
  leave: '퇴근까지 남은 시간',
  lupang: '오늘 루팡한 돈',
  toilet: '💩 오늘 똥값 (화장실 루팡)',
  food: '☕ 번 돈 커피·치킨 환산',
  overtime: '🌙 퇴근 뒤 공짜 야근',
  dday: '💳 월급날·주말까지'
}

export interface Settings {
  work: WorkSettings
  /** 머리 위 표시 (순서대로 번갈아). 비면 안 보임 */
  show: ShowItem[]
  /** 번갈아 보여 주는 간격(초) */
  showEvery: number
  /** 지금 펫 ('builtin:merong' 또는 내가 만든 펫 id) */
  petId: string
  /** 같이 돌아다닐 펫들 (대표 펫 말고, 최대 5) */
  extraPets: string[]
  /** 펫 키 (px) */
  petSize: number
  /** 0 얌전 · 1 보통 · 2 활발 */
  activity: number
  /** 혼잣말 말풍선 */
  chatter: boolean
  /** 내가 정한 펫 대사 (한 줄에 하나, 말풍선 안 줄바꿈은 \n) */
  customLines: string
  /** 'mix' 기본 대사와 섞기 · 'only' 내 대사만 */
  customMode: 'mix' | 'only'
  /** 혼잣말 간격 (초, 평균) */
  chatterEvery: number
  /** 말풍선·표시 글자 크기 (1 = 보통, 1.4 = 크게 — 폰으로 모니터를 찍을 때) */
  textScale: number
  sound: boolean
  /** 펫 숨기기 */
  hidden: boolean
  /** 전체화면 영상·발표 중에는 펫 숨기기 */
  hideOnFullscreen: boolean
  /** 자리를 비우면 펫 떼가 화면을 점령 */
  awaySwarm: boolean
  /** 자리를 이만큼(분) 비우면 돌아왔을 때 루팡으로 적을지 묻기 (0 = 끔) */
  autoLupangMin: number
  /** 퇴근 시간 축하 */
  leaveParty: boolean
  // 인터넷 창
  browserHome: string
  /** 인터넷 창만 숨기기·다시 보이기 단축키 (Electron accelerator) */
  bossKey: string
  bossMute: boolean
  /** 숨길 때 펫도 같이 숨기기 */
  bossHidesPet: boolean
  browserOnTop: boolean
  /** 0.3 ~ 1 */
  browserOpacity: number
  openAtLogin: boolean
}

export type LupangKind = 'button' | 'auto' | 'toilet'

export interface LupangSession {
  start: number
  end: number
  /** 그 동안 번 돈 (근무 시간과 겹친 만큼) */
  earned: number
  /** 근무 시간과 겹친 초 */
  sec: number
  /** 'button' 자리비움 버튼 · 'auto' 자리 비운 걸 돌아와서 적음 · 'toilet' 화장실(똥값) */
  kind: LupangKind
}

export interface Stats {
  pets: number
  throws: number
  treats: number
  filesHelped: number
  filesEaten: number
  clones: number
  parties: number
}

export interface PersistedState {
  settings: Settings
  onboarded: boolean
  /** 자리비움 중이면 시작 시각 */
  lupangOn: number | null
  /** 지금 자리비움이 화장실이면 'toilet' */
  lupangKind: LupangKind
  lupang: LupangSession[]
  pets: PetMeta[]
  stats: Stats
  /** 펫이 있던 자리 (다음 실행 때 그 화면·그 근처에서 시작) */
  lastSpot: { displayId: number; x: number; y: number } | null
}

// ───────── 오버레이 ─────────

/** 앉을 자리: 창 윗변 구간 또는 화면 바닥 (wid 0). 좌표는 디스플레이 기준 */
export interface Perch {
  wid: number
  /** 창 왼쪽 x (창이 움직이면 같이 움직이려고) */
  wx: number
  x0: number
  x1: number
  y: number
}

export interface PerchUpdate {
  perches: Perch[]
  blocked: boolean
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 메인이 60Hz 로 읽은 커서·버튼 (디스플레이 기준 좌표) */
export interface InputState {
  x: number
  y: number
  /** 왼쪽 버튼 눌림 */
  l: boolean
  r: boolean
}

export interface LiveInfo {
  lupangOn: number | null
  lupangKind: LupangKind
  /** 오늘 루팡한 돈 (끝난 것만, 똥값 포함) */
  lupangToday: number
  /** 오늘 똥값 (끝난 것만) */
  toiletToday: number
  /** 오늘 루팡한 시간(초, 똥값 포함) */
  lupangSecToday: number
  away: boolean
  /** 입력 없는 초 */
  idle: number
  browserOpen: boolean
  browserHidden: boolean
}

export type OverlayCommand =
  | { type: 'spawn'; x: number; y: number; drag?: boolean }
  | { type: 'despawn' }
  | { type: 'prank'; name: PrankName }
  | { type: 'say'; text: string; ms?: number }
  | { type: 'menu' }
  | { type: 'party' }
  | { type: 'askLupang'; start: number; end: number; earned: number }
  | { type: 'lupangDone'; session: LupangSession; todayTotal: number; toiletToday: number }
  | { type: 'toolProgress'; p: ToolProgress }
  | { type: 'toolDone'; r: ToolResult; tool: string }
  | { type: 'files'; files: DroppedFile[]; tools: ToolDef[] }

export type PrankName = 'clone' | 'occupy' | 'march' | 'boss' | 'fish' | 'receipt' | 'hang' | 'memo' | 'hide'

/** 바이럴 에이전트 조사(2026-11-19)로 고른 장난 — 남에게 보여 주고 싶은 「회사 PC 위」 장면 위주 */
export const PRANKS: { id: PrankName; emoji: string; label: string }[] = [
  { id: 'clone', emoji: '👯', label: '분신술 (누를수록)' },
  { id: 'occupy', emoji: '🏴', label: '창 점령' },
  { id: 'march', emoji: '🪧', label: '칼퇴 시위 행진' },
  { id: 'boss', emoji: '🚨', label: '부장님 온다!' },
  { id: 'fish', emoji: '🎣', label: '창 위에서 낚시' },
  { id: 'receipt', emoji: '🧾', label: '루팡 영수증' },
  { id: 'hang', emoji: '🖱', label: '커서에 매달리기' },
  { id: 'memo', emoji: '📝', label: '킹받는 쪽지' },
  { id: 'hide', emoji: '🙈', label: '숨바꼭질' }
]

export interface OverlayInit {
  width: number
  height: number
  displayId: number
  platform: string
  debug: boolean
  /** 테스트용 시계 차이 (MYPET_NOW) */
  nowOffset: number
}

export type OverlayReport =
  | { type: 'lupang'; on: boolean; kind?: LupangKind }
  | { type: 'lupangAnswer'; yes: boolean; start: number; end: number; kind?: LupangKind }
  | { type: 'openPanel'; tab?: PanelTab }
  | { type: 'browser' }
  | { type: 'share' }
  | { type: 'hidePet' }
  | { type: 'tool'; req: ToolRequest }
  | { type: 'dropped'; paths: string[] }
  | { type: 'leave'; gx: number; gy: number; drag: boolean }
  | { type: 'spot'; x: number; y: number }
  | { type: 'stat'; key: keyof Stats }
  | { type: 'reveal'; path: string }
  | { type: 'copy'; text: string }

export interface PetData {
  id: string
  /** 내가 만든 펫이면 atlas PNG, 기본 펫이면 null (코드로 그림) */
  atlas: Uint8Array | null
}

export interface OverlayApi {
  platform: string
  onInit(cb: (v: OverlayInit) => void): void
  onPerches(cb: (v: PerchUpdate) => void): void
  onInput(cb: (v: InputState) => void): void
  onSettings(cb: (v: Settings) => void): void
  /** 첫째 = 대표 펫, 나머지 = 같이 노는 펫 */
  onPet(cb: (v: PetData[]) => void): void
  onLive(cb: (v: LiveInfo) => void): void
  onCommand(cb: (v: OverlayCommand) => void): void
  /** 클릭을 받을 영역 (디스플레이 기준). all = 화면 전체 (끌고 있을 때) */
  setHot(rects: Rect[], all: boolean): void
  report(r: OverlayReport): void
  /** 끌어다 놓은 파일 → 경로 (펫 위에 떨어뜨림) */
  pathsOf(files: File[]): string[]
  ready(): void
}

// ───────── 패널 ─────────

export type PanelTab = 'home' | 'pets' | 'tools' | 'settings' | 'about'

export interface PanelApi {
  platform: string
  getState(): Promise<PersistedState>
  setSettings(patch: Partial<Settings>): Promise<void>
  setWork(patch: Partial<WorkSettings>): Promise<void>
  setOnboarded(): Promise<void>
  onState(cb: (s: PersistedState) => void): void
  getLive(): Promise<LiveInfo>
  onLive(cb: (v: LiveInfo) => void): void
  onTab(cb: (tab: PanelTab) => void): void
  /** 펫에서 '자랑하기' → 패널에서 자랑 이미지 미리 보기 */
  onShare(cb: () => void): void
  lupang(on: boolean, kind?: LupangKind): Promise<void>
  deleteLupang(start: number): Promise<void>
  browser(): Promise<void>
  prank(name: PrankName): Promise<void>
  /** 펫 */
  getPetAtlas(id: string): Promise<Uint8Array | null>
  savePet(name: string, atlasPng: Uint8Array, id?: string): Promise<PetMeta>
  renamePet(id: string, name: string): Promise<void>
  deletePet(id: string): Promise<void>
  exportPet(id: string): Promise<'saved' | 'cancel'>
  /** 파일 도우미 */
  pathsOf(files: File[]): string[]
  inspect(paths: string[]): Promise<{ files: DroppedFile[]; tools: ToolDef[] }>
  runTool(req: ToolRequest): Promise<ToolResult>
  onToolProgress(cb: (p: ToolProgress) => void): void
  reveal(path: string): Promise<void>
  pickFiles(): Promise<string[]>
  /** 자랑 이미지: 클립보드 복사 + 저장 */
  saveImage(dataUrl: string, name: string): Promise<'saved' | 'copied' | 'cancel'>
  copyText(text: string): Promise<void>
  openExternal(url: string): Promise<void>
  version(): Promise<string>
  checkShortcut(accel: string): Promise<boolean>
}

export interface BrowserApi {
  onState(cb: (s: BrowserState) => void): void
  go(url: string): void
  back(): void
  forward(): void
  reload(): void
  home(): void
  hide(): void
  setOnTop(on: boolean): void
  setOpacity(v: number): void
  zoom(dir: -1 | 0 | 1): void
}

export interface BrowserState {
  url: string
  title: string
  canBack: boolean
  canForward: boolean
  loading: boolean
  onTop: boolean
  opacity: number
  bossKey: string
  platform: string
}
