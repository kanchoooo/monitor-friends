import { useEffect, useState } from 'react'
import { accelFromEvent, accelLabel } from '@shared/accel'
import { fmtWon, hourlyWage, MIN_WAGE_2026, monthlyPay, today } from '@shared/money'
import type { PersistedState, Settings as S, ShowItem } from '@shared/types'
import { SHOW_LABEL } from '@shared/types'

const api = window.api
const DAYS = ['일', '월', '화', '수', '목', '금', '토']

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="toggle">
      <span>{children}</span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i />
    </label>
  )
}

/** 만원 단위로 입력 */
function PayInput({ value, onChange }: { value: number; onChange: (won: number) => void }): React.JSX.Element {
  const [txt, setTxt] = useState(String(Math.round(value / 10_000)))
  useEffect(() => setTxt(String(Math.round(value / 10_000))), [value])
  return (
    <input
      className="text num"
      inputMode="numeric"
      value={txt}
      onChange={(e) => setTxt(e.target.value.replace(/[^\d]/g, '').slice(0, 7))}
      onBlur={() => onChange(Math.max(0, Number(txt) || 0) * 10_000)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function WorkForm({ st }: { st: PersistedState }): React.JSX.Element {
  const w = st.settings.work
  const set = (p: Partial<typeof w>): void => void api.setWork(p)
  const t = today(w)
  return (
    <div className="form">
      <div className="field">
        <div className="seg">
          <button className={w.payType === 'year' ? 'on' : ''} onClick={() => set({ payType: 'year', pay: w.payType === 'year' ? w.pay : w.pay * 12 })}>
            연봉
          </button>
          <button className={w.payType === 'month' ? 'on' : ''} onClick={() => set({ payType: 'month', pay: w.payType === 'month' ? w.pay : Math.round(w.pay / 12) })}>
            월급
          </button>
        </div>
        <PayInput value={w.pay} onChange={(won) => set({ pay: won })} />
        <span>만 원 (세전)</span>
      </div>
      <div className="field">
        <span>근무 요일</span>
        <div className="days">
          {DAYS.map((d, i) => (
            <button key={d} className={w.workDays.includes(i) ? 'on' : ''} onClick={() => set({ workDays: w.workDays.includes(i) ? w.workDays.filter((x) => x !== i) : [...w.workDays, i] })}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>근무 시간</span>
        <input type="time" value={w.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
        <span>~</span>
        <input type="time" value={w.end} onChange={(e) => e.target.value && set({ end: e.target.value })} />
      </div>
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={w.lunch} onChange={(e) => set({ lunch: e.target.checked })} /> 점심
        </label>
        {w.lunch && (
          <>
            <input type="time" value={w.lunchStart} onChange={(e) => e.target.value && set({ lunchStart: e.target.value })} />
            <span>~</span>
            <input type="time" value={w.lunchEnd} onChange={(e) => e.target.value && set({ lunchEnd: e.target.value })} />
            <label className="check small">
              <input type="checkbox" checked={w.lunchPaid} onChange={(e) => set({ lunchPaid: e.target.checked })} /> 이때도 돈 오름
            </label>
          </>
        )}
      </div>
      <div className="field">
        <span>월급날</span>
        <select value={w.payday} onChange={(e) => set({ payday: Number(e.target.value) })}>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1 === 31 ? '말일' : `${i + 1}일`}
            </option>
          ))}
        </select>
      </div>
      <div className="calc">
        월 {fmtWon(monthlyPay(w))} · 시급 약 {fmtWon(hourlyWage(w))} (최저시급의 {(hourlyWage(w) / MIN_WAGE_2026).toFixed(1)}배){t.daily ? ` · 오늘 일당 ${fmtWon(t.daily)}` : ''}
        <div className="faint small">일당 = 월급 ÷ 그달 근무일 수. 공휴일은 따지지 않아요.</div>
      </div>
    </div>
  )
}

function KeyCapture({ value, onChange }: { value: string; onChange: (v: string) => void }): React.JSX.Element {
  const [rec, setRec] = useState(false)
  const [bad, setBad] = useState('')
  return (
    <button
      className={`keycap ${rec ? 'rec' : ''}`}
      onClick={() => {
        setRec(true)
        setBad('')
      }}
      onBlur={() => setRec(false)}
      onKeyDown={async (e) => {
        if (!rec) return
        e.preventDefault()
        if (e.key === 'Escape') return setRec(false)
        if (e.key === 'Backspace' || e.key === 'Delete') {
          onChange('')
          return setRec(false)
        }
        const a = accelFromEvent(e, api.platform)
        if (!a) return
        setRec(false)
        if (await api.checkShortcut(a)) onChange(a)
        else setBad(`${accelLabel(a, api.platform)} 은(는) 다른 앱이 쓰고 있어요`)
      }}
    >
      {rec ? '새 단축키를 누르세요…' : value ? accelLabel(value, api.platform) : '없음 (눌러서 정하기)'}
      {bad && <span className="err"> {bad}</span>}
    </button>
  )
}

const LINES_EXAMPLE = `부장님 뒤에 계심 👀
오늘 벌써 {earned} 벌었다!
퇴근까지 {left}…\n조금만 버티자
# 으로 시작하는 줄은 메모 (말 안 함)`

/** 펫이 할 말 직접 정하기 */
function LinesCard({ st }: { st: PersistedState }): React.JSX.Element {
  const s = st.settings
  const [txt, setTxt] = useState(s.customLines)
  const [saved, setSaved] = useState(false)
  useEffect(() => setTxt(s.customLines), [s.customLines])
  const n = txt.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length
  const save = (): void => {
    void api.setSettings({ customLines: txt })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }
  return (
    <section className="card">
      <div className="h">💬 펫이 할 말</div>
      <div className="faint small">
        한 줄에 하나씩 적으면 펫이 가끔 그중 하나를 말해요 (킹받는 쪽지에도 나와요). 말풍선 안에서 줄을 바꾸려면 <b>\n</b>. 넣을 수 있는 값: <b>{'{earned}'}</b> 오늘 번 돈 · <b>{'{left}'}</b> 퇴근까지 ·{' '}
        <b>{'{daily}'}</b> 일당 · <b>{'{perMin}'}</b> 분당 · <b>{'{over}'}</b> 야근 시간
      </div>
      <textarea className="lines" rows={6} value={txt} placeholder={LINES_EXAMPLE} onChange={(e) => setTxt(e.target.value)} onBlur={save} />
      <div className="row between">
        <div className="seg small">
          <button className={s.customMode === 'mix' ? 'on' : ''} onClick={() => void api.setSettings({ customMode: 'mix' })}>
            기본 대사와 섞기
          </button>
          <button className={s.customMode === 'only' ? 'on' : ''} onClick={() => void api.setSettings({ customMode: 'only' })}>
            내 대사만
          </button>
        </div>
        <button className="btn small" onClick={save}>
          {saved ? '저장했어요 ✓ (펫이 말해 봐요)' : `저장 (${n}줄)`}
        </button>
      </div>
      <label className="field">
        <span>말하는 간격</span>
        <input type="range" min={15} max={300} step={15} value={s.chatterEvery} onChange={(e) => void api.setSettings({ chatterEvery: Number(e.target.value) })} />
        <b className="num">약 {s.chatterEvery < 60 ? `${s.chatterEvery}초` : `${Math.round(s.chatterEvery / 60)}분`}</b>
      </label>
    </section>
  )
}

export function Settings({ st }: { st: PersistedState }): React.JSX.Element {
  const s = st.settings
  const set = (p: Partial<S>): void => void api.setSettings(p)
  const toggleShow = (k: ShowItem): void => set({ show: s.show.includes(k) ? s.show.filter((x) => x !== k) : [...s.show, k] })
  return (
    <div className="settings">
      <section className="card">
        <div className="h">💰 내 월급</div>
        <WorkForm st={st} />
      </section>

      <section className="card">
        <div className="h">🏷 펫 머리 위에 보여 줄 것</div>
        <div className="faint small">고른 것들을 번갈아 보여 줘요. 펫 머리 위 표시를 누르면 바로 다음 것으로 넘어가요.</div>
        <div className="checks">
          {(Object.keys(SHOW_LABEL) as ShowItem[]).map((k) => (
            <label key={k} className="check">
              <input type="checkbox" checked={s.show.includes(k)} onChange={() => toggleShow(k)} /> {SHOW_LABEL[k]}
            </label>
          ))}
        </div>
        <label className="field">
          <span>바꾸는 간격</span>
          <input type="range" min={2} max={30} value={s.showEvery} onChange={(e) => set({ showEvery: Number(e.target.value) })} />
          <b className="num">{s.showEvery}초</b>
        </label>
        <label className="field">
          <span>글자 크기</span>
          <input type="range" min={0.8} max={1.8} step={0.1} value={s.textScale} onChange={(e) => set({ textScale: Number(e.target.value) })} />
          <b className="num">{Math.round(s.textScale * 100)}%</b>
        </label>
        <div className="faint small">폰으로 모니터를 찍어 올릴 거면 글자를 크게 해 두면 잘 보여요 📱</div>
      </section>

      <LinesCard st={st} />

      <section className="card">
        <div className="h">🐾 펫</div>
        <Toggle on={s.chatter} onChange={(v) => set({ chatter: v })}>
          혼잣말 (가끔 말풍선)
        </Toggle>
        <Toggle on={s.sound} onChange={(v) => set({ sound: v })}>
          효과음
        </Toggle>
        <Toggle on={s.awaySwarm} onChange={(v) => set({ awaySwarm: v })}>
          자리 비우면 펫 떼가 창 점령 (돌아오면 후다닥)
        </Toggle>
        <Toggle on={s.leaveParty} onChange={(v) => set({ leaveParty: v })}>
          퇴근 10분 전 칼퇴 시위 · 퇴근 행렬 · 루팡 영수증
        </Toggle>
        <Toggle on={s.hideOnFullscreen} onChange={(v) => set({ hideOnFullscreen: v })}>
          전체화면 영상·발표 중에는 숨기기
        </Toggle>
        <label className="field">
          <span>자리 비움 알아채기</span>
          <select value={s.autoLupangMin} onChange={(e) => set({ autoLupangMin: Number(e.target.value) })}>
            <option value={0}>안 함</option>
            {[5, 10, 15, 20, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m}분 넘게 비우면
              </option>
            ))}
          </select>
        </label>
        <div className="faint small">근무 시간에 그만큼 입력이 없다가 돌아오면 "루팡으로 적을까?" 하고 물어봐요.</div>
      </section>

      <section className="card">
        <div className="h">🌐 인터넷 창</div>
        <label className="field">
          <span>첫 화면</span>
          <input className="text" defaultValue={s.browserHome} onBlur={(e) => set({ browserHome: /^https?:\/\//.test(e.target.value) ? e.target.value : `https://${e.target.value}` })} />
        </label>
        <div className="field">
          <span>숨기기 단축키</span>
          <KeyCapture value={s.bossKey} onChange={(v) => set({ bossKey: v })} />
        </div>
        <div className="faint small">어느 앱을 쓰고 있든 이 키를 누르면 인터넷 창만 바로 숨고, 다시 누르면 그대로 돌아와요.</div>
        <Toggle on={s.bossMute} onChange={(v) => set({ bossMute: v })}>
          숨길 때 소리도 끄기
        </Toggle>
        <Toggle on={s.bossHidesPet} onChange={(v) => set({ bossHidesPet: v })}>
          숨길 때 펫도 같이 숨기기
        </Toggle>
        <Toggle on={s.browserOnTop} onChange={(v) => set({ browserOnTop: v })}>
          인터넷 창을 항상 위에
        </Toggle>
        <label className="field">
          <span>투명도</span>
          <input type="range" min={0.3} max={1} step={0.05} value={s.browserOpacity} onChange={(e) => set({ browserOpacity: Number(e.target.value) })} />
          <b className="num">{Math.round(s.browserOpacity * 100)}%</b>
        </label>
      </section>

      <section className="card">
        <div className="h">⚙️ 기타</div>
        <Toggle on={s.openAtLogin} onChange={(v) => set({ openAtLogin: v })}>
          컴퓨터를 켜면 자동으로 시작
        </Toggle>
        <Toggle on={s.hidden} onChange={(v) => set({ hidden: v })}>
          펫 숨기기
        </Toggle>
      </section>
    </div>
  )
}
