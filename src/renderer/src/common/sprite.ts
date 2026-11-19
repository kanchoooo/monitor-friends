// 펫 아틀라스 불러오기 + 포즈별 실제 그림 영역(투명하지 않은 곳) 계산
import { ATLAS_H, ATLAS_W, CELL, COLS, POSES, type Pose } from '@shared/pet'
import { builtinAtlas } from './builtin'

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface PetSprite {
  id: string
  atlas: HTMLCanvasElement
  /** 포즈별 그림 영역 (칸 좌표) */
  box: Record<Pose, Box>
}

export async function loadSprite(id: string, png: Uint8Array | null): Promise<PetSprite> {
  let atlas: HTMLCanvasElement
  if (png) {
    const bmp = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }))
    atlas = document.createElement('canvas')
    atlas.width = ATLAS_W
    atlas.height = ATLAS_H
    atlas.getContext('2d')!.drawImage(bmp, 0, 0, ATLAS_W, ATLAS_H)
    bmp.close()
  } else {
    atlas = await builtinAtlas(id)
  }
  return { id, atlas, box: measure(atlas) }
}

function measure(atlas: HTMLCanvasElement): Record<Pose, Box> {
  const c = atlas.getContext('2d', { willReadFrequently: true })!
  const data = c.getImageData(0, 0, ATLAS_W, ATLAS_H).data
  const out = {} as Record<Pose, Box>
  POSES.forEach((p, i) => {
    const cx = (i % COLS) * CELL
    const cy = Math.floor(i / COLS) * CELL
    let x0 = CELL
    let y0 = CELL
    let x1 = 0
    let y1 = 0
    for (let y = 0; y < CELL; y += 2) {
      const row = ((cy + y) * ATLAS_W + cx) * 4
      for (let x = 0; x < CELL; x += 2) {
        if (data[row + x * 4 + 3] > 40) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    out[p] = x1 > x0 ? { x0, y0, x1: x1 + 2, y1: y1 + 2 } : { x0: CELL * 0.25, y0: CELL * 0.2, x1: CELL * 0.75, y1: CELL * 0.95 }
  })
  return out
}

/** 한 포즈를 캔버스에 그리기 (w×w 정사각형 = 한 칸) */
export function drawPose(c: CanvasRenderingContext2D, sp: PetSprite, pose: Pose, x: number, y: number, size: number): void {
  const i = POSES.indexOf(pose)
  c.drawImage(sp.atlas, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL, x, y, size, size)
}
