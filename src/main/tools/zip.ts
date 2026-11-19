// 압축(zip) — fflate 로 파일을 1MB 씩 읽어 바로 써 내려간다 (큰 파일도 메모리에 다 올리지 않음)
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { createReadStream } from 'fs'
import { lstat, open, readdir, rm } from 'fs/promises'
import { basename, extname, join } from 'path'

/** 합계 한도 (fflate 는 ZIP64 를 못 써서 4GB 아래로 넉넉히) */
export const ZIP_MAX = 2 * 1024 * 1024 * 1024
const SKIP = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized'])
/** 이미 압축된 형식은 그냥 담는다 (다시 눌러도 안 작아지고 느리기만 함) */
const STORED = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'mp4', 'mov', 'm4v', 'webm', 'mkv', 'mp3', 'm4a', 'aac', 'zip', '7z', 'rar', 'gz', 'xz', 'dmg', 'docx', 'xlsx', 'pptx', 'hwpx'])

interface Entry {
  abs: string | null
  rel: string
  size: number
  mtime: Date
}

async function walk(abs: string, rel: string, out: Entry[], skipPath: string): Promise<void> {
  const st = await lstat(abs)
  if (st.isSymbolicLink() || abs === skipPath) return
  if (st.isDirectory()) {
    const names = (await readdir(abs)).filter((n) => !SKIP.has(n)).sort((a, b) => a.localeCompare(b))
    if (!names.length) out.push({ abs: null, rel: rel + '/', size: 0, mtime: st.mtime })
    for (const n of names) await walk(join(abs, n), `${rel}/${n}`, out, skipPath)
  } else if (st.isFile()) {
    out.push({ abs, rel, size: st.size, mtime: st.mtime })
  }
}

/** 담을 목록 (같은 이름은 ' (2)' 붙임) */
export async function zipEntries(paths: string[], outPath: string): Promise<Entry[]> {
  const out: Entry[] = []
  for (const p of paths) {
    if (SKIP.has(basename(p))) continue
    await walk(p, basename(p), out, outPath)
  }
  const seen = new Set<string>()
  for (const e of out) {
    let r = e.rel
    for (let i = 2; seen.has(r.toLowerCase()); i++) {
      const ext = extname(e.rel)
      r = `${e.rel.slice(0, e.rel.length - ext.length)} (${i})${ext}`
    }
    e.rel = r
    seen.add(r.toLowerCase())
  }
  return out
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r))

export async function writeZip(entries: Entry[], outPath: string, onEntry?: (done: number, name: string) => void): Promise<number> {
  const total = entries.reduce((a, e) => a + e.size, 0)
  if (total > ZIP_MAX) throw new Error(`너무 커 (${(total / 1024 ** 3).toFixed(1)}GB) — 2GB 까지만 압축할 수 있어`)
  const fh = await open(outPath, 'wx')
  let chunks: Uint8Array[] = []
  let zipErr: Error | null = null
  let written = 0
  const zip = new Zip((err, chunk) => {
    if (err) zipErr = err
    else chunks.push(chunk)
  })
  const flush = async (): Promise<void> => {
    if (zipErr) throw zipErr
    const list = chunks
    chunks = []
    for (const c of list) {
      await fh.write(c)
      written += c.length
    }
  }
  try {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      const ext = extname(e.rel).slice(1).toLowerCase()
      const f = e.abs && !STORED.has(ext) && e.size > 0 ? new ZipDeflate(e.rel, { level: 6 }) : new ZipPassThrough(e.rel)
      f.mtime = e.mtime
      zip.add(f)
      if (e.abs && e.size > 0) {
        for await (const c of createReadStream(e.abs, { highWaterMark: 1024 * 1024 })) {
          f.push(c as Buffer)
          await flush()
          // 압축하는 동안 앱이 굳지 않게 한 번씩 숨 돌리기
          await tick()
        }
      }
      f.push(new Uint8Array(0), true)
      await flush()
      onEntry?.(i + 1, e.rel)
    }
    zip.end()
    await flush()
    await fh.close()
    return written
  } catch (err) {
    await fh.close().catch(() => undefined)
    await rm(outPath, { force: true })
    throw err
  }
}
