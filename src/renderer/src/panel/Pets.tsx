import { useEffect, useMemo, useRef, useState } from 'react'
import { ATLAS_H, ATLAS_W, BUILTIN_PETS, POSE_LABEL, POSES } from '@shared/pet'
import { buildPetPrompt, PET_GUIDE_STEPS, PET_KINDS, PET_STYLES, type PetKind, type PetStyle } from '@shared/petPrompt'
import type { PersistedState } from '@shared/types'
import exampleUrl from '@/assets/pets/default-sheet.webp'
import { processSheet, type SheetResult } from '@/common/sheet'
import { forgetAtlas, PetLoop, PetThumb, useAtlas } from './usePet'

const api = window.api

function PetCard({ id, name, sub, st, children }: { id: string; name: string; sub?: string; st: PersistedState; children?: React.ReactNode }): React.JSX.Element {
  const atlas = useAtlas(id)
  const main = st.settings.petId === id
  const extra = st.settings.extraPets.includes(id)
  const full = st.settings.extraPets.length >= 5
  const pickMain = (): void => void api.setSettings({ petId: id, extraPets: st.settings.extraPets.filter((x) => x !== id) })
  const toggle = (): void => void api.setSettings({ extraPets: extra ? st.settings.extraPets.filter((x) => x !== id) : [...st.settings.extraPets, id] })
  return (
    <div className={`petcard ${main ? 'on' : extra ? 'with' : ''}`} onClick={() => !main && pickMain()} title={main ? '대표' : '눌러서 대표로'}>
      {main && <span className="badge">대표</span>}
      {extra && <span className="badge with">함께</span>}
      <div className="pc-img">{atlas && (main || extra ? <PetLoop atlas={atlas} size={86} /> : <PetThumb atlas={atlas} size={86} />)}</div>
      <div className="pc-name">{name}</div>
      {sub && <div className="pc-sub">{sub}</div>}
      {!main && (
        <button
          className={`chip tiny ${extra ? 'on' : ''}`}
          disabled={!extra && full}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
        >
          {extra ? '✓ 함께 놓는 중' : '＋ 함께 놓기'}
        </button>
      )}
      {children}
    </div>
  )
}

export function Pets({ st }: { st: PersistedState }): React.JSX.Element {
  const [make, setMake] = useState(false)
  const [msg, setMsg] = useState('')
  if (make) return <Maker onDone={() => setMake(false)} />
  return (
    <div className="pets">
      <section className="card">
        <div className="faint small" style={{ marginBottom: 8 }}>
          카드를 누르면 <b>대표</b>(머리 위 표시·메뉴 담당), <b>＋ 함께 놓기</b>로 좋아하는 캐릭터를 최대 5마리까지 같이 띄워요. 서로 만나면 하이파이브도 해요.
        </div>
        <div className="h">기본 캐릭터</div>
        <div className="petgrid">
          {BUILTIN_PETS.map((p) => (
            <PetCard key={p.id} id={p.id} name={p.name} sub={p.desc} st={st} />
          ))}
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <div className="h">내가 만든 캐릭터</div>
          <button className="btn small" onClick={() => setMake(true)}>
            ＋ 새 캐릭터 만들기
          </button>
        </div>
        {st.pets.length === 0 ? (
          <div className="empty" onClick={() => setMake(true)}>
            <div className="big">📷 → 🐾</div>
            반려동물·내 캐릭터·최애·물건 사진으로 나만의 친구를 만들어 보세요.
            <br />
            ChatGPT 이미지 생성으로 5분이면 돼요.
          </div>
        ) : (
          <div className="petgrid">
            {st.pets.map((p) => (
              <PetCard key={p.id} id={p.id} name={p.name} st={st}>
                <div className="pc-acts" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="link"
                    onClick={() => {
                      const n = prompt('새 이름', p.name)
                      if (n) void api.renamePet(p.id, n)
                    }}
                  >
                    이름
                  </button>
                  <button
                    className="link"
                    onClick={async () => {
                      const r = await api.exportPet(p.id)
                      if (r === 'saved') setMsg(`"${p.name}" 캐릭터 파일을 저장했어요. 친구에게 보내면 친구도 가져올 수 있어요!`)
                    }}
                  >
                    보내기
                  </button>
                  <button
                    className="link red"
                    onClick={() => {
                      if (confirm(`"${p.name}" 캐릭터를 지울까요?`)) {
                        forgetAtlas(p.id)
                        void api.deletePet(p.id)
                      }
                    }}
                  >
                    지우기
                  </button>
                </div>
              </PetCard>
            ))}
          </div>
        )}
        {msg && <div className="ok">{msg}</div>}
      </section>

      <section className="card">
        <div className="h">크기·움직임</div>
        <label className="field">
          <span>크기</span>
          <input type="range" min={60} max={200} step={5} value={st.settings.petSize} onChange={(e) => void api.setSettings({ petSize: Number(e.target.value) })} />
          <b className="num">{st.settings.petSize}px</b>
        </label>
        <div className="field">
          <span>움직임</span>
          <div className="seg">
            {['얌전', '보통', '활발'].map((l, i) => (
              <button key={l} className={st.settings.activity === i ? 'on' : ''} onClick={() => void api.setSettings({ activity: i })}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ───────── 새 펫 만들기 ─────────

function Maker({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [lang, setLang] = useState<'ko' | 'en'>('en')
  const [kind, setKind] = useState<PetKind>('any')
  const [style, setStyle] = useState<PetStyle>('keep')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)
  const [src, setSrc] = useState<ImageBitmap | null>(null)
  const [srcAtlas, setSrcAtlas] = useState(false)
  const [res, setRes] = useState<SheetResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [tol, setTol] = useState(40)
  const [flip, setFlip] = useState(false)
  const [name, setName] = useState('')
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const example = exampleUrl

  useEffect(() => {
    if (!src) return
    let alive = true
    setBusy(true)
    setErr('')
    const run = async (): Promise<SheetResult> => {
      // 친구가 보낸 펫 파일(이미 규격대로 된 1024×768 투명 그림)은 그대로
      if (srcAtlas) {
        const cv = document.createElement('canvas')
        cv.width = ATLAS_W
        cv.height = ATLAS_H
        cv.getContext('2d')!.drawImage(src, 0, 0)
        return { atlas: cv, method: 'grid', warnings: [], bg: 'alpha' }
      }
      return processSheet(src, { tolerance: tol, flipWalk: flip })
    }
    const t = setTimeout(() => {
      run()
        .then((r) => alive && setRes(r))
        .catch((e: Error) => alive && setErr(e.message || '그림을 처리하지 못했어요'))
        .finally(() => alive && setBusy(false))
    }, 30)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [src, srcAtlas, tol, flip])

  const load = async (f: File | undefined): Promise<void> => {
    if (!f) return
    if (!/^image\//.test(f.type) && !/\.(png|jpe?g|webp)$/i.test(f.name)) {
      setErr('PNG·JPG·WEBP 그림 파일을 넣어 주세요')
      return
    }
    try {
      const bmp = await createImageBitmap(f)
      setSrcAtlas(bmp.width === ATLAS_W && bmp.height === ATLAS_H && /\.(프렌즈|모니터 프렌즈)\.png$|mypet|friends/i.test(f.name))
      setSrc(bmp)
      setRes(null)
      if (!name) setName(f.name.replace(/(\.(프렌즈|모니터 프렌즈))?\.(png|jpe?g|webp)$/i, '').slice(0, 12))
    } catch {
      setErr('그림을 열지 못했어요')
    }
  }

  const save = async (): Promise<void> => {
    if (!res) return
    const blob = await new Promise<Blob | null>((r) => res.atlas.toBlob(r, 'image/png'))
    if (!blob) return
    const meta = await api.savePet(name.trim() || '내 친구', new Uint8Array(await blob.arrayBuffer()))
    forgetAtlas(meta.id)
    onDone()
  }

  const prompt = buildPetPrompt({ kind, style, note }, lang)

  return (
    <div className="maker" onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={(e) => (e.preventDefault(), setOver(false), void load(e.dataTransfer.files[0]))}>
      <div className="row between">
        <button className="link" onClick={onDone}>
          ← 캐릭터 목록으로
        </button>
        <div className="h">나만의 캐릭터 만들기</div>
        <span />
      </div>

      {!res && (
        <>
          <section className="card">
            <ol className="steps">
              {PET_GUIDE_STEPS.map((s, i) => (
                <li key={i}>
                  <b>{s.title}</b>
                  <div className="faint">{s.body}</div>
                </li>
              ))}
            </ol>
          </section>
          <section className="card">
            <div className="h">무엇으로 만들까요?</div>
            <div className="chips">
              {PET_KINDS.map((k) => (
                <button key={k.id} className={`chip ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)}>
                  {k.label}
                </button>
              ))}
            </div>
            <div className="faint small">{PET_KINDS.find((k) => k.id === kind)!.hint}</div>
            <div className="field">
              <span>그림체</span>
              <div className="seg">
                {PET_STYLES.map((st) => (
                  <button key={st.id} className={style === st.id ? 'on' : ''} onClick={() => setStyle(st.id)}>
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>특징 (선택)</span>
              <input className="text" value={note} maxLength={120} placeholder="예: 갈색 푸들, 빨간 목도리 / 안경 쓴 단발머리" onChange={(e) => setNote(e.target.value)} />
            </label>
          </section>
          <section className="card">
            <div className="row between">
              <div className="h">ChatGPT 에 붙여 넣을 요청문</div>
              <div className="seg small">
                <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
                  영어(추천)
                </button>
                <button className={lang === 'ko' ? 'on' : ''} onClick={() => setLang('ko')}>
                  한국어
                </button>
              </div>
            </div>
            <pre className="prompt">{prompt}</pre>
            <div className="row gap">
              <button
                className="btn wide"
                onClick={() => {
                  void api.copyText(prompt)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? '복사했어요 ✓' : '📋 요청문 복사'}
              </button>
              <button className="btn ghost" onClick={() => void api.openExternal('https://chatgpt.com/')}>
                ChatGPT 열기
              </button>
            </div>
            <div className="faint small">사진·그림을 꼭 같이 첨부하세요. 여러 캐릭터를 만들려면 하나씩 따로 만들어서 「함께 놓기」로 같이 띄우면 돼요. 이런 모양이 나오면 성공이에요 ↓</div>
            <img className="example" src={example} alt="예시 시트" />
          </section>
        </>
      )}

      <section className={`card drop ${over ? 'over' : ''}`} onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void load(e.target.files?.[0])} />
        {busy ? (
          <div className="big">✂️ 배경 지우고 자르는 중…</div>
        ) : res ? (
          <div className="faint">다른 그림으로 바꾸려면 여기에 끌어다 놓거나 눌러요</div>
        ) : (
          <>
            <div className="big">⬇️ 받은 그림을 여기에 끌어다 놓기</div>
            <div className="faint">또는 눌러서 고르기 · 친구가 보낸 캐릭터 파일(.프렌즈.png)도 돼요</div>
          </>
        )}
        {err && <div className="err">{err}</div>}
      </section>

      {res && (
        <>
          <section className="card">
            <div className="row between">
              <div className="h">미리 보기</div>
              <div className="pv-live">{<PetLoop atlas={res.atlas} size={96} />}</div>
            </div>
            {res.warnings.map((w, i) => (
              <div key={i} className="warn">
                ⚠️ {w}
              </div>
            ))}
            <div className="posegrid">
              {POSES.map((p) => (
                <div key={p} className="pose">
                  <PetThumb atlas={res.atlas} pose={p} size={78} />
                  <span>{POSE_LABEL[p]}</span>
                </div>
              ))}
            </div>
            {!srcAtlas && (
              <>
                <label className="field">
                  <span>배경 지우기</span>
                  <input type="range" min={5} max={95} value={tol} onChange={(e) => setTol(Number(e.target.value))} />
                  <b className="num">{tol}</b>
                </label>
                <label className="check">
                  <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> 걷기 뒤집기 (걷는 그림이 왼쪽을 볼 때)
                </label>
              </>
            )}
          </section>
          <section className="card">
            <label className="field">
              <span>이름</span>
              <input className="text" value={name} maxLength={16} placeholder="예: 우리 집 보리" onChange={(e) => setName(e.target.value)} />
            </label>
            <button className="btn big" disabled={busy} onClick={() => void save()}>
              이 친구로 할래요 🐾
            </button>
          </section>
        </>
      )}
    </div>
  )
}
