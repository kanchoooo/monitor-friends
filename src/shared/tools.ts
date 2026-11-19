// 파일 도우미 — 펫에게 파일을 끌어다 주면 고를 수 있는 도구 목록 (오버레이 메뉴·패널이 같이 쓴다)
// 실제 처리는 src/main/tools/ (메인) + 숨은 작업 창 src/renderer/tools.html (이미지 그리기·인코딩)

export type FileKind = 'image' | 'heic' | 'video' | 'text' | 'pdf' | 'other'

export interface DroppedFile {
  path: string
  name: string
  /** 소문자, 점 없이 ('jpg') */
  ext: string
  size: number
  kind: FileKind
  /** 폴더면 true (압축·휴지통·이름 바꾸기만 됨) */
  dir?: boolean
}

export type ToolId =
  | 'convert' // 이미지 형식 바꾸기 (PNG·JPG·WEBP, HEIC → JPG)
  | 'resize' // 이미지 크기 바꾸기
  | 'compress' // 이미지 용량 줄이기
  | 'crop' // 정사각형 · 4:5(인스타) · 16:9 가운데 자르기
  | 'rotate' // 90° 돌리기 · 좌우 뒤집기
  | 'gray' // 흑백
  | 'strip' // 위치·촬영 정보(EXIF) 지우기
  | 'pdf' // 이미지 여러 장 → PDF 한 개
  | 'stitch' // 이미지 여러 장 → 세로로 이어 붙인 한 장 (캡처 이어 붙이기)
  | 'gif' // 짧은 동영상 → GIF
  | 'zip' // 압축(zip)
  | 'rename' // 이름 정리 (날짜 붙이기 · 일련번호)
  | 'count' // 글자 수 세기 (텍스트 파일)
  | 'copypath' // 경로 복사
  | 'trash' // 휴지통으로 (펫이 먹는다)

export interface ToolChoice {
  value: string
  label: string
}

export interface ToolOption {
  key: string
  label: string
  choices: ToolChoice[]
  /** choices[].value 중 하나 */
  default: string
}

export interface ToolDef {
  id: ToolId
  emoji: string
  label: string
  desc: string
  /** 이 도구가 받는 파일 종류 ('any' = 아무 파일, 폴더 포함) */
  kinds: (FileKind | 'any')[]
  /** 두 개 이상일 때만 의미 있는 도구 (pdf·stitch) */
  needsMany?: boolean
  options?: ToolOption[]
}

export interface ToolRequest {
  tool: ToolId
  files: string[]
  /** options 의 key → 고른 value */
  opts: Record<string, string>
}

export interface ToolResult {
  ok: boolean
  /** 새로 만든 파일 경로 (원본은 건드리지 않는다. trash 는 빈 배열) */
  outputs: string[]
  /** 펫 말풍선에 띄울 한 줄 ("3장 WEBP 로 바꿨어! 4.2MB → 1.1MB") */
  message: string
  failed: { name: string; reason: string }[]
  /** count 처럼 결과가 글인 도구 */
  text?: string
}

export interface ToolProgress {
  done: number
  total: number
  label?: string
}

/** 도구 목록 — 순서 = 메뉴에 보이는 순서. 실제 정의는 src/main/tools 담당이 채운다 */
export { TOOLS, toolsFor, kindOf } from './toolDefs'
