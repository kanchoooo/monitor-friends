/** 예전 코드 그림 펫 (지금은 앱에서 안 씀 — lab 확인용) */
export type DrawnPetId = 'builtin:mochi' | 'builtin:cheese' | 'builtin:kong'
export const DRAWN_PETS: { id: DrawnPetId }[] = [{ id: 'builtin:mochi' }, { id: 'builtin:cheese' }, { id: 'builtin:kong' }]
// 기본 펫 3마리 — 이미지 파일 없이 캔버스 도형으로 그린다.
// 좌표: 칸마다 원점 = 발바닥 가운데 (칸의 x=128, y=FEET_Y), 위쪽이 음수. 1 단위 = 아틀라스 1 px.
// 서기 키 ≈ STAND_H. 머리 크고 몸 작은 동글동글 모양.
// 그림체 = "밤티": 그림판에 마우스로 그린 듯 삐뚤빼뚤한 검은 선, 납작한 단색 칠, 덜 칠한 흰 얼룩.
// 도형은 보통 캔버스처럼 그리되, 실제로 칠하는 건 Doodle 펜이 맡아서 선을 흔들고 굵기를 들쭉날쭉하게 한다.
import { ATLAS_H, ATLAS_W, CELL, COLS, FEET_Y, POSES, poseIndex } from '@shared/pet'
import type { Pose } from '@shared/pet'

type Paint = string | Grad
type Part = (c: Pen) => void

interface Look {
  kind: 'cat' | 'dog'
  fill: string
  shade: string
  belly: string
  line: string
  innerEar: string
  cheek: string
  nose: string
  eye: string
  /** 치즈 줄무늬 */
  stripe?: string
  /** 콩이 눈썹 점·주둥이 */
  brow?: string
  muzzle?: string
  /** 바깥 흰 테두리 진하기 (어두운 창 위에서 잘 보이게) */
  halo: number
}

// 그림판 느낌의 납작한 색
const LOOKS: Record<DrawnPetId, Look> = {
  'builtin:mochi': {
    kind: 'cat',
    fill: '#ffffff',
    shade: '#e6e6e6',
    belly: '#ffffff',
    line: '#121212',
    innerEar: '#ffb3c1',
    cheek: '#ffa3b5',
    nose: '#ff7f97',
    eye: '#121212',
    halo: 0.6
  },
  'builtin:cheese': {
    kind: 'cat',
    fill: '#ffc93c',
    shade: '#f0ab2c',
    belly: '#fff3c4',
    line: '#121212',
    innerEar: '#ffaaa0',
    cheek: '#ff8f80',
    nose: '#ff7f7f',
    eye: '#121212',
    stripe: '#ee8418',
    muzzle: '#fff3c4',
    halo: 0.6
  },
  'builtin:kong': {
    kind: 'dog',
    fill: '#3a3536',
    shade: '#2a2627',
    belly: '#ffffff',
    line: '#000000',
    innerEar: '#3a3536',
    cheek: '#ff8fa8',
    nose: '#000000',
    eye: '#000000',
    brow: '#d9a060',
    muzzle: '#ffffff',
    halo: 0.9
  }
}

const TAU = Math.PI * 2
/** 외곽선 굵기 (도형 바깥으로) */
const OL = 3.4

interface G {
  c: Pen
  L: Look
}

// ───────────── 밤티 펜 (흔들리는 선·납작한 칠)

/** 그림 그리는 데 쓰는 캔버스 기능만 (Doodle 이 흉내 낸다) */
interface Grad {
  addColorStop(offset: number, color: string): void
}
interface Pen {
  fillStyle: string | Grad
  strokeStyle: string | Grad
  lineWidth: number
  globalAlpha: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(a: number): void
  scale(x: number, y: number): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean): void
  rect(x: number, y: number, w: number, h: number): void
  roundRect(x: number, y: number, w: number, h: number, r: number): void
  fill(): void
  stroke(): void
  clip(): void
  fillRect(x: number, y: number, w: number, h: number): void
  setLineDash(d: number[]): void
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Grad
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Grad
}

/** 그러데이션 대신 첫 색 하나로 납작하게 */
class FlatGrad implements Grad {
  color = ''
  addColorStop(_o: number, color: string): void {
    if (!this.color) this.color = color
  }
}

interface Poly {
  p: number[]
  closed: boolean
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * 캔버스처럼 길을 받아 두었다가, 칠할 때 손떨림을 넣어 진짜 캔버스에 그린다.
 * 난수는 고정 시드라서 같은 포즈는 언제나 같은 모양.
 */
class Doodle implements Pen {
  fillStyle: string | Grad = '#000'
  strokeStyle: string | Grad = '#000'
  lineWidth = 1
  lineCap: CanvasLineCap = 'round'
  lineJoin: CanvasLineJoin = 'round'
  private polys: Poly[] = []
  private cur: Poly | null = null
  /** 같은 길(같은 변환)은 같은 떨림 → 외곽선과 칠이 어긋나지 않게 */
  private cache = new Map<string, number[]>()
  private dash: number[] = []
  constructor(
    private r: CanvasRenderingContext2D,
    private rnd: () => number
  ) {}
  get globalAlpha(): number {
    return this.r.globalAlpha
  }
  set globalAlpha(v: number) {
    this.r.globalAlpha = v
  }
  save(): void {
    this.r.save()
  }
  restore(): void {
    this.r.restore()
  }
  translate(x: number, y: number): void {
    this.r.translate(x, y)
  }
  rotate(a: number): void {
    this.r.rotate(a)
  }
  scale(x: number, y: number): void {
    this.r.scale(x, y)
  }
  setLineDash(d: number[]): void {
    this.dash = d
  }
  createLinearGradient(): Grad {
    return new FlatGrad()
  }
  createRadialGradient(): Grad {
    return new FlatGrad()
  }
  // ── 길 받기 (곡선은 잘게 쪼갠 점으로)
  beginPath(): void {
    this.polys = []
    this.cur = null
  }
  closePath(): void {
    if (this.cur) this.cur.closed = true
    this.cur = null
  }
  moveTo(x: number, y: number): void {
    this.cur = { p: [x, y], closed: false }
    this.polys.push(this.cur)
  }
  lineTo(x: number, y: number): void {
    if (!this.cur) this.moveTo(x, y)
    else this.cur.p.push(x, y)
  }
  private last(): [number, number] {
    const p = this.cur!.p
    return [p[p.length - 2], p[p.length - 1]]
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (!this.cur) this.moveTo(cx, cy)
    const [x0, y0] = this.last()
    const n = Math.max(4, Math.ceil((Math.hypot(cx - x0, cy - y0) + Math.hypot(x - cx, y - cy)) / 3))
    for (let i = 1; i <= n; i++) {
      const t = i / n
      const u = 1 - t
      this.cur!.p.push(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y)
    }
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!this.cur) this.moveTo(c1x, c1y)
    const [x0, y0] = this.last()
    const len = Math.hypot(c1x - x0, c1y - y0) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y)
    const n = Math.max(6, Math.ceil(len / 3))
    for (let i = 1; i <= n; i++) {
      const t = i / n
      const u = 1 - t
      const a = u * u * u
      const b = 3 * u * u * t
      const c = 3 * u * t * t
      const d = t * t * t
      this.cur!.p.push(a * x0 + b * c1x + c * c2x + d * x, a * y0 + b * c1y + c * c2y + d * y)
    }
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw)
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    let span = a1 - a0
    if (!ccw && span < 0) span = (span % TAU) + TAU
    if (ccw && span > 0) span = (span % TAU) - TAU
    if (Math.abs(span) > TAU) span = Math.sign(span) * TAU
    const n = Math.max(8, Math.ceil((Math.abs(span) * Math.max(rx, ry)) / 3))
    const cr = Math.cos(rot)
    const sr = Math.sin(rot)
    for (let i = 0; i <= n; i++) {
      const t = a0 + (span * i) / n
      const ex = Math.cos(t) * rx
      const ey = Math.sin(t) * ry
      const px = x + ex * cr - ey * sr
      const py = y + ex * sr + ey * cr
      if (i === 0 && !this.cur) this.moveTo(px, py)
      else this.lineTo(px, py)
    }
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y)
    this.lineTo(x + w, y)
    this.lineTo(x + w, y + h)
    this.lineTo(x, y + h)
    this.closePath()
  }
  roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.cur = null
    this.arc(x + w - r, y + r, r, -Math.PI / 2, 0)
    this.arc(x + w - r, y + h - r, r, 0, Math.PI / 2)
    this.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI)
    this.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5)
    this.closePath()
  }
  // ── 손떨림
  private color(v: string | Grad): string {
    return typeof v === 'string' ? v : (v as FlatGrad).color || '#000'
  }
  /** 일정 간격으로 다시 찍고, 느린 물결 + 잔떨림만큼 옆으로 민다. 큰 도형은 살짝 찌그러뜨린다 */
  private wobble(poly: Poly, amp: number): number[] {
    const t = this.r.getTransform()
    const p0 = poly.p
    const key = [t.a, t.b, t.c, t.d, t.e, t.f, p0.length, poly.closed ? 1 : 0, p0[0], p0[1], p0[2], p0[3], p0[p0.length - 2], p0[p0.length - 1]]
      .map((v) => Math.round(v * 100))
      .join(',')
    const hit = this.cache.get(key)
    if (hit) return hit
    const res = this.wobbleNew(poly, amp)
    this.cache.set(key, res)
    return res
  }
  private wobbleNew(poly: Poly, amp: number): number[] {
    const src = poly.p
    const pts: number[] = []
    const n0 = src.length / 2
    const segs = poly.closed ? n0 : n0 - 1
    let L = 0
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n0
      L += Math.hypot(src[j * 2] - src[i * 2], src[j * 2 + 1] - src[i * 2 + 1])
    }
    if (L < 0.5) return src.slice()
    const step = 2.5
    const n = Math.max(poly.closed ? 6 : 2, Math.round(L / step))
    // 고르게 다시 찍기
    let seg = 0
    let segStart = 0
    let segLen = 0
    const segLenAt = (i: number): number => {
      const j = (i + 1) % n0
      return Math.hypot(src[j * 2] - src[i * 2], src[j * 2 + 1] - src[i * 2 + 1])
    }
    segLen = segLenAt(0)
    const count = poly.closed ? n : n + 1
    for (let k = 0; k < count; k++) {
      const d = (k / n) * L
      while (seg < segs - 1 && d > segStart + segLen) {
        segStart += segLen
        seg++
        segLen = segLenAt(seg)
      }
      const t = segLen > 0 ? Math.min(1, (d - segStart) / segLen) : 0
      const j = (seg + 1) % n0
      pts.push(src[seg * 2] + (src[j * 2] - src[seg * 2]) * t, src[seg * 2 + 1] + (src[j * 2 + 1] - src[seg * 2 + 1]) * t)
    }
    const m = pts.length / 2
    // 찌그러뜨리기 (중심 기준 가로·세로 조금씩)
    if (poly.closed && L > 70) {
      let cx = 0
      let cy = 0
      for (let i = 0; i < m; i++) {
        cx += pts[i * 2]
        cy += pts[i * 2 + 1]
      }
      cx /= m
      cy /= m
      const sx = 1 + (this.rnd() - 0.5) * 0.07
      const sy = 1 + (this.rnd() - 0.5) * 0.07
      const sh = (this.rnd() - 0.5) * 0.06
      for (let i = 0; i < m; i++) {
        const dx = pts[i * 2] - cx
        const dy = pts[i * 2 + 1] - cy
        pts[i * 2] = cx + dx * sx + dy * sh
        pts[i * 2 + 1] = cy + dy * sy
      }
    }
    // 물결 (마디 사이 매끈하게) + 잔떨림
    const a = Math.min(amp, L / 45)
    const knotGap = 9 + this.rnd() * 9
    const knots = Math.max(poly.closed ? 3 : 2, Math.ceil(L / knotGap))
    const kv: number[] = []
    for (let i = 0; i <= knots; i++) kv.push((this.rnd() * 2 - 1) * a)
    if (poly.closed) kv[knots] = kv[0]
    const out: number[] = []
    for (let i = 0; i < m; i++) {
      const ip = poly.closed ? (i - 1 + m) % m : Math.max(0, i - 1)
      const inx = poly.closed ? (i + 1) % m : Math.min(m - 1, i + 1)
      let nx = -(pts[inx * 2 + 1] - pts[ip * 2 + 1])
      let ny = pts[inx * 2] - pts[ip * 2]
      const nl = Math.hypot(nx, ny) || 1
      nx /= nl
      ny /= nl
      const u = (i / (poly.closed ? m : Math.max(1, m - 1))) * knots
      const k0 = Math.min(knots - 1, Math.floor(u))
      const f = u - k0
      const sm = f * f * (3 - 2 * f)
      const off = kv[k0] * (1 - sm) + kv[k0 + 1] * sm + (this.rnd() - 0.5) * a * 0.22
      out.push(pts[i * 2] + nx * off, pts[i * 2 + 1] + ny * off)
    }
    return out
  }
  private tracePolys(amp: number, shift: number): number[][] {
    const r = this.r
    r.beginPath()
    const all: number[][] = []
    // 칠을 아주 조금 밀어서 선 밖으로 삐져나오거나 덜 칠한 느낌
    const ox = (this.rnd() - 0.5) * shift
    const oy = (this.rnd() - 0.5) * shift
    for (const poly of this.polys) {
      if (poly.p.length < 4) continue
      const q = this.wobble(poly, amp)
      all.push(q)
      r.moveTo(q[0] + ox, q[1] + oy)
      for (let i = 2; i < q.length; i += 2) r.lineTo(q[i] + ox, q[i + 1] + oy)
      r.closePath()
    }
    return all
  }
  fill(): void {
    const col = this.color(this.fillStyle)
    const r = this.r
    r.fillStyle = col
    const all = this.tracePolys(1.5, 1.3)
    r.fill()
    // 덜 칠한 흰 얼룩 (밝은 색에선 안 보이니 진한 색에만)
    if (!isLight(col)) {
      for (const q of all) {
        const m = q.length / 2
        if (m < 40) continue
        let cx = 0
        let cy = 0
        for (let i = 0; i < m; i++) {
          cx += q[i * 2]
          cy += q[i * 2 + 1]
        }
        cx /= m
        cy /= m
        const nSpeck = Math.floor(this.rnd() * 2.4)
        for (let s = 0; s < nSpeck; s++) {
          const i = Math.floor(this.rnd() * m)
          const t = 0.08 + this.rnd() * 0.12
          const sx = q[i * 2] + (cx - q[i * 2]) * t
          const sy = q[i * 2 + 1] + (cy - q[i * 2 + 1]) * t
          r.fillStyle = '#ffffff'
          r.beginPath()
          const k = 3 + Math.floor(this.rnd() * 3)
          const rad = 1.1 + this.rnd() * 1.5
          for (let v = 0; v < k; v++) {
            const a = (v / k) * TAU + this.rnd() * 0.8
            const rr = rad * (0.6 + this.rnd() * 0.8)
            if (v === 0) r.moveTo(sx + Math.cos(a) * rr * 1.6, sy + Math.sin(a) * rr)
            else r.lineTo(sx + Math.cos(a) * rr * 1.6, sy + Math.sin(a) * rr)
          }
          r.closePath()
          r.fill()
        }
      }
    }
  }
  clip(): void {
    this.tracePolys(1.5, 0)
    this.r.clip()
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.r.fillStyle = this.color(this.fillStyle)
    this.r.fillRect(x, y, w, h)
  }
  /** 굵기가 들쭉날쭉한 선: 짧은 토막을 굵기 칸별로 모아 그린다 */
  stroke(): void {
    const r = this.r
    const col = this.color(this.strokeStyle)
    const base = this.lineWidth
    const amp = Math.min(1.8, 0.7 + base * 0.14)
    r.strokeStyle = col
    r.lineCap = this.dash.length ? 'butt' : 'round'
    r.lineJoin = 'round'
    const LEVELS = 5
    const buckets: number[][] = Array.from({ length: LEVELS }, () => [])
    const dash = this.dash
    const period = dash.length >= 2 ? dash[0] + dash[1] : 0
    for (const poly of this.polys) {
      if (poly.p.length < 4) continue
      const q = this.wobble(poly, amp)
      const m = q.length / 2
      const segs = poly.closed ? m : m - 1
      // 굵기 물결
      const wk: number[] = []
      const wn = Math.max(2, Math.ceil(segs / 8))
      for (let i = 0; i <= wn; i++) wk.push(this.rnd())
      if (poly.closed) wk[wn] = wk[0]
      let dist = 0
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % m
        const x0 = q[i * 2]
        const y0 = q[i * 2 + 1]
        const x1 = q[j * 2]
        const y1 = q[j * 2 + 1]
        const sl = Math.hypot(x1 - x0, y1 - y0)
        dist += sl
        if (period && dist % period > dash[0]) continue
        const u = (i / segs) * wn
        const k0 = Math.min(wn - 1, Math.floor(u))
        const f = u - k0
        const v = wk[k0] * (1 - f) + wk[k0 + 1] * f
        const lvl = Math.min(LEVELS - 1, Math.floor(v * LEVELS))
        buckets[lvl].push(x0, y0, x1, y1)
      }
    }
    buckets.forEach((b, lvl) => {
      if (!b.length) return
      r.lineWidth = Math.max(1, base + (lvl / (LEVELS - 1) - 0.5) * Math.min(base * 0.6, 3.2))
      r.beginPath()
      for (let i = 0; i < b.length; i += 4) {
        r.moveTo(b[i], b[i + 1])
        r.lineTo(b[i + 2], b[i + 3])
      }
      r.stroke()
    })
  }
}

function isLight(col: string): boolean {
  if (col[0] !== '#' || col.length < 7) return true
  const n = parseInt(col.slice(1, 7), 16)
  const l = 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)
  return l > 235
}

// ───────────── 도형 도우미

const ell =
  (x: number, y: number, rx: number, ry: number, rot = 0): Part =>
  (c) =>
    c.ellipse(x, y, rx, ry, rot, 0, TAU)

/** 양 끝이 둥근 막대 (팔·다리) */
const capsule =
  (x1: number, y1: number, x2: number, y2: number, r1: number, r2 = r1): Part =>
  (c) => {
    const a = Math.atan2(y2 - y1, x2 - x1)
    c.arc(x1, y1, r1, a + Math.PI / 2, a + (Math.PI * 3) / 2)
    c.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2)
    c.closePath()
  }

/** 찹쌀떡처럼 아래가 살짝 넓은 둥근 머리 */
const mochiHead =
  (x: number, y: number, rx: number, ry: number): Part =>
  (c) => {
    const N = 72
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * TAU
      const ct = Math.cos(t)
      const st = Math.sin(t)
      const px = Math.sign(ct) * Math.pow(Math.abs(ct), 0.8)
      const py = Math.sign(st) * Math.pow(Math.abs(st), 0.86)
      const wide = 1 + 0.06 * Math.max(0, py)
      const X = x + rx * px * wide
      const Y = y + ry * py
      if (i === 0) c.moveTo(X, Y)
      else c.lineTo(X, Y)
    }
    c.closePath()
  }

/** 여러 도형을 한 덩어리처럼: 외곽선을 먼저 굵게 다 그리고, 그 위에 채우기 */
function blob(g: G, parts: Part[], fill: Paint | Paint[], w = OL): void {
  const { c } = g
  c.strokeStyle = g.L.line
  c.lineWidth = w * 2
  if (w > 0) {
    for (const p of parts) {
      c.beginPath()
      p(c)
      c.stroke()
    }
  }
  parts.forEach((p, i) => {
    c.beginPath()
    p(c)
    c.fillStyle = Array.isArray(fill) ? fill[i] : fill
    c.fill()
  })
}

function vgrad(g: G, y0: number, y1: number, top: string, bottom: string, mid = 0.55): Grad {
  const gr = g.c.createLinearGradient(0, y0, 0, y1)
  gr.addColorStop(0, top)
  gr.addColorStop(mid, top)
  gr.addColorStop(1, bottom)
  return gr
}

/** 도형 안쪽에만 그리기 */
function inside(g: G, part: Part, draw: () => void): void {
  const { c } = g
  c.save()
  c.beginPath()
  part(c)
  c.clip()
  draw()
  c.restore()
}

function stroke(g: G, color: string, w: number, path: (c: Pen) => void): void {
  const { c } = g
  c.strokeStyle = color
  c.lineWidth = w
  c.beginPath()
  path(c)
  c.stroke()
}

// ───────────── 몸 부위

/** 몸통 (배 무늬·줄무늬 포함) */
function body(g: G, x: number, y: number, rx: number, ry: number, rot = 0, side = 0): void {
  const { L } = g
  const part = ell(x, y, rx, ry, rot)
  blob(g, [part], vgrad(g, y - ry, y + ry, L.fill, L.shade, 0.5))
  inside(g, part, () => {
    const { c } = g
    // 배 (옆모습이면 앞쪽으로)
    c.fillStyle = L.belly
    c.globalAlpha = L.kind === 'dog' ? 1 : 0.85
    c.beginPath()
    c.ellipse(x + side * rx * 0.5, y + ry * 0.28, rx * (0.62 - side * 0.12), ry * 0.66, rot, 0, TAU)
    c.fill()
    c.globalAlpha = 1
    if (L.stripe) {
      // 등·옆구리 줄무늬
      c.strokeStyle = L.stripe
      c.lineCap = 'round'
      c.lineWidth = 6
      const sx = side ? -1 : 1
      for (const k of side ? [0, 1, 2] : [-1, 1]) {
        if (side) {
          const bx = x - rx * 0.25 - k * 11
          stroke(g, L.stripe, 6, (cc) => {
            cc.moveTo(bx + 6, y - ry - 2)
            cc.quadraticCurveTo(bx - 4, y - ry * 0.4, bx + 2, y - ry * 0.05)
          })
        } else {
          const bx = x + k * rx
          for (let j = 0; j < 2; j++) {
            const yy = y - ry * 0.35 + j * 13
            stroke(g, L.stripe, 5.5, (cc) => {
              cc.moveTo(bx, yy)
              cc.quadraticCurveTo(bx - k * 9 * sx, yy + 3, bx - k * 15 * sx, yy + 7)
            })
          }
        }
      }
    }
  })
}

/** 앞에서 본 발 (발등) */
function foot(g: G, x: number, y: number, rot = 0, far = false): void {
  const { L } = g
  blob(g, [ell(x, y, 15, 9, rot)], far ? L.shade : vgrad(g, y - 9, y + 9, L.kind === 'dog' ? L.fill : L.fill, L.shade, 0.5))
  // 발가락 금
  const { c } = g
  c.save()
  c.translate(x, y)
  c.rotate(rot)
  c.strokeStyle = g.L.line
  c.globalAlpha = 0.55
  c.lineWidth = 2
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(-4, -8)
  c.lineTo(-4, -4)
  c.moveTo(4, -8)
  c.lineTo(4, -4)
  c.stroke()
  c.restore()
}

/** 발바닥이 보이는 발 (앉기·놀람) */
function sole(g: G, x: number, y: number, r = 14, rot = 0): void {
  const { c, L } = g
  blob(g, [ell(x, y, r, r * 0.92, rot)], L.kind === 'dog' ? L.fill : L.belly)
  const pad = L.kind === 'dog' ? '#2a2326' : L.innerEar
  c.fillStyle = L.kind === 'dog' ? '#8a7178' : pad
  c.beginPath()
  c.ellipse(x, y + r * 0.22, r * 0.42, r * 0.34, 0, 0, TAU)
  c.fill()
  for (const k of [-1, 0, 1]) {
    c.beginPath()
    c.ellipse(x + k * r * 0.45, y - r * 0.38 + Math.abs(k) * r * 0.1, r * 0.17, r * 0.2, 0, 0, TAU)
    c.fill()
  }
}

/** 팔 (어깨 → 손), 손끝은 동그란 발 */
function arm(g: G, x1: number, y1: number, x2: number, y2: number, far = false): void {
  const { L } = g
  const col = far ? L.shade : L.fill
  blob(g, [capsule(x1, y1, x2, y2, 8.5, 10)], col)
}

/** 다리 (엉덩이 → 발) + 발 */
function leg(g: G, x1: number, y1: number, x2: number, y2: number, far = false, footRot = 0, side = true): void {
  const { L } = g
  const col = far ? L.shade : L.fill
  blob(g, [capsule(x1, y1, x2, y2 - 3, 10), side ? ell(x2 + 4, y2, 14, 8.5, footRot) : ell(x2, y2, 15, 9, footRot)], col)
}

/** 꼬리. pts = 굵은 곡선의 점 (시작, 조절점, 끝 …) */
function tail(g: G, pts: number[], w?: number): void {
  const { c, L } = g
  const W = w ?? (L.kind === 'cat' ? 13 : 12)
  const path = (cc: Pen): void => {
    cc.moveTo(pts[0], pts[1])
    if (pts.length === 6) cc.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5])
    else cc.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7])
  }
  c.lineCap = 'round'
  c.lineJoin = 'round'
  stroke(g, L.line, W + OL * 2, path)
  stroke(g, L.fill, W, path)
  if (L.stripe) {
    c.setLineDash([5, 8])
    c.lineCap = 'butt'
    stroke(g, L.stripe, W, path)
    c.setLineDash([])
    c.lineCap = 'round'
    // 꼬리 끝은 진하게
  }
}

// ───────────── 머리·얼굴

type Eyes = 'open' | 'closed' | 'happy' | 'wide' | 'angry' | 'down'
type Mouth = 'w' | 'smile' | 'o' | 'munch' | 'pout' | 'sleep'

interface HeadOpt {
  x: number
  y: number
  /** 0 = 정면, 1 = 오른쪽으로 많이 돌림, 음수 = 왼쪽 */
  turn?: number
  tilt?: number
  eyes?: Eyes
  mouth?: Mouth
  puff?: boolean
  /** 귀 모양: 'up' 쫑긋, 'flat' 납작, 'back' 뒤로 */
  ears?: 'up' | 'flat' | 'perk'
  /** 화면 빛 (일하기) */
  glow?: boolean
  rx?: number
  ry?: number
}

function head(g: G, o: HeadOpt): void {
  const { c, L } = g
  const turn = o.turn ?? 0
  const rx = o.rx ?? (L.kind === 'dog' ? 66 : 64)
  const ry = o.ry ?? (L.kind === 'dog' ? 59 : 54)
  c.save()
  c.translate(o.x, o.y)
  c.rotate(o.tilt ?? 0)

  // 귀 (고양이: 머리 뒤에)
  if (L.kind === 'cat') catEars(g, rx, ry, turn, o.ears ?? 'up')
  else {
    dogEars(g, rx, ry, turn, o.ears ?? 'up', true)
    // 정수리 털 한 가닥
    const tx = turn * 16
    blob(g, [(cc) => {
      cc.moveTo(tx - 12, -ry + 8)
      cc.quadraticCurveTo(tx - 10, -ry - 16, tx + 6, -ry - 15)
      cc.quadraticCurveTo(tx - 2, -ry - 6, tx + 12, -ry + 6)
      cc.closePath()
    }], L.fill)
  }

  // 머리 (볼 부풀리기면 아래 양옆에 볼록)
  const hp = mochiHead(0, 0, rx, ry)
  const parts: Part[] = [hp]
  const fills: Paint[] = []
  const hg = vgrad(g, -ry, ry, L.fill, L.shade, 0.6)
  fills.push(hg)
  if (o.puff) {
    const dx = turn * 10
    parts.unshift(ell(-rx * 0.7 + dx, ry * 0.42, 30, 24), ell(rx * 0.7 + dx, ry * 0.42, 30, 24))
    fills.unshift(hg, hg)
  }
  blob(g, parts, fills)

  // 무늬·빛
  inside(g, hp, () => {
    // 치즈 이마 줄무늬
    if (L.stripe) {
      const fx = turn * 20
      c.lineCap = 'round'
      for (const k of [-1, 0, 1]) {
        stroke(g, L.stripe, k === 0 ? 7 : 6, (cc) => {
          cc.moveTo(fx + k * 13, -ry - 2)
          cc.lineTo(fx + k * 11, -ry + (k === 0 ? 24 : 18))
        })
      }
      // 볼 옆 줄
      for (const s of [-1, 1]) {
        for (let j = 0; j < 2; j++) {
          stroke(g, L.stripe, 5, (cc) => {
            cc.moveTo(s * (rx + 4), -4 + j * 12)
            cc.lineTo(s * (rx - 12), -1 + j * 12)
          })
        }
      }
    }
  })
  face(g, rx, ry, turn, o.eyes ?? 'open', o.mouth ?? 'w', !!o.puff)

  // 강아지 귀는 머리 앞에 늘어진다
  if (L.kind === 'dog') dogEars(g, rx, ry, turn, o.ears ?? 'up', false)
  c.restore()
}

function catEars(g: G, rx: number, ry: number, turn: number, kind: 'up' | 'flat' | 'perk'): void {
  const { c, L } = g
  for (const s of [-1, 1]) {
    const shift = turn * 14
    const tilt = kind === 'flat' ? 0.55 : kind === 'perk' ? -0.08 : 0.12
    const far = turn * s > 0.2 // 돌린 쪽 귀는 조금 작게
    const sc = far ? 0.88 : 1
    c.save()
    c.translate(s * rx * 0.58 + shift, -ry * 0.62)
    c.rotate(s * tilt)
    c.scale(s * sc, sc)
    const H = kind === 'flat' ? 28 : 39
    const ear: Part = (cc) => {
      cc.moveTo(-26, 14)
      cc.quadraticCurveTo(-18, -H * 0.4, 2, -H)
      cc.quadraticCurveTo(8, -H - 3, 12, -H + 4)
      cc.quadraticCurveTo(24, -H * 0.35, 26, 12)
      cc.closePath()
    }
    blob(g, [ear], L.fill)
    c.fillStyle = L.innerEar
    c.beginPath()
    c.moveTo(-14, 10)
    c.quadraticCurveTo(-8, -H * 0.32, 4, -H + 12)
    c.quadraticCurveTo(14, -H * 0.3, 15, 10)
    c.closePath()
    c.fill()
    c.restore()
  }
}

function dogEars(g: G, rx: number, ry: number, turn: number, kind: 'up' | 'flat' | 'perk', back: boolean): void {
  const { c, L } = g
  for (const s of [-1, 1]) {
    const far = turn * s > 0.2
    if (back !== far) continue
    const lift = kind === 'perk' ? -0.5 : kind === 'flat' ? 0.25 : 0
    c.save()
    c.translate(s * rx * 0.86 + turn * 12, -ry * 0.56)
    c.rotate(s * (0.42 + lift))
    c.scale(s, 1)
    const ear: Part = (cc) => {
      cc.moveTo(-14, -6)
      cc.bezierCurveTo(6, -14, 26, -4, 24, 26)
      cc.bezierCurveTo(23, 48, 4, 54, -2, 42)
      cc.bezierCurveTo(-8, 30, -16, 8, -14, -6)
      cc.closePath()
    }
    blob(g, [ear], far ? L.shade : '#2e2a2b')
    c.restore()
  }
}

function face(g: G, rx: number, ry: number, turn: number, eyes: Eyes, mouth: Mouth, puff: boolean): void {
  const { c, L } = g
  const fx = turn * 26
  const sp = 25 * (1 - Math.abs(turn) * 0.22)
  const ey = 4
  const my = 20
  // 강아지 주둥이 (흰 털)
  if (L.muzzle) {
    if (L.kind === 'dog') blob(g, [ell(fx, my + 4, 23 + (puff ? 4 : 0), 16)], L.muzzle, 0)
    else {
      c.globalAlpha = 0.9
      blob(g, [ell(fx - 8, my + 6, 12, 9), ell(fx + 8, my + 6, 12, 9)], L.muzzle, 0)
      c.globalAlpha = 1
    }
    // 눈썹 점
    if (L.brow && eyes !== 'happy') {
      c.fillStyle = L.brow
      for (const s of [-1, 1]) {
        c.beginPath()
        c.ellipse(fx + s * sp + s * 2, ey - 19, 5.5, 4, s * 0.2, 0, TAU)
        c.fill()
      }
    }
  }
  // 볼 터치
  for (const s of [-1, 1]) {
    const x = fx + s * (sp + 16) + (s * turn > 0 ? -4 : 0)
    const y = my + 2
    // 납작한 분홍 동그라미
    const r = puff ? 9 : 7
    c.fillStyle = L.cheek
    c.beginPath()
    c.ellipse(x, y, r * 1.3, r * 0.75, 0, 0, TAU)
    c.fill()
  }
  // 눈
  for (const s of [-1, 1]) {
    const far = turn * s < -0.2
    const sc = far ? 0.88 : 1
    eye(g, fx + s * sp, ey, eyes, sc, s)
  }
  // 코·입
  c.lineCap = 'round'
  c.lineJoin = 'round'
  const nx = fx + turn * 4
  if (L.kind === 'cat') {
    c.fillStyle = L.nose
    c.beginPath()
    c.moveTo(nx - 5, my - 6)
    c.quadraticCurveTo(nx, my - 8, nx + 5, my - 6)
    c.quadraticCurveTo(nx + 1, my + 1, nx, my)
    c.quadraticCurveTo(nx - 1, my + 1, nx - 5, my - 6)
    c.fill()
  } else {
    c.fillStyle = L.nose
    c.beginPath()
    c.ellipse(nx, my - 3, 8, 5.5, 0, 0, TAU)
    c.fill()
    c.fillStyle = 'rgba(255,255,255,0.7)'
    c.beginPath()
    c.ellipse(nx - 2.5, my - 5, 2.6, 1.5, 0, 0, TAU)
    c.fill()
  }
  const lc = L.kind === 'dog' ? '#3a3034' : L.line
  const m0 = my + 2
  switch (mouth) {
    case 'w':
    case 'sleep':
    case 'munch': {
      const w = mouth === 'sleep' ? 5 : 7
      stroke(g, lc, 2.6, (cc) => {
        cc.moveTo(nx, m0 - 1)
        cc.lineTo(nx, m0 + 2)
        cc.moveTo(nx - w - 1, m0 + 2)
        cc.quadraticCurveTo(nx - w / 2, m0 + 8, nx, m0 + 2)
        cc.quadraticCurveTo(nx + w / 2, m0 + 8, nx + w + 1, m0 + 2)
      })
      if (mouth === 'munch') {
        // 오물오물 + 부스러기
        c.fillStyle = '#e0a24c'
        for (const [dx, dy, r] of [
          [-30, 24, 2.6],
          [26, 30, 2.2],
          [-20, 34, 1.8]
        ]) {
          c.beginPath()
          c.arc(nx + dx, m0 + dy, r, 0, TAU)
          c.fill()
        }
      }
      break
    }
    case 'smile': {
      c.fillStyle = '#7a2e36'
      c.beginPath()
      c.moveTo(nx - 10, m0 + 1)
      c.quadraticCurveTo(nx, m0 + 4, nx + 10, m0 + 1)
      c.quadraticCurveTo(nx + 9, m0 + 16, nx, m0 + 16)
      c.quadraticCurveTo(nx - 9, m0 + 16, nx - 10, m0 + 1)
      c.fill()
      c.save()
      c.clip()
      c.fillStyle = '#ff8a9a'
      c.beginPath()
      c.ellipse(nx, m0 + 15, 7, 6, 0, 0, TAU)
      c.fill()
      c.restore()
      c.strokeStyle = lc
      c.lineWidth = 2.4
      c.beginPath()
      c.moveTo(nx - 10, m0 + 1)
      c.quadraticCurveTo(nx, m0 + 4, nx + 10, m0 + 1)
      c.quadraticCurveTo(nx + 9, m0 + 16, nx, m0 + 16)
      c.quadraticCurveTo(nx - 9, m0 + 16, nx - 10, m0 + 1)
      c.stroke()
      break
    }
    case 'o': {
      c.fillStyle = '#7a2e36'
      c.beginPath()
      c.ellipse(nx, m0 + 9, 6.5, 8.5, 0, 0, TAU)
      c.fill()
      c.strokeStyle = lc
      c.lineWidth = 2.4
      c.stroke()
      c.fillStyle = '#ff8a9a'
      c.beginPath()
      c.ellipse(nx, m0 + 13, 4, 3, 0, 0, TAU)
      c.fill()
      break
    }
    case 'pout': {
      stroke(g, lc, 2.8, (cc) => {
        cc.moveTo(nx - 6, m0 + 8)
        cc.quadraticCurveTo(nx, m0 + 1, nx + 6, m0 + 8)
      })
      break
    }
  }
  if (mouth === 'munch' || puff) {
    // 볼 빵빵 표시 (작은 호)
    for (const s of [-1, 1]) {
      c.globalAlpha = 0.45
      stroke(g, L.kind === 'dog' ? '#1d181b' : L.shade, 2.4, (cc) => {
        cc.arc(fx + s * (sp + 22), my + 6, 10, s > 0 ? -0.6 : Math.PI - 0.7, s > 0 ? 0.7 : Math.PI + 0.6)
      })
      c.globalAlpha = 1
    }
  }
}

function eye(g: G, x: number, y: number, kind: Eyes, sc: number, side: number): void {
  const { c, L } = g
  const lc = L.kind === 'dog' ? '#f2f2f2' : L.line // 까만 얼굴엔 흰 선
  c.save()
  c.translate(x, y)
  c.scale(sc, sc)
  c.lineCap = 'round'
  switch (kind) {
    case 'open':
    case 'down':
    case 'angry': {
      // 단순한 점 눈 (까만 얼굴은 흰자 위에 점)
      const dy = kind === 'down' ? 4 : 0
      if (L.kind === 'dog') {
        c.fillStyle = '#ffffff'
        c.beginPath()
        c.ellipse(0, 0, 8, 9, 0, 0, TAU)
        c.fill()
      }
      c.fillStyle = L.eye
      c.beginPath()
      c.ellipse(L.kind === 'dog' ? 1 : 0, dy + (L.kind === 'dog' ? 1 : 0), 5.2, kind === 'down' ? 4.5 : 6.2, 0, 0, TAU)
      c.fill()
      if (kind === 'angry') {
        // 찡그린 눈썹 (눈 위를 비스듬히 덮는다)
        c.fillStyle = L.kind === 'dog' ? L.fill : L.fill
        c.beginPath()
        c.moveTo(-15 * side, -5)
        c.lineTo(15 * side, -16)
        c.lineTo(15 * side, -22)
        c.lineTo(-15 * side, -22)
        c.closePath()
        c.fill()
        stroke(g, lc, 3.2, (cc) => {
          cc.moveTo(-11 * side, -6)
          cc.lineTo(11 * side, -14)
        })
      }
      break
    }
    case 'wide': {
      c.fillStyle = '#fff'
      c.beginPath()
      c.ellipse(0, 0, 11, 12.5, 0, 0, TAU)
      c.fill()
      c.strokeStyle = lc
      c.lineWidth = 3
      c.stroke()
      c.fillStyle = L.eye
      c.beginPath()
      c.arc(0, 1, 5, 0, TAU)
      c.fill()
      c.fillStyle = '#fff'
      c.beginPath()
      c.arc(1.6, -0.8, 1.6, 0, TAU)
      c.fill()
      break
    }
    case 'closed': {
      stroke(g, lc, 3.4, (cc) => {
        cc.moveTo(-8, 1)
        cc.quadraticCurveTo(0, 7, 8, 1)
      })
      break
    }
    case 'happy': {
      stroke(g, lc, 3.6, (cc) => {
        cc.moveTo(-8.5, 4)
        cc.quadraticCurveTo(0, -8, 8.5, 4)
      })
      break
    }
  }
  c.restore()
}

// ───────────── 소품

function sweat(g: G, x: number, y: number, s = 1, rot = 0): void {
  const { c } = g
  c.save()
  c.translate(x, y)
  c.rotate(rot)
  c.scale(s, s)
  const d: Part = (cc) => {
    cc.moveTo(0, -12)
    cc.bezierCurveTo(4, -5, 8, 0, 8, 4)
    cc.arc(0, 4, 8, 0, Math.PI)
    cc.bezierCurveTo(-8, 0, -4, -5, 0, -12)
    cc.closePath()
  }
  blob(g, [d], '#9fdcff', 2)
  c.fillStyle = 'rgba(255,255,255,0.85)'
  c.beginPath()
  c.ellipse(-3, 4, 2, 3, 0.3, 0, TAU)
  c.fill()
  c.restore()
}

/** 💢 모양 화남 표시 */
function anger(g: G, x: number, y: number, s = 1): void {
  const { c } = g
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  c.lineCap = 'round'
  for (let i = 0; i < 4; i++) {
    c.save()
    c.rotate((i * Math.PI) / 2)
    const p = (cc: Pen): void => {
      cc.moveTo(4, -13)
      cc.quadraticCurveTo(4, -4, 13, -4)
    }
    stroke(g, '#7a1b26', 6.5, p)
    stroke(g, '#ff4d5e', 3.2, p)
    c.restore()
  }
  c.restore()
}

function sparkle(g: G, x: number, y: number, r: number, color = '#ffd84a'): void {
  const { c } = g
  const p: Part = (cc) => {
    cc.moveTo(x, y - r)
    cc.quadraticCurveTo(x, y, x + r, y)
    cc.quadraticCurveTo(x, y, x, y + r)
    cc.quadraticCurveTo(x, y, x - r, y)
    cc.quadraticCurveTo(x, y, x, y - r)
    cc.closePath()
  }
  blob(g, [p], color, 1.6)
}

/** 붕어빵 */
function fishBun(g: G, x: number, y: number, rot: number): void {
  const { c } = g
  c.save()
  c.translate(x, y)
  c.rotate(rot)
  const p: Part = (cc) => {
    cc.moveTo(-24, 0)
    cc.bezierCurveTo(-20, -15, 6, -16, 16, -6)
    cc.lineTo(28, -14)
    cc.quadraticCurveTo(24, 0, 28, 14)
    cc.lineTo(16, 6)
    cc.bezierCurveTo(6, 16, -20, 15, -24, 0)
    cc.closePath()
  }
  const gr = c.createLinearGradient(0, -14, 0, 14)
  gr.addColorStop(0, '#f7c463')
  gr.addColorStop(1, '#d98a2b')
  blob(g, [p], gr, 3)
  c.strokeStyle = 'rgba(140,70,20,0.55)'
  c.lineWidth = 2
  c.lineCap = 'round'
  c.beginPath()
  for (const k of [-6, 2]) {
    c.moveTo(k, -7)
    c.quadraticCurveTo(k + 4, 0, k, 7)
  }
  c.stroke()
  c.fillStyle = '#3a2418'
  c.beginPath()
  c.arc(-15, -3, 2.2, 0, TAU)
  c.fill()
  c.restore()
}

/** 뼈다귀 과자 */
function boneCookie(g: G, x: number, y: number, rot: number): void {
  const { c } = g
  c.save()
  c.translate(x, y)
  c.rotate(rot)
  c.scale(1.3, 1.3)
  const parts: Part[] = [ell(-20, -6, 8, 8), ell(-20, 6, 8, 8), ell(20, -6, 8, 8), ell(20, 6, 8, 8), (cc) => cc.rect(-20, -6, 40, 12)]
  blob(g, parts, '#f0c27a', 3)
  c.fillStyle = '#d99a4c'
  for (const [dx, dy] of [
    [-6, -1],
    [5, 2],
    [12, -2]
  ]) {
    c.beginPath()
    c.arc(dx, dy, 1.6, 0, TAU)
    c.fill()
  }
  c.restore()
}

/** 작은 노트북 (뚜껑 뒷면이 보이게) */
function laptopBack(g: G, x: number, y: number): void {
  const { c } = g
  const lid: Part = (cc) => cc.roundRect(x - 44, y - 52, 88, 50, 7)
  const gr = c.createLinearGradient(0, y - 52, 0, y)
  gr.addColorStop(0, '#d9dee6')
  gr.addColorStop(1, '#aab3c0')
  blob(g, [lid], gr, 3.5)
  // 발바닥 로고
  c.fillStyle = '#f4f6fa'
  c.beginPath()
  c.ellipse(x, y - 24, 7, 6, 0, 0, TAU)
  c.fill()
  for (const k of [-1, 0, 1]) {
    c.beginPath()
    c.arc(x + k * 6.5, y - 33 + Math.abs(k) * 2.5, 2.8, 0, TAU)
    c.fill()
  }
  // 밑판
  blob(g, [(cc) => cc.roundRect(x - 52, y - 4, 104, 8, 4)], '#8d96a4', 3.5)
}

// ───────────── 포즈

type PoseFn = (g: G) => void

const isCat = (g: G): boolean => g.L.kind === 'cat'

function standBase(g: G, eyes: Eyes): void {
  if (isCat(g)) tail(g, [-26, -28, -70, -36, -58, -92])
  else tail(g, [-30, -34, -54, -48, -44, -66], 12)
  foot(g, -17, -8)
  foot(g, 17, -8)
  body(g, 0, -45, 38, 38)
  arm(g, -31, -60, -36, -40)
  arm(g, 31, -60, 36, -40)
  head(g, { x: 0, y: -124, eyes, mouth: 'w' })
}

function walk(g: G, phase: 0 | 1): void {
  // phase 0 = 왼발(보는 쪽 발) 앞, 1 = 오른발(먼 발) 앞
  const near = phase === 0 ? 1 : -1
  const bob = -2
  // 꼬리
  if (isCat(g)) tail(g, phase === 0 ? [-26, -44, -70, -46, -64, -98] : [-26, -44, -76, -56, -58, -102])
  else tail(g, [-28, -48, -52, -60, -46, -82], 12)
  // 먼 쪽 팔·다리 (어둡게, 몸 뒤)
  leg(g, -near * 8, -26, -near * 19 + 2, -8 - (near > 0 ? 4 : 0), true, near > 0 ? -0.3 : 0.1)
  arm(g, 14, -66 + bob, 14 + near * 10, -54 + bob, true)
  body(g, 0, -50 + bob, 34, 35, 0.06, 1)
  // 가까운 쪽 다리·팔
  leg(g, near * 8, -26, near * 19 + 2, -8 - (near < 0 ? 4 : 0), false, near > 0 ? 0.1 : -0.3)
  arm(g, 0, -66 + bob, -near * 9, -54 + bob)
  head(g, { x: 8, y: -126 + bob, turn: 0.62, eyes: 'open', mouth: 'w', tilt: 0.04 })
}

const POSE_FNS: Record<Pose, PoseFn> = {
  stand: (g) => standBase(g, 'open'),
  blink: (g) => standBase(g, 'closed'),
  walk1: (g) => walk(g, 0),
  walk2: (g) => walk(g, 1),
  surprised: (g) => {
    if (isCat(g)) tail(g, [-24, -34, -56, -60, -50, -112], 17)
    else tail(g, [-28, -38, -50, -60, -44, -82], 13)
    leg(g, -12, -24, -34, -9, false, -0.3, false)
    leg(g, 12, -24, 34, -9, false, 0.3, false)
    body(g, 0, -50, 36, 36)
    arm(g, -28, -64, -62, -86)
    arm(g, 28, -64, 62, -86)
    head(g, { x: 0, y: -128, eyes: 'wide', mouth: 'o', ears: 'perk' })
    sweat(g, 64, -168, 1, 0.3)
    sweat(g, -66, -150, 0.75, -0.3)
  },
  sit: (g) => {
    if (isCat(g)) tail(g, [26, -18, 70, -10, 74, -46])
    else tail(g, [28, -26, 52, -34, 46, -54], 12)
    body(g, 0, -36, 42, 33)
    sole(g, -22, -12, 14)
    sole(g, 22, -12, 14)
    arm(g, -26, -50, -13, -32)
    arm(g, 26, -50, 13, -32)
    head(g, { x: 0, y: -112, eyes: 'open', mouth: 'w', tilt: -0.06 })
  },
  sleep: (g) => {
    const { c } = g
    // 웅크린 떡 모양 몸 + 꼬리를 앞으로 감는다
    body(g, -14, -36, 70, 36, 0, 0)
    if (isCat(g)) tail(g, [-78, -22, -86, 6, -10, -5], 14)
    else tail(g, [-78, -30, -92, -10, -70, -4], 12)
    c.save()
    head(g, { x: 36, y: -52, eyes: 'closed', mouth: 'sleep', ears: 'flat', tilt: 0.14, rx: 58, ry: 47 })
    c.restore()
    // 턱 밑 앞발
    blob(g, [ell(18, -8, 14, 8.5, -0.1), ell(50, -6, 14, 8.5, 0.1)], vgrad(g, -16, 0, g.L.fill, g.L.shade, 0.3))
  },
  happy: (g) => {
    const L = -12 // 살짝 점프
    if (isCat(g)) tail(g, [-26, -28 + L, -76, -40 + L, -62, -100 + L])
    else tail(g, [-30, -34 + L, -60, -50 + L, -52, -76 + L], 12)
    foot(g, -20, -8 + L + 2, -0.25)
    foot(g, 20, -8 + L + 2, 0.25)
    arm(g, -26, -64 + L, -64, -104 + L)
    arm(g, 26, -64 + L, 64, -104 + L)
    body(g, 0, -46 + L, 37, 37)
    head(g, { x: 0, y: -124 + L, eyes: 'happy', mouth: 'smile' })
    sparkle(g, -84, -150, 8)
    sparkle(g, 86, -172, 10)
    sparkle(g, 92, -128, 6, '#ff9fc0')
  },
  work: (g) => {
    if (isCat(g)) tail(g, [-30, -18, -72, -10, -76, -46])
    else tail(g, [-30, -26, -54, -34, -48, -56], 12)
    body(g, 0, -38, 42, 33)
    arm(g, -30, -54, -30, -30)
    arm(g, 30, -54, 30, -30)
    head(g, { x: 0, y: -114, eyes: 'down', mouth: 'w', glow: true })
    laptopBack(g, 0, -6)
    // 타닥타닥 표시
    const { c } = g
    c.lineCap = 'round'
    for (const s of [-1, 1]) {
      stroke(g, g.L.line, 3, (cc) => {
        cc.moveTo(s * 50, -66)
        cc.lineTo(s * 58, -74)
        cc.moveTo(s * 54, -56)
        cc.lineTo(s * 64, -60)
      })
    }
  },
  eat: (g) => {
    if (isCat(g)) tail(g, [26, -18, 70, -10, 74, -46])
    else tail(g, [28, -26, 52, -34, 46, -54], 12)
    body(g, 0, -36, 42, 33)
    sole(g, -22, -12, 14)
    sole(g, 22, -12, 14)
    head(g, { x: 0, y: -114, eyes: 'happy', mouth: 'munch', puff: true })
    if (isCat(g)) fishBun(g, 2, -56, -0.15)
    else boneCookie(g, 2, -58, -0.15)
    arm(g, -30, -52, -20, -54)
    arm(g, 30, -52, 22, -58)
  },
  angry: (g) => {
    if (isCat(g)) tail(g, [-26, -26, -74, -26, -70, -70], 15)
    else tail(g, [-30, -34, -54, -48, -44, -66], 12)
    foot(g, -17, -8)
    foot(g, 17, -8)
    body(g, 0, -45, 38, 38)
    // 팔짱
    arm(g, 30, -62, -12, -48)
    arm(g, -30, -62, 14, -46)
    head(g, { x: -2, y: -124, eyes: 'angry', mouth: 'pout', puff: true, turn: -0.18, tilt: -0.05 })
    anger(g, 56, -178, 1.1)
  },
  wave: (g) => {
    if (isCat(g)) tail(g, [-26, -28, -70, -36, -58, -92])
    else tail(g, [-30, -34, -54, -48, -44, -66], 12)
    foot(g, -17, -8)
    foot(g, 17, -8)
    arm(g, 30, -62, 66, -98)
    body(g, 0, -45, 38, 38)
    arm(g, -31, -60, -36, -40)
    head(g, { x: -4, y: -124, eyes: 'open', mouth: 'smile', tilt: -0.08 })
    // 흔드는 표시
    const { c } = g
    c.lineCap = 'round'
    stroke(g, g.L.line, 3, (cc) => {
      cc.arc(70, -104, 24, -1.25, -0.45)
    })
    stroke(g, g.L.line, 3, (cc) => {
      cc.arc(70, -104, 34, -1.15, -0.55)
    })
  }
}

// ───────────── 아틀라스

/** 한 포즈를 원점(발바닥 가운데) 기준으로 그린다 */
export function drawBuiltinPose(ctx: CanvasRenderingContext2D, id: DrawnPetId, pose: Pose): void {
  const g: G = { c: new Doodle(ctx, mulberry32(hashStr(`${id}:${pose}`))), L: LOOKS[id] }
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  POSE_FNS[pose](g)
  ctx.restore()
}

/** 기본 펫 아틀라스 (1024×768, 투명 배경) */
export function drawBuiltinAtlas(id: DrawnPetId): HTMLCanvasElement {
  const atlas = makeCanvas(ATLAS_W, ATLAS_H)
  const actx = atlas.getContext('2d')!
  const cell = makeCanvas(CELL, CELL)
  const cctx = cell.getContext('2d')!
  const sil = makeCanvas(CELL, CELL)
  const sctx = sil.getContext('2d')!
  const halo = LOOKS[id].halo
  POSES.forEach((pose, i) => {
    cctx.clearRect(0, 0, CELL, CELL)
    cctx.save()
    cctx.translate(CELL / 2, FEET_Y)
    drawBuiltinPose(cctx, id, pose)
    cctx.restore()
    const x = (i % COLS) * CELL
    const y = Math.floor(i / COLS) * CELL
    // 바깥 흰 테두리 (실루엣을 둥글게 키워서 뒤에 깐다)
    if (halo > 0) {
      sctx.clearRect(0, 0, CELL, CELL)
      sctx.globalCompositeOperation = 'source-over'
      sctx.drawImage(cell, 0, 0)
      sctx.globalCompositeOperation = 'source-in'
      sctx.fillStyle = '#fff'
      sctx.fillRect(0, 0, CELL, CELL)
      sctx.globalCompositeOperation = 'source-over'
      actx.save()
      actx.beginPath()
      actx.rect(x, y, CELL, CELL)
      actx.clip()
      actx.globalAlpha = halo
      // 방향마다 두께를 조금씩 달리해 삐뚤게
      const hr = mulberry32(hashStr(`${id}:halo:${pose}`))
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU
        const R = 2 + hr() * 2
        actx.drawImage(sil, x + Math.cos(a) * R, y + Math.sin(a) * R)
      }
      actx.restore()
    }
    // 흰 테두리 겹친 자리를 깨끗하게 한 번 덮고 본 그림
    actx.drawImage(cell, x, y)
  })
  return atlas
}

/** 아틀라스에서 한 칸을 정사각형으로 */
export function drawPetThumb(atlas: CanvasImageSource, pose: Pose, size: number): HTMLCanvasElement {
  const out = makeCanvas(size, size)
  const ctx = out.getContext('2d')!
  const i = poseIndex(pose)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(atlas, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL, 0, 0, size, size)
  return out
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
