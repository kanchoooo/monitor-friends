// 숨은 작업 창 — 메인이 보낸 이미지·동영상 바이트를 그리고 다시 인코딩해 돌려준다
import type { ToolsWorkerApi, WorkerJob, WorkerOut } from '@shared/toolJobs'
import { runImage, runStitch } from './image'
import { runGif } from './gif'

declare global {
  interface Window {
    toolsWorker: ToolsWorkerApi
  }
}

const api = window.toolsWorker

async function handle(id: number, job: WorkerJob): Promise<void> {
  try {
    let out: WorkerOut
    if (job.op === 'image') out = await runImage(job.bytes, job.ops, job.out)
    else if (job.op === 'stitch') out = await runStitch(job.images, job.maxHeight)
    else out = await runGif(job, (p) => api.progress(id, p))
    await api.result(id, { ok: true, out })
  } catch (e) {
    await api.result(id, { ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}

api.onJob((id, job) => void handle(id, job))
void api.ready()
