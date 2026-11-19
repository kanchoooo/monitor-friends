// GPT 로 만든 스프라이트 시트(그림 한 장에 포즈 12개) → 펫 아틀라스 규격(pet.ts)으로 바꾼다.
// 순서: 배경 지우기 → 포즈 12개 나누기 (빈 줄·빈 칸 찾기, 안 되면 4×3 칸) → 크기·발 위치 맞추기 → (선택) 걷기 좌우 뒤집기
import { ATLAS_H, ATLAS_W, CELL, COLS, FEET_Y, POSES, POSE_LABEL, ROWS, STAND_H } from '@shared/pet'

export interface SheetOptions {
  /** 배경 지우기 허용 범위 0~100 (기본 40) */
  tolerance?: number
  /** 걷기 두 장 좌우 뒤집기 (왼쪽을 보고 걷는 그림일 때) */
  flipWalk?: boolean
  /** 배경색 (기본 'auto' = 가장자리에서 찾기) */
  bgColor?: [number, number, number] | 'auto'
}

export interface SheetResult {
  atlas: HTMLCanvasElement
  method: 'gaps' | 'grid'
  /** 사용자에게 보여 줄 안내 (한국어) */
  warnings: string[]
  bg: [number, number, number] | 'alpha'
}

type RGB = [number, number, number]
interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 빈 칸을 채울 비슷한 포즈 (앞에 있는 것부터) */
const FALLBACK: Partial<Record<(typeof POSES)[number], (typeof POSES)[number][]>> = {
  stand: ['blink', 'wave', 'happy', 'sit'],
  blink: ['stand'],
  walk1: ['walk2', 'stand'],
  walk2: ['walk1', 'stand'],
  surprised: ['happy', 'stand'],
  sit: ['stand'],
  sleep: ['sit', 'blink', 'stand'],
  happy: ['wave', 'stand'],
  work: ['sit', 'stand'],
  eat: ['sit', 'happy', 'stand'],
  angry: ['stand'],
  wave: ['happy', 'stand']
}

/** 너무 큰 그림은 이 크기로 줄여서 처리 (속도) */
const MAX_SIDE = 1600

export async function processSheet(img: ImageBitmap | HTMLImageElement | HTMLCanvasElement, opts: SheetOptions = {}): Promise<SheetResult> {
  const warnings: string[] = []
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height
  if (!iw || !ih) throw new Error('그림을 읽지 못했어요')
  const k = Math.min(1, MAX_SIDE / Math.max(iw, ih))
  const W = Math.round(iw * k)
  const H = Math.round(ih * k)
  const src = makeCanvas(W, H)
  const sctx = src.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(img, 0, 0, W, H)
  const id = sctx.getImageData(0, 0, W, H)
  const px = id.data

  if (Math.min(iw, ih) < 700) warnings.push('그림 해상도가 낮아요. 1536×1024 처럼 큰 그림이면 더 또렷해요.')

  // ── (a) 배경 지우기
  let bg: RGB | 'alpha'
  if (hasAlpha(px, W, H)) {
    bg = 'alpha'
  } else {
    const est = opts.bgColor && opts.bgColor !== 'auto' ? { color: opts.bgColor, uniform: 1 } : borderColor(px, W, H)
    bg = est.color
    if (est.uniform < 0.75) warnings.push('배경색이 고르지 않아요. 한 가지 색(자홍색 #FF00FF) 배경으로 다시 만들면 더 깔끔해요.')
    removeBg(px, W, H, est.color, opts.tolerance ?? 40)
  }

  // 전경 표시 + 덩어리 나누기 (작은 티끌은 지움)
  const mask = new Uint8Array(W * H)
  for (let i = 0, n = W * H; i < n; i++) mask[i] = px[i * 4 + 3] > 40 ? 1 : 0
  const { label, comps } = components(mask, px, W, H, Math.max(24, Math.round(W * H * 0.00004)))

  // ── (b) 포즈 12개 나누기 → 칸(영역)마다 무게중심이 들어오는 덩어리를 모은다
  let regions = splitByGaps(mask, W, H)
  let method: SheetResult['method'] = 'gaps'
  if (!regions) {
    method = 'grid'
    warnings.push('포즈 12개를 또렷이 나누지 못해서 4×3 칸으로 잘랐어요. 포즈 사이를 더 띄워 달라고 해서 다시 만들어 보세요.')
    regions = gridRegions(W, H)
  }
  const owner = new Int32Array(comps.length).fill(-1)
  // 칸으로 자를 때 여러 칸에 걸친 큰 덩어리(붙어 버린 포즈들)는 픽셀이 있는 칸으로 나눈다
  const [gc, gr] = W >= H * 0.9 ? [COLS, ROWS] : [ROWS, COLS]
  const split = new Uint8Array(comps.length)
  const cellOf = (x: number, y: number): number => Math.min(gr - 1, Math.floor((y * gr) / H)) * gc + Math.min(gc - 1, Math.floor((x * gc) / W))
  comps.forEach((c, ci) => {
    if (!c) return
    if (method === 'grid' && (c.x1 - c.x0 > (W / gc) * 1.15 || c.y1 - c.y0 > (H / gr) * 1.15)) {
      split[ci] = 1
      return
    }
    let best = -1
    let bd = Infinity
    regions.forEach((r, ri) => {
      const dx = c.cx < r.x0 ? r.x0 - c.cx : c.cx > r.x1 ? c.cx - r.x1 : 0
      const dy = c.cy < r.y0 ? r.y0 - c.cy : c.cy > r.y1 ? c.cy - r.y1 : 0
      const dd = dx * dx + dy * dy
      if (dd < bd) [bd, best] = [dd, ri]
    })
    owner[ci] = best
  })
  const boxes: (Box | null)[] = regions.map((r, ri) => {
    let b: Box | null = null
    comps.forEach((c, ci) => {
      if (!c) return
      let cb: Box = c
      if (split[ci]) {
        cb = { x0: Math.max(c.x0, r.x0), y0: Math.max(c.y0, r.y0), x1: Math.min(c.x1, r.x1), y1: Math.min(c.y1, r.y1) }
        if (cb.x0 > cb.x1 || cb.y0 > cb.y1) return
      } else if (owner[ci] !== ri) return
      b = b ? { x0: Math.min(b.x0, cb.x0), y0: Math.min(b.y0, cb.y0), x1: Math.max(b.x1, cb.x1), y1: Math.max(b.y1, cb.y1) } : { ...cb }
    })
    return b
  })

  // ── (c) 크기·위치 맞추기
  const stand = boxes[0]
  const standH = stand ? stand.y1 - stand.y0 + 1 : 0
  const heights = boxes.filter((b): b is Box => !!b).map((b) => b.y1 - b.y0 + 1)
  const median = heights.length ? [...heights].sort((a, b) => a - b)[Math.floor(heights.length / 2)] : 0
  const empty = boxes.filter((b) => !b).length
  if (empty) warnings.push(`빈 칸이 ${empty}개 있어요. 포즈가 빠졌는지 확인해 주세요.`)
  if (!stand) warnings.push('첫 번째 칸(서기)이 비어 있어요.')
  else if (standH / k < 120) warnings.push('서기 포즈가 너무 작아요. 펫을 더 크게 그려 달라고 하면 또렷해져요.')
  else if (standH < median * 0.6) warnings.push('서기 포즈가 다른 포즈보다 많이 작아요. 포즈 순서가 맞는지 확인해 주세요.')
  const scale = STAND_H / Math.max(1, stand ? standH : median || 1)

  const atlas = makeCanvas(ATLAS_W, ATLAS_H)
  const actx = atlas.getContext('2d')!
  actx.imageSmoothingEnabled = true
  actx.imageSmoothingQuality = 'high'
  const piece = makeCanvas(1, 1)
  const pctx = piece.getContext('2d')!
  boxes.forEach((b, i) => {
    if (!b || i >= POSES.length) return
    const bw = b.x1 - b.x0 + 1
    const bh = b.y1 - b.y0 + 1
    // 이 포즈의 덩어리만 떼어 낸다 (옆 포즈 조각이 끼지 않게)
    const pd = new ImageData(bw, bh)
    const out = pd.data
    let fs = 0
    let fn = 0
    const footFrom = b.y1 - Math.max(2, Math.round(bh * 0.12))
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const j = y * W + x
        const l = label[j]
        if (!l || (split[l - 1] ? cellOf(x, y) : owner[l - 1]) !== i) continue
        const o = j * 4
        const q = ((y - b.y0) * bw + (x - b.x0)) * 4
        out[q] = px[o]
        out[q + 1] = px[o + 1]
        out[q + 2] = px[o + 2]
        out[q + 3] = px[o + 3]
        if (y >= footFrom) {
          fs += x
          fn++
        }
      }
    }
    piece.width = bw
    piece.height = bh
    pctx.putImageData(pd, 0, 0)
    const s = Math.min(scale, (CELL - 6) / bw, (FEET_Y - 4) / bh)
    const dw = bw * s
    const dh = bh * s
    // 가로: 발 위치와 전체 가운데의 중간 (꼬리 때문에 치우치지 않게)
    const cx = ((fn ? fs / fn : (b.x0 + b.x1) / 2) + (b.x0 + b.x1) / 2) / 2
    let dx = CELL / 2 - (cx - b.x0) * s
    dx = Math.max(3, Math.min(CELL - 3 - dw, dx))
    const cellX = (i % COLS) * CELL
    const cellY = Math.floor(i / COLS) * CELL
    const flip = !!opts.flipWalk && (POSES[i] === 'walk1' || POSES[i] === 'walk2')
    actx.save()
    if (flip) {
      actx.translate(cellX * 2 + CELL, 0)
      actx.scale(-1, 1)
    }
    actx.drawImage(piece, 0, 0, bw, bh, cellX + dx, cellY + FEET_Y - dh, dw, dh)
    actx.restore()
  })

  // 빠진 포즈는 비슷한 포즈로 채운다 (그림이 갑자기 사라지지 않게)
  const filled: string[] = []
  POSES.forEach((pose, i) => {
    if (boxes[i]) return
    const alt = (FALLBACK[pose] ?? []).map((q) => POSES.indexOf(q)).find((j) => j >= 0 && boxes[j])
    const src = alt ?? boxes.findIndex((b) => !!b)
    if (src < 0) return
    actx.drawImage(atlas, (src % COLS) * CELL, Math.floor(src / COLS) * CELL, CELL, CELL, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL)
    filled.push(POSE_LABEL[pose])
  })
  if (filled.length) warnings.push(`빠진 포즈(${filled.join(', ')})는 비슷한 포즈로 채웠어요.`)

  return { atlas, method, warnings, bg }
}

// ───────────── 배경

function hasAlpha(px: Uint8ClampedArray, W: number, H: number): boolean {
  let clear = 0
  const n = W * H
  const step = Math.max(1, Math.floor(n / 200000))
  let total = 0
  for (let i = 0; i < n; i += step) {
    total++
    if (px[i * 4 + 3] < 20) clear++
  }
  return clear / total > 0.1
}

/** 가장자리 픽셀에서 가장 많은 색 → 배경색, 그 색에 가까운 비율 = 고른 정도 */
function borderColor(px: Uint8ClampedArray, W: number, H: number): { color: RGB; uniform: number } {
  const idx: number[] = []
  const band = Math.max(2, Math.round(Math.min(W, H) * 0.004))
  for (let b = 0; b < band; b++) {
    for (let x = 0; x < W; x += 2) idx.push(b * W + x, (H - 1 - b) * W + x)
    for (let y = 0; y < H; y += 2) idx.push(y * W + b, y * W + W - 1 - b)
  }
  const hist = new Map<number, number>()
  for (const i of idx) {
    const key = ((px[i * 4] >> 4) << 8) | ((px[i * 4 + 1] >> 4) << 4) | (px[i * 4 + 2] >> 4)
    hist.set(key, (hist.get(key) ?? 0) + 1)
  }
  let best = 0
  let bestN = -1
  for (const [key, n] of hist) if (n > bestN) [best, bestN] = [key, n]
  const br = ((best >> 8) & 15) * 16 + 8
  const bgc = ((best >> 4) & 15) * 16 + 8
  const bb = (best & 15) * 16 + 8
  // 가까운 픽셀의 평균으로 다듬기
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const i of idx) {
    const o = i * 4
    if (dist3(px[o], px[o + 1], px[o + 2], br, bgc, bb) < 40) {
      r += px[o]
      g += px[o + 1]
      b += px[o + 2]
      n++
    }
  }
  const color: RGB = n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [br, bgc, bb]
  let near = 0
  for (const i of idx) {
    const o = i * 4
    if (dist3(px[o], px[o + 1], px[o + 2], color[0], color[1], color[2]) < 48) near++
  }
  return { color, uniform: near / idx.length }
}

function dist3(r: number, g: number, b: number, r2: number, g2: number, b2: number): number {
  const dr = r - r2
  const dg = g - g2
  const db = b - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * 가장자리에서 퍼져 나가며 배경 지우기. 배경색과 가깝거나(허용 범위),
 * 바로 옆 배경 픽셀과 거의 같은 색이면(완만한 그러데이션·노이즈) 배경으로 본다.
 * 갇힌 배경 섬(팔 사이 빈틈)도 크면 지운다. 테두리 1px 은 반투명 + 배경색 번짐 빼기.
 */
function removeBg(px: Uint8ClampedArray, W: number, H: number, bg: RGB, tolerance: number): void {
  const n = W * H
  const T = 12 + (Math.max(0, Math.min(100, tolerance)) / 100) * 150
  const T2 = T * 1.9
  const [br, bgG, bb] = bg
  // 픽셀마다 배경색까지 거리 (한 번만 계산)
  const d = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    d[i] = dist3(px[o], px[o + 1], px[o + 2], br, bgG, bb)
  }
  const isBg = new Uint8Array(n)
  const queue = new Int32Array(n)
  // 이웃 색이 거의 같은가 (제곱 거리)
  const NEAR2 = 7 * 7
  const near = (a: number, b: number): boolean => {
    const oa = a * 4
    const ob = b * 4
    const dr = px[oa] - px[ob]
    const dg = px[oa + 1] - px[ob + 1]
    const db = px[oa + 2] - px[ob + 2]
    return dr * dr + dg * dg + db * db < NEAR2
  }
  /** 가장자리(또는 시작점)에서 퍼지기. into = 표시할 배열, block = 이미 배경인 곳. 모은 개수를 돌려준다 */
  const flood = (seeds: number[], into: Uint8Array, block: Uint8Array | null): number => {
    let qh = 0
    let qt = 0
    for (const sd of seeds) {
      if (!into[sd] && !(block && block[sd]) && d[sd] < T2) {
        into[sd] = 1
        queue[qt++] = sd
      }
    }
    while (qh < qt) {
      const i = queue[qh++]
      const x = i % W
      for (let k = 0; k < 4; k++) {
        let j: number
        if (k === 0) {
          if (x === 0) continue
          j = i - 1
        } else if (k === 1) {
          if (x === W - 1) continue
          j = i + 1
        } else if (k === 2) {
          if (i < W) continue
          j = i - W
        } else {
          if (i >= n - W) continue
          j = i + W
        }
        if (into[j] || (block && block[j])) continue
        const dj = d[j]
        if (dj < T || (dj < T2 && near(i, j))) {
          into[j] = 1
          queue[qt++] = j
        }
      }
    }
    return qt
  }
  const edge: number[] = []
  for (let x = 0; x < W; x++) edge.push(x, (H - 1) * W + x)
  for (let y = 0; y < H; y++) edge.push(y * W, y * W + W - 1)
  flood(edge, isBg, null)

  // 갇힌 배경 섬(팔 사이 빈틈): 색이 또렷한 배경(자홍·초록 등)일 때만. 흰 배경이면 흰 털을 지울 수 있어 건드리지 않는다.
  const chroma = Math.max(br, bgG, bb) - Math.min(br, bgG, bb)
  if (chroma > 100) {
    const minIsland = Math.max(12, Math.round(n * 0.00002))
    const seen = new Uint8Array(n)
    for (let s = 0; s < n; s++) {
      if (isBg[s] || seen[s] || d[s] >= T) continue
      const cnt = flood([s], seen, isBg)
      if (cnt >= minIsland) for (let q = 0; q < cnt; q++) isBg[queue[q]] = 1
    }
  }

  // 지우기 + 테두리 다듬기
  const magentaKey = br > 150 && bb > 150 && bgG < 110
  const greenKey = bgG > 150 && br < 110 && bb < 110
  for (let i = 0; i < n; i++) {
    const o = i * 4
    if (isBg[i]) {
      px[o + 3] = 0
      continue
    }
    const x = i % W
    // 배경과 맞닿은 정도 (1px, 2px)
    const edge1 =
      (x > 0 && isBg[i - 1]) || (x < W - 1 && isBg[i + 1]) || (i >= W && isBg[i - W]) || (i < n - W && isBg[i + W])
    const edge2 =
      !edge1 &&
      ((x > 1 && isBg[i - 2]) || (x < W - 2 && isBg[i + 2]) || (i >= 2 * W && isBg[i - 2 * W]) || (i < n - 2 * W && isBg[i + 2 * W]))
    if (!edge1 && !edge2) continue
    let r = px[o]
    let g = px[o + 1]
    let b = px[o + 2]
    if (edge1) {
      // 배경색이 섞인 만큼 투명하게 하고 색에서 배경을 빼낸다
      const a = Math.max(0.15, Math.min(1, (d[i] - T * 0.35) / (T2 - T * 0.35)))
      if (a < 1) {
        r = (r - (1 - a) * br) / a
        g = (g - (1 - a) * bgG) / a
        b = (b - (1 - a) * bb) / a
      }
      px[o + 3] = Math.round(px[o + 3] * a)
    }
    // 열쇠 색 번짐 빼기
    if (magentaKey) {
      const ex = Math.min(r, b) - g
      if (ex > 0) {
        const kk = edge1 ? 0.85 : 0.5
        r -= ex * kk
        b -= ex * kk
      }
    } else if (greenKey) {
      const ex = g - Math.max(r, b)
      if (ex > 0) g -= ex * (edge1 ? 0.85 : 0.5)
    }
    px[o] = clamp255(r)
    px[o + 1] = clamp255(g)
    px[o + 2] = clamp255(b)
  }
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v)

interface Comp {
  area: number
  x0: number
  y0: number
  x1: number
  y1: number
  cx: number
  cy: number
}

/** 8방향으로 이어진 덩어리 번호 붙이기. 아주 작은 덩어리(노이즈)는 지운다. label = 덩어리 번호 + 1 */
function components(mask: Uint8Array, px: Uint8ClampedArray, W: number, H: number, minArea: number): { label: Int32Array; comps: (Comp | null)[] } {
  const n = W * H
  const label = new Int32Array(n)
  const queue = new Int32Array(n)
  const comps: (Comp | null)[] = []
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s]) continue
    const id = comps.length + 1
    let qh = 0
    let qt = 0
    queue[qt++] = s
    label[s] = id
    let x0 = W
    let y0 = H
    let x1 = 0
    let y1 = 0
    let sx = 0
    let sy = 0
    while (qh < qt) {
      const i = queue[qh++]
      const x = i % W
      const y = (i - x) / W
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      sx += x
      sy += y
      const xa = x > 0 ? -1 : 0
      const xb = x < W - 1 ? 1 : 0
      const ya = y > 0 ? -1 : 0
      const yb = y < H - 1 ? 1 : 0
      for (let dy = ya; dy <= yb; dy++)
        for (let dx = xa; dx <= xb; dx++) {
          const j = i + dy * W + dx
          if (mask[j] && !label[j]) {
            label[j] = id
            queue[qt++] = j
          }
        }
    }
    if (qt < minArea) {
      for (let q = 0; q < qt; q++) {
        const j = queue[q]
        mask[j] = 0
        label[j] = 0
        px[j * 4 + 3] = 0
      }
      comps.push(null)
    } else {
      comps.push({ area: qt, x0, y0, x1, y1, cx: sx / qt, cy: sy / qt })
    }
  }
  return { label, comps }
}

// ───────────── 나누기

interface Band {
  a: number
  b: number
  mass: number
}

/** 값이 있는 구간들 */
function bands(profile: Uint32Array, from: number, to: number): Band[] {
  const out: Band[] = []
  let cur: Band | null = null
  for (let i = from; i < to; i++) {
    const v = profile[i]
    if (v > 0) {
      if (!cur) cur = { a: i, b: i, mass: 0 }
      cur.b = i
      cur.mass += v
    } else if (cur) {
      out.push(cur)
      cur = null
    }
  }
  if (cur) out.push(cur)
  return out
}

/** 작은 조각(땀방울·반짝이)을 가까운 이웃에 붙여서 개수를 target 으로 */
function mergeTo(list: Band[], target: number, span: number): Band[] | null {
  const bs = list.map((b) => ({ ...b }))
  const join = (i: number, j: number): void => {
    const lo = Math.min(i, j)
    const hi = Math.max(i, j)
    bs[lo] = { a: Math.min(bs[lo].a, bs[hi].a), b: Math.max(bs[lo].b, bs[hi].b), mass: bs[lo].mass + bs[hi].mass }
    bs.splice(hi, 1)
  }
  const nearer = (i: number): number => {
    const gl = i > 0 ? bs[i].a - bs[i - 1].b : Infinity
    const gr = i < bs.length - 1 ? bs[i + 1].a - bs[i].b : Infinity
    return gl <= gr ? i - 1 : i + 1
  }
  while (bs.length > target) {
    const maxMass = Math.max(...bs.map((b) => b.mass))
    let si = -1
    for (let i = 0; i < bs.length; i++) if (bs[i].mass < maxMass * 0.15 && (si < 0 || bs[i].mass < bs[si].mass)) si = i
    if (si >= 0) {
      join(si, nearer(si))
      continue
    }
    // 아주 좁은 틈은 한 덩어리로
    let gi = -1
    let gmin = span * 0.006
    for (let i = 0; i < bs.length - 1; i++) {
      const gap = bs[i + 1].a - bs[i].b
      if (gap < gmin) {
        gmin = gap
        gi = i
      }
    }
    if (gi < 0) break
    join(gi, gi + 1)
  }
  return bs.length === target ? bs : null
}

function splitByGaps(mask: Uint8Array, W: number, H: number): Box[] | null {
  const rowP = new Uint32Array(H)
  for (let y = 0; y < H; y++) {
    let s = 0
    const o = y * W
    for (let x = 0; x < W; x++) s += mask[o + x]
    rowP[y] = s
  }
  const rawRows = bands(rowP, 0, H)
  // 가로로 긴 그림 = 3줄×4칸, 세로로 긴 그림이면 4줄×3칸도 시도
  const layouts: [number, number][] = W >= H * 0.9 ? [[ROWS, COLS]] : [[COLS, ROWS], [ROWS, COLS]]
  for (const [nr, nc] of layouts) {
    const rows = mergeTo(rawRows, nr, H)
    if (!rows) continue
    const out: Box[] = []
    let ok = true
    for (const r of rows) {
      const colP = new Uint32Array(W)
      for (let y = r.a; y <= r.b; y++) {
        const o = y * W
        for (let x = 0; x < W; x++) colP[x] += mask[o + x]
      }
      const cols = mergeTo(bands(colP, 0, W), nc, W)
      if (!cols) {
        ok = false
        break
      }
      for (const c of cols) out.push({ x0: c.a, y0: r.a, x1: c.b, y1: r.b })
      if (!ok) break
    }
    if (ok && out.length === POSES.length) return out
  }
  return null
}

/** 고르게 4×3 칸 (세로로 긴 그림이면 3×4) */
function gridRegions(W: number, H: number): Box[] {
  const [nc, nr] = W >= H * 0.9 ? [COLS, ROWS] : [ROWS, COLS]
  const out: Box[] = []
  for (let r = 0; r < nr; r++)
    for (let c = 0; c < nc; c++)
      out.push({
        x0: Math.round((c * W) / nc),
        y0: Math.round((r * H) / nr),
        x1: Math.round(((c + 1) * W) / nc) - 1,
        y1: Math.round(((r + 1) * H) / nr) - 1
      })
  return out
}

// ───────────── 안내용 예시 시트

/** 아틀라스를 자홍색 배경에 늘어놓은 예시 그림 (labels = 칸 아래 포즈 이름) */
export function drawExampleSheet(atlas: HTMLCanvasElement, labels: boolean): HTMLCanvasElement {
  const LH = labels ? 30 : 0
  const out = makeCanvas(ATLAS_W, ROWS * (CELL + LH))
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#ff00ff'
  ctx.fillRect(0, 0, out.width, out.height)
  for (let r = 0; r < ROWS; r++) {
    ctx.drawImage(atlas, 0, r * CELL, ATLAS_W, CELL, 0, r * (CELL + LH), ATLAS_W, CELL)
  }
  if (labels) {
    ctx.font = "600 17px -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    POSES.forEach((p, i) => {
      const x = (i % COLS) * CELL + CELL / 2
      const y = Math.floor(i / COLS) * (CELL + LH) + CELL + LH / 2 - 2
      const t = `${i + 1}. ${POSE_LABEL[p]}`
      const w = ctx.measureText(t).width + 16
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.roundRect(x - w / 2, y - 12, w, 24, 12)
      ctx.fill()
      ctx.fillStyle = '#3a2b33'
      ctx.fillText(t, x, y + 1)
    })
  }
  return out
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
