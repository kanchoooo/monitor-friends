// 투명 전체화면 오버레이 (디스플레이마다 하나) — 펫 세상을 돌린다
import './overlay.css'
import { loadSprite } from '@/common/sprite'
import { World } from './world'

const api = window.overlayApi
const stage = document.getElementById('stage')!
const world = new World(stage, api)
world.platform = api.platform
let debug = false
;(window as unknown as { __world: World }).__world = world

// ── 맥: 누르기·떼기는 DOM 으로 (트랙패드 탭처럼 아주 짧은 클릭도 받으려고). 윈도우는 메인이 읽은 버튼 상태로
if (api.platform === 'darwin') {
  window.addEventListener('pointerdown', (e) => {
    world.domDown(e.clientX, e.clientY, e.button)
    kick()
  })
  window.addEventListener('pointerup', (e) => world.domUp(e.clientX, e.clientY))
}
window.addEventListener('contextmenu', (e) => e.preventDefault())

// ── 파일 끌어오기: 펫 위에 떨어뜨리면 도와준다
window.addEventListener('dragover', (e) => {
  e.preventDefault()
  const over = world.dragOver(e.clientX, e.clientY)
  if (e.dataTransfer) e.dataTransfer.dropEffect = over ? 'copy' : 'none'
  kick()
})
window.addEventListener('dragleave', () => world.dragLeave())
window.addEventListener('drop', (e) => {
  e.preventDefault()
  const files = [...(e.dataTransfer?.files ?? [])]
  if (!world.dragOver(e.clientX, e.clientY)) {
    world.dragLeave()
    return
  }
  world.dropped(api.pathsOf(files))
  kick()
})

// ── 루프: 바쁘면 매 프레임, 한가하면 초당 15번
let raf = 0
let timer: ReturnType<typeof setTimeout> | null = null
let last = performance.now()

function frame(): void {
  raf = 0
  timer = null
  const now = performance.now()
  const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000))
  last = now
  world.update(dt)
  schedule()
}

function schedule(): void {
  if (raf || timer) return
  if (!world.pet && !world.fx.active) return
  if (world.busy) raf = requestAnimationFrame(frame)
  else timer = setTimeout(frame, 66)
}

/** 무슨 일이 생기면 한가할 때 타이머(66ms)를 기다리지 않고 바로 다음 화면에 */
function kick(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!raf && (world.pet || world.fx.active)) raf = requestAnimationFrame(frame)
}

api.onInit((v) => {
  debug = v.debug
  world.nowOffset = v.nowOffset
  world.resize(v.width, v.height)
  document.body.classList.toggle('debug', debug)
  kick()
})
api.onPerches((v) => {
  world.setPerches(v.perches)
  if (debug) drawDebug(v.perches)
  kick()
})
api.onInput((v) => {
  world.setInput(v)
  if (world.pet) schedule()
})
api.onSettings((s) => {
  world.setSettings(s)
  kick()
})
api.onLive((l) => {
  world.setLive(l)
  kick()
})
let petReq = 0
api.onPet(async (list) => {
  const n = ++petReq
  const sps = await Promise.all(
    list.map((d) =>
      loadSprite(d.id, d.atlas).catch((err) => {
        console.error('[pet] load failed', err)
        return loadSprite('builtin:merong', null)
      })
    )
  )
  if (n !== petReq) return
  world.setSprites(sps)
  kick()
})
api.onCommand((cmd) => {
  world.command(cmd)
  kick()
})

// ── 디버그 배경 (헤드리스 테스트): 가짜 창을 그린다
let debugCv: HTMLCanvasElement | null = null
function drawDebug(perches: { wid: number; x0: number; x1: number; y: number }[]): void {
  if (!debugCv) {
    debugCv = document.createElement('canvas')
    debugCv.id = 'debug-bg'
    document.body.insertBefore(debugCv, stage)
  }
  const cv = debugCv
  cv.width = world.w
  cv.height = world.h
  const c = cv.getContext('2d')!
  const g = c.createLinearGradient(0, 0, 0, world.h)
  g.addColorStop(0, '#3d6db5')
  g.addColorStop(1, '#8fb4e3')
  c.fillStyle = g
  c.fillRect(0, 0, world.w, world.h)
  const wins = new Map<number, typeof perches>()
  for (const p of perches) if (p.wid) wins.set(p.wid, [...(wins.get(p.wid) ?? []), p])
  for (const [, ps] of [...wins].reverse()) {
    const x0 = Math.min(...ps.map((p) => p.x0)) - 18
    const x1 = Math.max(...ps.map((p) => p.x1)) + 18
    const y = ps[0].y
    c.fillStyle = '#f6f7f9'
    c.fillRect(x0, y, x1 - x0, 300)
    c.fillStyle = '#e3e6eb'
    c.fillRect(x0, y, x1 - x0, 28)
    c.strokeStyle = '#9aa0ab'
    c.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, 299)
    c.fillStyle = '#c9ced6'
    for (let i = 0; i < 8; i++) c.fillRect(x0 + 20, y + 50 + i * 26, (x1 - x0 - 40) * (0.4 + ((i * 37) % 50) / 100), 10)
  }
  const floor = perches.find((p) => p.wid === 0)
  if (floor) {
    c.fillStyle = 'rgba(30,30,40,0.55)'
    c.fillRect(0, floor.y, world.w, world.h - floor.y)
  }
}

api.ready()
