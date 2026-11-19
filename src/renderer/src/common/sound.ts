// 효과음 — WebAudio 로 합성 (파일 없음)

let ctx: AudioContext | null = null
let enabled = true

export function setSound(on: boolean): void {
  enabled = on
}

function ac(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return ctx
}

function tone(freq: number, dur: number, o: { type?: OscillatorType; vol?: number; to?: number; delay?: number; attack?: number } = {}): void {
  const c = ac()
  if (!c) return
  const t = c.currentTime + (o.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur)
  const v = o.vol ?? 0.12
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + (o.attack ?? 0.01))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function noise(dur: number, o: { vol?: number; delay?: number; freq?: number } = {}): void {
  const c = ac()
  if (!c) return
  const t = c.currentTime + (o.delay ?? 0)
  const n = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, n, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = o.freq ?? 1800
  const g = c.createGain()
  g.gain.value = o.vol ?? 0.15
  src.connect(f).connect(g).connect(c.destination)
  src.start(t)
}

export const sfx = {
  squeak(): void {
    tone(900, 0.12, { type: 'triangle', to: 1600, vol: 0.1 })
    tone(1500, 0.1, { type: 'triangle', to: 1100, vol: 0.08, delay: 0.1 })
  },
  boing(): void {
    tone(220, 0.25, { type: 'sine', to: 420, vol: 0.14 })
  },
  thud(): void {
    tone(140, 0.12, { type: 'sine', to: 70, vol: 0.18 })
  },
  pop(): void {
    tone(600, 0.08, { type: 'sine', to: 1400, vol: 0.12 })
  },
  munch(): void {
    for (let i = 0; i < 3; i++) noise(0.06, { delay: i * 0.13, vol: 0.12, freq: 900 + i * 200 })
  },
  purr(): void {
    for (let i = 0; i < 6; i++) tone(58, 0.14, { type: 'sawtooth', vol: 0.03, delay: i * 0.16, attack: 0.05 })
  },
  ding(): void {
    tone(1318, 0.35, { type: 'sine', vol: 0.1 })
    tone(1760, 0.45, { type: 'sine', vol: 0.08, delay: 0.09 })
  },
  coin(): void {
    tone(988, 0.08, { type: 'square', vol: 0.05 })
    tone(1319, 0.25, { type: 'square', vol: 0.05, delay: 0.08 })
  },
  party(): void {
    const notes = [523, 659, 784, 1047, 784, 1047]
    notes.forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.09, delay: i * 0.11 }))
    for (let i = 0; i < 4; i++) noise(0.25, { delay: 0.7 + i * 0.12, vol: 0.08, freq: 3000 })
  },
  whoosh(): void {
    noise(0.3, { vol: 0.1, freq: 700 })
  },
  beat(i: number): void {
    if (i % 2 === 0) tone(110, 0.12, { type: 'sine', to: 55, vol: 0.18 })
    else noise(0.05, { vol: 0.08, freq: 5000 })
  }
}
