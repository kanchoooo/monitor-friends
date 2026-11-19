// 월급 계산 — 오늘 번 돈 · 올해 번 돈 · 퇴근까지 · 루팡 금액 (메인·오버레이·패널이 같이 씀)
//
// 일당 = 월급 ÷ 그달 근무일 수,  초당 = 일당 ÷ 하루 유급 근무 초
// (월급 = 연봉 ÷ 12. 공휴일은 따지지 않는다.)
// 퇴근 시각이 출근 시각보다 이르면 다음 날 퇴근(밤샘 근무)으로 본다 — 그 근무는 출근한 날에 붙는다.

export interface WorkSettings {
  /** 'year' = 연봉, 'month' = 월급 (세전, 원) */
  payType: 'year' | 'month'
  pay: number
  /** 근무 요일 (0 = 일요일 … 6 = 토요일) */
  workDays: number[]
  /** 'HH:MM' */
  start: string
  end: string
  /** 점심시간 (유급이 아니면 이 동안은 돈이 안 오른다) */
  lunch: boolean
  lunchStart: string
  lunchEnd: string
  lunchPaid: boolean
  /** 월급날 (1~31, 말일보다 크면 말일) */
  payday: number
}

export const DEFAULT_WORK: WorkSettings = {
  payType: 'year',
  pay: 40_000_000,
  workDays: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '18:00',
  lunch: true,
  lunchStart: '12:00',
  lunchEnd: '13:00',
  lunchPaid: false,
  payday: 25
}

/** 2026 최저시급 */
export const MIN_WAGE_2026 = 10_320

export function hm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return 0
  return Math.min(48 * 60, Number(m[1]) * 60 + Number(m[2])) * 60
}

export function fmtHM(sec: number): string {
  const m = Math.round(sec / 60)
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const DAY = 86_400_000

function midnight(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 그날 0시 기준 근무 구간들 [시작ms, 끝ms] (점심 빼기). 근무일이 아니면 [] */
export function workIntervals(w: WorkSettings, dayStart: number): [number, number][] {
  const dow = new Date(dayStart).getDay()
  if (!w.workDays.includes(dow)) return []
  const s = hm(w.start)
  let e = hm(w.end)
  if (e <= s) e += 86_400
  let iv: [number, number][] = [[s, e]]
  if (w.lunch && !w.lunchPaid) {
    let ls = hm(w.lunchStart)
    let le = hm(w.lunchEnd)
    if (ls < s) {
      ls += 86_400
      le += 86_400
    }
    if (le <= ls) le += 86_400
    iv = cut(iv, ls, le)
  }
  // 하루를 기준으로 실제 시각 → ms (서머타임이 없는 한국 기준이라 단순 더하기)
  return iv.map(([a, b]) => [dayStart + a * 1000, dayStart + b * 1000])
}

function cut(iv: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = []
  for (const [s, e] of iv) {
    if (b <= s || a >= e) out.push([s, e])
    else {
      if (a > s) out.push([s, a])
      if (b < e) out.push([b, e])
    }
  }
  return out
}

/** 하루 유급 근무 초 (근무일 기준) */
export function paidSecondsPerDay(w: WorkSettings): number {
  const s = hm(w.start)
  let e = hm(w.end)
  if (e <= s) e += 86_400
  let total = e - s
  if (w.lunch && !w.lunchPaid) {
    let ls = hm(w.lunchStart)
    let le = hm(w.lunchEnd)
    if (ls < s) {
      ls += 86_400
      le += 86_400
    }
    if (le <= ls) le += 86_400
    total -= Math.max(0, Math.min(e, le) - Math.max(s, ls))
  }
  return Math.max(60, total)
}

export function monthlyPay(w: WorkSettings): number {
  return Math.max(0, w.payType === 'year' ? w.pay / 12 : w.pay)
}

export function yearlyPay(w: WorkSettings): number {
  return Math.max(0, w.payType === 'year' ? w.pay : w.pay * 12)
}

const wdCache = new Map<string, number>()
/** 그달 근무일 수 */
export function workDaysInMonth(w: WorkSettings, y: number, m: number): number {
  const key = `${y}-${m}-${w.workDays.join('')}`
  const hit = wdCache.get(key)
  if (hit !== undefined) return hit
  const days = new Date(y, m + 1, 0).getDate()
  let n = 0
  for (let d = 1; d <= days; d++) if (w.workDays.includes(new Date(y, m, d).getDay())) n++
  if (wdCache.size > 200) wdCache.clear()
  wdCache.set(key, n)
  return n
}

/** 그날 일당 (근무일이 아니면 0) */
export function dailyWage(w: WorkSettings, dayStart: number): number {
  const d = new Date(dayStart)
  if (!w.workDays.includes(d.getDay())) return 0
  const n = workDaysInMonth(w, d.getFullYear(), d.getMonth())
  return n ? monthlyPay(w) / n : 0
}

/** 그날 기준 초당 버는 돈 */
export function perSecond(w: WorkSettings, dayStart: number): number {
  const d = new Date(dayStart)
  const n = workDaysInMonth(w, d.getFullYear(), d.getMonth())
  return n ? monthlyPay(w) / n / paidSecondsPerDay(w) : 0
}

/** 시급 (원) */
export function hourlyWage(w: WorkSettings, now = Date.now()): number {
  return perSecond(w, midnight(now)) * 3600
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

/** [a, b] 동안 근무 시간과 겹친 초 × 초당 = 그 동안 번 돈 (루팡 금액) */
export function earnedBetween(w: WorkSettings, a: number, b: number): number {
  if (b <= a) return 0
  let sum = 0
  // 밤샘 근무가 전날에 붙어 있을 수 있어 하루 앞에서부터 본다
  for (let d = midnight(a) - DAY; d <= b; d = midnight(d + DAY + 3_600_000)) {
    const ps = perSecond(w, d)
    for (const [s, e] of workIntervals(w, d)) sum += (overlap(a, b, s, e) / 1000) * ps
  }
  return sum
}

/** [a, b] 중 근무 시간 초 */
export function workSecondsBetween(w: WorkSettings, a: number, b: number): number {
  if (b <= a) return 0
  let sum = 0
  for (let d = midnight(a) - DAY; d <= b; d = midnight(d + DAY + 3_600_000)) for (const [s, e] of workIntervals(w, d)) sum += overlap(a, b, s, e) / 1000
  return sum
}

export type DayStatus = 'off' | 'before' | 'working' | 'lunch' | 'after'

export interface TodayInfo {
  status: DayStatus
  /** 오늘 지금까지 번 돈 */
  earned: number
  /** 오늘 일당 (다 일하면) */
  daily: number
  perSec: number
  /** 퇴근까지 남은 초 (근무 중·점심·출근 전), 아니면 0 */
  leftSec: number
  /** 퇴근 뒤 지난 초 (after 일 때) */
  overSec: number
  /** 오늘(또는 지금 걸쳐 있는 밤샘 근무)의 출근·퇴근 시각 ms */
  startAt: number
  endAt: number
}

/** 지금 걸쳐 있는 근무일 (밤샘 근무면 어제일 수 있음) */
function currentWorkDay(w: WorkSettings, now: number): number {
  const today = midnight(now)
  const y = midnight(today - 3_600_000)
  const iv = workIntervals(w, y)
  if (iv.length && now < iv[iv.length - 1][1]) return y
  return today
}

export function today(w: WorkSettings, now = Date.now()): TodayInfo {
  const day = currentWorkDay(w, now)
  const iv = workIntervals(w, day)
  const daily = dailyWage(w, day)
  const ps = perSecond(w, day)
  if (!iv.length) return { status: 'off', earned: 0, daily: 0, perSec: ps, leftSec: 0, overSec: 0, startAt: 0, endAt: 0 }
  const startAt = iv[0][0]
  const endAt = iv[iv.length - 1][1]
  let earned = 0
  for (const [s, e] of iv) earned += (overlap(day, now, s, e) / 1000) * ps
  let status: DayStatus
  if (now < startAt) status = 'before'
  else if (now >= endAt) status = 'after'
  else status = iv.some(([s, e]) => now >= s && now < e) ? 'working' : 'lunch'
  return {
    status,
    earned: Math.min(daily, earned),
    daily,
    perSec: ps,
    leftSec: status === 'after' ? 0 : Math.max(0, (endAt - now) / 1000),
    overSec: status === 'after' ? (now - endAt) / 1000 : 0,
    startAt,
    endAt
  }
}

const yearCache = { key: '', value: 0 }
/** 올해 1월 1일부터 지금까지 번 돈 (어제까지는 하루에 한 번만 계산) */
export function yearEarned(w: WorkSettings, now = Date.now()): number {
  const t = midnight(now)
  const y = new Date(t).getFullYear()
  const key = `${t}|${JSON.stringify(w)}`
  if (yearCache.key !== key) {
    let sum = 0
    for (let d = new Date(y, 0, 1).getTime(); d < t; d = midnight(d + DAY + 3_600_000)) sum += dailyWage(w, d)
    yearCache.key = key
    yearCache.value = sum
  }
  const td = today(w, now)
  // 밤샘 근무가 어제에 붙은 경우는 어제 일당이 이미 들어가 있어 오늘 몫만 더한다
  return yearCache.value + (midnight(td.startAt || now) === t ? td.earned : 0)
}

/** 다음 월급날까지 남은 날 (오늘이 월급날이면 0) */
export function daysToPayday(w: WorkSettings, now = Date.now()): number {
  const d = new Date(midnight(now))
  const pd = (y: number, m: number): Date => new Date(y, m, Math.min(w.payday, new Date(y, m + 1, 0).getDate()))
  let p = pd(d.getFullYear(), d.getMonth())
  if (p.getTime() < d.getTime()) p = pd(d.getFullYear(), d.getMonth() + 1)
  return Math.round((p.getTime() - d.getTime()) / DAY)
}

// ───────── 보여 주기 ─────────

export function fmtWon(n: number, decimals = 0): string {
  const v = Math.max(0, n)
  if (decimals <= 0) return '₩' + Math.floor(v).toLocaleString('ko-KR')
  // 반올림하면 .995 → 1.00 으로 넘어가므로 내림
  const p = 10 ** decimals
  const all = Math.floor(v * p)
  const int = Math.floor(all / p)
  const frac = String(all % p).padStart(decimals, '0')
  return `₩${int.toLocaleString('ko-KR')}.${frac}`
}

/** 1,234만 원 처럼 짧게 */
export function fmtWonShort(n: number): string {
  const v = Math.max(0, Math.floor(n))
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(v >= 1_000_000_000 ? 0 : 1).replace(/\.0$/, '')}억 원`
  if (v >= 10_000) return `${Math.floor(v / 10_000).toLocaleString('ko-KR')}만 원`
  return `${v.toLocaleString('ko-KR')}원`
}

/** 1:02:03 / 12:03 */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

/** 1시간 2분 / 12분 / 40초 */
export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s}초`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`
}

/** 루팡 칭호 (누적 루팡 금액) */
const RANKS: [number, string][] = [
  [0, '루팡 새싹'],
  [10_000, '인턴 루팡'],
  [50_000, '사원 루팡'],
  [150_000, '대리 루팡'],
  [400_000, '과장 루팡'],
  [1_000_000, '차장 루팡'],
  [2_500_000, '부장 루팡'],
  [6_000_000, '임원 루팡'],
  [15_000_000, '전설의 월급루팡']
]

export function lupangRank(total: number): { title: string; next: number | null } {
  let i = 0
  while (i + 1 < RANKS.length && total >= RANKS[i + 1][0]) i++
  return { title: RANKS[i][1], next: i + 1 < RANKS.length ? RANKS[i + 1][0] : null }
}

// ───────── 바이럴 표시: 먹을 것 환산 · 주말까지 · 공짜 야근 ─────────

export const FOODS = [
  { ic: '☕', name: '아메리카노', unit: '잔', price: 4_500 },
  { ic: '🍗', name: '치킨', unit: '마리', price: 23_000 },
  { ic: '🍚', name: '국밥', unit: '그릇', price: 10_000 },
  { ic: '🍺', name: '편의점 맥주', unit: '캔', price: 3_000 },
  { ic: '🍜', name: '라면', unit: '봉지', price: 1_000 }
] as const

/** 돈 → "아메리카노 21잔" (10 미만은 소수 한 자리) */
export function foodOf(won: number, i: number): { ic: string; text: string } {
  let f: (typeof FOODS)[number] = FOODS[((i % FOODS.length) + FOODS.length) % FOODS.length]
  // 너무 적으면 "0잔" 대신 더 싼 걸로
  if (won / f.price < 0.3) f = FOODS[FOODS.length - 1]
  if (won / f.price < 0.3) return { ic: '🍬', text: won >= 100 ? `사탕 ${Math.floor(won / 100)}개` : '사탕 반 개' }
  const n = Math.max(0, won) / f.price
  const s = n >= 10 ? Math.floor(n).toLocaleString('ko-KR') : (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, '')
  return { ic: f.ic, text: `${f.name} ${s}${f.unit}` }
}

/** 이번 주 마지막 근무일 퇴근까지 남은 초. 이미 주말(쉬는 날)이면 weekend */
export function untilWeekend(w: WorkSettings, now = Date.now()): { sec: number; weekend: boolean } {
  if (!w.workDays.length) return { sec: 0, weekend: true }
  const t = today(w, now)
  if (t.status === 'off') return { sec: 0, weekend: true }
  let d = midnight(now)
  for (let i = 0; i < 8; i++, d = midnight(d + DAY + 3_600_000)) {
    const iv = workIntervals(w, d)
    if (!iv.length) continue
    const next = workIntervals(w, midnight(d + DAY + 3_600_000))
    if (!next.length) {
      const end = iv[iv.length - 1][1]
      if (now >= end) return { sec: 0, weekend: true }
      return { sec: (end - now) / 1000, weekend: false }
    }
  }
  return { sec: 0, weekend: false }
}
