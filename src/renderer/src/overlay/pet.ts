// 펫 한 마리: 위치·물리·포즈·그리기. 무엇을 할지는 world.ts 가 정한다.
import { CELL, FEET_Y, STAND_H, type Pose } from '@shared/pet'
import type { Perch, Rect } from '@shared/types'
import { drawPose, type PetSprite } from '@/common/sprite'

export type PetState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'sleep'
  | 'work'
  | 'eat'
  | 'happy'
  | 'angry'
  | 'wave'
  | 'drag'
  | 'fall'
  | 'thrown'
  | 'dizzy'
  | 'jump'
  | 'hang'
  | 'dance'
  | 'peek'

const GRAVITY = 2600
const WALK = 0.62 // 키 대비 초당 걷는 거리
const RUN = 2.2

export class Pet {
  readonly el: HTMLDivElement
  private cv: HTMLCanvasElement
  private c: CanvasRenderingContext2D
  sprite: PetSprite
  /** 발바닥 위치 (디스플레이 좌표) */
  x = 0
  y = 0
  vx = 0
  vy = 0
  /** 1 = 오른쪽을 봄 */
  face = 1
  state: PetState = 'fall'
  /** 지금 상태로 지낸 시간 */
  t = 0
  /** 지금 상태를 끝낼 시각 (t 기준, 0 = 정하지 않음) */
  until = 0
  perch: Perch | null = null
  /** 앉은 창 왼쪽에서 떨어진 거리 */
  rel = 0
  target: number | null = null
  pose: Pose = 'stand'
  /** 키 (px) */
  size = 110
  /** 착지 찌그러짐 0~1 */
  squash = 0
  tilt = 0
  /** 점프 목표 자리 */
  jumpTo: Perch | null = null
  /** 숨바꼭질: 화면 밖으로 삐져나가도 된다 */
  allowOff = false
  /** 마지막 착지 속도 (어지러움 판단) */
  impact = 0
  private drawn = ''
  private rx = 0
  private ry = 0
  private blinkAt = 2
  private walkPhase = 0
  footstep = 0
  readonly clone: boolean
  // 사람과의 놀이 (펫마다 따로)
  rub = { score: 0, flips: 0, lastDx: 0 }
  hoverT = 0
  lastPetAt = -100
  lastWave = -100
  clicks: number[] = []
  /** 분신: 사라질 시각 (world.time) */
  dieAt = 0
  /** 같이 노는 펫의 작은 말풍선 */
  talk: HTMLDivElement | null = null
  talkUntil = 0
  /** 걷는 속도 배수 (부장님 온다 = 7배) */
  speedMul = 1
  /** 분신: 창 점령 중 (자리를 지킴) · 행진·흩어지는 중 */
  seated = false
  marching = false
  /** 끈에 매달려 있을 때: 머리를 중심으로 돈다 */
  pivotHead = false
  /** 칼퇴 시위 피켓 */
  sign: HTMLDivElement | null = null

  constructor(parent: HTMLElement, sprite: PetSprite, size: number, clone = false) {
    this.sprite = sprite
    this.clone = clone
    this.el = document.createElement('div')
    this.el.className = clone ? 'pet clone' : 'pet'
    this.cv = document.createElement('canvas')
    this.el.appendChild(this.cv)
    this.c = this.cv.getContext('2d')!
    parent.appendChild(this.el)
    this.setSize(size)
  }

  get k(): number {
    return this.size / STAND_H
  }

  setSize(size: number): void {
    this.size = size
    const box = Math.round(CELL * this.k)
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    this.cv.width = Math.round(box * dpr)
    this.cv.height = Math.round(box * dpr)
    this.el.style.width = this.cv.style.width = `${box}px`
    this.el.style.height = this.cv.style.height = `${box}px`
    this.drawn = ''
  }

  setSprite(sp: PetSprite): void {
    this.sprite = sp
    this.drawn = ''
  }

  set(state: PetState, dur = 0): void {
    this.state = state
    this.t = 0
    this.until = dur
    if (state !== 'walk' && state !== 'run') this.target = null
  }

  get grounded(): boolean {
    return this.perch !== null && !['drag', 'fall', 'thrown', 'jump', 'hang'].includes(this.state)
  }

  /** 지금 포즈의 실제 그림 영역 (화면 좌표) */
  bbox(pad = 0): Rect {
    const b = this.sprite.box[this.pose]
    const k = this.k
    const left = this.rx - (CELL / 2) * k
    const top = this.ry - FEET_Y * k
    let x0 = b.x0
    let x1 = b.x1
    if (this.face < 0) {
      x0 = CELL - b.x1
      x1 = CELL - b.x0
    }
    return { x: left + x0 * k - pad, y: top + b.y0 * k - pad, w: (x1 - x0) * k + pad * 2, h: (b.y1 - b.y0) * k + pad * 2 }
  }

  /** 머리 꼭대기 (말풍선·표시 위치) */
  head(): { x: number; y: number } {
    const b = this.bbox()
    return { x: this.rx, y: b.y }
  }

  contains(px: number, py: number, pad = 4): boolean {
    const b = this.bbox(pad)
    return px >= b.x && py >= b.y && px < b.x + b.w && py < b.y + b.h
  }

  /** 걷기·뛰기 목표 */
  goTo(x: number, run = false): void {
    this.target = x
    this.state = run ? 'run' : 'walk'
    this.t = 0
    this.until = 0
    this.face = x >= this.x ? 1 : -1
  }

  land(p: Perch): void {
    this.perch = p
    this.rel = this.x - p.wx
    this.y = p.y
    this.impact = this.vy
    this.vx = 0
    this.vy = 0
    this.squash = Math.min(1, 0.35 + Math.abs(this.impact) / 2200)
  }

  /** 물리·걷기. 착지하면 'landed', 목표에 닿으면 'arrived' */
  step(dt: number, perches: Perch[], W: number, H: number): 'landed' | 'arrived' | null {
    this.t += dt
    this.squash = Math.max(0, this.squash - dt * 3.2)
    let ev: 'landed' | 'arrived' | null = null
    const half = this.size * 0.32
    switch (this.state) {
      case 'walk':
      case 'run': {
        if (this.target === null || !this.perch) break
        const sp = (this.state === 'run' ? RUN : WALK) * this.size * this.speedMul
        const d = this.target - this.x
        this.face = d >= 0 ? 1 : -1
        const mv = Math.sign(d) * Math.min(Math.abs(d), sp * dt)
        this.x += mv
        this.rel = this.x - this.perch.wx
        this.walkPhase += dt * (this.state === 'run' ? 10 : 5.5)
        this.footstep += Math.abs(mv)
        if (Math.abs(this.target - this.x) < 1) {
          this.x = this.target
          this.target = null
          ev = 'arrived'
        }
        break
      }
      case 'fall':
      case 'thrown':
      case 'jump': {
        const py = this.y
        this.vy += GRAVITY * dt
        this.x += this.vx * dt
        this.y += this.vy * dt
        if (this.state === 'thrown') {
          this.tilt += this.vx * dt * 0.8
          // 화면 가장자리에서 튕김
          if (this.x < half) {
            this.x = half
            this.vx = Math.abs(this.vx) * 0.55
          } else if (this.x > W - half) {
            this.x = W - half
            this.vx = -Math.abs(this.vx) * 0.55
          }
          if (this.y - this.size < 0 && this.vy < 0) {
            this.y = this.size
            this.vy = Math.abs(this.vy) * 0.4
          }
        } else if (!this.allowOff) this.x = Math.max(half, Math.min(W - half, this.x))
        if (this.vy > 0) {
          const cands = this.state === 'jump' && this.jumpTo ? [this.jumpTo, ...perches.filter((p) => p.wid === 0)] : perches
          let best: Perch | null = null
          for (const p of cands) {
            if (this.x < p.x0 || this.x > p.x1) continue
            if (py <= p.y + 0.5 && this.y >= p.y && (!best || p.y < best.y)) best = p
          }
          if (best) {
            this.land(best)
            this.tilt = 0
            ev = 'landed'
          } else if (this.y > H + this.size) {
            // 바닥을 못 찾았으면 화면 아래 바닥에
            const floor = perches.find((p) => p.wid === 0)
            this.y = floor ? floor.y : H - 40
            this.x = Math.max(half, Math.min(W - half, this.x))
            if (floor) this.land(floor)
            ev = 'landed'
          }
        }
        break
      }
    }
    // 서 있는 동안 창이 움직이면 같이
    if (this.perch && this.grounded && this.state !== 'walk' && this.state !== 'run') this.x = this.perch.wx + this.rel
    return ev
  }

  /** 포즈 고르기 + 그리기 */
  render(dt: number): void {
    const s = this.state
    let pose: Pose = 'stand'
    let bob = 0
    let sx = 1
    let sy = 1
    let rot = 0
    switch (s) {
      case 'idle':
        this.blinkAt -= dt
        if (this.blinkAt < 0) {
          pose = 'blink'
          if (this.blinkAt < -0.14) this.blinkAt = 2 + Math.random() * 3
        }
        sy = 1 + Math.sin(this.t * 2.4) * 0.012
        break
      case 'walk':
      case 'run':
        pose = Math.floor(this.walkPhase) % 2 ? 'walk2' : 'walk1'
        bob = -Math.abs(Math.sin(this.walkPhase * Math.PI)) * this.size * (s === 'run' ? 0.06 : 0.03)
        break
      case 'sit':
        pose = 'sit'
        sy = 1 + Math.sin(this.t * 2) * 0.012
        break
      case 'sleep':
        pose = 'sleep'
        sy = 1 + Math.sin(this.t * 1.6) * 0.03
        sx = 1 - Math.sin(this.t * 1.6) * 0.012
        break
      case 'work':
        pose = 'work'
        bob = Math.floor(this.t * 9) % 2 ? -1.2 : 0
        break
      case 'eat':
        pose = 'eat'
        sy = 1 + Math.abs(Math.sin(this.t * 9)) * 0.04
        break
      case 'happy':
        pose = 'happy'
        bob = -Math.abs(Math.sin(this.t * 7)) * this.size * 0.1
        break
      case 'angry':
        pose = 'angry'
        rot = Math.sin(this.t * 30) * (this.t < 0.4 ? 3 : 0)
        break
      case 'wave':
        pose = 'wave'
        rot = Math.sin(this.t * 8) * 3
        break
      case 'drag':
        pose = 'surprised'
        rot = this.tilt
        break
      case 'hang':
        // 끈에 매달려 흔들흔들: 천천히면 만세(끈 잡기), 세게 흔들리면 깜짝
        pose = Math.hypot(this.vx, this.vy) > 900 ? 'surprised' : 'happy'
        rot = this.tilt
        break
      case 'fall':
        pose = 'surprised'
        break
      case 'thrown':
        pose = 'surprised'
        rot = this.tilt
        break
      case 'jump':
        pose = 'happy'
        break
      case 'dizzy':
        pose = this.t % 1.2 < 0.6 ? 'surprised' : 'sit'
        rot = Math.sin(this.t * 6) * 6
        break
      case 'dance': {
        const beat = Math.floor(this.t * 2.6)
        pose = (['happy', 'wave', 'happy', 'walk1'] as Pose[])[beat % 4]
        if (beat % 4 === 3) this.face = beat % 8 === 3 ? 1 : -1
        bob = -Math.abs(Math.sin(this.t * Math.PI * 2.6)) * this.size * 0.08
        rot = Math.sin(this.t * Math.PI * 1.3) * 8
        break
      }
      case 'peek':
        pose = this.t % 3 < 2.6 ? 'stand' : 'blink'
        break
    }
    // 착지 찌그러짐
    if (this.squash > 0) {
      const q = Math.sin(this.squash * Math.PI) * 0.22 * this.squash
      sx *= 1 + q
      sy *= 1 - q
    }
    this.pose = pose
    // 창을 끌어 옮길 때 툭툭 끊기지 않게 살짝 따라가기
    const smooth = this.grounded && Math.hypot(this.x - this.rx, this.y - this.ry) < 160 && this.state !== 'walk' && this.state !== 'run'
    if (smooth) {
      const a = 1 - Math.exp(-dt * 22)
      this.rx += (this.x - this.rx) * a
      this.ry += (this.y - this.ry) * a
    } else {
      this.rx = this.x
      this.ry = this.y
    }
    const key = `${pose}|${this.sprite.id}|${this.size}`
    if (key !== this.drawn) {
      this.drawn = key
      const c = this.c
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.clearRect(0, 0, this.cv.width, this.cv.height)
      c.imageSmoothingQuality = 'high'
      drawPose(c, this.sprite, pose, 0, 0, this.cv.width)
    }
    const k = this.k
    const left = this.rx - (CELL / 2) * k
    const top = this.ry - FEET_Y * k + bob
    // 발바닥을 기준으로 찌그러지고 돈다
    this.el.style.transformOrigin = this.pivotHead ? `${(CELL / 2) * k}px ${this.sprite.box[pose].y0 * k}px` : `${(CELL / 2) * k}px ${FEET_Y * k}px`
    this.el.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg) scale(${(sx * this.face).toFixed(3)}, ${sy.toFixed(3)})`
  }

  remove(): void {
    this.el.remove()
    this.talk?.remove()
    this.sign?.remove()
  }
}
