// 기본 펫 3마리 아틀라스 확인 (체크무늬·어두운 배경, 작은 크기 줄)
import { DRAWN_PETS, drawBuiltinAtlas, drawPetThumb } from '@/common/petart'
import { POSES } from '@shared/pet'

export default async function (root: HTMLElement): Promise<void> {
  root.style.padding = '8px'
  for (const p of DRAWN_PETS) {
    const atlas = drawBuiltinAtlas(p.id)
    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.gap = '8px'
    row.style.marginBottom = '8px'
    const a = document.createElement('div')
    a.style.background = 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 16px 16px'
    atlas.style.width = '512px'
    a.appendChild(atlas)
    const b = document.createElement('div')
    b.style.background = '#1d2230'
    const atlas2 = drawBuiltinAtlas(p.id)
    atlas2.style.width = '512px'
    b.appendChild(atlas2)
    row.append(a, b)
    root.appendChild(row)
  }
  // 작게 (펫 키 75px 근처) — 어두운 / 밝은 / 알록달록 배경
  for (const bg of ['#2b2f3a', '#ffffff', 'linear-gradient(90deg,#3b82f6,#f59e0b,#10b981)']) {
    const strip = document.createElement('div')
    strip.style.background = bg
    strip.style.display = 'flex'
    strip.style.flexWrap = 'wrap'
    strip.style.marginBottom = '4px'
    for (const p of DRAWN_PETS) {
      const atlas = drawBuiltinAtlas(p.id)
      for (const pose of POSES) {
        const t = drawPetThumb(atlas, pose, 128)
        t.style.width = '96px'
        strip.appendChild(t)
      }
    }
    root.appendChild(strip)
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  ;(window as unknown as { __labDone: boolean }).__labDone = true
}
