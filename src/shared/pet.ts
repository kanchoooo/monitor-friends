// 펫 그림 규격 (기본 펫·GPT 로 만든 펫이 같은 규격을 쓴다)
//
// 아틀라스 = 4열 × 3행, 칸마다 CELL×CELL (투명 배경 PNG, 1024×768)
//  - 칸 안에서 펫의 발바닥(바닥에 닿는 점)이 가로 가운데, 세로 FEET_Y 에 오도록 맞춘다
//  - '서기' 포즈의 키가 STAND_H 쯤 (다른 포즈도 같은 배율 — 앉으면 낮아지고 잠자면 납작해진다)
//  - 걷기 두 장(walk1·walk2)은 오른쪽을 본다. 왼쪽으로 걸을 때는 좌우를 뒤집어 그린다.

export const CELL = 256
export const COLS = 4
export const ROWS = 3
export const ATLAS_W = CELL * COLS
export const ATLAS_H = CELL * ROWS
/** 칸 위에서 발바닥까지 */
export const FEET_Y = 240
/** '서기' 포즈의 키 (머리 꼭대기 ~ 발바닥) */
export const STAND_H = 200

/** 아틀라스 칸 순서 (왼쪽 위부터 오른쪽으로, 줄 바꿈) */
export const POSES = [
  'stand', // 1 정면으로 서 있기 (기본)
  'blink', // 2 서기 + 눈 감음 (깜빡임)
  'walk1', // 3 오른쪽을 보고 걷기 — 왼발 앞
  'walk2', // 4 오른쪽을 보고 걷기 — 오른발 앞
  'surprised', // 5 깜짝 놀람 (집어 들렸을 때) — 눈 동그랗게, 팔다리 쭉, 땀방울
  'sit', // 6 앉아 있기
  'sleep', // 7 웅크리고 잠자기 (눈 감음)
  'happy', // 8 신남 — 두 팔 번쩍, 눈웃음, 살짝 점프
  'work', // 9 작은 노트북으로 타자 치기
  'eat', // 10 뭔가를 냠냠 먹기 (볼 빵빵)
  'angry', // 11 삐짐·화남 (볼 부풀림, 팔짱)
  'wave' // 12 한 손 흔들며 인사
] as const

export type Pose = (typeof POSES)[number]

export const POSE_LABEL: Record<Pose, string> = {
  stand: '서기',
  blink: '눈 깜빡',
  walk1: '걷기 1',
  walk2: '걷기 2',
  surprised: '깜짝 놀람',
  sit: '앉기',
  sleep: '잠자기',
  happy: '신남',
  work: '일하기',
  eat: '냠냠',
  angry: '삐짐',
  wave: '인사'
}

export function poseIndex(p: Pose): number {
  return POSES.indexOf(p)
}

/** 기본 캐릭터 (그림: src/renderer/src/assets/pets/default.png — 사용자가 만든 시트를 sheet.ts 로 처리한 아틀라스) */
export const BUILTIN_PETS = [
  { id: 'builtin:merong', name: '메롱이', desc: '시큰둥한 메롱 강아지' }
] as const

export type BuiltinPetId = (typeof BUILTIN_PETS)[number]['id']

/** 내가 만든 펫 (userData/pets/<id>/atlas.png + meta) */
export interface PetMeta {
  id: string
  name: string
  createdAt: number
}
