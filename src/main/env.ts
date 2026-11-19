import { BrowserWindow } from 'electron'
import { join } from 'path'

/**
 * 개발·테스트용 환경변수
 *  MYPET_HEADLESS=1         창을 화면에 띄우지 않고 오프스크린 렌더링 (스크린샷 자동화용)
 *                           → 1440x900 가짜 화면 1개 + 가짜 창(MYPET_FAKE_WINDOWS=JSON)
 *  MYPET_SCRIPT=경로.json    자동 조작 [{ "at": ms, ... }] (index.ts 의 Step 참고)
 *  MYPET_SHOT_DIR=폴더       MYPET_SCRIPT 의 shot 저장 위치
 *  MYPET_NOW=ISO시각         시계를 이 시각부터 흐르게 (월급·퇴근 연출 확인)
 *  MYPET_USERDATA=폴더      저장 위치를 바꾼다 (헤드리스는 기본으로 임시 폴더)
 *  MYPET_SELFTEST=1         창 목록(koffi)을 한 번 읽어 출력하고 종료 (패키징 확인용)
 *  MYPET_LOG=1              렌더러 콘솔을 터미널로
 *  MYPET_NO_UPDATE=1        자동 업데이트 끄기
 *  MYPET_SAVE_DIR=폴더      이미지 저장 대화상자 대신 이 폴더에 바로 저장 (자동 테스트)
 *  MYPET_LAB=이름 MYPET_SHOT=경로.png MYPET_SIZE=가로x세로   lab.html#이름 캡처 (아이콘 만들기 등)
 */
export const env = process.env

export function isHeadless(): boolean {
  return env.MYPET_HEADLESS === '1'
}

export function preloadPath(name: 'panel' | 'overlay' | 'browser'): string {
  return join(__dirname, `../preload/${name}.js`)
}

export function rendererUrl(page: string): { url?: string; file?: string } {
  const devUrl = env.ELECTRON_RENDERER_URL
  if (devUrl) return { url: `${devUrl}/${page}.html` }
  return { file: join(__dirname, `../renderer/${page}.html`) }
}

export function loadRenderer(win: BrowserWindow | Electron.WebContents, page: string, o: { hash?: string; query?: Record<string, string> } = {}): void {
  const wc = 'webContents' in win ? win.webContents : win
  const r = rendererUrl(page)
  const q = o.query && Object.keys(o.query).length ? '?' + new URLSearchParams(o.query).toString() : ''
  if (r.url) void wc.loadURL(`${r.url}${q}${o.hash ? '#' + o.hash : ''}`)
  else void wc.loadFile(r.file!, { hash: o.hash, query: o.query })
}

/** 테스트용 시계: MYPET_NOW 가 있으면 그 시각부터 흐른다 */
const nowOffset = env.MYPET_NOW ? new Date(env.MYPET_NOW).getTime() - Date.now() : 0
export function now(): number {
  return Date.now() + nowOffset
}
export const NOW_OFFSET = nowOffset
