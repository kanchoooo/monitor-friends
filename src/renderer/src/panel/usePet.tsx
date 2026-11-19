// 패널에서 펫 그림 쓰기: 아틀라스 불러오기(캐시) + 움직이는 미리 보기
import { useEffect, useRef, useState } from 'react'
import type { Pose } from '@shared/pet'
import { builtinAtlas, isBuiltin } from '@/common/builtin'
import { drawPose } from '@/common/sprite'

const cache = new Map<string, Promise<HTMLCanvasElement>>()

export function atlasFor(id: string): Promise<HTMLCanvasElement> {
  let p = cache.get(id)
  if (!p) {
    p = (async () => {
      if (isBuiltin(id)) return builtinAtlas(id)
      const png = await window.api.getPetAtlas(id)
      if (!png) return builtinAtlas('')
      const bmp = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }))
      const cv = document.createElement('canvas')
      cv.width = 1024
      cv.height = 768
      cv.getContext('2d')!.drawImage(bmp, 0, 0, 1024, 768)
      return cv
    })()
    cache.set(id, p)
  }
  return p
}

export function forgetAtlas(id: string): void {
  cache.delete(id)
}

export function useAtlas(id: string): HTMLCanvasElement | null {
  const [a, setA] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    let alive = true
    void atlasFor(id).then((x) => alive && setA(x))
    return () => {
      alive = false
    }
  }, [id])
  return a
}

/** 정해진 포즈 하나 */
export function PetThumb({ atlas, pose = 'stand', size }: { atlas: HTMLCanvasElement | null; pose?: Pose; size: number }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv || !atlas) return
    const dpr = window.devicePixelRatio || 1
    cv.width = size * dpr
    cv.height = size * dpr
    const c = cv.getContext('2d')!
    c.clearRect(0, 0, cv.width, cv.height)
    drawPose(c, { id: '', atlas, box: {} as never }, pose, 0, 0, cv.width)
  }, [atlas, pose, size])
  return <canvas ref={ref} style={{ width: size, height: size }} />
}

const SHOW: [Pose, number][] = [
  ['stand', 1.6],
  ['blink', 0.15],
  ['stand', 1],
  ['wave', 1.4],
  ['walk1', 0.22],
  ['walk2', 0.22],
  ['walk1', 0.22],
  ['walk2', 0.22],
  ['happy', 1.2],
  ['sit', 1.6],
  ['work', 1.6],
  ['eat', 1.2],
  ['sleep', 1.8],
  ['surprised', 0.9],
  ['angry', 1]
]

/** 포즈를 돌아가며 보여 주는 미리 보기 */
export function PetLoop({ atlas, size, poses = SHOW }: { atlas: HTMLCanvasElement | null; size: number; poses?: [Pose, number][] }): React.JSX.Element {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setI((x) => (x + 1) % poses.length), poses[i % poses.length][1] * 1000)
    return () => clearTimeout(t)
  }, [i, poses])
  return <PetThumb atlas={atlas} pose={poses[i % poses.length][0]} size={size} />
}

/** 1초에 여러 번 다시 그리기 (실시간 금액) */
export function useTicker(ms: number): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms)
    return () => clearInterval(t)
  }, [ms])
  return n
}
