// 앱 아이콘 (1024×1024): 둥근 사각형 + 기본 캐릭터(원본 시트의 서기 포즈를 크게)
import sheetUrl from '@/assets/pets/default-sheet.webp'

export default async function (root: HTMLElement): Promise<void> {
  document.body.style.background = 'transparent'
  const S = 1024
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  cv.style.width = '512px'
  root.appendChild(cv)
  const c = cv.getContext('2d')!
  const m = 100
  const r = 185
  c.save()
  c.shadowColor = 'rgba(0,0,0,0.28)'
  c.shadowBlur = 28
  c.shadowOffsetY = 12
  c.beginPath()
  c.roundRect(m, m, S - m * 2, S - m * 2, r)
  const g = c.createLinearGradient(0, m, 0, S - m)
  g.addColorStop(0, '#ffe7b3')
  g.addColorStop(1, '#ffb347')
  c.fillStyle = g
  c.fill()
  c.restore()
  c.save()
  c.beginPath()
  c.roundRect(m, m, S - m * 2, S - m * 2, r)
  c.clip()
  const img = new Image()
  img.src = sheetUrl
  await img.decode()
  // 원본 시트 첫 칸(서기)에서 그림이 있는 곳만 찾아 크게
  const cw = img.width / 4
  const ch = img.height / 3
  const t = document.createElement('canvas')
  t.width = cw
  t.height = ch
  const tc = t.getContext('2d')!
  tc.drawImage(img, 0, 0, cw, ch, 0, 0, cw, ch)
  const d = tc.getImageData(0, 0, cw, ch).data
  let x0 = cw, y0 = ch, x1 = 0, y1 = 0
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (d[(y * cw + x) * 4 + 3] > 30) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const k = Math.min(660 / bw, 700 / bh)
  c.imageSmoothingQuality = 'high'
  c.fillStyle = 'rgba(160, 80, 10, 0.18)'
  c.beginPath()
  c.ellipse(S / 2, 140 + 700 + 10, (bw * k) / 2.3, 34, 0, 0, Math.PI * 2)
  c.fill()
  c.drawImage(t, x0, y0, bw, bh, S / 2 - (bw * k) / 2, 140 + 700 - bh * k, bw * k, bh * k)
  c.restore()
  ;(window as unknown as { __labDone: boolean }).__labDone = true
}
