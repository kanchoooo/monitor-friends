import { useEffect, useState } from 'react'
import { daysToPayday, earnedBetween, fmtClock, fmtDur, fmtWon, foodOf, hourlyWage, lupangRank, today, untilWeekend, yearEarned } from '@shared/money'
import { BUILTIN_PETS } from '@shared/pet'
import type { LiveInfo, PersistedState } from '@shared/types'
import { PRANKS } from '@shared/types'
import { drawReport } from './share'
import { PetLoop, useAtlas, useTicker } from './usePet'

const api = window.api

export function petNameOf(st: PersistedState): string {
  return st.pets.find((p) => p.id === st.settings.petId)?.name ?? BUILTIN_PETS.find((p) => p.id === st.settings.petId)?.name ?? '모니터 프렌즈'
}

export function Home({ st, live, shareReq }: { st: PersistedState; live: LiveInfo; shareReq: number }): React.JSX.Element {
  useTicker(100)
  const atlas = useAtlas(st.settings.petId)
  const [share, setShare] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const w = st.settings.work
  const now = Date.now()
  const t = today(w, now)
  const t0 = new Date(now).setHours(0, 0, 0, 0)
  const todays = st.lupang.filter((s) => s.end >= t0).reverse()
  const lupToday = todays.reduce((a, s) => a + s.earned, 0)
  const toiletToday = todays.filter((s) => s.kind === 'toilet').reduce((a, s) => a + s.earned, 0)
  const toiletTotal = st.lupang.filter((s) => s.kind === 'toilet').reduce((a, s) => a + s.earned, 0)
  const wk = untilWeekend(w, now)
  const won = t.status === 'after' ? t.daily : t.earned
  const food = foodOf(won, Math.floor(now / 4000))
  const lupTotal = st.lupang.reduce((a, s) => a + s.earned, 0)
  const rank = lupangRank(lupTotal)
  const name = petNameOf(st)

  const openShare = (): void => {
    if (!atlas) return
    setShare(drawReport(st, atlas, name).toDataURL('image/png'))
    setMsg('')
  }
  useEffect(() => {
    if (shareReq && atlas) openShare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareReq, atlas])

  const status =
    t.status === 'off' ? '오늘은 쉬는 날이에요 🏖' : t.status === 'before' ? `출근 전 · 오늘 일당 ${fmtWon(t.daily)}` : t.status === 'after' ? `퇴근 완료! ${t.overSec > 600 ? `(퇴근 ${fmtDur(t.overSec)} 지남)` : ''}` : t.status === 'lunch' ? '점심시간 — 지금은 돈이 안 올라요' : `퇴근까지 ${fmtClock(t.leftSec)}`
  const pct = t.daily ? Math.min(1, t.earned / t.daily) : 0
  const lupLive = live.lupangOn ? earnedBetween(w, live.lupangOn, now) : 0

  return (
    <div className="home">
      <section className="card hero">
        <div className="hero-pet">{atlas && <PetLoop atlas={atlas} size={124} />}</div>
        <div className="hero-r">
          <div className="faint">{t.status === 'after' ? '오늘 번 돈' : '오늘 지금까지 번 돈'}</div>
          <div className="money big">{fmtWon(t.status === 'after' ? t.daily : t.earned, t.status === 'working' ? 2 : 0)}</div>
          <div className="bar">
            <i style={{ width: `${pct * 100}%` }} />
          </div>
          <div className="status">{status}</div>
          {won >= 1000 && (
            <div className="food">
              {food.ic} = {food.text}
            </div>
          )}
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <div className="k">올해 번 돈</div>
          <div className="v">{fmtWon(yearEarned(w, now))}</div>
        </div>
        <div className="stat">
          <div className="k">내 시급</div>
          <div className="v">{fmtWon(hourlyWage(w, now))}</div>
        </div>
        <div className="stat">
          <div className="k">월급날 · 주말</div>
          <div className="v">
            {daysToPayday(w, now) === 0 ? '오늘! 🎉' : `D-${daysToPayday(w, now)}`} · {wk.weekend ? '주말!' : fmtClock(wk.sec).replace(/:\d\d$/, '')}
          </div>
        </div>
      </section>

      <section className={`card lupang ${live.lupangOn ? 'on' : ''}`}>
        <div className="row between">
          <div>
            <div className="h">🕶 루팡 기록</div>
            <div className="faint">자리 비울 때 누르고, 돌아와서 다시 누르면 그동안 번 돈을 적어요</div>
          </div>
        </div>
        {live.lupangOn ? (
          <button className="btn big dark" onClick={() => void api.lupang(false)}>
            {live.lupangKind === 'toilet' ? '💩 화장실' : '루팡'} 중 {fmtClock((now - live.lupangOn) / 1000)} · {fmtWon(lupLive, 1)} — 돌아왔어요 (정산)
          </button>
        ) : (
          <div className="row gap">
            <button className="btn big wide" onClick={() => void api.lupang(true)}>
              🕶 자리비움 시작
            </button>
            <button className="btn big wide brown" onClick={() => void api.lupang(true, 'toilet')}>
              💩 화장실 (똥값)
            </button>
          </div>
        )}
        <div className="lup-sum">
          <span>
            오늘 <b>{fmtWon(lupToday)}</b>
          </span>
          <span>
            누적 <b>{fmtWon(lupTotal)}</b>
          </span>
          <span className="rank">{rank.title}</span>
        </div>
        {toiletTotal > 0 && (
          <div className="lup-sum">
            <span>
              💩 오늘 똥값 <b>{fmtWon(toiletToday)}</b>
            </span>
            <span>
              누적 똥값 <b>{fmtWon(toiletTotal)}</b>
            </span>
          </div>
        )}
        {todays.length > 0 && (
          <ul className="lup-list">
            {todays.slice(0, 6).map((s) => (
              <li key={s.start}>
                <span>
                  {new Date(s.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · {fmtDur(s.sec)}
                  {s.kind === 'auto' ? ' (자동)' : s.kind === 'toilet' ? ' 💩' : ''}
                </span>
                <b>{fmtWon(s.earned)}</b>
                <button className="link" title="지우기" onClick={() => void api.deleteLupang(s.start)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {st.settings.autoLupangMin > 0 && <div className="faint small">버튼을 깜빡해도 {st.settings.autoLupangMin}분 넘게 자리를 비우면 돌아왔을 때 펫이 물어봐요</div>}
      </section>

      <section className="row gap">
        <button className="btn wide" onClick={openShare}>
          📸 오늘 리포트 자랑하기
        </button>
        <button className="btn wide ghost" onClick={() => void api.browser()}>
          🌐 인터넷 열기
        </button>
      </section>

      <section className="card">
        <div className="h">🎲 장난치기</div>
        <div className="chips">
          {PRANKS.map((p) => (
            <button key={p.id} className="chip" onClick={() => void api.prank(p.id)}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
        <div className="faint small">펫을 끌어서 던지거나, 커서로 문질러 쓰다듬어 보세요</div>
      </section>

      {share && (
        <div className="modal" onClick={() => setShare(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <img src={share} alt="오늘의 월급 리포트" />
            <div className="row gap">
              <button
                className="btn wide"
                onClick={async () => {
                  const r = await api.saveImage(share, `월급리포트-${new Date().toISOString().slice(0, 10)}`)
                  setMsg(r === 'saved' ? '저장하고 클립보드에도 복사했어요. 인스타·카톡에 바로 붙여 넣기!' : r === 'copied' ? '클립보드에 복사했어요' : '')
                }}
              >
                저장 + 복사
              </button>
              <button className="btn ghost" onClick={() => setShare(null)}>
                닫기
              </button>
            </div>
            {msg && <div className="ok">{msg}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
