import { nativeImage, NativeImage } from 'electron'

// 트레이 아이콘: 발바닥 도트. 런타임에 비트맵으로 만든다 ('#' = 칠함)
const PAW_16 = [
  '................',
  '.....##..##.....',
  '....####.####...',
  '....####.####...',
  '.##..##...##.##.',
  '####.......#####',
  '####..###..####.',
  '.##..#####..##..',
  '....#######.....',
  '...#########....',
  '...#########....',
  '...#########....',
  '....###.###.....',
  '................',
  '................',
  '................'
]

function rasterize(rows: string[], scale: number, rgb: [number, number, number]): Buffer {
  const h = rows.length
  const w = rows[0].length
  const W = w * scale
  const H = h * scale
  const buf = Buffer.alloc(W * H * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rows[y][x] !== '#') continue
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const i = ((y * scale + sy) * W + (x * scale + sx)) * 4
          // createFromBitmap 은 BGRA
          buf[i] = rgb[2]
          buf[i + 1] = rgb[1]
          buf[i + 2] = rgb[0]
          buf[i + 3] = 255
        }
      }
    }
  }
  return buf
}

export function trayIcon(): NativeImage {
  const isMac = process.platform === 'darwin'
  const rgb: [number, number, number] = isMac ? [0, 0, 0] : [240, 150, 70]
  const img = nativeImage.createEmpty()
  img.addRepresentation({ scaleFactor: 1, width: 16, height: 16, buffer: rasterize(PAW_16, 1, rgb) })
  img.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: rasterize(PAW_16, 2, rgb) })
  if (isMac) img.setTemplateImage(true)
  return img
}
