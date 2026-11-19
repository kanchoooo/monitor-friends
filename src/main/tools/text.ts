// 글자 수 세기 — 자기소개서용 (공백 포함·제외, 줄, 단어, 원고지 매수, 바이트)
import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import { fmtNum } from './files'

const MAX_TEXT = 50 * 1024 * 1024

/** UTF-8 (BOM 포함)·UTF-16 → 아니면 EUC-KR(CP949) 로 읽어 본다 */
export function decodeText(b: Uint8Array): string {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3))
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2))
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b)
  } catch {
    return new TextDecoder('euc-kr').decode(b)
  }
}

export interface TextCount {
  chars: number
  noSpace: number
  lines: number
  words: number
  manuscript: number
  bytes: number
  bytes2: number
}

const seg = new Intl.Segmenter('ko', { granularity: 'grapheme' })

export function countText(raw: string): TextCount {
  const t = raw.normalize('NFC').replace(/\r\n?/g, '\n')
  let chars = 0
  let noSpace = 0
  let bytes2 = 0
  for (const { segment } of seg.segment(t)) {
    chars++
    if (!/^\s+$/u.test(segment)) noSpace++
    bytes2 += segment === '\n' ? 2 : /^[\x00-\x7f]$/.test(segment) ? 1 : 2
  }
  const body = t.replace(/\n+$/, '')
  const lines = body ? body.split('\n').length : 0
  const words = t.split(/\s+/u).filter(Boolean).length
  // 원고지 200자 (20칸 × 10줄): 문단마다 첫 칸 들여쓰기, 빈 줄도 한 줄
  let rows = 0
  for (const para of body.split('\n')) {
    const n = [...seg.segment(para.trim())].length
    rows += n ? Math.ceil((n + 1) / 20) : 1
  }
  const manuscript = body ? Math.ceil(rows / 10) : 0
  return { chars, noSpace, lines, words, manuscript, bytes: Buffer.byteLength(t, 'utf8'), bytes2 }
}

export function formatCount(name: string, c: TextCount): string {
  return [
    `📄 ${name}`,
    `글자 수 (공백 포함) ${fmtNum(c.chars)}자`,
    `글자 수 (공백 제외) ${fmtNum(c.noSpace)}자`,
    `줄 ${fmtNum(c.lines)}줄 · 단어 ${fmtNum(c.words)}개`,
    `원고지 (200자) 약 ${fmtNum(c.manuscript)}매`,
    `바이트 ${fmtNum(c.bytes)} (UTF-8) · ${fmtNum(c.bytes2)} (한글 2바이트 기준)`
  ].join('\n')
}

export async function countFile(path: string): Promise<TextCount> {
  const st = await stat(path)
  if (st.size > MAX_TEXT) throw new Error('글자가 너무 많아 (50MB 넘는 파일)')
  const b = await readFile(path)
  if (b.subarray(0, 8000).includes(0) && !(b[0] === 0xff && b[1] === 0xfe) && !(b[0] === 0xfe && b[1] === 0xff)) {
    throw new Error(`${basename(path)} 은 글자 파일이 아닌 것 같아`)
  }
  return countText(decodeText(b))
}
