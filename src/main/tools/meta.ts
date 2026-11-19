// 촬영 정보(EXIF·XMP·IPTC) 지우기 — JPG·PNG·WEBP 는 화질 손실 없이 바이트에서 빼낸다
// 못 다루는 형식이면 null → 작업 창에서 다시 인코딩

/** JPG: APP1(EXIF·XMP)·APP13(IPTC)·COM·MPF 를 빼고, 사진 방향만 작은 EXIF 로 다시 넣는다 */
export function stripJpeg(b: Buffer): Buffer | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  const parts: Buffer[] = []
  let orientation = 1
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1]
    if (m === 0xff) {
      i++
      continue
    }
    if (m === 0xda) {
      // 사진 데이터 시작 — 첫 EOI(FFD9) 까지만 (뒤에 붙은 숨은 사진·깊이 정보는 버린다)
      const eoi = findEoi(b, i)
      // 방향 EXIF 는 JFIF(APP0) 바로 뒤에
      if (orientation !== 1) parts.splice(parts[0]?.[1] === 0xe0 ? 1 : 0, 0, orientationApp1(orientation))
      return Buffer.concat([b.subarray(0, 2), ...parts, b.subarray(i, eoi)])
    }
    const len = b.readUInt16BE(i + 2)
    if (len < 2 || i + 2 + len > b.length) return null
    const seg = b.subarray(i, i + 2 + len)
    const body = b.subarray(i + 4, i + 2 + len)
    let drop = false
    if (m === 0xe1) {
      if (body.subarray(0, 6).toString('latin1') === 'Exif\0\0') orientation = readOrientation(body.subarray(6)) ?? 1
      drop = true
    } else if (m === 0xed || m === 0xfe) drop = true
    else if (m === 0xe2 && body.subarray(0, 4).toString('latin1') === 'MPF\0') drop = true
    if (!drop) parts.push(seg)
    i += 2 + len
  }
  return null
}

function findEoi(b: Buffer, from: number): number {
  for (let j = from; j + 1 < b.length; j++) {
    if (b[j] === 0xff && b[j + 1] === 0xd9) return j + 2
  }
  return b.length
}

function readOrientation(t: Buffer): number | null {
  if (t.length < 8) return null
  const le = t.toString('latin1', 0, 2) === 'II'
  const u16 = (o: number): number => (le ? t.readUInt16LE(o) : t.readUInt16BE(o))
  const u32 = (o: number): number => (le ? t.readUInt32LE(o) : t.readUInt32BE(o))
  const ifd = u32(4)
  if (ifd + 2 > t.length) return null
  const n = u16(ifd)
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12
    if (e + 12 > t.length) return null
    if (u16(e) === 0x0112) return u16(e + 8)
  }
  return null
}

/** 방향(Orientation) 태그 하나만 든 EXIF */
function orientationApp1(o: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4)
  tiff.write('MM', 0, 'latin1')
  tiff.writeUInt16BE(42, 2)
  tiff.writeUInt32BE(8, 4)
  tiff.writeUInt16BE(1, 8)
  tiff.writeUInt16BE(0x0112, 10)
  tiff.writeUInt16BE(3, 12)
  tiff.writeUInt32BE(1, 14)
  tiff.writeUInt16BE(o, 18)
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const head = Buffer.alloc(4)
  head[0] = 0xff
  head[1] = 0xe1
  head.writeUInt16BE(body.length + 2, 2)
  return Buffer.concat([head, body])
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'])

/** PNG: 글자·EXIF·시각 덩어리를 뺀다 (그림 데이터는 그대로) */
export function stripPng(b: Buffer): Buffer | null {
  if (b.length < 8 || !b.subarray(0, 8).equals(PNG_SIG)) return null
  const parts: Buffer[] = [PNG_SIG]
  let i = 8
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i)
    const type = b.toString('latin1', i + 4, i + 8)
    const end = i + 12 + len
    if (end > b.length) return null
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end))
    i = end
    if (type === 'IEND') return Buffer.concat(parts)
  }
  return null
}

/** WEBP: EXIF·XMP 덩어리를 빼고 VP8X 표시도 끈다 */
export function stripWebp(b: Buffer): Buffer | null {
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null
  const parts: Buffer[] = []
  let i = 12
  while (i + 8 <= b.length) {
    const type = b.toString('latin1', i, i + 4)
    const len = b.readUInt32LE(i + 4)
    const end = i + 8 + len + (len & 1)
    if (i + 8 + len > b.length) return null
    if (type === 'VP8X') {
      const c = Buffer.from(b.subarray(i, Math.min(end, b.length)))
      c[8] &= ~(0x08 | 0x04)
      parts.push(c)
    } else if (type !== 'EXIF' && type !== 'XMP ') parts.push(b.subarray(i, Math.min(end, b.length)))
    i = end
  }
  const body = Buffer.concat(parts)
  const head = Buffer.alloc(12)
  head.write('RIFF', 0, 'latin1')
  head.writeUInt32LE(body.length + 4, 4)
  head.write('WEBP', 8, 'latin1')
  return Buffer.concat([head, body])
}

export function stripLossless(ext: string, b: Buffer): Buffer | null {
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'jfif') return stripJpeg(b)
  if (ext === 'png') return stripPng(b)
  if (ext === 'webp') return stripWebp(b)
  return null
}
