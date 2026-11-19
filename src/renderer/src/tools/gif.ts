// 짧은 동영상 → GIF (앞부분만). <video> 로 장면을 하나씩 찾아가 캔버스에 그리고 gifenc 로 묶는다
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import type { WorkerOut, WorkerProgress } from '@shared/toolJobs'

const UNSUPPORTED = '이 동영상은 못 열었어 (mp4·mov·webm 중 H.264·VP9 같은 흔한 형식만 돼)'

function waitFor(v: HTMLVideoElement, ok: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void): void => {
      clearTimeout(t)
      v.removeEventListener(ok, onOk)
      v.removeEventListener('error', onErr)
      fn()
    }
    const onOk = (): void => done(resolve)
    const onErr = (): void => done(() => reject(new Error(UNSUPPORTED)))
    const t = setTimeout(() => done(() => reject(new Error(ok === 'seeked' ? '동영상 장면을 못 찾았어 (시간이 너무 걸려)' : UNSUPPORTED))), ms)
    v.addEventListener(ok, onOk)
    v.addEventListener('error', onErr)
  })
}

async function seek(v: HTMLVideoElement, t: number): Promise<void> {
  const p = waitFor(v, 'seeked', 8000)
  v.currentTime = t
  await p
}

export async function runGif(
  job: { bytes: Uint8Array; mime: string; seconds: number; size: number; fps: number },
  onProgress: (p: WorkerProgress) => void
): Promise<WorkerOut> {
  const url = URL.createObjectURL(new Blob([job.bytes as Uint8Array<ArrayBuffer>], { type: job.mime }))
  const v = document.createElement('video')
  v.muted = true
  v.preload = 'auto'
  v.playsInline = true
  try {
    const meta = waitFor(v, 'loadeddata', 15000)
    v.src = url
    await meta
    if (!v.videoWidth || !v.videoHeight) throw new Error(UNSUPPORTED)
    // MediaRecorder 로 만든 webm 은 길이가 Infinity — 끝으로 보내 보면 알게 된다
    let dur = v.duration
    if (!Number.isFinite(dur)) {
      await seek(v, 1e7).catch(() => undefined)
      dur = v.duration
    }
    if (!Number.isFinite(dur) || dur <= 0) dur = job.seconds
    const len = Math.min(job.seconds, dur)
    const n = Math.max(1, Math.floor(len * job.fps))

    // 긴 변을 size 로 (늘리지 않음), 짝수로
    const k = Math.min(1, job.size / Math.max(v.videoWidth, v.videoHeight))
    const w = Math.max(2, Math.round((v.videoWidth * k) / 2) * 2)
    const h = Math.max(2, Math.round((v.videoHeight * k) / 2) * 2)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('그림판을 못 만들었어')
    ctx.imageSmoothingQuality = 'high'

    const total = n * 2
    const frames: Uint8ClampedArray[] = []
    for (let i = 0; i < n; i++) {
      // 마지막 장면을 살짝 앞에서 잡는다 (끝에 딱 맞추면 빈 장면이 나오기도 해서)
      await seek(v, Math.min(i / job.fps + 0.001, Math.max(0, dur - 0.05)))
      ctx.drawImage(v, 0, 0, w, h)
      frames.push(ctx.getImageData(0, 0, w, h).data)
      if (i % 5 === 4) onProgress({ done: i + 1, total })
    }

    // 모든 장면에서 고르게 뽑은 픽셀로 공통 팔레트 하나 (깜빡임 없게)
    const step = Math.max(1, Math.ceil((w * h * n) / 1_000_000))
    const sample = new Uint8ClampedArray((Math.ceil((w * h) / step) * n) * 4)
    let si = 0
    for (const f of frames) {
      for (let p = 0; p < w * h && si + 4 <= sample.length; p += step) {
        sample[si++] = f[p * 4]
        sample[si++] = f[p * 4 + 1]
        sample[si++] = f[p * 4 + 2]
        sample[si++] = 255
      }
    }
    const palette = quantize(sample.subarray(0, si), 256)

    const gif = GIFEncoder()
    const delay = Math.round(1000 / job.fps)
    for (let i = 0; i < n; i++) {
      const index = applyPalette(frames[i], palette)
      gif.writeFrame(index, w, h, i === 0 ? { palette, delay, repeat: 0 } : { delay })
      frames[i] = new Uint8ClampedArray(0)
      if (i % 5 === 4) onProgress({ done: n + i + 1, total })
    }
    gif.finish()
    onProgress({ done: total, total })
    return { bytes: gif.bytes(), width: w, height: h, type: 'gif', frames: n, seconds: n / job.fps }
  } finally {
    v.removeAttribute('src')
    v.load()
    URL.revokeObjectURL(url)
  }
}
