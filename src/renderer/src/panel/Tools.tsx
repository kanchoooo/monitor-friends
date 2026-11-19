import { useEffect, useState } from 'react'
import type { DroppedFile, ToolDef, ToolProgress, ToolResult } from '@shared/tools'
import { TOOLS } from '@shared/tools'

const api = window.api

function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)}MB`
  return `${(n / 1024 ** 3).toFixed(2)}GB`
}

export function Tools(): React.JSX.Element {
  const [files, setFiles] = useState<DroppedFile[]>([])
  const [tools, setTools] = useState<ToolDef[]>([])
  const [sel, setSel] = useState<ToolDef | null>(null)
  const [opts, setOpts] = useState<Record<string, string>>({})
  const [prog, setProg] = useState<ToolProgress | null>(null)
  const [res, setRes] = useState<ToolResult | null>(null)
  const [over, setOver] = useState(false)

  useEffect(() => api.onToolProgress(setProg), [])

  const take = async (paths: string[]): Promise<void> => {
    if (!paths.length) return
    const r = await api.inspect(paths)
    setFiles(r.files)
    setTools(r.tools)
    setSel(null)
    setRes(null)
  }
  const choose = (t: ToolDef): void => {
    setSel(t)
    setOpts(Object.fromEntries((t.options ?? []).map((o) => [o.key, o.default])))
    setRes(null)
  }
  const run = async (): Promise<void> => {
    if (!sel) return
    setProg({ done: 0, total: files.length })
    try {
      const r = await api.runTool({ tool: sel.id, files: files.map((f) => f.path), opts })
      setRes(r)
      if (sel.id === 'trash' || sel.id === 'rename') setFiles([])
    } finally {
      setProg(null)
    }
  }

  return (
    <div className="tools">
      <section
        className={`card drop ${over ? 'over' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void take(api.pathsOf([...e.dataTransfer.files]))
        }}
        onClick={async () => take(await api.pickFiles())}
      >
        <div className="big">📂 파일을 여기에 (또는 화면 위 펫에게) 끌어다 놓기</div>
        <div className="faint">눌러서 고를 수도 있어요 · 원본은 그대로 두고 옆에 새 파일을 만들어요</div>
      </section>

      {files.length > 0 && (
        <section className="card">
          <div className="h">받은 파일 {files.length}개</div>
          <ul className="flist">
            {files.slice(0, 8).map((f) => (
              <li key={f.path}>
                <span>{f.dir ? '📁' : f.kind === 'image' || f.kind === 'heic' ? '🖼' : f.kind === 'video' ? '🎬' : f.kind === 'text' ? '📄' : '📦'}</span>
                <span className="fn">{f.name}</span>
                <span className="faint">{f.dir ? '폴더' : fmtSize(f.size)}</span>
              </li>
            ))}
            {files.length > 8 && <li className="faint">… 외 {files.length - 8}개</li>}
          </ul>
          <div className="toolgrid">
            {tools.map((t) => (
              <button key={t.id} className={`tool ${sel?.id === t.id ? 'on' : ''} ${t.id === 'trash' ? 'danger' : ''}`} onClick={() => choose(t)}>
                <i>{t.emoji}</i>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          {sel && (
            <div className="toolopts">
              <div className="faint">{sel.desc}</div>
              {(sel.options ?? []).map((o) => (
                <div key={o.key} className="opt">
                  <div className="ol">{o.label}</div>
                  <div className="chips">
                    {o.choices.map((c) => (
                      <button key={c.value} className={`chip ${opts[o.key] === c.value ? 'on' : ''}`} onClick={() => setOpts({ ...opts, [o.key]: c.value })}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button className={`btn big ${sel.id === 'trash' ? 'red' : ''}`} disabled={!!prog} onClick={() => void run()}>
                {prog ? `${sel.emoji} 하는 중… ${prog.done}/${prog.total}` : `${sel.emoji} ${sel.label}`}
              </button>
            </div>
          )}
        </section>
      )}

      {res && (
        <section className={`card result ${res.ok ? '' : 'bad'}`}>
          <div className="h">{res.message}</div>
          {res.text && (
            <>
              <pre className="prompt">{res.text}</pre>
              <button className="btn small" onClick={() => void api.copyText(res.text!)}>
                📋 복사
              </button>
            </>
          )}
          {res.outputs.length > 0 && (
            <ul className="flist">
              {res.outputs.slice(0, 6).map((p) => (
                <li key={p}>
                  <span className="fn">{p.split(/[\\/]/).pop()}</span>
                  <button className="link" onClick={() => void api.reveal(p)}>
                    폴더에서 보기
                  </button>
                </li>
              ))}
            </ul>
          )}
          {res.failed.map((f, i) => (
            <div key={i} className="warn">
              {f.name}: {f.reason}
            </div>
          ))}
        </section>
      )}

      {!files.length && !res && (
        <section className="card">
          <div className="h">할 수 있는 일</div>
          <ul className="can">
            {TOOLS.map((t) => (
              <li key={t.id}>
                <i>{t.emoji}</i> <b>{t.label}</b> <span className="faint">{t.desc}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
