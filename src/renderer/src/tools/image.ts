// 이미지 그리기 — 읽기(EXIF 방향 반영) → 자르기 → 크기 → 돌리기 → 흑백 → 인코딩
import type { EncodeOpts, ImageOps, WorkerOut } from '@shared/toolJobs'

/** 캔버스 한 장 최대 픽셀 (메모리·크로미움 한도) */
const MAX_PIXELS = 200_000_000

export async function decode(bytes: Uint8Array): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]), { imageOrientation: 'from-image' })
  } catch {
    throw new Error('이미지를 못 읽었어 (깨졌거나 모르는 형식이야)')
  }
}

function newCanvas(w: number, h: number): { c: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  if (w * h > MAX_PIXELS || w > 32000 || h > 32000) throw new Error(`그림이 너무 커 (${w}×${h})`)
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('그림판을 못 만들었어 (메모리가 모자란가 봐)')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return { c, ctx }
}

async function encode(c: OffscreenCanvas, out: EncodeOpts): Promise<{ bytes: Uint8Array; notSmaller: boolean }> {
  const qs: (number | undefined)[] = out.type === 'png' ? [undefined] : out.quality?.length ? out.quality : [0.92]
  let best: Blob | null = null
  for (const q of qs) {
    const blob = await c.convertToBlob({ type: `image/${out.type}`, quality: q })
    if (blob.type !== `image/${out.type}`) throw new Error(`${out.type.toUpperCase()} 로는 저장을 못 해`)
    if (!best || blob.size < best.size) best = blob
    if (!out.maxBytes || blob.size < out.maxBytes) return { bytes: new Uint8Array(await blob.arrayBuffer()), notSmaller: false }
  }
  return { bytes: new Uint8Array(await best!.arrayBuffer()), notSmaller: true }
}

export async function runImage(bytes: Uint8Array, ops: ImageOps, out: EncodeOpts): Promise<WorkerOut> {
  const bmp = await decode(bytes)
  try {
    const srcW = bmp.width
    const srcH = bmp.height
    // 자를 부분 (가운데)
    let sx = 0
    let sy = 0
    let sw = srcW
    let sh = srcH
    if (ops.crop) {
      const r = ops.crop
      if (sw / sh > r) {
        const nw = Math.max(1, Math.round(sh * r))
        sx = Math.floor((sw - nw) / 2)
        sw = nw
      } else {
        const nh = Math.max(1, Math.round(sw / r))
        sy = Math.floor((sh - nh) / 2)
        sh = nh
      }
    }
    // 배율 (늘리지 않는다)
    let k = ops.scale ?? 1
    if (ops.maxWidth && sw * k > ops.maxWidth) k = ops.maxWidth / sw
    if (ops.maxEdge && Math.max(sw, sh) * k > ops.maxEdge) k = ops.maxEdge / Math.max(sw, sh)
    k = Math.min(k, 1)
    const dw = Math.max(1, Math.round(sw * k))
    const dh = Math.max(1, Math.round(sh * k))
    const rot = ops.rotate ?? 0
    const swap = rot === 90 || rot === 270
    const cw = swap ? dh : dw
    const ch = swap ? dw : dh

    const { c, ctx } = newCanvas(cw, ch)
    if (out.type === 'jpeg') {
      // JPG 는 투명이 없어서 흰 바탕
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, cw, ch)
    }
    if (ops.gray) ctx.filter = 'grayscale(1)'
    ctx.translate(cw / 2, ch / 2)
    if (rot) ctx.rotate((rot * Math.PI) / 180)
    if (ops.flip) ctx.scale(-1, 1)
    ctx.drawImage(bmp, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh)

    const enc = await encode(c, out)
    return { bytes: enc.bytes, notSmaller: enc.notSmaller, width: cw, height: ch, type: out.type, srcWidth: srcW, srcHeight: srcH }
  } finally {
    bmp.close()
  }
}

/** 세로로 이어 붙이기 — 가장 흔한 가로 폭(없으면 가장 좁은 폭)에 맞춘다 */
export async function runStitch(images: Uint8Array[], maxHeight: number): Promise<WorkerOut> {
  const sizes: [number, number][] = []
  for (const b of images) {
    const bmp = await decode(b)
    sizes.push([bmp.width, bmp.height])
    bmp.close()
  }
  const count = new Map<number, number>()
  for (const [w] of sizes) count.set(w, (count.get(w) ?? 0) + 1)
  let W = Math.min(...sizes.map((s) => s[0]))
  let top = 1
  for (const [w, n] of count) if (n > top || (n === top && n > 1 && w < W)) [W, top] = [w, n]
  const heights = sizes.map(([w, h]) => Math.max(1, Math.round((h * W) / w)))
  const H = heights.reduce((a, b) => a + b, 0)
  if (H > maxHeight) throw new Error(`너무 길어 (${H.toLocaleString()}px) — ${maxHeight.toLocaleString()}px 까지만 붙일 수 있어`)

  const { c, ctx } = newCanvas(W, H)
  let y = 0
  for (let i = 0; i < images.length; i++) {
    const bmp = await decode(images[i])
    ctx.drawImage(bmp, 0, y, W, heights[i])
    bmp.close()
    y += heights[i]
  }
  // 적당한 크기면 PNG (캡처 글씨가 선명), 아주 크면 JPG
  const type = W * H <= 25_000_000 ? 'png' : 'jpeg'
  if (type === 'jpeg') {
    // 투명 부분 흰색으로 (위에 그렸으니 뒤에 깔기)
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
  }
  const enc = await encode(c, { type, quality: [0.9] })
  return { bytes: enc.bytes, width: W, height: H, type }
}
