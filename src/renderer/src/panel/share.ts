// 자랑 이미지 (1080×1350, 인스타 세로) — 오늘의 월급 리포트
import { daysToPayday, fmtDur, fmtWon, foodOf, hourlyWage, lupangRank, MIN_WAGE_2026, today, untilWeekend, yearEarned } from '@shared/money'
import type { Pose } from '@shared/pet'
import type { PersistedState } from '@shared/types'
import { INSTAGRAM_HANDLE } from '@shared/types'
import { drawPose } from '@/common/sprite'

const W = 1080
const H = 1350
const FONT = "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
const INK = '#3b2f25'

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, o: { size?: number; w?: number; color?: string; align?: CanvasTextAlign; max?: number } = {}): void {
  c.font = `${o.w ?? 700} ${o.size ?? 36}px ${FONT}`
  c.fillStyle = o.color ?? INK
  c.textAlign = o.align ?? 'center'
  c.textBaseline = 'alphabetic'
  c.fillText(s, x, y, o.max)
}

function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath()
  c.roundRect(x, y, w, h, r)
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/** 시간대에 맞는 한 줄 */
function headline(st: PersistedState, now: number): string {
  const t = today(st.settings.work, now)
  const d = new Date(now)
  if (t.status === 'off') return '오늘은 쉬는 날 🏖'
  if (t.status === 'before') return '출근 전… 아직 0원'
  if (t.status === 'after') return t.overSec > 1800 ? `퇴근 ${fmtDur(t.overSec)} 지났는데 아직 회사 🥲` : '퇴근 완료! 오늘도 버텼다 🎉'
  if (t.leftSec < 3600) return `퇴근까지 ${fmtDur(t.leftSec)}!! 🏃`
  if (d.getDay() === 1) return '월요일 생존 중 🫠'
  if (d.getDay() === 5) return '불금까지 조금만 🔥'
  return '오늘도 열일(하는 척) 중 💼'
}

export function drawReport(st: PersistedState, atlas: HTMLCanvasElement, petName: string, now = Date.now()): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  const w = st.settings.work
  const t = today(w, now)
  const d = new Date(now)
  const t0 = new Date(now).setHours(0, 0, 0, 0)
  const lupToday = st.lupang.filter((s) => s.end >= t0)
  const lupMoney = lupToday.reduce((a, s) => a + s.earned, 0)
  const toilet = lupToday.filter((s) => s.kind === 'toilet').reduce((a, s) => a + s.earned, 0)
  const lupSec = lupToday.reduce((a, s) => a + s.sec, 0)
  const lupTotal = st.lupang.reduce((a, s) => a + s.earned, 0)
  const rank = lupangRank(lupTotal).title

  // 바탕
  c.fillStyle = '#fff6e6'
  c.fillRect(0, 0, W, H)
  c.fillStyle = '#ffe9c7'
  for (let y = 0; y < H; y += 54) for (let x = (y / 54) % 2 ? 27 : 0; x < W; x += 54) {
    c.beginPath()
    c.arc(x, y, 5, 0, Math.PI * 2)
    c.fill()
  }
  // 카드
  round(c, 54, 54, W - 108, H - 108, 44)
  c.fillStyle = '#fffdf8'
  c.fill()
  c.lineWidth = 6
  c.strokeStyle = INK
  c.stroke()

  text(c, `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]}) 오늘의 월급 리포트`, W / 2, 150, { size: 40, w: 800 })
  text(c, headline(st, now), W / 2, 210, { size: 34, w: 600, color: '#8d6e52' })

  // 펫
  const pose: Pose = t.status === 'after' ? 'happy' : lupSec > 0 ? 'happy' : t.status === 'working' ? 'work' : t.status === 'lunch' ? 'eat' : 'wave'
  c.save()
  c.fillStyle = '#ffe3b8'
  c.beginPath()
  c.ellipse(W / 2, 560, 250, 34, 0, 0, Math.PI * 2)
  c.fill()
  c.restore()
  drawPose(c, { id: '', atlas, box: {} as never }, pose, W / 2 - 200, 560 - 375, 400)
  // 이름표
  c.font = `800 30px ${FONT}`
  const nw = c.measureText(petName).width + 40
  round(c, W / 2 - nw / 2, 590, nw, 50, 25)
  c.fillStyle = '#fff'
  c.fill()
  c.lineWidth = 4
  c.stroke()
  text(c, petName, W / 2, 626, { size: 30, w: 800 })

  // 오늘 번 돈
  text(c, t.status === 'after' ? '오늘 번 돈 (다 벌었다!)' : '오늘 지금까지 번 돈', W / 2, 720, { size: 32, w: 600, color: '#8d6e52' })
  text(c, fmtWon(t.status === 'after' ? t.daily : t.earned), W / 2, 820, { size: 108, w: 900 })
  // 진행 막대
  const pct = t.daily ? Math.min(1, t.earned / t.daily) : 0
  round(c, 160, 852, W - 320, 28, 14)
  c.fillStyle = '#f2e4cf'
  c.fill()
  if (pct > 0) {
    round(c, 160, 852, Math.max(28, (W - 320) * pct), 28, 14)
    c.fillStyle = '#ff9f43'
    c.fill()
  }
  const won = t.status === 'after' ? t.daily : t.earned
  const f1 = foodOf(won, 0)
  const f2 = foodOf(won, 1)
  text(c, t.daily ? `= ${f1.ic} ${f1.text} · ${f2.ic} ${f2.text}` : '오늘은 근무일이 아니에요', W / 2, 922, { size: 28, w: 700, color: '#a0612a' })

  // 숫자 칸
  const wk = untilWeekend(w, now)
  const pd = daysToPayday(w, now)
  const rows: [string, string][] = [
    t.status === 'after' && t.overSec > 600
      ? ['🌙 공짜 야근', `${fmtDur(t.overSec)} (${fmtWon(t.overSec * t.perSec)} 손해)`]
      : ['⏰ 퇴근까지', t.status === 'working' || t.status === 'lunch' || t.status === 'before' ? fmtDur(t.leftSec) : t.status === 'after' ? '퇴근 완료' : '쉬는 날'],
    ['🕶 오늘 루팡', lupMoney > 0 ? `${fmtWon(lupMoney)} (${fmtDur(lupSec)})` : '0원 (성실)'],
    ['💩 오늘 똥값', toilet > 0 ? fmtWon(toilet) : '0원'],
    ['💸 내 시급', `${fmtWon(hourlyWage(w, now))} (최저의 ${(hourlyWage(w, now) / MIN_WAGE_2026).toFixed(1)}배)`],
    ['📅 올해 번 돈', fmtWon(yearEarned(w, now))],
    ['💳 월급날 · 주말', `${pd === 0 ? '오늘 월급날!!' : `D-${pd}`} · ${wk.weekend ? '주말이다!' : `주말까지 ${fmtDur(wk.sec)}`}`]
  ]
  let y = 970
  for (const [k, v] of rows) {
    text(c, k, 150, y, { size: 32, w: 700, align: 'left', color: '#6f5a46' })
    text(c, v, W - 150, y, { size: 34, w: 800, align: 'right' })
    y += 46
  }
  // 칭호 + 꼬리말
  text(c, `칭호 · ${rank}`, W / 2, H - 104, { size: 28, w: 700, color: '#b07a3a' })
  text(c, `모니터 프렌즈  ·  인스타 ${INSTAGRAM_HANDLE}`, W / 2, H - 70, { size: 24, w: 600, color: '#b3a08a' })
  return cv
}
