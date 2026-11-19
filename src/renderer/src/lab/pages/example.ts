// 펫 만들기 안내용 예시 시트 (docs/img/example-sheet.png)
import { drawBuiltinAtlas } from '@/common/petart'
import { drawExampleSheet } from '@/common/sheet'

export default function (root: HTMLElement): void {
  const cv = drawExampleSheet(drawBuiltinAtlas('builtin:cheese'), true)
  cv.style.width = '100%'
  root.appendChild(cv)
  ;(window as unknown as { __labDone: boolean }).__labDone = true
}
