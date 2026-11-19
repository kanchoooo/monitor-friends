import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { DEFAULT_WORK, earnedBetween, hm, workSecondsBetween, type WorkSettings } from '@shared/money'
import { BUILTIN_PETS, type PetMeta } from '@shared/pet'
import type { LupangKind, LupangSession, PersistedState, Settings, ShowItem, Stats } from '@shared/types'
import { SHOW_LABEL } from '@shared/types'
import { now } from './env'

type Listener = (s: PersistedState) => void

export const DEFAULT_SETTINGS: Settings = {
  work: { ...DEFAULT_WORK },
  show: ['today', 'leave', 'food', 'dday', 'overtime'],
  showEvery: 6,
  petId: 'builtin:merong',
  extraPets: [],
  petSize: 110,
  activity: 1,
  chatter: true,
  customLines: '',
  customMode: 'mix',
  chatterEvery: 90,
  textScale: 1,
  sound: true,
  hidden: false,
  hideOnFullscreen: true,
  autoLupangMin: 10,
  awaySwarm: true,
  leaveParty: true,
  browserHome: 'https://www.google.com/',
  bossKey: process.platform === 'darwin' ? 'Control+Shift+Space' : 'Control+Shift+Space',
  bossMute: true,
  bossHidesPet: true,
  browserOnTop: false,
  browserOpacity: 1,
  openAtLogin: true
}

const LUPANG_MAX = 1000
const STATS: Stats = { pets: 0, throws: 0, treats: 0, filesHelped: 0, filesEaten: 0, clones: 0, parties: 0 }

/** userData/state.json 에 저장되는 작은 JSON 저장소 */
export class Store {
  private file: string
  private listeners = new Set<Listener>()
  private saveTimer: NodeJS.Timeout | null = null
  state: PersistedState

  constructor() {
    this.file = join(app.getPath('userData'), 'state.json')
    this.state = this.load()
  }

  private load(): PersistedState {
    const fresh: PersistedState = {
      settings: sanitize(DEFAULT_SETTINGS),
      onboarded: false,
      lupangOn: null,
      lupangKind: 'button',
      lupang: [],
      pets: [],
      stats: { ...STATS },
      lastSpot: null
    }
    try {
      if (!existsSync(this.file)) return fresh
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<PersistedState>
      const rs = (raw.settings ?? {}) as Partial<Settings>
      const pets = Array.isArray(raw.pets) ? raw.pets.filter((p) => p && typeof p.id === 'string' && /^[a-z0-9-]{4,40}$/.test(p.id) && existsSync(this.petFile(p.id))) : []
      return {
        settings: sanitize({ ...DEFAULT_SETTINGS, ...rs, work: { ...DEFAULT_WORK, ...(rs.work ?? {}) } }, pets),
        onboarded: !!raw.onboarded,
        lupangOn: typeof raw.lupangOn === 'number' ? raw.lupangOn : null,
        lupangKind: raw.lupangKind === 'toilet' ? 'toilet' : 'button',
        lupang: Array.isArray(raw.lupang) ? raw.lupang.filter((s) => s && Number.isFinite(s.start) && Number.isFinite(s.end)).slice(-LUPANG_MAX) : [],
        pets,
        stats: { ...STATS, ...(raw.stats ?? {}) },
        lastSpot: raw.lastSpot && Number.isFinite(raw.lastSpot.x) ? raw.lastSpot : null
      }
    } catch (err) {
      console.error('[store] load failed, starting fresh', err)
      return fresh
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = this.file + '.tmp'
      writeFileSync(tmp, JSON.stringify(this.state, null, 1))
      renameSync(tmp, this.file)
    } catch (err) {
      console.error('[store] save failed', err)
    }
  }

  private saveSoon(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.save()
    }, 3000)
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.save()
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  private commit(next: PersistedState, lazy = false, quiet = false): PersistedState {
    this.state = next
    if (lazy) this.saveSoon()
    else this.save()
    if (!quiet) for (const l of this.listeners) l(next)
    return next
  }

  setSettings(patch: Partial<Settings>): PersistedState {
    return this.commit({ ...this.state, settings: sanitize({ ...this.state.settings, ...patch }, this.state.pets) })
  }

  setWork(patch: Partial<WorkSettings>): PersistedState {
    return this.setSettings({ work: { ...this.state.settings.work, ...patch } })
  }

  setOnboarded(): PersistedState {
    return this.commit({ ...this.state, onboarded: true })
  }

  setSpot(spot: PersistedState['lastSpot']): void {
    this.commit({ ...this.state, lastSpot: spot }, true, true)
  }

  bump(key: keyof Stats, n = 1): void {
    this.commit({ ...this.state, stats: { ...this.state.stats, [key]: (this.state.stats[key] ?? 0) + n } }, true)
  }

  // ───────── 루팡(자리비움) ─────────

  lupangStart(at = now(), kind: LupangKind = 'button'): void {
    if (this.state.lupangOn) return
    this.commit({ ...this.state, lupangOn: at, lupangKind: kind === 'toilet' ? 'toilet' : 'button' })
  }

  /** 자리비움 끝 → 기록. 근무 시간과 안 겹쳤으면(퇴근 뒤 등) 기록하지 않고 null */
  lupangEnd(at = now(), kind: LupangKind = this.state.lupangKind, start = this.state.lupangOn): LupangSession | null {
    if (!start) return null
    const w = this.state.settings.work
    const sec = workSecondsBetween(w, start, at)
    const s: LupangSession = { start, end: at, earned: earnedBetween(w, start, at), sec, kind }
    const keep = sec >= 5
    this.commit({ ...this.state, lupangOn: kind === 'auto' || start !== this.state.lupangOn ? this.state.lupangOn : null, lupang: keep ? [...this.state.lupang, s].slice(-LUPANG_MAX) : this.state.lupang })
    return keep ? s : null
  }

  deleteLupang(start: number): void {
    this.commit({ ...this.state, lupang: this.state.lupang.filter((s) => s.start !== start) })
  }

  // ───────── 내가 만든 펫 ─────────

  get petDir(): string {
    return join(app.getPath('userData'), 'pets')
  }

  petFile(id: string): string {
    return join(this.petDir, `${id}.png`)
  }

  readPet(id: string): Uint8Array | null {
    if (!/^[a-z0-9-]{4,40}$/.test(id)) return null
    try {
      return new Uint8Array(readFileSync(this.petFile(id)))
    } catch {
      return null
    }
  }

  savePet(name: string, png: Uint8Array, id?: string): PetMeta {
    const pid = id && /^[a-z0-9-]{4,40}$/.test(id) ? id : `pet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    mkdirSync(this.petDir, { recursive: true })
    writeFileSync(this.petFile(pid), png)
    const meta: PetMeta = { id: pid, name: cleanName(name) || '내 펫', createdAt: Date.now() }
    const pets = [...this.state.pets.filter((p) => p.id !== pid), meta]
    this.commit({ ...this.state, pets, settings: { ...this.state.settings, petId: pid } })
    return meta
  }

  renamePet(id: string, name: string): void {
    const n = cleanName(name)
    if (!n) return
    this.commit({ ...this.state, pets: this.state.pets.map((p) => (p.id === id ? { ...p, name: n } : p)) })
  }

  deletePet(id: string): void {
    try {
      rmSync(this.petFile(id), { force: true })
    } catch {
      /* 없으면 그만 */
    }
    const pets = this.state.pets.filter((p) => p.id !== id)
    const cur = this.state.settings
    const settings = { ...cur, petId: cur.petId === id ? BUILTIN_PETS[0].id : cur.petId, extraPets: cur.extraPets.filter((x) => x !== id && x !== (cur.petId === id ? BUILTIN_PETS[0].id : cur.petId)) }
    this.commit({ ...this.state, pets, settings })
  }
}

function cleanName(s: unknown): string {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) : ''
}

const clamp = (v: unknown, a: number, b: number, d: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d
}

const HM = /^\d{1,2}:\d{2}$/

function sanitize(s: Settings, pets: PetMeta[] = []): Settings {
  const w = s.work
  const D = DEFAULT_WORK
  const work: WorkSettings = {
    payType: w.payType === 'month' ? 'month' : 'year',
    pay: clamp(w.pay, 0, 100_000_000_000, D.pay),
    workDays: Array.isArray(w.workDays) ? [...new Set(w.workDays.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : D.workDays,
    start: HM.test(w.start) && hm(w.start) < 86_400 ? w.start : D.start,
    end: HM.test(w.end) && hm(w.end) < 86_400 ? w.end : D.end,
    lunch: !!w.lunch,
    lunchStart: HM.test(w.lunchStart) ? w.lunchStart : D.lunchStart,
    lunchEnd: HM.test(w.lunchEnd) ? w.lunchEnd : D.lunchEnd,
    lunchPaid: !!w.lunchPaid,
    payday: Math.round(clamp(w.payday, 1, 31, D.payday))
  }
  const validPet = BUILTIN_PETS.some((p) => p.id === s.petId) || pets.some((p) => p.id === s.petId)
  return {
    ...s,
    work,
    show: Array.isArray(s.show) ? (s.show.filter((x, i, a) => x in SHOW_LABEL && a.indexOf(x) === i) as ShowItem[]) : DEFAULT_SETTINGS.show,
    showEvery: Math.round(clamp(s.showEvery, 2, 60, 6)),
    petId: validPet ? s.petId : BUILTIN_PETS[0].id,
    extraPets: Array.isArray(s.extraPets)
      ? s.extraPets.filter((id, i, a) => typeof id === 'string' && id !== (validPet ? s.petId : BUILTIN_PETS[0].id) && a.indexOf(id) === i && (BUILTIN_PETS.some((p) => p.id === id) || pets.some((p) => p.id === id))).slice(0, 5)
      : [],
    petSize: Math.round(clamp(s.petSize, 60, 220, 110)),
    activity: Math.round(clamp(s.activity, 0, 2, 1)),
    textScale: clamp(s.textScale, 0.8, 1.8, 1),
    customLines: typeof s.customLines === 'string' ? s.customLines.slice(0, 5000) : '',
    customMode: s.customMode === 'only' ? 'only' : 'mix',
    chatterEvery: Math.round(clamp(s.chatterEvery, 15, 600, 90)),
    autoLupangMin: Math.round(clamp(s.autoLupangMin, 0, 120, 10)),
    browserHome: typeof s.browserHome === 'string' && /^https?:\/\//.test(s.browserHome) ? s.browserHome.slice(0, 500) : DEFAULT_SETTINGS.browserHome,
    bossKey: typeof s.bossKey === 'string' ? s.bossKey.slice(0, 60) : DEFAULT_SETTINGS.bossKey,
    browserOpacity: clamp(s.browserOpacity, 0.3, 1, 1)
  }
}
