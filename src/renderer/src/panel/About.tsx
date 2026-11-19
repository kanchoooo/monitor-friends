import { useEffect, useState } from 'react'
import { accelLabel } from '@shared/accel'
import type { PersistedState } from '@shared/types'
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, MORE_APPS_URL } from '@shared/types'

const api = window.api

export function About({ st }: { st: PersistedState }): React.JSX.Element {
  const [ver, setVer] = useState('')
  useEffect(() => void api.version().then(setVer), [])
  const boss = st.settings.bossKey ? accelLabel(st.settings.bossKey, api.platform) : null
  const s = st.stats
  return (
    <div className="about">
      <section className="card">
        <div className="h">하는 법</div>
        <ul className="tips">
          <li>
            <b>누르기</b> → 메뉴: 자리비움(루팡) · 인터넷 · 장난치기 · 자랑하기 · 파일 도우미 · 재우기
          </li>
          <li>
            <b>끌기</b> → 깜짝 놀라며 들려요. 창 위에 올려 두면 그 창을 옮길 때 같이 움직여요. 휙 던지면 날아가서 튕겨요
          </li>
          <li>
            <b>문지르기</b> → 커서로 펫을 좌우로 문지르면 쓰다듬기 💕 · 너무 여러 번 누르면 삐져요
          </li>
          <li>
            <b>파일 주기</b> → 파일을 펫 위에 끌어다 놓으면 형식 바꾸기 · 크기 · 용량 줄이기 · PDF · 이어 붙이기 · GIF · 압축 · 글자 수 · 휴지통(냠냠)
          </li>
          <li>
            <b>인터넷</b> → 펫 메뉴의 🌐. {boss ? <><b>{boss}</b> 한 번이면 인터넷 창만 숨고(소리도 꺼짐), 다시 누르면 돌아와요</> : '설정에서 숨기기 단축키를 정할 수 있어요'}
          </li>
          <li>
            <b>루팡</b> → 자리 비울 때 🕶 자리비움, 돌아와서 한 번 더 → 그동안 번 돈이 루팡 금액으로 쌓여요. 비운 동안 펫이 대신 일하는 척해요
          </li>
          <li>
            <b>퇴근 시간</b> → 10초 카운트다운 + 꽃가루 🎉
          </li>
          <li>
            <b>숨기기·끄기</b> → 메뉴 막대(맥) · 작업 표시줄 트레이(윈도우)의 🐾 아이콘
          </li>
        </ul>
      </section>

      <section className="card">
        <div className="h">지금까지</div>
        <div className="statgrid">
          <span>쓰다듬기 {s.pets}번</span>
          <span>던지기 {s.throws}번</span>
          <span>간식 {s.treats}개</span>
          <span>파일 도움 {s.filesHelped}개</span>
          <span>파일 냠냠 {s.filesEaten}개</span>
          <span>분신술 {s.clones}번</span>
          <span>칼퇴 축하 {s.parties}번</span>
          <span>루팡 {st.lupang.length}번</span>
        </div>
      </section>

      <section className="card follow">
        <div className="h">🎁 새로 나온 재밌는 앱 먼저 해 보기</div>
        <div className="faint">팔로우하면 이런 쓸데없이 재밌는 앱을 바로바로 해 볼 수 있어요</div>
        <div className="row gap">
          <button className="btn wide" onClick={() => void api.openExternal(INSTAGRAM_URL)}>
            인스타그램 {INSTAGRAM_HANDLE}
          </button>
          <button className="btn wide ghost" onClick={() => void api.openExternal(MORE_APPS_URL)}>
            개발자의 다른 앱 보기
          </button>
        </div>
      </section>

      <div className="faint small center">
        모니터 프렌즈 {ver} · 기본 캐릭터·효과음은 오리지널 · 내 월급 정보는 이 컴퓨터에만 저장돼요
      </div>
    </div>
  )
}
