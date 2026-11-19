// 메인 ↔ 숨은 작업 창(tools.html) 사이의 일 주고받기 규격 (파일 도우미 내부용)
// 채널: tools:job (메인→창) · tools:ready / tools:result (창→메인, invoke) · tools:progress (창→메인, send)

export type ImgType = 'png' | 'jpeg' | 'webp'

export interface ImageOps {
  /** 가운데 자르기 비율 (가로/세로) */
  crop?: number
  /** 배율 (0.5 = 절반) */
  scale?: number
  /** 가로를 이 값 이하로 (늘리지는 않는다) */
  maxWidth?: number
  /** 긴 변을 이 값 이하로 */
  maxEdge?: number
  /** 시계 방향 각도 */
  rotate?: 0 | 90 | 180 | 270
  flip?: boolean
  gray?: boolean
}

export interface EncodeOpts {
  type: ImgType
  /** jpeg·webp 화질 0~1 — 여러 개면 maxBytes 보다 작아질 때까지 차례로 해 본다 */
  quality?: number[]
  maxBytes?: number
}

export type WorkerJob =
  | { op: 'image'; bytes: Uint8Array; ops: ImageOps; out: EncodeOpts }
  | { op: 'stitch'; images: Uint8Array[]; maxHeight: number }
  | { op: 'gif'; bytes: Uint8Array; mime: string; seconds: number; size: number; fps: number }

export interface WorkerOut {
  bytes: Uint8Array
  width: number
  height: number
  type: string
  /** 원본(방향 반영) 크기 */
  srcWidth?: number
  srcHeight?: number
  /** maxBytes 보다 작게 못 만들었으면 true */
  notSmaller?: boolean
  frames?: number
  seconds?: number
}

export type WorkerReply = { ok: true; out: WorkerOut } | { ok: false; error: string }

export interface WorkerProgress {
  done: number
  total: number
}

/** preload 가 작업 창에 내주는 API (window.toolsWorker) */
export interface ToolsWorkerApi {
  onJob(cb: (id: number, job: WorkerJob) => void): void
  progress(id: number, p: WorkerProgress): void
  result(id: number, r: WorkerReply): Promise<void>
  ready(): Promise<void>
}
