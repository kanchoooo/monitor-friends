// 순수 계산 테스트 (node --experimental-strip-types)
import assert from 'node:assert/strict'
import { DEFAULT_WORK, today, earnedBetween, yearEarned, paidSecondsPerDay, daysToPayday, workDaysInMonth, fmtWon, fmtClock, lupangRank, hourlyWage } from '../src/shared/money.ts'

const w = { ...DEFAULT_WORK, pay: 48_000_000 } // 월 400만
const at = (s: string) => new Date(s).getTime()
// 2026-11 근무일 (월~금) = 21일
assert.equal(workDaysInMonth(w, 2026, 10), 21)
assert.equal(paidSecondsPerDay(w), 8 * 3600)
const daily = 4_000_000 / 21
// 목 2026-11-19 10:00 → 1시간 = daily/8
let t = today(w, at('2026-11-19T10:00:00'))
assert.equal(t.status, 'working')
assert.ok(Math.abs(t.earned - daily / 8) < 0.01, `earned ${t.earned}`)
assert.equal(Math.round(t.leftSec), 8 * 3600)
t = today(w, at('2026-11-19T12:30:00'))
assert.equal(t.status, 'lunch')
assert.ok(Math.abs(t.earned - (daily * 3) / 8) < 0.01)
t = today(w, at('2026-11-19T19:00:00'))
assert.equal(t.status, 'after')
assert.ok(Math.abs(t.earned - daily) < 0.01)
assert.equal(Math.round(t.overSec), 3600)
t = today(w, at('2026-11-21T10:00:00')) // 토
assert.equal(t.status, 'off')
t = today(w, at('2026-11-19T08:00:00'))
assert.equal(t.status, 'before')
assert.equal(t.earned, 0)
// 루팡: 11:30~13:30 → 근무 1시간 (11:30~12:00, 13:00~13:30)
assert.ok(Math.abs(earnedBetween(w, at('2026-11-19T11:30:00'), at('2026-11-19T13:30:00')) - daily / 8) < 0.01)
// 주말 루팡은 0
assert.equal(earnedBetween(w, at('2026-11-21T11:00:00'), at('2026-11-21T13:00:00')), 0)
// 밤샘: 22:00~06:00, 점심 없음
const n = { ...w, start: '22:00', end: '06:00', lunch: false }
t = today(n, at('2026-11-20T02:00:00')) // 목요일 밤 근무 중 (금 새벽)
assert.equal(t.status, 'working')
assert.ok(Math.abs(t.earned - (4_000_000 / 21) / 2) < 0.01, `night ${t.earned}`)
// 올해: 1월~10월 = 4000만 + 11월 1~18일 근무일(13일)치 + 오늘 1시간
const y = yearEarned(w, at('2026-11-19T10:00:00'))
const expect = 40_000_000 + 13 * daily + daily / 8
assert.ok(Math.abs(y - expect) < 1, `year ${y} vs ${expect}`)
assert.equal(daysToPayday(w, at('2026-11-19T10:00:00')), 6)
assert.equal(daysToPayday(w, at('2026-11-25T10:00:00')), 0)
assert.equal(daysToPayday(w, at('2026-11-26T10:00:00')), 29)
assert.equal(fmtWon(1234.567, 2), '₩1,234.56')
assert.equal(fmtClock(3723), '1:02:03')
assert.equal(lupangRank(60_000).title, '사원 루팡')
assert.ok(Math.abs(hourlyWage(w, at('2026-11-19T10:00:00')) - daily / 8) < 0.01)
console.log('money ok')
import { foodOf, untilWeekend } from '../src/shared/money.ts'
assert.equal(foodOf(94_500, 0).text, '아메리카노 21잔')
assert.equal(foodOf(18_400, 1).text, '치킨 0.8마리')
// 목 10:00 → 금 18:00 까지 = 32시간
assert.equal(Math.round(untilWeekend(w, at('2026-11-19T10:00:00')).sec), 32 * 3600)
assert.equal(untilWeekend(w, at('2026-11-20T19:00:00')).weekend, true)
assert.equal(untilWeekend(w, at('2026-11-21T12:00:00')).weekend, true)
assert.equal(foodOf(41, 0).text, '사탕 반 개')
assert.equal(foodOf(450, 0).text, '라면 0.4봉지')
console.log('viral ok')
