// 파일 도우미 — 펫에게 끌어다 놓은 파일로 할 일 (원본은 건드리지 않고 옆에 '이름_pet.확장자' 로 만든다)
// 이미지 픽셀 작업은 숨은 작업 창(worker.ts)에, 나머지(압축·PDF·이름·글자 수·휴지통)는 여기서
import { clipboard, shell } from 'electron'
import { execFile } from 'child_process'
import { statSync } from 'fs'
import { readFile, rm, stat, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { promisify } from 'util'
import type { DroppedFile, ToolProgress, ToolRequest, ToolResult } from '@shared/tools'
import { isImageFile, kindOf } from '@shared/toolDefs'
import type { EncodeOpts, ImageOps, ImgType, WorkerOut } from '@shared/toolJobs'
import { baseName, errMsg, fmtBytes, fmtNum, makeTemp, outDirFor, outPathFor, uniquePath } from './files'
import { stripLossless } from './meta'
import { PdfWriter } from './pdf'
import { renameFiles } from './rename'
import { countFile, formatCount } from './text'
import { disposeWorker, workerRun } from './worker'
import { writeZip, zipEntries } from './zip'

const run = promisify(execFile)

const MAX_IMAGE = 300 * 1024 * 1024
const MAX_VIDEO = 500 * 1024 * 1024
const MAX_STITCH_TOTAL = 400 * 1024 * 1024
const STITCH_MAX_H = 30000
const GIF_FPS = 10

/** 크로미움이 직접 못 읽어서 맥 sips 로 먼저 JPG 로 푸는 형식 */
const SIPS_EXT = new Set(['heic', 'heif', 'tif', 'tiff'])
const EXT_OF: Record<ImgType, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }
const NAME_OF: Record<ImgType, string> = { jpeg: 'JPG', png: 'PNG', webp: 'WEBP' }

/** 건너뛴 것 (실패는 아님 — "이미 작아서 그대로 뒀어" 같은) */
class Skip extends Error {}

type Progress = ((p: ToolProgress) => void) | undefined

export function inspectFiles(paths: string[]): DroppedFile[] {
  const out: DroppedFile[] = []
  for (const p of paths) {
    try {
      const st = statSync(p)
      const name = basename(p)
      if (st.isDirectory()) {
        out.push({ path: p, name, ext: '', size: 0, kind: 'other', dir: true })
      } else {
        const ext = extname(name).slice(1).toLowerCase()
        out.push({ path: p, name, ext, size: st.size, kind: kindOf(ext) })
      }
    } catch {
      // 없어진 파일은 뺀다
    }
  }
  return out
}

export function disposeTools(): void {
  disposeWorker()
}

/** 원본과 같은 형식 (못 쓰는 형식이면 가까운 것으로) */
function sameType(ext: string): ImgType {
  if (ext === 'png' || ext === 'gif' || ext === 'bmp') return 'png'
  if (ext === 'webp') return 'webp'
  return 'jpeg'
}

function qualityFor(t: ImgType): number[] | undefined {
  return t === 'png' ? undefined : [t === 'webp' ? 0.9 : 0.92]
}

/** 이미지 바이트 읽기 (HEIC·TIFF 는 맥 sips 로 JPG 로 풀어서) */
async function readImage(f: DroppedFile, tmp: string): Promise<Uint8Array> {
  if (f.size > MAX_IMAGE) throw new Error('너무 큰 이미지야 (300MB 넘음)')
  if (!SIPS_EXT.has(f.ext)) return readFile(f.path)
  if (process.platform !== 'darwin') {
    throw new Error(f.kind === 'heic' ? '윈도우에서는 HEIC 을 못 열어 (사진 앱에서 JPG 로 저장해 줘)' : `윈도우에서는 ${f.ext.toUpperCase()} 를 못 열어`)
  }
  const out = join(tmp, `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)
  try {
    await run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', 'best', f.path, '--out', out], { timeout: 60_000 })
    return await readFile(out)
  } catch {
    throw new Error(`${f.ext.toUpperCase()} 을 못 풀었어 (깨진 파일일 수도)`)
  } finally {
    await rm(out, { force: true })
  }
}

async function writeOut(src: string, ext: string, bytes: Uint8Array): Promise<string> {
  // 'wx' — 혹시 그 사이 같은 이름이 생겨도 덮어쓰지 않게
  for (let i = 0; i < 3; i++) {
    const p = outPathFor(src, ext)
    try {
      await writeFile(p, bytes, { flag: 'wx' })
      return p
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
  throw new Error('저장할 이름을 못 정했어')
}

interface ImgDone {
  out: string
  inSize: number
  outSize: number
  w: number
  h: number
  srcW?: number
  srcH?: number
}

function summary(r: ToolResult, skipped: number): ToolResult {
  const fails = r.failed.length - skipped
  if (!r.outputs.length && !r.text) {
    r.ok = skipped > 0 && fails === 0
    if (!r.ok) r.message = `앗, 못 했어… ${r.failed[0]?.reason ?? '알 수 없는 문제'}`
    else r.message = r.failed[0]?.reason ?? '할 게 없었어'
    return r
  }
  if (fails > 0) r.message += ` (${fails}개는 못 했어)`
  else if (skipped > 0) r.message += ` (${skipped}개는 그대로 뒀어)`
  return r
}

/** 이미지 한 장씩 같은 일 (실패는 모아 두고 나머지는 계속) */
async function eachImage(
  req: ToolRequest,
  onProgress: Progress,
  work: (f: DroppedFile, bytes: Uint8Array) => Promise<ImgDone>,
  say: (done: ImgDone[]) => string
): Promise<ToolResult> {
  const files = inspectFiles(req.files)
  const res: ToolResult = { ok: true, outputs: [], message: '', failed: [] }
  const done: ImgDone[] = []
  let skipped = 0
  const tmp = makeTemp()
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      onProgress?.({ done: i, total: files.length, label: f.name })
      try {
        if (!isImageFile(f)) throw new Skip(f.dir ? '폴더는 건너뛰었어' : '이미지가 아니라서 건너뛰었어')
        const d = await work(f, await readImage(f, tmp.dir))
        done.push(d)
        res.outputs.push(d.out)
      } catch (e) {
        if (e instanceof Skip) skipped++
        res.failed.push({ name: f.name, reason: errMsg(e) })
      }
    }
    onProgress?.({ done: files.length, total: files.length })
  } finally {
    tmp.dispose()
  }
  if (done.length) res.message = say(done)
  return summary(res, skipped)
}

const sizes = (d: ImgDone[]): string => {
  const a = d.reduce((s, x) => s + x.inSize, 0)
  const b = d.reduce((s, x) => s + x.outSize, 0)
  return `${fmtBytes(a)} → ${fmtBytes(b)}`
}

async function imageJob(f: DroppedFile, bytes: Uint8Array, ops: ImageOps, out: EncodeOpts): Promise<WorkerOut> {
  return workerRun({ op: 'image', bytes, ops, out }, 90_000)
}

async function saveImage(f: DroppedFile, r: WorkerOut): Promise<ImgDone> {
  const out = await writeOut(f.path, EXT_OF[r.type as ImgType] ?? 'png', r.bytes)
  return { out, inSize: f.size, outSize: r.bytes.length, w: r.width, h: r.height, srcW: r.srcWidth, srcH: r.srcHeight }
}

// ── 이미지 도구 ──

function toolConvert(req: ToolRequest, p: Progress): Promise<ToolResult> {
  const to: ImgType = req.opts.to === 'png' ? 'png' : req.opts.to === 'webp' ? 'webp' : 'jpeg'
  return eachImage(
    req,
    p,
    async (f, bytes) => {
      if (!SIPS_EXT.has(f.ext) && sameType(f.ext) === to && f.ext !== 'gif' && f.ext !== 'bmp') throw new Skip(`이미 ${NAME_OF[to]}야`)
      return saveImage(f, await imageJob(f, bytes, {}, { type: to, quality: qualityFor(to) }))
    },
    (d) => `${d.length}장 ${NAME_OF[to]}로 바꿨어! ${sizes(d)}`
  )
}

function toolResize(req: ToolRequest, p: Progress): Promise<ToolResult> {
  const v = req.opts.size ?? '50'
  const ops: ImageOps = v.startsWith('w') ? { maxWidth: Number(v.slice(1)) || 1920 } : { scale: (Number(v) || 50) / 100 }
  const what = v.startsWith('w') ? `가로 ${v.slice(1)}으로` : `${v}%로`
  return eachImage(
    req,
    p,
    async (f, bytes) => {
      const t = sameType(f.ext)
      const r = await imageJob(f, bytes, ops, { type: t, quality: qualityFor(t) })
      if (r.srcWidth && r.width >= r.srcWidth) throw new Skip(`이미 가로 ${r.srcWidth}px라서 그대로 뒀어 (늘리지는 않아)`)
      return saveImage(f, r)
    },
    (d) =>
      d.length === 1 && d[0].srcW
        ? `${what} 줄였어! ${d[0].srcW}×${d[0].srcH} → ${d[0].w}×${d[0].h} · ${sizes(d)}`
        : `${d.length}장 ${what} 줄였어! ${sizes(d)}`
  )
}

const COMPRESS: Record<string, { q: number[]; edge: number }> = {
  normal: { q: [0.8, 0.7], edge: 2560 },
  more: { q: [0.65, 0.55], edge: 1920 },
  most: { q: [0.5, 0.4], edge: 1280 }
}

function toolCompress(req: ToolRequest, p: Progress): Promise<ToolResult> {
  const lv = COMPRESS[req.opts.level ?? 'normal'] ?? COMPRESS.normal
  const fmt = req.opts.format ?? 'auto'
  return eachImage(
    req,
    p,
    async (f, bytes) => {
      const t: ImgType = fmt === 'jpg' ? 'jpeg' : fmt === 'webp' ? 'webp' : sameType(f.ext) === 'jpeg' ? 'jpeg' : 'webp'
      const r = await imageJob(f, bytes, { maxEdge: lv.edge }, { type: t, quality: lv.q, maxBytes: f.size })
      if (r.notSmaller) throw new Skip('이미 충분히 가벼워서 그대로 뒀어')
      return saveImage(f, r)
    },
    (d) => {
      const a = d.reduce((s, x) => s + x.inSize, 0)
      const b = d.reduce((s, x) => s + x.outSize, 0)
      return `${d.length}장 가볍게 했어! ${fmtBytes(a)} → ${fmtBytes(b)} (${Math.round((1 - b / a) * 100)}% 줄임)`
    }
  )
}

const RATIO: Record<string, number> = { '1x1': 1, '4x5': 4 / 5, '16x9': 16 / 9, '9x16': 9 / 16 }

function toolCrop(req: ToolRequest, p: Progress): Promise<ToolResult> {
  const key = RATIO[req.opts.ratio ?? ''] ? (req.opts.ratio as string) : '1x1'
  const r = RATIO[key]
  return eachImage(
    req,
    p,
    async (f, bytes) => {
      const t = sameType(f.ext)
      const o = await imageJob(f, bytes, { crop: r }, { type: t, quality: qualityFor(t) })
      if (o.srcWidth === o.width && o.srcHeight === o.height) throw new Skip('이미 그 비율이야')
      return saveImage(f, o)
    },
    (d) => `${d.length}장 ${key.replace('x', ':')}로 잘랐어!${d.length === 1 ? ` ${d[0].w}×${d[0].h}` : ''}`
  )
}

function toolRotate(req: ToolRequest, p: Progress): Promise<ToolResult> {
  const dir = req.opts.dir ?? 'right'
  const ops: ImageOps = dir === 'left' ? { rotate: 270 } : dir === '180' ? { rotate: 180 } : dir === 'flip' ? { flip: true } : { rotate: 90 }
  const what = dir === 'left' ? '왼쪽으로 돌렸어' : dir === '180' ? '거꾸로 돌렸어' : dir === 'flip' ? '좌우로 뒤집었어' : '오른쪽으로 돌렸어'
  return eachImage(
    req,
    p,
    async (f, bytes) => {
      const t = sameType(f.ext)
      return saveImage(f, await imageJob(f, bytes, ops, { type: t, quality: qualityFor(t) }))
    },
    (d) => `${d.length}장 ${what}!`
  )
}

function toolGray(req: ToolRequest, p: Progress): Promise<ToolResult> {
  return eachImage(
    req,
    p,
    async (f, bytes) => {
      const t = sameType(f.ext)
      return saveImage(f, await imageJob(f, bytes, { gray: true }, { type: t, quality: qualityFor(t) }))
    },
    (d) => `${d.length}장 흑백으로 바꿨어!`
  )
}

function toolStrip(req: ToolRequest, p: Progress): Promise<ToolResult> {
  let lossless = 0
  return eachImage(
    req,
    p,
    async (f, bytes) => {
      const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const clean = SIPS_EXT.has(f.ext) ? null : stripLossless(f.ext, b)
      if (clean) {
        if (clean.length === b.length) throw new Skip('지울 촬영 정보가 없었어')
        lossless++
        const out = await writeOut(f.path, f.ext, clean)
        return { out, inSize: f.size, outSize: clean.length, w: 0, h: 0 }
      }
      // 직접 못 다루는 형식은 다시 그려서 저장 (그림판 저장은 정보를 안 담는다)
      const t = sameType(f.ext)
      return saveImage(f, await imageJob(f, bytes, {}, { type: t, quality: t === 'png' ? undefined : [0.95] }))
    },
    (d) => `${d.length}장 촬영 정보를 지웠어! 위치 걱정 끝${lossless === d.length ? ' (화질 그대로)' : ''}`
  )
}

// ── 여러 장 → 하나 ──

async function toolPdf(req: ToolRequest, onProgress: Progress): Promise<ToolResult> {
  const files = inspectFiles(req.files)
  const imgs = files.filter((f) => isImageFile(f))
  const res: ToolResult = { ok: true, outputs: [], message: '', failed: [] }
  for (const f of files) if (!imgs.includes(f)) res.failed.push({ name: f.name, reason: '이미지가 아니라서 뺐어' })
  if (!imgs.length) return summary(res, 0)
  const a4 = (req.opts.page ?? 'a4') === 'a4'
  const out = outPathFor(imgs[0].path, 'pdf')
  const pdf = new PdfWriter(out, a4)
  const tmp = makeTemp()
  let pages = 0
  try {
    await pdf.open()
    for (let i = 0; i < imgs.length; i++) {
      const f = imgs[i]
      onProgress?.({ done: i, total: imgs.length, label: f.name })
      try {
        const bytes = await readImage(f, tmp.dir)
        // A4 는 300dpi 정도면 충분
        const r = await workerRun({ op: 'image', bytes, ops: a4 ? { maxEdge: 3508 } : {}, out: { type: 'jpeg', quality: [0.9] } }, 90_000)
        await pdf.addPage({ jpeg: r.bytes, px: r.width, py: r.height })
        pages++
      } catch (e) {
        res.failed.push({ name: f.name, reason: errMsg(e) })
      }
    }
    if (!pages) throw new Error(res.failed[0]?.reason ?? '쪽이 하나도 없어')
    await pdf.close()
  } catch (e) {
    await pdf.abort()
    await rm(out, { force: true })
    tmp.dispose()
    return { ok: false, outputs: [], message: `앗, PDF 를 못 만들었어… ${errMsg(e)}`, failed: res.failed }
  }
  tmp.dispose()
  onProgress?.({ done: imgs.length, total: imgs.length })
  res.outputs.push(out)
  res.message = `${pages}장 PDF로 묶었어! (${fmtBytes((await stat(out)).size)})`
  return summary(res, 0)
}

async function toolStitch(req: ToolRequest, onProgress: Progress): Promise<ToolResult> {
  const files = inspectFiles(req.files)
  const imgs = files.filter((f) => isImageFile(f))
  const res: ToolResult = { ok: true, outputs: [], message: '', failed: [] }
  for (const f of files) if (!imgs.includes(f)) res.failed.push({ name: f.name, reason: '이미지가 아니라서 뺐어' })
  const tmp = makeTemp()
  try {
    const total = imgs.reduce((a, f) => a + f.size, 0)
    if (total > MAX_STITCH_TOTAL) throw new Error('사진이 너무 많거나 커 (합쳐서 400MB 넘음)')
    const bytes: Uint8Array[] = []
    const used: DroppedFile[] = []
    for (let i = 0; i < imgs.length; i++) {
      onProgress?.({ done: i, total: imgs.length + 1, label: imgs[i].name })
      try {
        bytes.push(await readImage(imgs[i], tmp.dir))
        used.push(imgs[i])
      } catch (e) {
        res.failed.push({ name: imgs[i].name, reason: errMsg(e) })
      }
    }
    if (bytes.length < 2) throw new Error('이어 붙일 이미지가 두 장은 있어야 해')
    onProgress?.({ done: imgs.length, total: imgs.length + 1, label: '이어 붙이는 중' })
    const r = await workerRun({ op: 'stitch', images: bytes, maxHeight: STITCH_MAX_H }, 180_000)
    const out = await writeOut(used[0].path, EXT_OF[r.type as ImgType], r.bytes)
    onProgress?.({ done: imgs.length + 1, total: imgs.length + 1 })
    res.outputs.push(out)
    res.message = `${used.length}장 이어 붙였어! ${fmtNum(r.width)}×${fmtNum(r.height)} · ${fmtBytes(r.bytes.length)}`
    return summary(res, 0)
  } catch (e) {
    return { ok: false, outputs: [], message: `앗, 못 붙였어… ${errMsg(e)}`, failed: res.failed }
  } finally {
    tmp.dispose()
  }
}

async function toolGif(req: ToolRequest, onProgress: Progress): Promise<ToolResult> {
  const files = inspectFiles(req.files)
  const res: ToolResult = { ok: true, outputs: [], message: '', failed: [] }
  const seconds = req.opts.len === '8' ? 8 : 5
  const size = Number(req.opts.size) || 480
  const vids = files.filter((f) => !f.dir && f.kind === 'video')
  for (const f of files) if (!vids.includes(f)) res.failed.push({ name: f.name, reason: '동영상이 아니라서 건너뛰었어' })
  const made: WorkerOut[] = []
  for (let i = 0; i < vids.length; i++) {
    const f = vids[i]
    // 진행 = 파일 하나당 100칸
    onProgress?.({ done: i * 100, total: vids.length * 100, label: f.name })
    try {
      if (f.size > MAX_VIDEO) throw new Error('동영상이 너무 커 (500MB 넘음)')
      const bytes = await readFile(f.path)
      const mime = f.ext === 'webm' ? 'video/webm' : 'video/mp4'
      const r = await workerRun({ op: 'gif', bytes, mime, seconds, size, fps: GIF_FPS }, 240_000, (p) =>
        onProgress?.({ done: i * 100 + Math.floor((p.done / Math.max(1, p.total)) * 100), total: vids.length * 100, label: f.name })
      )
      res.outputs.push(await writeOut(f.path, 'gif', r.bytes))
      made.push(r)
    } catch (e) {
      res.failed.push({ name: f.name, reason: errMsg(e) })
    }
  }
  onProgress?.({ done: vids.length * 100, total: vids.length * 100 })
  if (made.length === 1) {
    const r = made[0]
    res.message = `GIF 만들었어! ${Math.round(r.seconds ?? seconds)}초 · ${r.width}×${r.height} · ${fmtBytes(r.bytes.length)}`
  } else if (made.length) res.message = `GIF ${made.length}개 만들었어! ${fmtBytes(made.reduce((a, r) => a + r.bytes.length, 0))}`
  return summary(res, 0)
}

// ── 파일 정리 ──

async function toolZip(req: ToolRequest, onProgress: Progress): Promise<ToolResult> {
  const files = inspectFiles(req.files)
  if (!files.length) return { ok: false, outputs: [], message: '앗, 압축할 파일이 없어졌어', failed: [] }
  const first = files[0]
  const out = uniquePath(outDirFor(first.path), first.dir ? first.name : baseName(first.path), 'zip')
  try {
    const entries = await zipEntries(
      files.map((f) => f.path),
      out
    )
    const total = entries.reduce((a, e) => a + e.size, 0)
    const written = await writeZip(entries, out, (done, name) => onProgress?.({ done, total: entries.length, label: name }))
    const n = entries.filter((e) => e.abs).length
    return { ok: true, outputs: [out], failed: [], message: `${fmtNum(n)}개 압축했어! ${fmtBytes(total)} → ${fmtBytes(written)}` }
  } catch (e) {
    return { ok: false, outputs: [], failed: [], message: `앗, 압축을 못 했어… ${errMsg(e)}` }
  }
}

async function toolRename(req: ToolRequest, onProgress: Progress): Promise<ToolResult> {
  const files = inspectFiles(req.files)
  const missing = req.files.filter((p) => !files.some((f) => f.path === p))
  onProgress?.({ done: 0, total: files.length })
  const r = await renameFiles(
    files.map((f) => f.path),
    req.opts.how === 'seq' ? 'seq' : 'date'
  )
  onProgress?.({ done: files.length, total: files.length })
  const res: ToolResult = {
    ok: true,
    outputs: r.done.map((d) => d[1]),
    failed: [...missing.map((p) => ({ name: basename(p), reason: '파일이 없어졌어' })), ...r.failed],
    message: r.done.length ? `${r.done.length}개 이름 바꿨어! 예) ${basename(r.done[0][1])}` : ''
  }
  const skipped = r.failed.filter((f) => f.reason === '이미 날짜가 붙어 있어').length
  return summary(res, skipped)
}

async function toolCount(req: ToolRequest, onProgress: Progress): Promise<ToolResult> {
  const files = inspectFiles(req.files).filter((f) => !f.dir)
  const res: ToolResult = { ok: true, outputs: [], message: '', failed: [] }
  const blocks: string[] = []
  let chars = 0
  let noSpace = 0
  let n = 0
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    onProgress?.({ done: i, total: files.length, label: f.name })
    try {
      if (f.kind !== 'text') throw new Error('글자 파일(txt·md·csv …)만 셀 수 있어')
      const c = await countFile(f.path)
      blocks.push(formatCount(f.name, c))
      chars += c.chars
      noSpace += c.noSpace
      n++
    } catch (e) {
      res.failed.push({ name: f.name, reason: errMsg(e) })
    }
  }
  if (n) {
    if (n > 1) blocks.push(`합계 ${fmtNum(chars)}자 (공백 제외 ${fmtNum(noSpace)}자)`)
    res.text = blocks.join('\n\n')
    res.message = n === 1 ? `${fmtNum(chars)}자야! (공백 빼면 ${fmtNum(noSpace)}자)` : `${n}개 합쳐서 ${fmtNum(chars)}자야! (공백 빼면 ${fmtNum(noSpace)}자)`
  }
  return summary(res, 0)
}

function toolCopyPath(req: ToolRequest): ToolResult {
  const files = inspectFiles(req.files)
  if (!files.length) return { ok: false, outputs: [], failed: [], message: '앗, 파일이 없어졌어' }
  clipboard.writeText(files.map((f) => f.path).join('\n'))
  return { ok: true, outputs: [], failed: [], message: files.length === 1 ? '경로 복사했어! 붙여넣기 하면 돼' : `경로 ${files.length}개 복사했어!` }
}

async function toolTrash(req: ToolRequest, onProgress: Progress): Promise<ToolResult> {
  const files = inspectFiles(req.files)
  const res: ToolResult = { ok: true, outputs: [], message: '', failed: [] }
  let n = 0
  for (let i = 0; i < files.length; i++) {
    onProgress?.({ done: i, total: files.length, label: files[i].name })
    try {
      await shell.trashItem(files[i].path)
      n++
    } catch (e) {
      res.failed.push({ name: files[i].name, reason: errMsg(e) })
    }
  }
  onProgress?.({ done: files.length, total: files.length })
  if (n) {
    res.message = `냠냠! ${n}개 먹었어 (휴지통에서 꺼낼 수 있어)`
    if (res.failed.length) res.message += ` (${res.failed.length}개는 못 했어)`
    return res
  }
  return { ...res, ok: false, message: `앗, 못 버렸어… ${res.failed[0]?.reason ?? '파일이 없어졌어'}` }
}

export async function runTool(req: ToolRequest, onProgress?: (p: ToolProgress) => void): Promise<ToolResult> {
  try {
    if (!req.files?.length) return { ok: false, outputs: [], failed: [], message: '파일을 먼저 줘!' }
    switch (req.tool) {
      case 'convert':
        return await toolConvert(req, onProgress)
      case 'resize':
        return await toolResize(req, onProgress)
      case 'compress':
        return await toolCompress(req, onProgress)
      case 'crop':
        return await toolCrop(req, onProgress)
      case 'rotate':
        return await toolRotate(req, onProgress)
      case 'gray':
        return await toolGray(req, onProgress)
      case 'strip':
        return await toolStrip(req, onProgress)
      case 'pdf':
        return await toolPdf(req, onProgress)
      case 'stitch':
        return await toolStitch(req, onProgress)
      case 'gif':
        return await toolGif(req, onProgress)
      case 'zip':
        return await toolZip(req, onProgress)
      case 'rename':
        return await toolRename(req, onProgress)
      case 'count':
        return await toolCount(req, onProgress)
      case 'copypath':
        return toolCopyPath(req)
      case 'trash':
        return await toolTrash(req, onProgress)
      default:
        return { ok: false, outputs: [], failed: [], message: '그건 아직 못 해' }
    }
  } catch (e) {
    return { ok: false, outputs: [], failed: [], message: `앗, 문제가 생겼어… ${errMsg(e)}` }
  }
}
