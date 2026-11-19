// 기본 캐릭터 시트 → 아틀라스 (assets/pets/default.png 만들기). MYPET_LAB=atlas 로 첫 캔버스를 저장
import sheetUrl from '@/assets/pets/default-sheet.webp'
import { processSheet } from '@/common/sheet'

export default async function (root: HTMLElement): Promise<void> {
  const img = new Image()
  img.src = sheetUrl
  await img.decode()
  const r = await processSheet(img, {})
  console.log('method', r.method, 'bg', JSON.stringify(r.bg), 'warnings', JSON.stringify(r.warnings))
  r.atlas.style.background = 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 20px 20px'
  root.appendChild(r.atlas)
  ;(window as unknown as { __labDone: boolean }).__labDone = true
}
