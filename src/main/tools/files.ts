// 결과 파일 이름 짓기 · 크기 글자 · 임시 폴더
import { app } from 'electron'
import { accessSync, constants, existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, extname, join } from 'path'

/** 결과 파일 꼬리표 — 원본 옆에 '이름_pet.확장자' 로 만든다 */
export const SUFFIX = '_pet'

export function baseName(p: string): string {
  const b = basename(p)
  const e = extname(b)
  return e && e !== b ? b.slice(0, -e.length) : b
}

function writable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** 쓸 수 있는 폴더 (원본 폴더에 못 쓰면 바탕화면). 테스트는 MYPET_TOOLS_FALLBACK_DIR 로 바꾼다 */
export function outDirFor(src: string): string {
  const d = dirname(src)
  if (writable(d)) return d
  return process.env.MYPET_TOOLS_FALLBACK_DIR || app.getPath('desktop')
}

/** 겹치지 않는 경로 (있으면 ' (2)', ' (3)' …) */
export function uniquePath(dir: string, base: string, ext: string, taken?: Set<string>): string {
  const dot = ext ? `.${ext}` : ''
  for (let i = 1; i < 10000; i++) {
    const p = join(dir, i === 1 ? `${base}${dot}` : `${base} (${i})${dot}`)
    if (!existsSync(p) && !taken?.has(p)) return p
  }
  throw new Error('이름을 못 정했어 (같은 이름이 너무 많아)')
}

/** 원본 옆 결과 경로: 사진.jpg → 사진_pet.webp */
export function outPathFor(src: string, ext: string, suffix = SUFFIX): string {
  return uniquePath(outDirFor(src), baseName(src) + suffix, ext)
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)}MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)}GB`
}

export function fmtNum(n: number): string {
  return n.toLocaleString('ko-KR')
}

/** 작업마다 쓰는 임시 폴더 (끝나면 지운다) */
export function makeTemp(): { dir: string; dispose: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'mypet-tools-'))
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return '파일이 없어졌어'
    if (code === 'EACCES' || code === 'EPERM') return '권한이 없어서 못 건드려'
    if (code === 'ENOSPC') return '디스크 공간이 모자라'
    return e.message
  }
  return String(e)
}
