// 기본 캐릭터 아틀라스 (앱에 들어 있는 PNG)
import { ATLAS_H, ATLAS_W, BUILTIN_PETS } from '@shared/pet'
import merongUrl from '@/assets/pets/default.png'

const URLS: Record<string, string> = { 'builtin:merong': merongUrl }

export function isBuiltin(id: string): boolean {
  return BUILTIN_PETS.some((p) => p.id === id)
}

const cache = new Map<string, Promise<HTMLCanvasElement>>()

/** 기본 캐릭터 아틀라스 (없는 아이디면 첫 번째 기본 캐릭터) */
export function builtinAtlas(id: string): Promise<HTMLCanvasElement> {
  const key = URLS[id] ? id : BUILTIN_PETS[0].id
  let p = cache.get(key)
  if (!p) {
    p = (async () => {
      const img = new Image()
      img.src = URLS[key]
      await img.decode()
      const cv = document.createElement('canvas')
      cv.width = ATLAS_W
      cv.height = ATLAS_H
      cv.getContext('2d')!.drawImage(img, 0, 0, ATLAS_W, ATLAS_H)
      return cv
    })()
    cache.set(key, p)
  }
  return p
}
