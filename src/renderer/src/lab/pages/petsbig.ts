// 기본 펫 아틀라스 실제 크기 (칸 경계 표시)
import { DRAWN_PETS, drawBuiltinAtlas } from '@/common/petart'
import { CELL, FEET_Y, STAND_H } from '@shared/pet'

export default async function (root: HTMLElement): Promise<void> {
  for (const p of DRAWN_PETS) {
    const atlas = drawBuiltinAtlas(p.id)
    const ctx = atlas.getContext('2d')!
    ctx.globalCompositeOperation = 'destination-over'
    ctx.strokeStyle = 'rgba(0,0,255,0.25)'
    for (let x = 0; x < 4; x++)
      for (let y = 0; y < 3; y++) {
        ctx.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1)
        ctx.beginPath()
        ctx.moveTo(x * CELL, y * CELL + FEET_Y + 0.5)
        ctx.lineTo(x * CELL + CELL, y * CELL + FEET_Y + 0.5)
        ctx.moveTo(x * CELL, y * CELL + FEET_Y - STAND_H + 0.5)
        ctx.lineTo(x * CELL + CELL, y * CELL + FEET_Y - STAND_H + 0.5)
        ctx.stroke()
      }
    ctx.fillStyle = '#e9eef5'
    ctx.fillRect(0, 0, 1024, 768)
    atlas.style.display = 'block'
    root.appendChild(atlas)
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  ;(window as unknown as { __labDone: boolean }).__labDone = true
}
