// GPT 시트 가져오기 확인: 기본 펫 아틀라스로 "GPT 같은" 시트(자홍·흰·투명 배경, 위치·크기 흔들림, 노이즈)를 만들어
// processSheet 를 돌리고 입력·결과를 나란히 보여 준다.
import { drawBuiltinAtlas , type DrawnPetId } from '@/common/petart'
import { drawExampleSheet, processSheet } from '@/common/sheet'
import { CELL, COLS } from '@shared/pet'

type Bg = 'magenta' | 'white' | 'alpha'

function rand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function fakeSheet(id: DrawnPetId, bg: Bg, seed: number, W = 1536, H = 1024): HTMLCanvasElement {
  const atlas = drawBuiltinAtlas(id)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  if (bg === 'magenta') {
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, '#ff00ff')
    g.addColorStop(1, '#f20af0')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  } else if (bg === 'white') {
    ctx.fillStyle = '#fdfdfd'
    ctx.fillRect(0, 0, W, H)
  }
  const r = rand(seed)
  const sw = W / 4
  const sh = H / 3
  for (let i = 0; i < 12; i++) {
    const s = 1.15 + r() * 0.2
    const x = (i % 4) * sw + sw / 2 + (r() - 0.5) * 30
    const y = Math.floor(i / 4) * sh + sh / 2 + (r() - 0.5) * 24
    ctx.drawImage(atlas, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL, x - (CELL * s) / 2, y - (CELL * s) / 2 - 10, CELL * s, CELL * s)
  }
  if (bg !== 'alpha') {
    // 압축 노이즈 흉내
    const id2 = ctx.getImageData(0, 0, W, H)
    const d = id2.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * 14
      d[i] += n
      d[i + 1] += n * 0.6
      d[i + 2] += n
    }
    ctx.putImageData(id2, 0, 0)
  }
  return c
}

function panel(root: HTMLElement, title: string, canvases: HTMLCanvasElement[]): void {
  const box = document.createElement('div')
  box.style.margin = '6px'
  const h = document.createElement('div')
  h.textContent = title
  h.style.font = '13px sans-serif'
  box.appendChild(h)
  const row = document.createElement('div')
  row.style.display = 'flex'
  row.style.gap = '6px'
  for (const cv of canvases) {
    const wrap = document.createElement('div')
    wrap.style.background = 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 14px 14px'
    cv.style.width = '520px'
    cv.style.display = 'block'
    wrap.appendChild(cv)
    row.appendChild(wrap)
  }
  box.appendChild(row)
  root.appendChild(box)
}

export default async function (root: HTMLElement): Promise<void> {
  const cases: [DrawnPetId, Bg, number, number][] = [
    ['builtin:cheese', 'magenta', 1536, 1024],
    ['builtin:mochi', 'white', 1536, 1024],
    ['builtin:kong', 'alpha', 1536, 1024],
    ['builtin:mochi', 'magenta', 2048, 2048]
  ]
  let n = 0
  const zoom: HTMLCanvasElement[] = []
  for (const [id, bg, w, h] of cases) {
    const input = fakeSheet(id, bg, 7 + n++, w, h)
    const t0 = performance.now()
    const res = await processSheet(input)
    const ms = performance.now() - t0
    const info = `${id} ${bg} ${w}x${h}: ${ms.toFixed(0)}ms method=${res.method} bg=${JSON.stringify(res.bg)} warnings=${JSON.stringify(res.warnings)}`
    console.log(info)
    if (w === h) continue
    panel(root, info, [input, res.atlas])
    // 테두리 확인: 첫 줄을 어두운 배경에 크게
    const z = document.createElement('canvas')
    z.width = 1024
    z.height = 256
    const zc = z.getContext('2d')!
    zc.fillStyle = '#1d2230'
    zc.fillRect(0, 0, 1024, 256)
    zc.drawImage(res.atlas, 0, 0, 1024, 256, 0, 0, 1024, 256)
    z.dataset.zoom = '1'
    zoom.push(z)
  }
  // 겹쳐서 나누기 어려운 시트 → grid 로 가는지
  const tight = fakeSheet('builtin:cheese', 'magenta', 3, 1100, 760)
  const r2 = await processSheet(tight, { flipWalk: true })
  console.log(`tight: method=${r2.method} warnings=${JSON.stringify(r2.warnings)}`)
  panel(root, `tight 1100x760 flipWalk: ${r2.method}`, [tight, r2.atlas])
  for (const z of zoom) {
    z.style.width = '1024px'
    root.appendChild(z)
  }
  panel(root, 'example sheet', [drawExampleSheet(drawBuiltinAtlas('builtin:cheese'), true)])
  // 그림이 화면에 칠해진 뒤에 찍히도록 몇 프레임 기다린다
  await new Promise((r) => setTimeout(r, 300))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  ;(window as unknown as { __labDone: boolean }).__labDone = true
}
