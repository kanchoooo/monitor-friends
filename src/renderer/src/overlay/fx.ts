// 효과 (하트·별·zzz·꽃가루·발자국·부스러기·펑) — 화면 전체 캔버스 하나. 효과가 없으면 그리지 않는다

type Kind = 'heart' | 'star' | 'z' | 'confetti' | 'crumb' | 'poof' | 'note' | 'sweat' | 'foot' | 'spark' | 'text' | 'money'

interface P {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  g: number
  life: number
  max: number
  rot: number
  vr: number
  size: number
  color: string
  text?: string
  flip?: number
}

const CONFETTI = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#ff9ff3', '#ffa94d', '#9775fa']

export class Fx {
  private cv: HTMLCanvasElement
  private c: CanvasRenderingContext2D
  private ps: P[] = []
  private dpr = 1
  private w = 0
  private h = 0
  private dirty = false

  constructor(parent: HTMLElement) {
    this.cv = document.createElement('canvas')
    this.cv.className = 'fx'
    parent.appendChild(this.cv)
    this.c = this.cv.getContext('2d')!
  }

  resize(w: number, h: number): void {
    this.w = w
    this.h = h
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.cv.width = Math.round(w * this.dpr)
    this.cv.height = Math.round(h * this.dpr)
    this.cv.style.width = `${w}px`
    this.cv.style.height = `${h}px`
  }

  get active(): boolean {
    return this.ps.length > 0 || this.dirty
  }

  private add(p: Partial<P> & { kind: Kind; x: number; y: number }): void {
    if (this.ps.length > 900) return
    this.ps.push({ vx: 0, vy: 0, g: 0, life: 0, max: 1, rot: 0, vr: 0, size: 12, color: '#ff6b81', ...p })
  }

  hearts(x: number, y: number, n = 3): void {
    for (let i = 0; i < n; i++) this.add({ kind: 'heart', x: x + (Math.random() - 0.5) * 40, y, vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 50, max: 1.4 + Math.random() * 0.5, size: 12 + Math.random() * 8, color: Math.random() < 0.8 ? '#ff6b81' : '#ff9ff3' })
  }

  stars(x: number, y: number, n = 5): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      this.add({ kind: 'star', x, y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 12, max: 1.6, size: 10, color: '#ffd93d', rot: a, vr: 3 })
    }
  }

  z(x: number, y: number): void {
    this.add({ kind: 'z', x, y, vx: 14 + Math.random() * 8, vy: -22, max: 2.2, size: 13 + Math.random() * 6, color: '#7b8cde', text: 'z' })
  }

  note(x: number, y: number): void {
    this.add({ kind: 'note', x, y, vx: (Math.random() - 0.5) * 50, vy: -50, max: 1.5, size: 18, color: ['#ff6b6b', '#4d96ff', '#9775fa'][Math.floor(Math.random() * 3)], text: Math.random() < 0.5 ? '♪' : '♫' })
  }

  sweat(x: number, y: number): void {
    this.add({ kind: 'sweat', x, y, vx: (Math.random() - 0.5) * 60, vy: -40, g: 300, max: 0.8, size: 6, color: '#74c0fc' })
  }

  confetti(x0: number, x1: number, y: number, n = 160): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'confetti',
        x: x0 + Math.random() * (x1 - x0),
        y: y - Math.random() * 120,
        vx: (Math.random() - 0.5) * 160,
        vy: 60 + Math.random() * 140,
        g: 30,
        max: 4 + Math.random() * 2,
        size: 6 + Math.random() * 6,
        color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
        flip: Math.random() * 6
      })
    }
  }

  burst(x: number, y: number, n = 40): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 150 + Math.random() * 350
      this.add({ kind: 'confetti', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 200, g: 500, max: 1.8 + Math.random(), size: 5 + Math.random() * 5, color: CONFETTI[i % CONFETTI.length], rot: a, vr: (Math.random() - 0.5) * 14, flip: Math.random() * 6 })
    }
  }

  crumbs(x: number, y: number, n = 8, color = '#c8925a'): void {
    for (let i = 0; i < n; i++) this.add({ kind: 'crumb', x, y, vx: (Math.random() - 0.5) * 140, vy: -80 - Math.random() * 120, g: 700, max: 0.9, size: 3 + Math.random() * 3, color })
  }

  poof(x: number, y: number, r = 30): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      this.add({ kind: 'poof', x, y, vx: Math.cos(a) * r * 2, vy: Math.sin(a) * r * 1.4, max: 0.55, size: r * 0.5, color: 'rgba(255,255,255,0.9)' })
    }
  }

  foot(x: number, y: number, face: number, size: number): void {
    this.add({ kind: 'foot', x, y, max: 9, size, color: 'rgba(90,70,50,0.55)', flip: face })
  }

  spark(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, max: 0.45, size: 3, color: '#ffe066' })
    }
  }

  /** 화면 위에서 돈이 쏟아진다 (월급날) */
  moneyRain(w: number, n = 60): void {
    for (let i = 0; i < n; i++)
      this.add({ kind: 'money', x: Math.random() * w, y: -20 - Math.random() * 400, vx: (Math.random() - 0.5) * 40, vy: 120 + Math.random() * 160, g: 120, max: 5, size: 20 + Math.random() * 14, color: ['#2b8a3e', '#e67700', '#1971c2'][i % 3], text: ['₩', '💸', '💰'][i % 3] })
  }

  /** 떠오르는 글자 (+₩120) */
  text(x: number, y: number, s: string, color = '#2b8a3e', size = 15): void {
    this.add({ kind: 'text', x, y, vy: -40, max: 1.4, size, color, text: s })
  }

  money(x: number, y: number): void {
    this.add({ kind: 'money', x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 40, vy: -70, g: 60, max: 1.2, size: 15, color: '#2b8a3e', text: '₩' })
  }

  update(dt: number): void {
    const ps = this.ps
    for (const p of ps) {
      p.life += dt
      p.vy += p.g * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
      if (p.kind === 'confetti') {
        p.vx *= 1 - 0.8 * dt
        if (p.g < 100 && p.vy > 120) p.vy = 120
      }
    }
    this.ps = ps.filter((p) => p.life < p.max && p.y < this.h + 40)
    this.draw()
  }

  private draw(): void {
    const c = this.c
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.clearRect(0, 0, this.w, this.h)
    this.dirty = this.ps.length > 0
    for (const p of this.ps) {
      const t = p.life / p.max
      const a = p.kind === 'foot' ? Math.min(1, (1 - t) * 3) : t > 0.7 ? (1 - t) / 0.3 : 1
      c.globalAlpha = Math.max(0, Math.min(1, a))
      c.save()
      c.translate(p.x, p.y)
      switch (p.kind) {
        case 'heart':
          c.scale(p.size / 16, p.size / 16)
          c.fillStyle = p.color
          heart(c)
          break
        case 'star':
          c.rotate(p.rot)
          c.fillStyle = p.color
          star(c, p.size)
          break
        case 'spark':
          c.fillStyle = p.color
          star(c, p.size * 1.5)
          break
        case 'z':
        case 'note':
        case 'text':
        case 'money':
          c.font = `800 ${p.size}px -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`
          c.textAlign = 'center'
          c.lineWidth = 3
          c.strokeStyle = 'rgba(255,255,255,0.9)'
          c.strokeText(p.text ?? '', 0, 0)
          c.fillStyle = p.color
          c.fillText(p.text ?? '', 0, 0)
          break
        case 'confetti':
          c.rotate(p.rot)
          c.scale(1, Math.cos((p.flip ?? 0) + p.life * 8))
          c.fillStyle = p.color
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
          break
        case 'crumb':
        case 'sweat':
          c.fillStyle = p.color
          c.beginPath()
          c.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          c.fill()
          break
        case 'poof':
          c.fillStyle = p.color
          c.strokeStyle = 'rgba(120,120,140,0.5)'
          c.lineWidth = 1.5
          c.beginPath()
          c.arc(0, 0, p.size * (0.6 + t * 0.6), 0, Math.PI * 2)
          c.fill()
          c.stroke()
          break
        case 'foot':
          c.scale(p.flip ?? 1, 1)
          c.fillStyle = p.color
          paw(c, p.size)
          break
      }
      c.restore()
    }
    c.globalAlpha = 1
  }
}

function heart(c: CanvasRenderingContext2D): void {
  c.beginPath()
  c.moveTo(0, 5)
  c.bezierCurveTo(-9, -2, -7, -11, 0, -6)
  c.bezierCurveTo(7, -11, 9, -2, 0, 5)
  c.fill()
}

function star(c: CanvasRenderingContext2D, r: number): void {
  c.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const rr = i % 2 ? r * 0.45 : r
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  c.closePath()
  c.fill()
}

function paw(c: CanvasRenderingContext2D, s: number): void {
  c.beginPath()
  c.ellipse(0, 0, s * 0.42, s * 0.3, 0, 0, Math.PI * 2)
  c.fill()
  for (const [dx, dy] of [
    [-0.38, -0.42],
    [-0.12, -0.6],
    [0.16, -0.58],
    [0.4, -0.38]
  ]) {
    c.beginPath()
    c.ellipse(dx * s, dy * s, s * 0.12, s * 0.15, 0, 0, Math.PI * 2)
    c.fill()
  }
}
