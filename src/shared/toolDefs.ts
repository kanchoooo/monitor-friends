// 파일 도우미 도구 목록 · 파일 종류 판정 (오버레이 메뉴·패널·메인이 같이 쓴다)
import type { DroppedFile, FileKind, ToolDef } from './tools'

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'jfif', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff']
const HEIC_EXT = ['heic', 'heif']
const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm']
const TEXT_EXT = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'yml', 'yaml', 'html', 'htm', 'srt', 'ini']

/** 확장자(점 없이, 대소문자 상관없음) → 파일 종류 */
export function kindOf(ext: string): FileKind {
  const e = ext.toLowerCase().replace(/^\./, '')
  if (IMAGE_EXT.includes(e)) return 'image'
  if (HEIC_EXT.includes(e)) return 'heic'
  if (VIDEO_EXT.includes(e)) return 'video'
  if (TEXT_EXT.includes(e)) return 'text'
  if (e === 'pdf') return 'pdf'
  return 'other'
}

const IMG: FileKind[] = ['image', 'heic']

/** 순서 = 메뉴 순서 */
export const TOOLS: ToolDef[] = [
  {
    id: 'convert',
    emoji: '🔁',
    label: '형식 바꾸기',
    desc: 'PNG · JPG · WEBP 로 바꿔 줄게 (아이폰 HEIC 도)',
    kinds: IMG,
    options: [
      {
        key: 'to',
        label: '바꿀 형식',
        choices: [
          { value: 'jpg', label: 'JPG' },
          { value: 'png', label: 'PNG' },
          { value: 'webp', label: 'WEBP' }
        ],
        default: 'jpg'
      }
    ]
  },
  {
    id: 'resize',
    emoji: '📐',
    label: '크기 줄이기',
    desc: '비율은 그대로, 더 크게는 안 늘려',
    kinds: IMG,
    options: [
      {
        key: 'size',
        label: '크기',
        choices: [
          { value: '50', label: '50%' },
          { value: '25', label: '25%' },
          { value: 'w1920', label: '가로 1920' },
          { value: 'w1280', label: '가로 1280' },
          { value: 'w1080', label: '가로 1080' },
          { value: 'w720', label: '가로 720' }
        ],
        default: '50'
      }
    ]
  },
  {
    id: 'compress',
    emoji: '🗜️',
    label: '용량 줄이기',
    desc: '메일·카톡으로 보내기 좋게 가볍게',
    kinds: IMG,
    options: [
      {
        key: 'level',
        label: '얼마나',
        choices: [
          { value: 'normal', label: '보통' },
          { value: 'more', label: '많이' },
          { value: 'most', label: '아주 많이' }
        ],
        default: 'normal'
      },
      {
        key: 'format',
        label: '형식',
        choices: [
          { value: 'auto', label: '알아서 (JPG는 JPG, 나머지는 WEBP)' },
          { value: 'jpg', label: 'JPG' },
          { value: 'webp', label: 'WEBP' }
        ],
        default: 'auto'
      }
    ]
  },
  {
    id: 'crop',
    emoji: '✂️',
    label: '가운데 자르기',
    desc: '정사각형 · 인스타 4:5 · 16:9',
    kinds: IMG,
    options: [
      {
        key: 'ratio',
        label: '비율',
        choices: [
          { value: '1x1', label: '1:1 정사각형' },
          { value: '4x5', label: '4:5 인스타' },
          { value: '16x9', label: '16:9 가로' },
          { value: '9x16', label: '9:16 세로' }
        ],
        default: '1x1'
      }
    ]
  },
  {
    id: 'rotate',
    emoji: '🔄',
    label: '돌리기',
    desc: '90° 돌리기 · 좌우 뒤집기',
    kinds: IMG,
    options: [
      {
        key: 'dir',
        label: '방향',
        choices: [
          { value: 'right', label: '오른쪽 90°' },
          { value: 'left', label: '왼쪽 90°' },
          { value: '180', label: '180°' },
          { value: 'flip', label: '좌우 뒤집기' }
        ],
        default: 'right'
      }
    ]
  },
  { id: 'gray', emoji: '🖤', label: '흑백으로', desc: '흑백 사진으로 바꿔 줄게', kinds: IMG },
  { id: 'strip', emoji: '🕵️', label: '촬영 정보 지우기', desc: '위치·카메라 정보(EXIF)를 지운 사본', kinds: IMG },
  {
    id: 'pdf',
    emoji: '📄',
    label: 'PDF로 묶기',
    desc: '사진 여러 장 → PDF 한 개 (놓은 순서대로)',
    kinds: IMG,
    needsMany: true,
    options: [
      {
        key: 'page',
        label: '쪽 크기',
        choices: [
          { value: 'a4', label: 'A4 세로에 맞추기' },
          { value: 'original', label: '원본 크기' }
        ],
        default: 'a4'
      }
    ]
  },
  { id: 'stitch', emoji: '🧻', label: '세로로 이어 붙이기', desc: '캡처 여러 장 → 길쭉한 한 장', kinds: IMG, needsMany: true },
  {
    id: 'gif',
    emoji: '🎞️',
    label: 'GIF 만들기',
    desc: '짧은 동영상 앞부분 → 움짤',
    kinds: ['video'],
    options: [
      {
        key: 'len',
        label: '길이',
        choices: [
          { value: '5', label: '5초' },
          { value: '8', label: '8초' }
        ],
        default: '5'
      },
      {
        key: 'size',
        label: '크기 (긴 변)',
        choices: [
          { value: '360', label: '360' },
          { value: '480', label: '480' },
          { value: '640', label: '640' }
        ],
        default: '480'
      }
    ]
  },
  { id: 'count', emoji: '🔢', label: '글자 수 세기', desc: '공백 포함·제외, 원고지 매수까지', kinds: ['text'] },
  { id: 'zip', emoji: '📦', label: '압축하기', desc: 'zip 파일 하나로 (폴더도 돼)', kinds: ['any'] },
  {
    id: 'rename',
    emoji: '🏷️',
    label: '이름 정리',
    desc: '날짜 붙이기 · 일련번호 (원본 이름이 바뀌어)',
    kinds: ['any'],
    options: [
      {
        key: 'how',
        label: '방법',
        choices: [
          { value: 'date', label: '앞에 날짜 붙이기 (YYMMDD_)' },
          { value: 'seq', label: '일련번호 (첫 파일이름_01, _02 …)' }
        ],
        default: 'date'
      }
    ]
  },
  { id: 'copypath', emoji: '📋', label: '경로 복사', desc: '파일 위치를 클립보드에', kinds: ['any'] },
  { id: 'trash', emoji: '🗑️', label: '휴지통에 버리기', desc: '냠냠 (휴지통에서 되살릴 수 있어)', kinds: ['any'] }
]

/** 이 파일을 이미지 도구로 다룰 수 있나 (HEIC 은 맥에서만 — platform 을 모르면 된다고 보고 실행할 때 안내) */
export function isImageFile(f: DroppedFile, platform?: string): boolean {
  if (f.dir) return false
  if (f.kind === 'image') return true
  return f.kind === 'heic' && platform !== 'win32'
}

/** 놓은 파일들에 쓸 수 있는 도구 (메뉴 순서). platform = process.platform (넘기면 윈도우에서 HEIC 을 뺀다) */
export function toolsFor(files: DroppedFile[], platform?: string): ToolDef[] {
  if (!files.length) return []
  const images = files.filter((f) => isImageFile(f, platform)).length
  const videos = files.filter((f) => !f.dir && f.kind === 'video').length
  const texts = files.filter((f) => !f.dir && f.kind === 'text').length
  return TOOLS.filter((t) => {
    if (t.kinds.includes('any')) {
      // 일련번호는 하나여도 의미는 없지만 날짜 붙이기가 있어서 둔다
      return true
    }
    if (t.kinds.includes('image')) return t.needsMany ? images >= 2 : images >= 1
    if (t.kinds.includes('video')) return videos >= 1
    if (t.kinds.includes('text')) return texts >= 1
    return false
  })
}
