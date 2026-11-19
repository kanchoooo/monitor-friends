import './panel.css'
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import type { LiveInfo, PanelTab, PersistedState } from '@shared/types'
import { About } from './About'
import { Home } from './Home'
import { Onboard } from './Onboard'
import { Pets } from './Pets'
import { Settings } from './Settings'
import { Tools } from './Tools'

const api = window.api
const TABS: { id: PanelTab; label: string }[] = [
  { id: 'home', label: '오늘' },
  { id: 'pets', label: '캐릭터' },
  { id: 'tools', label: '파일 도우미' },
  { id: 'settings', label: '설정' },
  { id: 'about', label: '정보' }
]

function App(): React.JSX.Element | null {
  const [st, setSt] = useState<PersistedState | null>(null)
  const [live, setLive] = useState<LiveInfo | null>(null)
  const [tab, setTab] = useState<PanelTab>('home')
  const [share, setShare] = useState(0)

  useEffect(() => {
    void api.getState().then(setSt)
    void api.getLive().then(setLive)
    api.onState(setSt)
    api.onLive(setLive)
    api.onTab(setTab)
    api.onShare(() => {
      setTab('home')
      setShare((n) => n + 1)
    })
  }, [])

  if (!st || !live) return null
  if (!st.onboarded) return <Onboard st={st} />
  return (
    <div className={`app ${api.platform}`}>
      <header className="top">
        <div className="brand">
          <span className="paw">🖥️</span> 모니터 프렌즈
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="body">
        {tab === 'home' && <Home st={st} live={live} shareReq={share} />}
        {tab === 'pets' && <Pets st={st} />}
        {tab === 'tools' && <Tools />}
        {tab === 'settings' && <Settings st={st} />}
        {tab === 'about' && <About st={st} />}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
