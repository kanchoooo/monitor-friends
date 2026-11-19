// 처음 켰을 때: 월급·근무 시간 → 펫 고르기
import { useState } from 'react'
import { BUILTIN_PETS } from '@shared/pet'
import type { PersistedState } from '@shared/types'
import { WorkForm } from './Settings'
import { PetLoop, PetThumb, useAtlas } from './usePet'

const api = window.api

function Pick({ id, name, on, onClick }: { id: string; name: string; on: boolean; onClick: () => void }): React.JSX.Element {
  const a = useAtlas(id)
  return (
    <button className={`petcard ${on ? 'on' : ''}`} onClick={onClick}>
      <div className="pc-img">{a && (on ? <PetLoop atlas={a} size={86} /> : <PetThumb atlas={a} size={86} />)}</div>
      <div className="pc-name">{name}</div>
    </button>
  )
}

export function Onboard({ st }: { st: PersistedState }): React.JSX.Element {
  const [step, setStep] = useState(0)
  return (
    <div className={`app onboard ${api.platform}`}>
      <div className="ob-top">
        <div className="paw">🖥️</div>
        <div className="ob-title">모니터 프렌즈에 오신 걸 환영해요</div>
        <div className="faint">내 모니터 위에 사는 친구가 오늘 번 돈 · 퇴근까지 남은 시간을 알려 주고 같이 놀아 줘요</div>
      </div>
      {step === 0 ? (
        <section className="card">
          <div className="h">① 내 월급 알려 주기</div>
          <div className="faint small">캐릭터 머리 위에 1초마다 오르는 오늘 일당을 보여 주려고 써요. 이 컴퓨터 밖으로 나가지 않아요.</div>
          <WorkForm st={st} />
          <button className="btn big" onClick={() => setStep(1)}>
            다음
          </button>
        </section>
      ) : (
        <section className="card">
          <div className="h">② 캐릭터 고르기</div>
          <div className="faint small">나중에 좋아하는 캐릭터·반려동물 그림으로 나만의 친구를 만들어 여러 마리 같이 띄울 수 있어요 (캐릭터 탭)</div>
          <div className="petgrid">
            {BUILTIN_PETS.map((p) => (
              <Pick key={p.id} id={p.id} name={p.name} on={st.settings.petId === p.id} onClick={() => void api.setSettings({ petId: p.id })} />
            ))}
          </div>
          <ul className="tips">
            <li>펫을 <b>누르면</b> 메뉴 (자리비움 · 인터넷 · 장난 · 자랑하기)</li>
            <li>펫을 <b>끌어서</b> 창 위에 올려놓거나 휙 던질 수 있어요</li>
            <li>커서로 <b>문지르면</b> 쓰다듬기 💕</li>
            <li>파일을 펫에게 <b>끌어다 주면</b> 변환·압축·정리해 줘요</li>
          </ul>
          <div className="row gap">
            <button className="btn ghost" onClick={() => setStep(0)}>
              이전
            </button>
            <button className="btn big wide" onClick={() => void api.setOnboarded()}>
              시작하기 🐾
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
