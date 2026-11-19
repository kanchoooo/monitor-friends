// 이름 정리 — 원본 이름을 바꾸는 유일한 도구. 겹치지 않게 임시 이름을 거쳐 두 번에 바꾼다
import { existsSync } from 'fs'
import { rename, stat } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import { errMsg } from './files'

export interface RenameResult {
  done: [from: string, to: string][]
  failed: { name: string; reason: string }[]
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

function yymmdd(d: Date): string {
  return `${pad2(d.getFullYear() % 100)}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

/** 대소문자를 안 가리는 디스크(맥·윈도우 기본)도 있으니 비교는 소문자로 */
const key = (p: string): string => p.normalize('NFC').toLowerCase()

export async function renameFiles(paths: string[], how: 'date' | 'seq'): Promise<RenameResult> {
  const failed: RenameResult['failed'] = []
  const plan: { from: string; to: string }[] = []
  const sources = new Set(paths.map(key))
  const taken = new Set<string>()

  const pick = (dir: string, base: string, ext: string, self: string): string => {
    for (let i = 1; i < 1000; i++) {
      const p = join(dir, `${i === 1 ? base : `${base} (${i})`}${ext}`)
      const k = key(p)
      if (taken.has(k)) continue
      if (k !== key(self) && existsSync(p) && !sources.has(k)) continue
      return p
    }
    throw new Error('같은 이름이 너무 많아')
  }

  if (how === 'date') {
    for (const p of paths) {
      const name = basename(p)
      try {
        if (/^\d{6}_/.test(name)) throw new Error('이미 날짜가 붙어 있어')
        const st = await stat(p)
        const ext = st.isDirectory() ? '' : extname(name)
        const base = `${yymmdd(st.mtime)}_${ext ? name.slice(0, -ext.length) : name}`
        const to = pick(dirname(p), base, ext, p)
        taken.add(key(to))
        plan.push({ from: p, to })
      } catch (e) {
        failed.push({ name, reason: errMsg(e) })
      }
    }
  } else {
    const first = basename(paths[0])
    const firstExt = extname(first)
    const base = (firstExt && firstExt !== first ? first.slice(0, -firstExt.length) : first).replace(/_\d{2,4}$/, '')
    const width = Math.max(2, String(paths.length).length)
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i]
      const name = basename(p)
      try {
        const st = await stat(p)
        const ext = st.isDirectory() ? '' : extname(name)
        const to = pick(dirname(p), `${base}_${String(i + 1).padStart(width, '0')}`, ext, p)
        taken.add(key(to))
        plan.push({ from: p, to })
      } catch (e) {
        failed.push({ name, reason: errMsg(e) })
      }
    }
  }

  // 1단계: 임시 이름으로 (서로 이름을 맞바꾸는 경우 대비)
  const moves = plan.filter((m) => m.from !== m.to)
  const tag = `.mypet-${process.pid}-${Date.now().toString(36)}`
  const staged: { from: string; tmp: string; to: string }[] = []
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]
    const tmp = join(dirname(m.from), `${tag}-${i}`)
    try {
      await rename(m.from, tmp)
      staged.push({ ...m, tmp })
    } catch (e) {
      failed.push({ name: basename(m.from), reason: errMsg(e) })
    }
  }
  // 2단계: 새 이름으로 (안 되면 원래 이름으로 되돌린다)
  const done: RenameResult['done'] = []
  for (const s of staged) {
    try {
      if (existsSync(s.to)) throw new Error('그 이름이 방금 생겼어')
      await rename(s.tmp, s.to)
      done.push([s.from, s.to])
    } catch (e) {
      await rename(s.tmp, s.from).catch(() => undefined)
      failed.push({ name: basename(s.from), reason: errMsg(e) })
    }
  }
  return { done, failed }
}
