// 아주 작은 PDF 쓰개 — 쪽마다 JPG 한 장 (DCTDecode). 쪽을 받는 대로 파일에 써서 메모리를 덜 쓴다
import { open, type FileHandle } from 'fs/promises'

export const A4 = { w: 595.28, h: 841.89 }
/** PDF 쪽 한 변 최대 (200인치) */
const MAX_PT = 14400

export interface PdfPage {
  jpeg: Uint8Array
  /** 그림 픽셀 크기 */
  px: number
  py: number
}

export class PdfWriter {
  private fh: FileHandle | null = null
  private pos = 0
  private offsets: number[] = []
  private kids: number[] = []

  constructor(
    private path: string,
    private fitA4: boolean
  ) {}

  private async put(s: string | Uint8Array): Promise<void> {
    const b = typeof s === 'string' ? Buffer.from(s, 'latin1') : s
    await this.fh!.write(b)
    this.pos += b.length
  }

  private async obj(n: number, body: string | Uint8Array[]): Promise<void> {
    this.offsets[n] = this.pos
    await this.put(`${n} 0 obj\n`)
    if (typeof body === 'string') await this.put(body)
    else for (const b of body) await this.put(b)
    await this.put('\nendobj\n')
  }

  async open(): Promise<void> {
    this.fh = await open(this.path, 'wx')
    // 1 = 목차(Catalog), 2 = 쪽 묶음(Pages) — 맨 끝에 쓴다
    await this.put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  }

  async addPage(p: PdfPage): Promise<void> {
    const n = 3 + this.kids.length * 3
    const [img, content, page] = [n, n + 1, n + 2]
    let pw: number
    let ph: number
    let dw: number
    let dh: number
    if (this.fitA4) {
      pw = A4.w
      ph = A4.h
      const margin = 28
      const k = Math.min((pw - margin * 2) / p.px, (ph - margin * 2) / p.py)
      dw = p.px * k
      dh = p.py * k
    } else {
      // 96dpi 화면 기준 (1px = 0.75pt)
      const k = Math.min(0.75, MAX_PT / Math.max(p.px, p.py))
      pw = dw = p.px * k
      ph = dh = p.py * k
    }
    const x = (pw - dw) / 2
    const y = (ph - dh) / 2
    const f = (v: number): string => v.toFixed(2)

    await this.obj(img, [
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${p.px} /Height ${p.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, 'latin1'),
      p.jpeg,
      Buffer.from('\nendstream', 'latin1')
    ])
    const draw = `q ${f(dw)} 0 0 ${f(dh)} ${f(x)} ${f(y)} cm /Im0 Do Q`
    await this.obj(content, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)
    await this.obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`)
    this.kids.push(page)
  }

  async close(): Promise<void> {
    await this.obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
    await this.obj(2, `<< /Type /Pages /Kids [${this.kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${this.kids.length} >>`)
    const size = 3 + this.kids.length * 3
    const xref = this.pos
    let t = `xref\n0 ${size}\n0000000000 65535 f \n`
    for (let n = 1; n < size; n++) t += `${String(this.offsets[n]).padStart(10, '0')} 00000 n \n`
    t += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    await this.put(t)
    await this.fh!.close()
    this.fh = null
  }

  /** 실패했을 때 파일 닫기 (지우는 건 부르는 쪽) */
  async abort(): Promise<void> {
    await this.fh?.close().catch(() => undefined)
    this.fh = null
  }
}
