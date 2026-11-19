// 펫 세상: 입력(누르기·끌기·던지기·쓰다듬기) · 알아서 하는 행동 · 머리 위 표시 · 말풍선 · 메뉴 · 파일 도우미 · 장난
import { daysToPayday, earnedBetween, fmtClock, fmtDur, fmtWon, foodOf, today, untilWeekend, yearEarned, type TodayInfo } from '@shared/money'
import type { InputState, LiveInfo, OverlayCommand, OverlayReport, Perch, PrankName, Rect, Settings, ShowItem } from '@shared/types'
import { PRANKS } from '@shared/types'
import type { DroppedFile, ToolDef, ToolId, ToolProgress, ToolResult } from '@shared/tools'
import { sfx, setSound } from '@/common/sound'
import type { PetSprite } from '@/common/sprite'
import { Fx } from './fx'
import { MEMOS, pick, type LineKey } from './lines'
import { FEET_Y } from '@shared/pet'
import { Pet, type PetState } from './pet'

interface Press {
  x: number
  y: number
  t: number
  /** 누른 펫 (대표 펫 또는 같이 노는 펫) */
  who: Pet
  moved: boolean
}

interface Btn {
  label: string
  act: string
  primary?: boolean
}

interface Note {
  id: number
  el: HTMLDivElement
}

interface Treat {
  el: HTMLDivElement
  x: number
  y: number
  vy: number
  landed: boolean
}

/** 스스로 정하는 행동 (사람이 건드리지 않을 때) */
const CALM: PetState[] = ['idle', 'sit', 'sleep', 'work', 'peek']
const SIGNS_PROTEST = ['6시 칼퇴', '야근 반대', '퇴근 보장', '월요일 폐지', '점심 2시간', '연봉 인상', '회의 줄이기', '주 4일']
const SIGNS_LEAVE = ['퇴근', '칼퇴 성공', '내일 봐요', '안녕히 계세요', '퇴근합니다', '수고하셨어요']
const CHANTS = ['✊ 칼퇴 보장!', '✊ 야근 반대!', '✊ 6시는 퇴근!', '✊ 회의는 짧게!', '✊ 월급 인상!']
const CATCHES: [string, string][] = [
  ['🐟', '엑셀에서 월척!'],
  ['📄', '결재 서류를 낚았다…'],
  ['💸', '만 원 낚았다!!'],
  ['🧦', '…양말?'],
  ['📎', '클립 하나'],
  ['🦐', '새우 한 마리'],
  ['☕', '식은 커피'],
  ['📧', '안 읽은 메일 37통'],
  ['🐠', '셀 사이에 사는 물고기']
]

/** 창 점령 박자: 다 같이 앉았다 → 만세 → 손 흔들기 → 타자 … */
const OCCUPY_BEAT: { pose: PetState; dur: number; shout?: string }[] = [
  { pose: 'sit', dur: 1.6 },
  { pose: 'happy', dur: 1.1, shout: '점령!' },
  { pose: 'sit', dur: 1.2 },
  { pose: 'wave', dur: 1.4, shout: '🏴' },
  { pose: 'work', dur: 2.2 },
  { pose: 'happy', dur: 1.1, shout: '만세!' },
  { pose: 'idle', dur: 1.4 }
]

/** 분신 최대 수 */
const MAX_CLONES = 90
const AUTO: PetState[] = ['idle', 'walk', 'sit', 'sleep', 'work', 'eat', 'happy', 'angry', 'wave', 'dizzy', 'dance']

export class World {
  w = 1440
  h = 900
  perches: Perch[] = [{ wid: 0, wx: 0, x0: 12, x1: 1428, y: 852 }]
  settings: Settings | null = null
  sprite: PetSprite | null = null
  /** 대표 펫 (머리 위 표시·메뉴·장난의 주인공) */
  pet: Pet | null = null
  /** 같이 노는 펫들 */
  friends: Pet[] = []
  sprites: PetSprite[] = []
  clones: Pet[] = []
  /** 메뉴를 연 펫 */
  private focus: Pet | null = null
  live: LiveInfo = { lupangOn: null, lupangKind: 'button', lupangToday: 0, toiletToday: 0, lupangSecToday: 0, away: false, idle: 0, browserOpen: false, browserHidden: false }
  nowOffset = 0
  platform = 'darwin'
  readonly fx: Fx
  private stage: HTMLElement
  private input: InputState = { x: -1e4, y: -1e4, l: false, r: false }
  private press: Press | null = null
  private hist: { x: number; y: number; t: number }[] = []
  private dragOff = { x: 0, y: 0 }
  private lastL = false
  private releaseWait = 0
  // 머리 위 표시
  private tag: HTMLDivElement
  private tagText = ''
  private showIdx = 0
  private showT = 0
  /** 같은 항목 안에서 돌려 보여 주기 (먹을 것 종류 · 월급날/주말) */
  private cycle = 0
  /** 퇴근 뒤 마지막으로 컴퓨터를 쓴 시각 (공짜 야근) */
  private otLast = 0
  // 말풍선
  private bubble: HTMLDivElement
  private bubbleUntil = 0
  private bubbleBtns = false
  private bubbleBig = false
  private bubbleText = ''
  // 메뉴
  private menu: HTMLDivElement
  private menuMode: '' | 'main' | 'pranks' | 'files' | 'options' = ''
  private files: DroppedFile[] = []
  private tools: ToolDef[] = []
  private toolSel: ToolDef | null = null
  private toolOpts: Record<string, string> = {}
  private working: ToolProgress | null = null
  private eating = false
  private prog: HTMLDivElement
  private lastOut = ''
  private lastText = ''
  // 장난
  private notes: Note[] = []
  private noteSeq = 0
  private treats: Treat[] = []
  private prank: { name: PrankName; until: number; data?: number } | null = null
  // 기억
  private chatterAt = 0
  private secT = 0
  private lastDay: TodayInfo | null = null
  private wasAway = false
  private partyDone = ''
  private warned = new Set<string>()
  private hotKey = ''
  private spotT = 0
  private dropHover = false
  private cloneWave = 0
  private chantAt = 0
  private swarmed = false
  private rope: HTMLDivElement | null = null
  private beatAt = 0
  private beatIdx = 0
  private fishLine: HTMLDivElement | null = null
  private fishAt = 0
  private fishDepth = 0
  private fishCount = 0
  private stepsT = 0
  time = 0

  constructor(
    stage: HTMLElement,
    private api: { report(r: OverlayReport): void; setHot(r: Rect[], all: boolean): void }
  ) {
    this.stage = stage
    this.fx = new Fx(stage)
    this.tag = div('tag', stage)
    // 바깥 상자는 자리(transform)만, 안쪽이 모양·튀어나오는 효과 — 효과가 자리를 건드려 날아오지 않게
    this.bubble = div('bwrap', stage)
    this.menu = div('mwrap', stage)
    this.prog = div('prog', stage)
    this.tag.dataset.act = 'tag'
    this.hide(this.tag)
    this.hide(this.bubble)
    this.hide(this.menu)
    this.hide(this.prog)
    this.chatterAt = 25 + Math.random() * 30
  }

  now(): number {
    return Date.now() + this.nowOffset
  }

  resize(w: number, h: number): void {
    this.w = w
    this.h = h
    this.fx.resize(w, h)
  }

  // ───────── 외부에서 ─────────

  setSettings(s: Settings): void {
    const prev = this.settings
    this.settings = s
    if (prev && prev.customLines !== s.customLines) setTimeout(() => this.sayCustomPreview(), 50)
    setSound(s.sound)
    this.applyTextScale()
    if (this.pet && prev && prev.petSize !== s.petSize) {
      this.pet.setSize(s.petSize)
      for (const f of this.friends) f.setSize(s.petSize)
      for (const c of this.clones) c.setSize(s.petSize * 0.7)
    }
    if (!s.show.length) this.hide(this.tag)
  }

  /** 글자 크기 = 설정 × 펫 크기 (펫을 줄이면 말풍선·표시도 같이 작아진다) */
  private applyTextScale(): void {
    const s = this.settings
    if (!s) return
    const k = Math.max(0.78, Math.min(1.5, s.petSize / 110))
    document.documentElement.style.setProperty('--ts', (s.textScale * k).toFixed(3))
  }

  /** 첫째 = 대표 펫, 나머지 = 같이 노는 펫 */
  setSprites(list: PetSprite[]): void {
    if (!list.length) return
    const first = !this.sprite
    const mainChanged = this.sprite?.id !== list[0].id
    this.sprite = list[0]
    this.sprites = list
    if (this.pet) {
      this.pet.setSprite(list[0])
      if (!first && mainChanged) {
        this.fx.poof(this.pet.x, this.pet.y - this.pet.size / 2, 40)
        sfx.pop()
        this.pet.set('happy', 1.5)
        this.say(pick('greet'), 2500)
      }
    }
    this.syncFriends()
  }

  /** 펫 목록에 맞춰 같이 노는 펫을 만들고 없앤다 (새로 온 펫은 하늘에서 뚝) */
  private syncFriends(): void {
    const main = this.pet
    if (!main || !this.settings) return
    const want = this.sprites.slice(1)
    const keep: Pet[] = []
    for (const f of this.friends) {
      if (want.some((sp) => sp.id === f.sprite.id) && !keep.some((k) => k.sprite.id === f.sprite.id)) keep.push(f)
      else {
        this.fx.poof(f.x, f.y - f.size / 2, 30)
        f.remove()
      }
    }
    want.forEach((sp, i) => {
      if (keep.some((k) => k.sprite.id === sp.id)) return
      const f = new Pet(this.stage, sp, this.settings!.petSize)
      f.x = clamp(main.x + (i % 2 ? 1 : -1) * main.size * (0.9 + i * 0.6), f.size * 0.4, this.w - f.size * 0.4)
      f.y = -f.size * (0.2 + i * 0.4)
      f.vy = 0
      f.set('fall')
      keep.push(f)
      setTimeout(() => this.friendSay(f, pick('greet'), 2000), 900 + i * 300)
    })
    this.friends = want.map((sp) => keep.find((k) => k.sprite.id === sp.id)!).filter(Boolean)
  }

  /** 대표 펫 + 같이 노는 펫 */
  all(): Pet[] {
    return this.pet ? [this.pet, ...this.friends] : []
  }

  /** 같이 노는 펫의 작은 말풍선 */
  friendSay(p: Pet, text: string, ms = 2500): void {
    if (p === this.pet) return this.say(text, ms)
    if (!this.friends.includes(p)) return
    if (!p.talk) p.talk = div('bwrap', this.stage)
    p.talk.innerHTML = `<div class="bubble small">${esc(text).replace(/\n/g, '<br>')}</div>`
    p.talk.style.display = ''
    p.talkUntil = this.time + ms / 1000
    this.layoutUi()
  }

  /** 누가 말하든 */
  private speak(p: Pet, text: string, ms = 2500): void {
    if (p === this.pet) this.say(text, ms)
    else this.friendSay(p, text, ms)
  }

  setLive(l: LiveInfo): void {
    this.live = l
  }

  setPerches(ps: Perch[]): void {
    this.perches = ps.length ? ps : this.perches
    for (const p of [...this.all(), ...this.clones]) this.rePerch(p)
  }

  /** 창이 움직이거나 사라지면 따라가거나 떨어진다 */
  private rePerch(p: Pet): void {
    const old = p.perch
    if (!old) return
    if (old.wid === 0) {
      const f = this.perches.find((q) => q.wid === 0)
      if (f) {
        p.perch = f
        p.y = f.y
        if (p.state !== 'walk' && p.state !== 'run' && !p.allowOff) p.x = Math.max(f.x0, Math.min(f.x1, p.x))
        p.rel = p.x - f.wx
      }
      return
    }
    const segs = this.perches.filter((q) => q.wid === old.wid)
    if (!segs.length) return this.drop(p)
    const x = p.state === 'walk' || p.state === 'run' ? p.x - old.wx + segs[0].wx : segs[0].wx + p.rel
    const seg = segs.find((q) => x >= q.x0 - 4 && x <= q.x1 + 4)
    if (!seg) return this.drop(p)
    p.perch = seg
    p.x = x
    p.y = seg.y
    p.rel = x - seg.wx
  }

  /** 발밑이 사라짐 → 떨어짐 */
  private drop(p: Pet): void {
    p.perch = null
    p.vx = 0
    p.vy = -120
    p.set('fall')
    if (p === this.pet) sfx.whoosh()
  }

  setInput(i: InputState): void {
    this.input = i
    const t = this.time
    this.hist.push({ x: i.x, y: i.y, t })
    while (this.hist.length > 2 && t - this.hist[0].t > 0.15) this.hist.shift()
    // 윈도우: 메인이 읽은 버튼으로 누르기·떼기 / 맥: DOM 으로 받고, 떼기는 이걸로도 (다른 화면에서 놓을 때)
    if (this.platform !== 'darwin') {
      if (i.l && !this.lastL) this.pointerDown(i.x, i.y)
      else if (!i.l && this.lastL) this.pointerUp(i.x, i.y)
    }
    this.lastL = i.l
    this.pointerMove(i.x, i.y)
  }

  /** 맥 DOM 누르기·떼기 */
  domDown(x: number, y: number, button: number): void {
    if (button !== 0) {
      this.closeMenu()
      return
    }
    this.input = { ...this.input, x, y }
    this.pointerDown(x, y)
  }

  domUp(x: number, y: number): void {
    this.pointerUp(x, y)
  }

  command(cmd: OverlayCommand): void {
    switch (cmd.type) {
      case 'spawn':
        this.spawn(cmd.x, cmd.y, !!cmd.drag)
        break
      case 'despawn':
        this.despawn()
        break
      case 'prank':
        this.startPrank(cmd.name)
        break
      case 'say':
        this.say(cmd.text, cmd.ms ?? 3500)
        break
      case 'menu':
        this.openMenu('main')
        break
      case 'party':
        this.party()
        break
      case 'askLupang':
        if (!this.pet) return
        this.pet.set('wave', 2)
        this.say(`방금 ${fmtDur((cmd.end - cmd.start) / 1000)} 자리 비웠지? 그동안 ${fmtWon(cmd.earned)} 벌었어. 루팡으로 적을까?`, 40_000, [
          { label: '응 루팡', act: `lupangYes:${cmd.start}:${cmd.end}`, primary: true },
          { label: '💩 화장실이었어', act: `lupangToilet:${cmd.start}:${cmd.end}` },
          { label: '아니 일했어', act: 'lupangNo' }
        ])
        break
      case 'lupangDone': {
        const s = cmd.session
        if (!this.pet) return
        this.pet.set('happy', 2.5)
        sfx.coin()
        for (let i = 0; i < 6; i++) setTimeout(() => this.pet && this.fx.money(this.pet.x, this.pet.y - this.pet.size), i * 120)
        const f = foodOf(s.earned, Math.floor(Math.random() * 3))
        const msg =
          s.kind === 'toilet'
            ? `💩 ${fmtDur(s.sec)} 볼일 보면서 ${fmtWon(s.earned)} 벌었다!\n${f.ic} ${f.text} 값 · 오늘 똥값 ${fmtWon(cmd.toiletToday)}`
            : `${fmtDur(s.sec)} 루팡 성공! ${fmtWon(s.earned)} 벌었다 💸\n${f.ic} ${f.text} 값 · 오늘 루팡 ${fmtWon(cmd.todayTotal)}`
        this.say(msg, 8000, [{ label: '📸 자랑하기', act: 'share' }])
        break
      }
      case 'files':
        this.files = cmd.files
        this.tools = cmd.tools
        this.toolSel = null
        if (!this.files.length) {
          this.say('어… 이건 못 받겠어 (파일이 아니야)', 3000)
          return
        }
        this.pet?.set('happy', 1.2)
        this.openMenu('files')
        break
      case 'toolProgress':
        this.working = cmd.p
        this.renderProg()
        break
      case 'toolDone':
        this.toolDone(cmd.r, cmd.tool)
        break
    }
  }

  // ───────── 나타나기 ─────────

  private spawn(x: number, y: number, drag: boolean): void {
    if (!this.sprite || !this.settings) {
      setTimeout(() => this.spawn(x, y, drag), 100)
      return
    }
    if (!this.pet) this.pet = new Pet(this.stage, this.sprite, this.settings.petSize)
    const p = this.pet
    p.x = Math.max(p.size * 0.4, Math.min(this.w - p.size * 0.4, x))
    p.y = Math.min(y, this.h)
    p.perch = null
    if (drag) {
      p.set('drag')
      this.press = { x: this.input.x, y: this.input.y, t: this.time, who: p, moved: true }
      this.dragOff = { x: 0, y: p.size * 0.45 }
      this.lastL = true
    } else {
      // 화면 위쪽이면 떨어지고, 바닥 가까이면 바로 선다
      const floor = this.perches.find((q) => q.wid === 0)
      if (floor && Math.abs(p.y - floor.y) < 6) p.land(floor)
      p.set(p.perch ? 'idle' : 'fall', 1)
      if (!p.perch) p.vy = 0
    }
    p.render(0)
    // 같이 노는 펫도 이 화면으로
    for (const f of this.friends) f.remove()
    this.friends = []
    this.syncFriends()
  }

  private despawn(): void {
    this.pet?.remove()
    this.pet = null
    for (const f of this.friends) f.remove()
    this.friends = []
    for (const c of this.clones) c.remove()
    this.clones = []
    this.press = null
    this.closeMenu()
    this.hide(this.bubble)
    this.hide(this.tag)
    this.hide(this.prog)
    this.api.setHot([], false)
    this.hotKey = ''
  }

  // ───────── 입력 ─────────

  private uiAt(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    return el?.closest('[data-act]') ?? null
  }

  private pointerDown(x: number, y: number): void {
    const ui = this.uiAt(x, y)
    if (ui) {
      this.act(ui.dataset.act ?? '')
      return
    }
    // 분신 누르면 펑
    for (const c of this.clones) {
      if (c.contains(x, y)) {
        this.poofClone(c)
        return
      }
    }
    // 앞에 그려진 펫부터 (같이 노는 펫이 대표 펫 위에 있을 수 있다)
    for (const q of [...this.friends].reverse().concat(this.pet ? [this.pet] : [])) {
      if (q.state === 'hang' || !q.contains(x, y, 6)) continue
      this.press = { x, y, t: this.time, who: q, moved: false }
      this.dragOff = { x: q.x - x, y: q.y - y }
      return
    }
    // 바깥을 누름 → 메뉴·말풍선 닫기
    this.press = null
    if (this.menuMode && this.menuMode !== 'options' && this.menuMode !== 'files') this.closeMenu()
    if (!this.bubbleBtns && this.bubbleUntil > this.time) this.bubbleUntil = Math.min(this.bubbleUntil, this.time + 0.4)
  }

  private pointerMove(x: number, y: number): void {
    const pr = this.press
    if (pr) {
      const p = pr.who
      const main = p === this.pet
      if (!pr.moved && Math.hypot(x - pr.x, y - pr.y) > 5) {
        pr.moved = true
        p.perch = null
        p.set('drag')
        p.allowOff = false
        this.closeMenu()
        sfx.squeak()
        if (Math.random() < 0.6) this.speak(p, pick('pickedUp'), 1600)
        if (main && this.prank) this.endPrank()
      }
      if (pr.moved) {
        p.x = x + this.dragOff.x
        p.y = y + this.dragOff.y
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
          // 대표 펫은 다른 화면으로 넘어가고 (같이 노는 펫들도 따라감), 나머지는 이 화면 안에
          if (main) {
            this.api.report({ type: 'leave', gx: x, gy: y, drag: true })
            this.press = null
          } else {
            p.x = clamp(p.x, p.size * 0.4, this.w - p.size * 0.4)
            p.y = clamp(p.y, p.size, this.h)
          }
        }
      }
    }
  }

  private pointerUp(x: number, y: number): void {
    const pr = this.press
    this.press = null
    if (!pr) return
    const p = pr.who
    const main = p === this.pet
    if (pr.moved) {
      // 던지기: 마지막 0.1초 커서 속도
      const h = this.hist
      const a = h[0]
      const b = h[h.length - 1]
      const dt = Math.max(0.016, b.t - a.t)
      let vx = (b.x - a.x) / dt
      let vy = (b.y - a.y) / dt
      const sp = Math.hypot(vx, vy)
      if (sp > 3000) {
        vx *= 3000 / sp
        vy *= 3000 / sp
      }
      p.vx = sp > 700 ? vx : 0
      p.vy = sp > 700 ? vy : 0
      p.set(sp > 700 ? 'thrown' : 'fall')
      if (sp > 700) {
        sfx.whoosh()
        this.api.report({ type: 'stat', key: 'throws' })
      }
      return
    }
    // 그냥 누름 (클릭)
    const t = this.time
    p.clicks = [...p.clicks.filter((c) => t - c < 1.6), t]
    if (p.state === 'sleep') {
      p.set('wave', 1.6)
      this.speak(p, this.live.away ? '음냐… 나 자는 중이었어' : pick('back'), 2400)
      return
    }
    if (main && p.state === 'peek') {
      this.found()
      return
    }
    if (p.clicks.length >= 4) {
      p.clicks = []
      this.closeMenu()
      p.set('angry', 2)
      sfx.boing()
      this.speak(p, pick('poked'), 1800)
      return
    }
    if (this.menuMode && this.focus === p) this.closeMenu()
    else {
      this.focus = p
      this.openMenu('main')
    }
  }

  // ───────── 메뉴·버튼 ─────────

  private act(a: string): void {
    const [cmd, ...args] = a.split(':')
    sfx.pop()
    switch (cmd) {
      case 'tag':
        // 머리 위 표시를 누르면 다음 항목
        this.showIdx++
        this.cycle++
        this.showT = 0
        this.updateTag(true)
        return
      case 'close':
        this.closeMenu()
        return
      case 'lupang':
        this.closeMenu()
        this.api.report({ type: 'lupang', on: !this.live.lupangOn })
        return
      case 'toilet':
        this.closeMenu()
        this.api.report({ type: 'lupang', on: true, kind: 'toilet' })
        return
      case 'browser':
        this.closeMenu()
        this.api.report({ type: 'browser' })
        if (this.pet) {
          this.pet.set('work', 2.5)
          this.say(this.live.browserOpen ? '인터넷 창 여기 있어!' : '인터넷 열어 줄게 🌐', 2200)
        }
        return
      case 'share':
        this.closeMenu()
        this.hideBubble()
        this.api.report({ type: 'share' })
        return
      case 'pranks':
        this.openMenu('pranks')
        return
      case 'prank':
        this.closeMenu()
        this.startPrank(args[0] as PrankName)
        return
      case 'back':
        this.openMenu(this.menuMode === 'options' ? 'files' : 'main')
        return
      case 'sleep': {
        this.closeMenu()
        const q = this.focus ?? this.pet
        if (q) {
          if (q.state === 'sleep') {
            q.set('wave', 1.5)
            this.speak(q, '잘 잤다!', 1500)
          } else {
            q.set('sleep', 60)
            this.speak(q, '잠깐 잘게… 깨우려면 눌러 줘', 2500)
          }
        }
        return
      }
      case 'settings':
        this.closeMenu()
        this.api.report({ type: 'openPanel', tab: 'settings' })
        return
      case 'tools':
        this.closeMenu()
        this.api.report({ type: 'openPanel', tab: 'tools' })
        return
      case 'pets':
        this.closeMenu()
        this.api.report({ type: 'openPanel', tab: 'pets' })
        return
      case 'hidePet':
        this.closeMenu()
        this.api.report({ type: 'hidePet' })
        return
      case 'tool': {
        const t = this.tools.find((x) => x.id === args[0])
        if (!t) return
        this.toolSel = t
        this.toolOpts = Object.fromEntries((t.options ?? []).map((o) => [o.key, o.default]))
        if (t.options?.length) this.openMenu('options')
        else this.runTool()
        return
      }
      case 'opt':
        this.toolOpts[args[0]] = args.slice(1).join(':')
        this.openMenu('options')
        return
      case 'run':
        this.runTool()
        return
      case 'lupangYes':
        this.hideBubble()
        this.api.report({ type: 'lupangAnswer', yes: true, start: Number(args[0]), end: Number(args[1]) })
        return
      case 'lupangToilet':
        this.hideBubble()
        this.api.report({ type: 'lupangAnswer', yes: true, start: Number(args[0]), end: Number(args[1]), kind: 'toilet' })
        return
      case 'lupangNo':
        this.hideBubble()
        this.pet?.set('happy', 1.2)
        this.say('역시 성실해! 👍', 1800)
        return
      case 'reveal':
        this.hideBubble()
        if (this.lastOut) this.api.report({ type: 'reveal', path: this.lastOut })
        return
      case 'copy':
        this.hideBubble()
        this.api.report({ type: 'copy', text: this.lastText })
        this.say('복사했어! 📋', 1500)
        return
      case 'note': {
        const n = this.notes.find((x) => String(x.id) === args[0])
        if (n) {
          const r = n.el.getBoundingClientRect()
          this.fx.poof(r.left + r.width / 2, r.top + r.height / 2, 30)
          n.el.remove()
          this.notes = this.notes.filter((x) => x !== n)
        }
        return
      }
      case 'bubble':
        this.hideBubble()
        return
    }
  }

  private openMenu(mode: 'main' | 'pranks' | 'files' | 'options'): void {
    if (!this.pet) return
    this.menuMode = mode
    const m = this.menu
    const b = (act: string, ic: string, label: string, cls = ''): string => `<button data-act="${act}" class="${cls}"><i>${ic}</i><span>${esc(label)}</span></button>`
    let html = ''
    if (mode === 'main') {
      const t = this.settings ? today(this.settings.work, this.now()) : null
      const sum = t && t.status !== 'off' ? `<div class="sum">오늘 <b>${fmtWon(t.earned)}</b>${t.status === 'after' ? ' · 퇴근 완료' : t.leftSec ? ` · 퇴근까지 <b>${fmtClock(t.leftSec)}</b>` : ''}</div>` : '<div class="sum">오늘은 쉬는 날 🏖</div>'
      html =
        sum +
        (this.live.lupangOn
          ? `<div class="grid one">${b('lupang', this.live.lupangKind === 'toilet' ? '💩' : '🕶', this.live.lupangKind === 'toilet' ? '다녀왔어 (똥값 정산)' : '돌아왔어 (루팡 정산)', 'hot')}</div>`
          : `<div class="grid">${b('lupang', '🕶', '자리비움')}${b('toilet', '💩', '화장실 (똥값)')}</div>`) +
        '<div class="grid">' +
        b('browser', '🌐', this.live.browserOpen ? '인터넷 창' : '인터넷') +
        b('pranks', '🎲', '장난치기') +
        b('share', '📸', '자랑하기') +
        b('tools', '📂', '파일 도우미') +
        b('sleep', '💤', (this.focus ?? this.pet).state === 'sleep' ? '깨우기' : '재우기') +
        b('pets', '🐾', '캐릭터 바꾸기') +
        b('settings', '⚙️', '설정') +
        b('hidePet', '🙈', '숨기기') +
        '</div><div class="tip">파일을 나한테 끌어다 주면 변환·정리해 줄게</div>'
    } else if (mode === 'pranks') {
      html = '<div class="sum">무슨 장난 칠까?</div><div class="grid">' + PRANKS.map((p) => b(`prank:${p.id}`, p.emoji, p.label)).join('') + '</div>' + b('back', '←', '뒤로', 'wide')
    } else if (mode === 'files') {
      const n = this.files.length
      const what = n === 1 ? esc(this.files[0].name) : `파일 ${n}개`
      html =
        `<div class="sum"><b>${what}</b> 받았어! 뭐 해 줄까?</div><div class="grid tools">` +
        this.tools.map((t) => b(`tool:${t.id}`, t.emoji, t.label, t.id === 'trash' ? 'danger' : '')).join('') +
        '</div>' +
        b('close', '×', '그냥 둘래', 'wide')
    } else if (mode === 'options' && this.toolSel) {
      const t = this.toolSel
      html = `<div class="sum">${t.emoji} <b>${esc(t.label)}</b> <span class="faint">${esc(t.desc)}</span></div>`
      for (const o of t.options ?? []) {
        html += `<div class="opt"><div class="ol">${esc(o.label)}</div><div class="chips">${o.choices.map((c) => `<button data-act="opt:${o.key}:${esc(c.value)}" class="chip ${this.toolOpts[o.key] === c.value ? 'on' : ''}">${esc(c.label)}</button>`).join('')}</div></div>`
      }
      html += `<div class="row">${b('back', '←', '뒤로')}${b('run', '✨', '해 줘!', 'go')}</div>`
    }
    m.innerHTML = `<div class="menu ${mode}">${html}</div>`
    this.show(m)
    this.placeMenu()
  }

  private closeMenu(): void {
    this.menuMode = ''
    this.focus = null
    this.hide(this.menu)
  }

  private placeMenu(): void {
    const p = this.focus && this.all().includes(this.focus) ? this.focus : this.pet
    if (!p || !this.menuMode) return
    const m = this.menu
    const bb = p.bbox()
    const mw = m.offsetWidth
    const mh = m.offsetHeight
    // 펫 옆 (오른쪽 공간이 없으면 왼쪽)
    let x = bb.x + bb.w + 10
    if (x + mw > this.w - 8) x = bb.x - mw - 10
    if (x < 8) x = Math.max(8, Math.min(this.w - mw - 8, p.x - mw / 2))
    let y = bb.y + bb.h / 2 - mh / 2
    y = Math.max(8, Math.min(this.h - mh - 8, y))
    m.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  }

  // ───────── 파일 도우미 ─────────

  private runTool(): void {
    const t = this.toolSel
    if (!t || !this.files.length) return
    this.closeMenu()
    this.working = { done: 0, total: this.files.length }
    this.renderProg()
    if (t.id === 'trash') {
      this.eating = true
      this.pet?.set('eat', 30)
      sfx.munch()
      this.say(pick('eatFile'), 2000)
    } else {
      this.pet?.set('work', 60)
      this.say(`${t.emoji} ${t.label} 하는 중…`, 60_000)
    }
    this.api.report({ type: 'tool', req: { tool: t.id as ToolId, files: this.files.map((f) => f.path), opts: { ...this.toolOpts } } })
  }

  private renderProg(): void {
    const w = this.working
    if (!w || !this.pet) {
      this.hide(this.prog)
      return
    }
    this.prog.innerHTML = `<div class="bar"><i style="width:${Math.round((w.done / Math.max(1, w.total)) * 100)}%"></i></div><span>${w.done}/${w.total}</span>`
    this.show(this.prog)
  }

  private toolDone(r: ToolResult, tool: string): void {
    this.working = null
    this.renderProg()
    this.files = []
    const p = this.pet
    if (!p) return
    this.lastOut = r.outputs[0] ?? ''
    this.lastText = r.text ?? ''
    if (tool === 'trash' || this.eating) {
      this.eating = false
      sfx.munch()
      this.fx.crumbs(p.x + p.face * p.size * 0.2, p.y - p.size * 0.4, 12, '#adb5bd')
    }
    p.set(r.ok ? 'happy' : 'angry', 2)
    if (r.ok) sfx.ding()
    const fail = r.failed.length ? `\n(${r.failed.length}개는 못 했어: ${esc(r.failed[0].reason)})` : ''
    const btns: Btn[] = []
    if (r.text) btns.push({ label: '📋 복사', act: 'copy', primary: true })
    if (this.lastOut) btns.push({ label: '📂 열어 보기', act: 'reveal', primary: !r.text })
    btns.push({ label: '닫기', act: 'bubble' })
    const text = r.text ? `${r.message}\n${r.text}` : r.message
    this.say(text + fail, 12_000, btns)
  }

  // ───────── 말풍선 ─────────

  say(text: string, ms = 3500, btns: Btn[] = [], big = false): void {
    if (!this.pet) return
    this.bubbleText = text
    this.bubbleBtns = btns.length > 0
    this.bubbleBig = big
    this.bubbleUntil = this.time + ms / 1000
    this.bubble.innerHTML =
      `<div class="bubble${big ? ' big' : ''}${btns.length ? ' ask' : ''}"><div class="txt">${esc(text).replace(/\n/g, '<br>')}</div>` +
      (btns.length ? `<div class="btns">${btns.map((b) => `<button data-act="${b.act}" class="${b.primary ? 'pri' : ''}">${esc(b.label)}</button>`).join('')}</div>` : '') +
      '</div>'
    if (!btns.length) this.bubble.dataset.act = 'bubble'
    else delete this.bubble.dataset.act
    this.show(this.bubble)
    // 보이는 첫 프레임부터 펫 머리 위에 (다음 프레임까지 기다리면 엉뚱한 곳에 잠깐 그려진다)
    this.layoutUi()
  }

  private hideBubble(): void {
    this.bubbleUntil = 0
    this.bubbleBtns = false
    this.hide(this.bubble)
  }

  private sayLine(k: LineKey, ms = 3200): void {
    this.say(pick(k, this.vars()), ms)
  }

  private vars(): Record<string, string> {
    const s = this.settings
    if (!s) return {}
    const t = today(s.work, this.now())
    return {
      daily: fmtWon(t.daily),
      earned: fmtWon(t.earned),
      left: fmtDur(t.leftSec),
      over: fmtDur(t.overSec),
      perMin: fmtWon(t.perSec * 60)
    }
  }

  // ───────── 머리 위 표시 ─────────

  /** 머리 위 한 줄. 지금 보여 줄 게 없으면 null (다음 항목으로) */
  private tagFor(item: ShowItem, t: TodayInfo): string | null {
    const s = this.settings!
    const now = this.now()
    switch (item) {
      case 'toilet':
        return this.live.toiletToday > 0 ? `💩 오늘 똥값 ${fmtWon(this.live.toiletToday)}` : null
      case 'food': {
        const won = t.status === 'after' ? t.daily : t.earned
        if (won < 1000) return null
        const f = foodOf(won, this.cycle)
        return `${f.ic} 오늘 번 돈 = ${f.text}`
      }
      case 'overtime': {
        if (t.status !== 'after' || !this.otLast) return null
        const sec = (this.otLast - t.endAt) / 1000
        if (sec < 60) return null
        return `🌙 공짜 야근 ${fmtDur(sec)}째 (${fmtWon(sec * t.perSec)} 손해)`
      }
      case 'dday': {
        const pd = daysToPayday(s.work, now)
        if (pd === 0) return '💳 오늘 월급날!! 🎉'
        if (this.cycle % 2 === 0) return `💳 월급날 D-${pd}`
        const wk = untilWeekend(s.work, now)
        return wk.weekend ? '🏖 주말이다!!' : `🏖 주말까지 ${fmtClock(wk.sec)}`
      }
      case 'today':
        if (t.status === 'off') return '🏖 오늘은 쉬는 날'
        if (t.status === 'before') return `☕ 출근 전 · 일당 ${fmtWon(t.daily)}`
        if (t.status === 'after') return `💰 오늘 ${fmtWon(t.daily)} 벌었다`
        return `💰 ${fmtWon(t.earned, 2)}`
      case 'year':
        return `📅 올해 ${fmtWon(yearEarned(s.work, this.now()))}`
      case 'leave':
        if (t.status === 'off') return '🏖 퇴근할 필요 없음'
        if (t.status === 'after') return `🌙 퇴근 ${fmtDur(t.overSec)} 지남`
        return `⏰ 퇴근까지 ${fmtClock(t.leftSec)}`
      case 'lupang':
        return `🕶 오늘 루팡 ${fmtWon(this.live.lupangToday)}`
    }
  }

  private updateTag(force = false): void {
    const s = this.settings
    const p = this.pet
    if (!s || !p) return
    const hideNow = ['drag', 'thrown', 'hang', 'peek'].includes(p.state) || !!p.sign || p.x < 0 || p.x > this.w || (!s.show.length && !this.live.lupangOn)
    if (hideNow) {
      this.hide(this.tag)
      return
    }
    let text: string
    const t = today(s.work, this.now())
    if (this.live.lupangOn) {
      const e = earnedBetween(s.work, this.live.lupangOn, this.now())
      text = this.live.lupangKind === 'toilet' ? `💩 화장실 루팡 중 ${fmtWon(e, 1)}` : `🕶 루팡 중 ${fmtWon(e, 1)}`
    } else {
      // 보여 줄 게 없는 항목은 건너뛴다
      let found: string | null = null
      for (let i = 0; i < s.show.length && !found; i++) {
        found = this.tagFor(s.show[(this.showIdx + i) % s.show.length], t)
        if (found && i > 0) this.showIdx += i
      }
      if (!found) {
        this.hide(this.tag)
        return
      }
      text = found
    }
    if (text !== this.tagText || force) {
      this.tagText = text
      this.tag.textContent = text
      this.tag.classList.toggle('lupang', !!this.live.lupangOn)
    }
    this.show(this.tag)
  }

  // ───────── 장난 ─────────

  /** 분신술: 누를 때마다 6~9마리씩 더 (최대 MAX_CLONES), 있던 분신도 시간이 늘어난다 */
  private cloneMore(): void {
    const p = this.pet
    if (!p || !this.settings) return
    this.closeMenu()
    const T = this.time
    const room = MAX_CLONES - this.clones.length
    const n = Math.min(room, 6 + Math.floor(Math.random() * 4))
    const wave = this.cloneWave++
    if (n <= 0) {
      this.say('더는 무리야… 화면이 꽉 찼어 🥵', 2000)
      return
    }
    this.say(wave === 0 ? pick('clone') : wave < 3 ? `분신술 ${wave + 1}연속!!` : `분신 ${this.clones.length + n}마리!!! 🤯`, 2200)
    sfx.pop()
    // 대표 펫과 같이 노는 펫들이 돌아가며 분신을 만든다
    const srcs = this.all()
    for (let i = 0; i < n; i++) {
      const from = srcs[i % srcs.length]
      const c = new Pet(this.stage, from.sprite, this.settings.petSize * (0.5 + Math.random() * 0.35), true)
      c.x = from.x
      c.y = from.y - from.size * 0.5
      c.vx = (Math.random() - 0.5) * 1600
      c.vy = -600 - Math.random() * 1000
      c.face = c.vx > 0 ? 1 : -1
      c.dieAt = T + 14 + Math.random() * 4
      c.set('thrown')
      this.clones.push(c)
    }
    for (const src of srcs) this.fx.poof(src.x, src.y - src.size / 2, 45)
    for (const c of this.clones) c.dieAt = Math.max(c.dieAt, T + 10 + Math.random() * 4)
    p.set('happy', 2)
    this.api.report({ type: 'stat', key: 'clones' })
  }

  startPrank(name: PrankName): void {
    const p = this.pet
    if (!p || !this.sprite || !this.settings) return
    if (name === 'clone') return this.cloneMore()
    if (name === 'occupy') {
      this.occupy(12)
      return
    }
    if (name === 'receipt') return this.receipt()
    this.endPrank()
    this.closeMenu()
    const T = this.time
    switch (name) {
      case 'boss':
        this.bossAlarm()
        break
      case 'march':
        this.march('protest')
        break
      case 'fish':
        this.startFish()
        break
      case 'hang':
        this.say('커서 잡으러 간다!', 1500)
        p.perch = null
        p.set('hang')
        this.prank = { name, until: T + 9, data: 0 }
        break
      case 'memo':
        this.prank = { name, until: T + 30, data: 0 }
        // 화면 가장자리로 갔다가 쪽지를 끌고 온다
        if (p.perch) p.goTo(p.x < this.w / 2 ? p.size * 0.4 : this.w - p.size * 0.4, true)
        break
      case 'hide': {
        const left = p.x < this.w / 2
        this.prank = { name, until: T + 45, data: left ? -1 : 1 }
        this.say(pick('hide'), 1500)
        if (p.perch) p.goTo(left ? p.size * 0.4 : this.w - p.size * 0.4, true)
        break
      }
    }
  }

  private endPrank(): void {
    const pr = this.prank
    if (!pr) return
    this.prank = null
    const p = this.pet
    if (p && pr.name === 'hide' && p.state === 'peek') this.unhide(p, 'idle')
    if (pr.name === 'hang') {
      this.rope?.remove()
      this.rope = null
      if (p) {
        p.pivotHead = false
        p.tilt = 0
        if (p.state === 'hang') {
          this.say('이제 내려갈래~', 1500)
          this.drop(p)
        }
      }
    }
    if (pr.name === 'fish') {
      this.fishLine?.remove()
      this.fishLine = null
      if (p?.state === 'sit') p.set('idle', 1)
    }
    if (pr.name === 'boss' || pr.name === 'march') this.comeBack(pr.name === 'march' ? 'right' : 'near')
    if (p && pr.name !== 'boss' && pr.name !== 'march') p.allowOff = false
  }

  /** 화면 밖으로 나갔던 펫들이 다시 걸어 들어온다 */
  private comeBack(from: 'right' | 'near'): void {
    this.all().forEach((q, i) => {
      q.sign?.remove()
      q.sign = null
      q.speedMul = 1
      const floor = this.perches.find((x) => x.wid === 0)!
      const off = q.x < 0 || q.x > this.w
      if (!off) {
        q.allowOff = false
        return
      }
      const right = from === 'right' ? true : q.x > this.w / 2
      q.perch = floor
      q.y = floor.y
      q.x = right ? this.w + q.size * 0.6 : -q.size * 0.6
      q.rel = q.x - floor.wx
      q.allowOff = true
      q.goTo(right ? this.w - q.size * (1 + i * 0.9) : q.size * (1 + i * 0.9), false)
    })
  }

  /** 펫을 정한 자리(창 윗변)로 점프시킨다 */
  private leap(c: Pet, q: Perch, tx: number): void {
    const g = 2600
    const apex = Math.min(c.y, q.y) - c.size * 0.8
    const vy0 = -Math.sqrt(2 * g * Math.max(10, c.y - apex))
    const t1 = -vy0 / g
    const t2 = Math.sqrt((2 * Math.max(1, q.y - apex)) / g)
    c.vx = (tx - c.x) / (t1 + t2)
    c.vy = vy0
    c.face = tx >= c.x ? 1 : -1
    c.perch = null
    c.jumpTo = q
    c.set('jump')
  }

  /** 창 점령: 앞 창 윗변부터 분신이 줄줄이 앉는다. 누를수록 더 (창을 옮기면 같이 탄다) */
  private occupy(n: number, quiet = false): number {
    const p = this.pet
    if (!p || !this.settings) return 0
    this.closeMenu()
    const wins = this.perches.filter((q) => q.wid !== 0 && q.x1 - q.x0 > 60)
    if (!wins.length) {
      if (!quiet) this.say('창을 하나 띄워 줘야 점령하지! 🏴', 2200)
      return 0
    }
    const T = this.time
    const size = this.settings.petSize * 0.55
    const gap = size * 0.62
    const srcs = this.all()
    let made = 0
    const limit = Math.min(n, MAX_CLONES - this.clones.length)
    for (const q of wins) {
      if (made >= limit) break
      const cap = Math.floor((q.x1 - q.x0) / gap)
      let k = this.clones.filter((c) => c.seated && (c.perch?.wid === q.wid || c.jumpTo?.wid === q.wid) && Math.abs((c.perch ?? c.jumpTo)!.y - q.y) < 2).length
      while (k < cap && made < limit) {
        const from = srcs[made % srcs.length]
        const c = new Pet(this.stage, from.sprite, size * (0.92 + Math.random() * 0.16), true)
        c.x = from.x
        c.y = from.y - from.size * 0.5
        c.seated = true
        c.dieAt = T + 60
        this.leap(c, q, q.x0 + gap * (k + 0.5))
        this.clones.push(c)
        k++
        made++
      }
    }
    for (const c of this.clones) if (c.seated) c.dieAt = Math.max(c.dieAt, T + 45)
    if (!quiet) {
      sfx.pop()
      p.set('happy', 1.5)
      this.say(made ? `창 점령!! 🏴 ${this.clones.filter((c) => c.seated).length}마리` : '빈자리가 없어… 창이 꽉 찼어', 2200)
      this.api.report({ type: 'stat', key: 'clones' })
    }
    return made
  }

  /** 창 점령한 분신들: 박자에 맞춰 모두 같은 동작 (점령군 느낌) */
  private occupyBeat(): void {
    const T = this.time
    if (T < this.beatAt) return
    const seated = this.clones.filter((c) => c.seated && c.grounded && !c.marching)
    if (!seated.length) return
    const step = OCCUPY_BEAT[this.beatIdx++ % OCCUPY_BEAT.length]
    this.beatAt = T + step.dur
    const face = this.beatIdx % 4 < 2 ? 1 : -1
    for (const c of seated) {
      c.face = face
      c.set(step.pose, step.dur + 0.5)
    }
    if (step.shout && this.beatIdx % 2 === 0) {
      const c = seated[Math.floor(Math.random() * seated.length)]
      this.fx.text(c.x, c.y - c.size * 1.1, step.shout, '#c92a2a', 16)
    }
    if (step.pose === 'happy') sfx.beat(0)
  }

  /** 분신들이 화면 밖으로 쌩 흩어진다 */
  private scatterClones(): void {
    for (const c of this.clones) {
      c.marching = true
      c.allowOff = true
      c.speedMul = 7
      const right = c.x > this.w / 2
      if (c.grounded) c.goTo(right ? this.w + c.size * 2 : -c.size * 2, true)
      else c.dieAt = this.time
    }
  }

  /** 부장님 온다: 펫이고 분신이고 0.3초 만에 화면 밖으로 → 몇 초 뒤 슬금슬금 */
  private bossAlarm(): void {
    const T = this.time
    this.say('🚨 부장님 온다!!', 700, [], true)
    sfx.whoosh()
    this.scatterClones()
    for (const q of this.all()) {
      q.sign?.remove()
      q.sign = null
      q.allowOff = true
      q.speedMul = 7
      const right = q.x > this.w / 2
      if (!q.grounded) {
        q.x = right ? this.w + q.size : -q.size
        continue
      }
      q.goTo(right ? this.w + q.size * 1.5 : -q.size * 1.5, true)
    }
    this.prank = { name: 'boss', until: T + 6 }
  }

  /** 칼퇴 시위 행진(protest) · 퇴근 행렬(leave): 피켓 든 펫 떼가 화면 바닥을 가로지른다 */
  march(mode: 'protest' | 'leave'): void {
    const p = this.pet
    const floor = this.perches.find((q) => q.wid === 0)
    if (!p || !this.settings || !floor) return
    const T = this.time
    const size = this.settings.petSize
    const lead = this.all()
    const signs = mode === 'protest' ? SIGNS_PROTEST : SIGNS_LEAVE
    const marchers: Pet[] = []
    for (const q of lead) this.fx.poof(q.x, q.y - q.size / 2, 30)
    lead.forEach((q, i) => {
      q.perch = floor
      q.y = floor.y
      q.x = -size * (0.6 + i * 0.8)
      q.rel = q.x - floor.wx
      marchers.push(q)
    })
    const n = Math.min(mode === 'protest' ? 10 : 7, MAX_CLONES - this.clones.length)
    for (let i = 0; i < n; i++) {
      const from = lead[i % lead.length]
      const c = new Pet(this.stage, from.sprite, size * 0.62, true)
      c.perch = floor
      c.y = floor.y
      c.x = -size * (0.6 + lead.length * 0.8 + i * 0.6)
      c.rel = c.x - floor.wx
      c.dieAt = T + 90
      c.marching = true
      this.clones.push(c)
      marchers.push(c)
    }
    marchers.forEach((m, i) => {
      m.allowOff = true
      // 걷는 속도는 키에 비례하므로 작은 분신도 같은 속도로 줄 맞춰 걷게
      m.speedMul = (mode === 'leave' ? 2.8 : 2.3) * (size / m.size)
      m.goTo(this.w + size * 1.2, false)
      m.sign?.remove()
      m.sign = div(`sign ${mode}`, this.stage)
      m.sign.textContent = signs[i % signs.length]
    })
    this.prank = { name: 'march', until: T + 80, data: mode === 'leave' ? 10 : 0 }
    this.chantAt = 0
    this.say(mode === 'protest' ? '✊ 칼퇴 보장! 야근 반대!' : '다들 퇴근~ 👋 내일 봐!', 2600)
  }

  /** 창 위에서 낚시: 창 안으로 낚싯줄을 드리우고 가끔 뭔가 낚는다 */
  private startFish(): void {
    const p = this.pet!
    const T = this.time
    if (!p.perch || p.perch.wid === 0) {
      const wins = this.perches.filter((q) => q.wid !== 0 && q.x1 - q.x0 > p.size * 1.2)
      if (!wins.length || !p.perch) {
        this.say('창 위에 올려 줘야 낚시할 수 있어 🎣', 2500)
        return
      }
      const q = wins.reduce((a, b) => (Math.abs((a.x0 + a.x1) / 2 - p.x) < Math.abs((b.x0 + b.x1) / 2 - p.x) ? a : b))
      this.leap(p, q, clamp(p.x, q.x0 + p.size * 0.6, q.x1 - p.size * 0.6))
      this.say('저 창에서 낚시할래! 🎣', 1500)
      this.prank = { name: 'fish', until: T + 50, data: -1 }
      return
    }
    this.prank = { name: 'fish', until: T + 50, data: 0 }
  }

  /** 루팡 영수증: 오늘 일한 시간·번 돈·루팡·똥값을 길게 뽑아 온다 */
  receipt(): void {
    const p = this.pet
    const s = this.settings
    if (!p || !s) return
    this.closeMenu()
    const now = this.now()
    const t = today(s.work, now)
    const won = t.status === 'after' ? t.daily : t.earned
    const workSec = t.perSec ? won / t.perSec : 0
    const lupSec = Math.min(workSec, this.live.lupangSecToday)
    const pct = workSec > 0 ? Math.round(((workSec - lupSec) / workSec) * 100) : 100
    const f = foodOf(won, 0)
    const d = new Date(now)
    const rows: [string, string][] = [
      ['근무 시간', fmtDur(workSec)],
      ['오늘 번 돈', fmtWon(won)],
      ['🕶 루팡', `${fmtDur(lupSec)} · ${fmtWon(this.live.lupangToday - this.live.toiletToday)}`],
      ['💩 똥값', fmtWon(this.live.toiletToday)],
      [`${f.ic} 환산`, f.text]
    ]
    if (t.status === 'after' && t.overSec > 300) rows.push(['🌙 공짜 야근', `${fmtDur(t.overSec)} (−${fmtWon(t.overSec * t.perSec)})`])
    const el = div('receipt', this.stage)
    const id = ++this.noteSeq
    el.dataset.act = `note:${id}`
    el.innerHTML =
      `<div class="rc-h">🧾 오늘의 루팡 영수증</div><div class="rc-d">${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${esc(this.petName())} 상회</div>` +
      rows.map(([k, v]) => `<div class="rc-r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('') +
      `<div class="rc-t"><span>실제로 일한 비율</span><b>${pct}%</b></div><div class="rc-f">${pct >= 95 ? '성실 그 자체… 좀 쉬어요' : pct >= 80 ? '적당한 루팡, 훌륭합니다' : '프로 루팡러 인증 🏅'}</div><div class="rc-bar"></div><div class="rc-f">감사합니다 · 또 루팡하세요</div>`
    const x = clamp(p.x + (p.x < this.w / 2 ? p.size * 0.5 : -p.size * 0.5 - 220), 10, this.w - 230)
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(clamp(p.y - 420, 10, this.h - 440))}px, 0) rotate(${(Math.random() - 0.5) * 4}deg)`
    this.notes.push({ id, el })
    while (this.notes.length > 6) {
      this.notes[0].el.remove()
      this.notes.shift()
    }
    p.set('happy', 1.6)
    sfx.ding()
    this.say('오늘의 루팡 영수증 나왔습니다 🧾', 2500, [{ label: '📸 자랑하기', act: 'share' }])
  }

  private unhide(p: Pet, st: PetState): void {
    p.allowOff = false
    p.x = Math.max(p.size * 0.4, Math.min(this.w - p.size * 0.4, p.x))
    if (p.perch) p.rel = p.x - p.perch.wx
    p.set(st, st === 'happy' ? 2 : 1)
  }

  private poofClone(c: Pet, quiet = false): void {
    if (!quiet && c.x > 0 && c.x < this.w) {
      this.fx.poof(c.x, c.y - c.size / 2, 26)
      sfx.pop()
    }
    c.remove()
    this.clones = this.clones.filter((x) => x !== c)
  }

  private found(): void {
    const p = this.pet
    if (!p) return
    this.prank = null
    this.unhide(p, 'happy')
    sfx.ding()
    this.fx.stars(p.x, p.y - p.size, 6)
    this.sayLine('found', 2200)
  }

  private updatePrank(dt: number): void {
    const pr = this.prank
    const p = this.pet
    if (!pr || !p) return
    const T = this.time
    if (T > pr.until) {
      if (pr.name === 'hide' && p.state === 'peek') this.say('아무도 안 찾네… 그냥 나올래', 2000)
      if (pr.name === 'boss') this.say('갔어…? 😅', 1800)
      this.endPrank()
      return
    }
    const cur = this.input
    switch (pr.name) {
      case 'hang':
        this.updateHang(dt, pr)
        break
      case 'memo':
        if (pr.data === 0 && p.target === null && p.grounded) {
          pr.data = 1
          const x = Math.max(80, Math.min(this.w - 240, p.x + (p.x < this.w / 2 ? 60 : -230)))
          const y = Math.max(60, Math.min(this.h - 260, (p.perch?.y ?? this.h) - p.size - 150 - Math.random() * 120))
          const mine = this.customLines()
          const text = mine.length && (this.settings?.customMode === 'only' || Math.random() < 0.5) ? this.fill(mine[Math.floor(Math.random() * mine.length)]) : MEMOS[Math.floor(Math.random() * MEMOS.length)]
          this.addNote(x, y, text)
          p.set('wave', 2)
          this.sayLine('memo', 2200)
          pr.until = T + 2.5
        }
        break
      case 'hide':
        if (p.state === 'peek') break
        if (p.target === null && p.grounded) {
          p.allowOff = true
          const side = pr.data ?? 1
          p.x = side < 0 ? 0 : this.w
          if (p.perch) p.rel = p.x - p.perch.wx
          p.face = side < 0 ? 1 : -1
          p.set('peek')
          pr.until = T + 40
        }
        break
      case 'boss':
        // 화면 밖에 다 나갔으면 가만히 (몇 초 뒤 comeBack)
        for (const q of this.all()) if (q.target === null && (q.x < 0 || q.x > this.w) && q.state !== 'idle') q.set('idle', 0)
        break
      case 'march': {
        // 구호
        this.chantAt -= dt
        if (this.chantAt <= 0 && (pr.data ?? 0) < 2) {
          this.chantAt = 2.2
          if ((pr.data ?? 0) === 0) this.say(CHANTS[Math.floor(Math.random() * CHANTS.length)], 2000)
          sfx.beat(0)
        }
        const lead = this.all()
        const out = (q: Pet): boolean => q.x > this.w + q.size * 0.4
        for (const c of [...this.clones]) if (c.marching && out(c)) this.poofClone(c, true)
        if (lead.every(out)) {
          if (pr.data === 10) {
            // 퇴근 행렬: 다 나가고 나만 남음 → 잠시 뒤 대표 펫이 빼꼼
            pr.data = 11
            pr.until = T + 3.5
          } else if (pr.data === 0) this.endPrank()
        }
        if (pr.data === 11 && T > pr.until - 0.2) {
          pr.data = 12
          this.endPrank()
          setTimeout(() => this.say('아 맞다… 너 아직 일하지? 🥲\n너만 남았어', 4500, [], true), 1200)
        }
        break
      }
      case 'fish':
        this.updateFish(dt, pr)
        break
    }
  }

  /** 커서에 고무줄로 매달려 데롱데롱 (진자 + 늘어나는 끈). 세게 흔들면 끊어진다 */
  private updateHang(dt: number, pr: { name: PrankName; until: number; data?: number }): void {
    const p = this.pet!
    if (p.state !== 'hang') return
    const T = this.time
    const ax = this.input.x
    const ay = this.input.y
    const L = p.size * 1.15
    const headOff = (FEET_Y - p.sprite.box[p.pose].y0) * p.k
    let hx = p.x
    let hy = p.y - headOff
    if (pr.data === 0) {
      // 커서 아래로 폴짝 날아가서 끈을 묶는다
      const tx = ax
      const ty = ay + L
      const d = Math.hypot(tx - hx, ty - hy)
      const sp = Math.max(600, d * 5) * dt
      if (d <= sp + 2) {
        pr.data = 1
        pr.until = T + 12
        p.vx = (Math.random() - 0.5) * 600
        p.vy = 0
        p.pivotHead = true
        sfx.boing()
        this.say(pick('caught'), 1500)
        hx = tx
        hy = ty
      } else {
        hx += ((tx - hx) / d) * sp
        hy += ((ty - hy) / d) * sp
        p.face = tx >= hx ? 1 : -1
      }
    } else {
      // 중력 + 늘어나는 끈(용수철) + 공기 저항
      const n = 3
      for (let i = 0; i < n; i++) {
        const h = dt / n
        p.vy += 2000 * h
        const dx = hx - ax
        const dy = hy - ay
        const dist = Math.hypot(dx, dy) || 1
        if (dist > L) {
          const f = 70 * (dist - L)
          p.vx -= (dx / dist) * f * h
          p.vy -= (dy / dist) * f * h
          // 끈 방향으로만 출렁임을 줄인다
          const vr = (p.vx * dx + p.vy * dy) / dist
          p.vx -= (dx / dist) * vr * 2.2 * h
          p.vy -= (dy / dist) * vr * 2.2 * h
        }
        p.vx *= 1 - 0.35 * h
        p.vy *= 1 - 0.35 * h
        hx += p.vx * h
        hy += p.vy * h
      }
      const dist = Math.hypot(hx - ax, hy - ay)
      if (dist > L * 3.4) {
        // 너무 늘어나면 툭 끊어진다
        this.rope?.remove()
        this.rope = null
        p.pivotHead = false
        p.tilt = 0
        p.x = hx
        p.y = hy + headOff
        p.perch = null
        p.set('thrown')
        sfx.pop()
        this.say('끈이 끊어졌다!! 으아악', 1800)
        this.prank = null
        return
      }
      p.face = p.vx >= 0 ? 1 : -1
    }
    // 몸은 끈 방향으로 기울어진다
    const th = Math.atan2(hx - ax, hy - ay)
    p.tilt = pr.data === 0 ? 0 : (-th * 180) / Math.PI
    p.x = hx
    p.y = hy + headOff
    // 끈 그리기
    if (pr.data !== 0) {
      if (!this.rope) this.rope = div('rope', this.stage)
      const dist = Math.hypot(hx - ax, hy - ay)
      this.rope.style.height = `${Math.round(dist)}px`
      this.rope.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0) rotate(${((-th * 180) / Math.PI).toFixed(1)}deg)`
      this.rope.classList.toggle('tight', dist > L * 1.6)
    }
  }

  private updateFish(dt: number, pr: { name: PrankName; until: number; data?: number }): void {
    const p = this.pet!
    const T = this.time
    if (pr.data === -1) {
      if (p.grounded && p.perch && p.perch.wid !== 0) pr.data = 0
      else if (p.grounded) return this.endPrank()
      return
    }
    if (!p.perch || p.perch.wid === 0 || !p.grounded) return this.endPrank()
    const rodX = p.x + p.face * p.size * 0.38
    const rodY = p.y - p.size * 0.45
    if (pr.data === 0) {
      p.set('sit', 999)
      if (!this.fishLine) {
        this.fishLine = div('fishline', this.stage)
        this.fishLine.innerHTML = '<i></i><b>🔴</b>'
      }
      this.fishDepth = p.size * (0.9 + Math.random() * 0.6)
      this.fishAt = T + 2.5 + Math.random() * 3
      pr.data = 1
      sfx.whoosh()
    }
    if (pr.data === 1 && T > this.fishAt) {
      pr.data = 2
      this.fishAt = T + 0.7
      this.fx.text(rodX, p.y + this.fishDepth - 10, '!', '#e03131', 26)
      sfx.squeak()
    }
    if (pr.data === 2 && T > this.fishAt) {
      const [ic, msg] = CATCHES[Math.floor(Math.random() * CATCHES.length)]
      this.fx.text(rodX, p.y + 10, ic, '#333', 34)
      this.fx.spark(rodX, p.y)
      p.set('happy', 1.4)
      sfx.ding()
      this.say(`${ic} ${msg}`, 2600)
      this.fishCount++
      pr.data = this.fishCount >= 4 ? 9 : 3
      this.fishAt = T + 1.6
    }
    if (pr.data === 3 && T > this.fishAt) pr.data = 0
    if (pr.data === 9 && T > this.fishAt) {
      this.fishCount = 0
      this.say('오늘 조황 끝! 🎣', 1800)
      return this.endPrank()
    }
    // 낚싯줄
    const ln = this.fishLine
    if (ln) {
      const bob = pr.data === 2 ? 10 + Math.sin(T * 40) * 4 : Math.sin(T * 3) * 2
      const len = (pr.data === 0 ? 0 : this.fishDepth) + bob + (p.y - rodY)
      ln.style.transform = `translate3d(${Math.round(rodX)}px, ${Math.round(rodY)}px, 0)`
      ln.style.height = `${Math.max(0, Math.round(len))}px`
    }
    void dt
  }

  private cloneBrain(c: Pet): void {
    if (c.marching) {
      // 흩어지는 중·행진 중: 가는 방향으로 화면 밖에 나가면 조용히 사라짐 (화면 밖에서 출발하는 행렬은 남겨 둔다)
      const goingLeft = c.target !== null ? c.target < c.x : c.x < this.w / 2
      const gone = goingLeft ? c.x < -c.size * 1.2 && (c.target === null || c.target < 0) : c.x > this.w + c.size * 1.2
      if (gone) this.poofClone(c, true)
      return
    }
    if (!c.grounded) return
    // 창 점령 중: 다 같이 맞춰 움직인다 (occupyBeat)
    if (c.seated) return
    if (c.t < c.until && c.until > 0) return
    if (c.target !== null) return
    const r = Math.random()
    const per = c.perch!
    if (r < 0.5) c.goTo(Math.max(per.x0 + 10, Math.min(per.x1 - 10, c.x + (Math.random() - 0.5) * 500)), Math.random() < 0.4)
    else if (r < 0.7) c.set('happy', 1 + Math.random())
    else if (r < 0.8) c.set('dance', 2)
    else if (r < 0.9) this.jumpSomewhere(c)
    else c.set('idle', 0.5 + Math.random())
  }

  private addNote(x: number, y: number, text: string): void {
    const el = div('memo', this.stage)
    const id = ++this.noteSeq
    el.dataset.act = `note:${id}`
    el.innerHTML = `<b>${esc(text).replace(/\n/g, "<br>")}</b><small>— ${esc(this.petName())}</small>`
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) rotate(${(Math.random() - 0.5) * 8}deg)`
    this.notes.push({ id, el })
    sfx.pop()
    // 너무 많으면 오래된 것부터
    while (this.notes.length > 6) {
      this.notes[0].el.remove()
      this.notes.shift()
    }
  }

  private petName(): string {
    return '모니터 프렌즈'
  }

  private perchBelow(x: number, y0: number, y1: number): Perch | null {
    let best: Perch | null = null
    for (const p of this.perches) {
      if (x < p.x0 || x > p.x1) continue
      if (y0 <= p.y + 0.5 && y1 >= p.y && (!best || p.y < best.y)) best = p
    }
    return best
  }

  // ───────── 퇴근 축하 ─────────

  party(): void {
    const p = this.pet
    if (!p || !this.settings) return
    const t = today(this.settings.work, this.now())
    this.fx.confetti(0, this.w, 0, 220)
    this.fx.burst(p.x, p.y - p.size, 50)
    sfx.party()
    for (const q of this.all()) q.set('dance', 6)
    this.say(`퇴근이다!!! 🎉\n오늘 ${fmtWon(t.daily || t.earned)} 벌었다`, 6000, [{ label: '📸 자랑하기', act: 'share', primary: true }], true)
    this.api.report({ type: 'stat', key: 'parties' })
    // 영수증 → 다 같이 퇴근 행렬 (나만 남음)
    setTimeout(() => this.pet && this.receipt(), 4500)
    setTimeout(() => {
      if (this.pet && !this.press && (!this.prank || this.prank.name === 'march')) {
        this.endPrank()
        this.march('leave')
      }
    }, 9000)
  }

  // ───────── 시간 따라 ─────────

  /** 1초마다: 출근·점심·퇴근 직전·퇴근 */
  private everySecond(): void {
    const s = this.settings
    const p = this.pet
    if (!s || !p) return
    const now = this.now()
    const t = today(s.work, now)
    const prev = this.lastDay
    this.lastDay = t
    const d = new Date(now)
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const hm = d.getHours() * 60 + d.getMinutes()
    // 퇴근 뒤에도 컴퓨터를 쓰는 중이면 공짜 야근
    if (t.status === 'after' && !this.live.away) this.otLast = now
    else if (t.status !== 'after') this.otLast = 0
    // 자리 비움 → 펫 떼가 창을 점령 / 돌아옴 → 들켜서 흩어짐
    if (!this.wasAway && this.live.away && s.awaySwarm && !this.live.lupangOn && this.clones.length < 10) {
      this.swarmed = this.occupy(18, true) > 0
    }
    if (this.wasAway && !this.live.away) {
      if (p.state === 'sleep') p.set('wave', 1.6)
      if (this.swarmed && this.clones.length) {
        this.scatterClones()
        sfx.whoosh()
        this.say('앗 들켰다!! 다들 흩어져!! 💨', 2800)
      } else this.sayLine('back', 2500)
      this.swarmed = false
    }
    this.wasAway = this.live.away
    if (!prev) return
    const once = (k: string): boolean => {
      const key = `${dayKey}|${k}`
      if (this.warned.has(key)) return false
      this.warned.add(key)
      return true
    }
    // 월급날: 처음 일할 때 돈비
    if (t.status === 'working' && !this.live.away && daysToPayday(s.work, now) === 0 && once('payday')) {
      p.set('happy', 3)
      sfx.coin()
      this.fx.moneyRain(this.w, 70)
      this.say('오늘 월급날이다!!! 💸💸', 6000, [{ label: '📸 자랑하기', act: 'share', primary: true }], true)
    }
    if (prev.status === 'before' && t.status === 'working' && once('start')) {
      p.set('wave', 2)
      this.sayLine('start', 4000)
    }
    if (t.status === 'working' && !this.live.away) {
      if (t.leftSec <= 1800 && prev.leftSec > 1800 && once('30')) this.say(`퇴근 30분 전!! 조금만 버텨`, 4000)
      if (t.leftSec <= 600 && prev.leftSec > 600 && once('10')) {
        if (s.leaveParty && !this.prank) this.march('protest')
        else this.sayLine('leaveSoon', 4000)
      }
      if (t.leftSec <= 10 && t.leftSec > 0) {
        // 퇴근 10초 카운트다운 (크게)
        const n = Math.ceil(t.leftSec)
        if (once(`cd${n}`)) {
          this.say(String(n), 1100, [], true)
          sfx.pop()
          p.set('happy', 1.1)
        }
      }
    }
    if (s.leaveParty && prev.status !== 'after' && t.status === 'after' && this.partyDone !== dayKey && !this.live.away) {
      this.partyDone = dayKey
      this.party()
    }
    if (t.status === 'working' && hm === 11 * 60 + 30 && once('lunchSoon')) this.sayLine('lunchSoon')
    if (t.status === 'lunch' && prev.status === 'working' && once('lunch')) {
      p.set('eat', 3)
      this.sayLine('lunch')
    }
  }

  /** 내가 정한 대사 (빈 줄·# 으로 시작하는 줄은 빼고) */
  private customLines(): string[] {
    return (this.settings?.customLines ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  }

  /** {earned} 같은 자리 채우기 + \n → 줄바꿈 */
  private fill(line: string): string {
    const v = this.vars()
    return line.replace(/\\n/g, '\n').replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m)
  }

  /** 설정에서 대사를 바꾸면 바로 하나 말해 보기 */
  sayCustomPreview(): void {
    const ls = this.customLines()
    if (ls.length && this.pet) this.say(this.fill(ls[ls.length - 1]), 3500)
  }

  private chatter(): void {
    const s = this.settings
    const p = this.pet
    if (!s || !p || !s.chatter || this.live.away || this.bubbleUntil > this.time || this.menuMode) return
    // 내 대사: 'only' 면 이것만, 'mix' 면 반쯤. 말하는 펫은 여러 마리 중 아무나
    const custom = this.customLines()
    const who = this.all()[Math.floor(Math.random() * this.all().length)] ?? p
    if (custom.length && (s.customMode === 'only' || Math.random() < 0.5)) {
      this.speak(who, this.fill(custom[Math.floor(Math.random() * custom.length)]), 4000)
      return
    }
    if (s.customMode === 'only' && custom.length === 0) return
    const t = today(s.work, this.now())
    const d = new Date(this.now())
    const dow = d.getDay()
    const h = d.getHours() + d.getMinutes() / 60
    let k: LineKey = 'working'
    if (t.status === 'off') k = 'off'
    else if (t.status === 'before') k = 'beforeWork'
    else if (t.status === 'after') k = 'after'
    else if (t.status === 'lunch') k = 'lunch'
    else if (t.leftSec < 3600) k = 'leaveSoon'
    else if (dow === 1 && Math.random() < 0.4) k = 'monday'
    else if (dow === 5 && Math.random() < 0.5) k = 'friday'
    else if (h >= 13.3 && h < 15.5 && Math.random() < 0.5) k = 'sleepy'
    else if (h >= 11.3 && h < 12) k = 'lunchSoon'
    if (k === 'friday') {
      this.say(pick('friday', { ...this.vars(), left: fmtDur(t.leftSec) }), 3500)
    } else this.sayLine(k, 3800)
    if (k === 'sleepy' && p.grounded && CALM.includes(p.state)) p.set('sleep', 6)
  }

  // ───────── 스스로 행동 ─────────

  private decide(p: Pet): void {
    const s = this.settings!
    const act = s.activity
    const slow = act === 0 ? 1.8 : act === 2 ? 0.6 : 1
    const per = p.perch!
    if (this.live.lupangOn) {
      // 주인이 자리 비운 동안 대신 일하는 척 (화장실이면 같이 앉아서 기다림)
      p.set(this.live.lupangKind === 'toilet' ? 'sit' : 'work', 20)
      return
    }
    if (this.live.away) {
      p.set('sleep', 30)
      return
    }
    const t = today(s.work, this.now())
    const r = Math.random()
    const room = per.x1 - per.x0
    const walkTo = (): void => {
      let x = p.x + (Math.random() - 0.5) * Math.min(room, p.size * 8)
      // 창 위에서는 가끔 가장자리 너머로 걸어가 떨어진다
      if (per.wid !== 0 && Math.random() < 0.12) x = Math.random() < 0.5 ? per.x0 - p.size : per.x1 + p.size
      else x = Math.max(per.x0 + p.size * 0.35, Math.min(per.x1 - p.size * 0.35, x))
      p.goTo(x, Math.random() < 0.08 * (act + 1))
    }
    const d = new Date(this.now())
    const hour = d.getHours()
    p.speedMul = 1
    if (t.status === 'lunch' && r < 0.25) return p.set('eat', 4 + Math.random() * 4)
    // 야근 중: 컵라면 · 졸기 · 삐짐
    if (t.status === 'after') {
      if (r < 0.15) {
        p.set('eat', 4)
        this.fx.text(p.x + p.face * p.size * 0.3, p.y - p.size * 0.6, '🍜', '#333', 24)
        if (Math.random() < 0.3) this.speak(p, '야근엔 역시 컵라면…', 2200)
        return
      }
      if (r < 0.25) return p.set('sleep', 5)
      if (r < 0.32) return p.set('angry', 2.5)
    }
    // 월요일 오전: 좀비처럼 느릿느릿 · 자주 졸기 / 금요일 오후: 들썩들썩
    if (d.getDay() === 1 && hour < 12) {
      p.speedMul = 0.55
      if (r < 0.2) {
        if (Math.random() < 0.3) this.speak(p, '월요병… 🧟', 1800)
        return p.set('sleep', 5 + Math.random() * 5)
      }
    }
    if (d.getDay() === 5 && hour >= 15 && t.status === 'working' && r < 0.15) {
      if (Math.random() < 0.3) this.speak(p, '불금이다~ 🎶', 1800)
      return p.set('dance', 3)
    }
    if (r < 0.32) walkTo()
    else if (r < 0.52) p.set('idle', (2 + Math.random() * 4) * slow)
    else if (r < 0.64) p.set('sit', (5 + Math.random() * 10) * slow)
    else if (r < 0.76 && (t.status === 'working' || t.status === 'after')) p.set('work', (5 + Math.random() * 8) * slow)
    else if (r < 0.86 && !this.jumpSomewhere(p)) walkTo()
    else if (r < 0.92) p.set('wave', 1.6)
    else if (r < 0.96) p.set('happy', 1.4)
    else p.set('sleep', (8 + Math.random() * 10) * slow)
  }

  /** 근처 창 위로 점프. 갈 곳이 없으면 false */
  private jumpSomewhere(p: Pet): boolean {
    if (!p.perch) return false
    const reach = p.size * 3.2
    const cands = this.perches.filter((q) => q !== p.perch && q.y < p.y + 2000 && p.y - q.y < reach && q.x1 - q.x0 > p.size && Math.min(Math.abs(q.x0 - p.x), Math.abs(q.x1 - p.x), q.x0 <= p.x && p.x <= q.x1 ? 0 : 1e9) < p.size * 6)
    if (!cands.length) return false
    const q = cands[Math.floor(Math.random() * cands.length)]
    const tx = Math.max(q.x0 + p.size * 0.4, Math.min(q.x1 - p.size * 0.4, p.x + (Math.random() - 0.5) * p.size * 3))
    const g = 2600
    const apex = Math.min(p.y, q.y) - p.size * 0.7
    const vy0 = -Math.sqrt(2 * g * (p.y - apex))
    const t1 = -vy0 / g
    const t2 = Math.sqrt((2 * Math.max(1, q.y - apex)) / g)
    p.vx = (tx - p.x) / (t1 + t2)
    p.vy = vy0
    p.face = tx >= p.x ? 1 : -1
    p.perch = null
    p.jumpTo = q
    p.set('jump')
    return true
  }

  // ───────── 매 프레임 ─────────

  /** 지금 매 프레임 그려야 하나 (아니면 가끔만) */
  get busy(): boolean {
    const ps = this.all()
    if (!ps.length) return this.fx.active
    return this.fx.active || !!this.press || this.clones.length > 0 || this.treats.length > 0 || !!this.prank || ps.some((p) => !CALM.includes(p.state) || p.hoverT > 0 || p.squash > 0)
  }

  update(dt: number): void {
    this.time += dt
    const p = this.pet
    this.fx.update(dt)
    if (!p || !this.settings) return
    const T = this.time
    // 맥: 다른 화면에서 버튼을 놓았으면 DOM 떼기가 안 온다 → 메인 버튼 상태로
    if (this.platform === 'darwin' && this.press && !this.input.l) {
      this.releaseWait += dt
      if (this.releaseWait > 0.25) this.pointerUp(this.input.x, this.input.y)
    } else this.releaseWait = 0

    // 물리
    const pets = this.all()
    for (const c of [...pets, ...this.clones]) {
      const ev = c.step(dt, this.perches, this.w, this.h)
      if (ev === 'landed') this.onLand(c)
      // 창 가장자리 너머로 걸어감 → 떨어짐
      if (c.perch && c.perch.wid !== 0 && (c.state === 'walk' || c.state === 'run') && (c.x < c.perch.x0 - 2 || c.x > c.perch.x1 + 2) && !c.allowOff) {
        c.perch = null
        c.vx = c.face * c.size * 1.2
        c.vy = -200
        c.set('fall')
      }
      if (ev === 'arrived' && !c.clone && !(c === p && this.prank && this.prank.name !== 'boss' && this.prank.name !== 'march')) this.arrived(c)
    }
    // 분신: 시간이 되면 펑
    for (const c of [...this.clones]) {
      if (T > c.dieAt) this.poofClone(c)
      else this.cloneBrain(c)
    }
    this.occupyBeat()

    this.updatePrank(dt)
    for (const q of pets) this.updateRub(q, dt)

    // 알아서 하는 행동
    for (const q of pets) {
      const main = q === p
      const herd = this.prank?.name === 'boss' || this.prank?.name === 'march'
      if (q.grounded && this.press?.who !== q && !(main && this.prank) && !herd && q.target === null) {
        const timed = AUTO.includes(q.state) && q.until > 0 && q.t >= q.until
        const sleepingButBack = q.state === 'sleep' && !this.live.away && q.t > q.until
        const awayNow = this.live.away && q.state !== 'sleep' && !this.live.lupangOn && q.state !== 'eat' && !(main && this.working)
        if (timed || sleepingButBack || awayNow || (q.state === 'idle' && q.until === 0)) {
          if (!main || (!this.working && !this.eating)) this.decide(q)
        }
        if (this.live.away && q.state === 'sleep' && Math.random() < dt * 0.7) this.fx.z(q.x + q.size * 0.2, q.y - q.size * 0.7)
      }
      if (q.state === 'dizzy' && Math.random() < dt * 4) this.fx.stars(q.x, q.y - q.size * 0.95, 1)
      if (q.state === 'drag' && Math.random() < dt * 3) this.fx.sweat(q.x + q.size * 0.25, q.y - q.size * 0.8)
      if (this.live.lupangOn && (q.state === 'work' || q.state === 'sit') && Math.random() < dt * 0.6 / pets.length) {
        if (this.live.lupangKind === 'toilet' && Math.random() < 0.4) this.fx.text(q.x + (Math.random() - 0.5) * q.size * 0.6, q.y - q.size, '💩', '#7a4a1f', 18)
        else this.fx.money(q.x, q.y - q.size)
      }
      // 끄는 중 흔들림
      if (q.state === 'drag') {
        const h = this.hist
        const vx = h.length > 1 ? (h[h.length - 1].x - h[0].x) / Math.max(0.016, h[h.length - 1].t - h[0].t) : 0
        q.tilt += (Math.max(-28, Math.min(28, -vx * 0.025)) - q.tilt) * Math.min(1, dt * 10)
      }
      q.render(dt)
    }
    for (const c of this.clones) c.render(dt)
    for (const q of [...pets, ...this.clones]) {
      if (!q.sign) continue
      const hd = q.head()
      q.sign.style.transform = `translate3d(${Math.round(hd.x - q.sign.offsetWidth / 2)}px, ${Math.round(hd.y - q.sign.offsetHeight - 2 + Math.sin(T * 6 + q.x * 0.05) * 3)}px, 0) rotate(${Math.sin(T * 3 + q.x) * 6}deg)`
    }

    // 1초마다
    this.secT += dt
    if (this.secT >= 1) {
      this.secT = 0
      this.everySecond()
    }
    this.chatterAt -= dt * (this.settings.activity === 0 ? 0.6 : this.settings.activity === 2 ? 1.5 : 1)
    if (this.chatterAt <= 0) {
      const e = this.settings.chatterEvery
      this.chatterAt = e * (0.6 + Math.random() * 0.8)
      this.chatter()
    }
    // 표시
    this.showT += dt
    if (this.showT >= this.settings.showEvery) {
      this.showT = 0
      this.showIdx++
      if (this.showIdx % Math.max(1, this.settings.show.length) === 0) this.cycle++
    }
    this.updateTag()
    if (T > this.bubbleUntil && this.bubble.style.display !== 'none') this.hideBubble()
    this.layoutUi()
    // 자리 기억 (30초마다·착지할 때)
    this.spotT += dt
    if (this.spotT > 30 && p.grounded) {
      this.spotT = 0
      this.api.report({ type: 'spot', x: Math.round(p.x), y: Math.round(p.y) })
    }
    this.pushHot()
  }

  /** 걸어서 도착: 근처에 다른 펫이 있으면 가끔 하이파이브 */
  private arrived(c: Pet): void {
    c.set('idle', 0.6 + Math.random() * 1.5)
    if (c.allowOff) {
      if (c.x >= 0 && c.x <= this.w && !(c === this.pet && this.prank)) {
        c.allowOff = false
        c.speedMul = 1
      }
      return
    }
    const other = this.all().find((o) => o !== c && o.grounded && o.perch === c.perch && Math.abs(o.x - c.x) < c.size * 0.9)
    if (other && Math.random() < 0.5 && CALM.concat(['walk']).includes(other.state)) {
      c.face = other.x > c.x ? 1 : -1
      other.face = -c.face
      c.set('happy', 1.6)
      other.set('happy', 1.6)
      this.fx.hearts((c.x + other.x) / 2, c.y - c.size, 3)
      this.speak(c, ['하이파이브!', '안녕 친구!', '같이 놀자~', '뭐 해?'][Math.floor(Math.random() * 4)], 1600)
      sfx.pop()
    }
  }

  private onLand(c: Pet): void {
    if (c.clone) {
      c.set('idle', 0.3 + Math.random())
      return
    }
    const hard = Math.abs(c.impact) > 1500
    sfx.thud()
    if (c.state === 'jump') {
      c.set('idle', 0.8)
      return
    }
    if (hard) {
      c.set('dizzy', 2.2)
      this.speak(c, pick('dizzy'), 2200)
    } else c.set('idle', 1)
    this.spotT = 31
  }

  private updateRub(p: Pet, dt: number): void {
    const i = this.input
    const h = this.hist
    const over = !this.press && p.grounded && p.contains(i.x, i.y, 0)
    if (!over) {
      p.hoverT = Math.max(0, p.hoverT - dt)
      p.rub.score = Math.max(0, p.rub.score - dt * 200)
      if (p.rub.score === 0) p.rub.flips = 0
      return
    }
    p.hoverT += dt
    if (h.length > 1) {
      const dx = h[h.length - 1].x - h[h.length - 2].x
      if (Math.abs(dx) > 1) {
        p.rub.score += Math.abs(dx)
        if (Math.sign(dx) !== Math.sign(p.rub.lastDx) && p.rub.lastDx !== 0) p.rub.flips++
        p.rub.lastDx = dx
      }
    }
    p.rub.score = Math.max(0, p.rub.score - dt * 60)
    if (p.rub.flips >= 4 && p.rub.score > 120 && this.time - p.lastPetAt > 1.2) {
      p.lastPetAt = this.time
      p.rub = { score: 0, flips: 0, lastDx: 0 }
      if (p.state !== 'happy') {
        p.set('happy', 1.8)
        this.speak(p, pick('pet'), 1800)
        this.api.report({ type: 'stat', key: 'pets' })
      }
      sfx.purr()
      this.fx.hearts(p.x, p.y - p.size * 0.9, 3)
    }
    // 가만히 올려 두면 인사
    if (p.hoverT > 0.8 && this.time - p.lastWave > 45 && ['idle', 'sit', 'walk'].includes(p.state)) {
      p.lastWave = this.time
      p.set('wave', 1.4)
      if (p !== this.pet || !this.bubbleUntil || this.bubbleUntil < this.time) this.speak(p, pick('greet'), 1500)
    }
  }

  /** 말풍선·표시·메뉴를 펫 머리 위로 */
  private layoutUi(): void {
    const p = this.pet
    if (!p) return
    const hd = p.head()
    // 피켓을 들고 있으면 그 위부터
    let y = hd.y - 6 - (p.sign ? p.sign.offsetHeight + 16 : 0)
    if (this.tag.style.display !== 'none') {
      const tw = this.tag.offsetWidth
      const th = this.tag.offsetHeight
      const x = clamp(hd.x - tw / 2, 4, this.w - tw - 4)
      y = Math.max(th + 4, y)
      this.tag.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y - th)}px, 0)`
      y -= th + 6
    }
    if (this.prog.style.display !== 'none') {
      const pw = this.prog.offsetWidth
      const ph = this.prog.offsetHeight
      this.prog.style.transform = `translate3d(${Math.round(clamp(hd.x - pw / 2, 4, this.w - pw - 4))}px, ${Math.round(y - ph)}px, 0)`
      y -= ph + 6
    }
    if (this.bubble.style.display !== 'none') {
      const bw = this.bubble.offsetWidth
      const bh = this.bubble.offsetHeight
      let by = y - bh
      // 위에 자리가 없으면 펫 아래로
      if (by < 4) by = Math.min(this.h - bh - 4, p.y + 8)
      const bx = clamp(hd.x - bw / 2, 4, this.w - bw - 4)
      this.bubble.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(by)}px, 0)`
      this.bubble.style.setProperty('--tail', `${Math.round(clamp(hd.x - bx, 18, bw - 18))}px`)
    }
    if (this.menuMode) this.placeMenu()
    // 같이 노는 펫 말풍선
    for (const f of this.friends) {
      const t = f.talk
      if (!t || t.style.display === 'none') continue
      if (this.time > f.talkUntil) {
        t.style.display = 'none'
        continue
      }
      const fh = f.head()
      const bw = t.offsetWidth
      const bh = t.offsetHeight
      const bx = clamp(fh.x - bw / 2, 4, this.w - bw - 4)
      const lift = f.sign ? f.sign.offsetHeight + 16 : 0
      t.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(Math.max(4, fh.y - bh - 10 - lift))}px, 0)`
      t.style.setProperty('--tail', `${Math.round(clamp(fh.x - bx, 14, bw - 14))}px`)
    }
  }

  /** 클릭을 받을 곳을 메인에 알린다 (바뀔 때만) */
  private pushHot(): void {
    const rs: Rect[] = []
    const p = this.pet
    const all = !!this.press?.moved
    if (p && p.state !== 'hang') rs.push(p.bbox(6))
    for (const f of this.friends) {
      rs.push(f.bbox(6))
    }
    for (const c of this.clones) rs.push(c.bbox(2))
    for (const el of [this.tag, this.bubble, this.menu, this.prog]) if (el.style.display !== 'none') rs.push(rectOf(el, 4))
    for (const n of this.notes) rs.push(rectOf(n.el, 2))
    const key = (all ? 'A' : '') + rs.map((r) => `${r.x >> 2},${r.y >> 2},${r.w >> 2},${r.h >> 2}`).join('|')
    if (key === this.hotKey) return
    this.hotKey = key
    this.api.setHot(
      rs.map((r) => ({ x: Math.floor(r.x), y: Math.floor(r.y), w: Math.ceil(r.w), h: Math.ceil(r.h) })),
      all
    )
  }

  // ───────── 파일 끌어오기 ─────────

  dragOver(x: number, y: number): boolean {
    const p = this.all().find((q) => q.contains(x, y, 16)) ?? this.pet
    if (!p) return false
    const over = p.contains(x, y, 16)
    if (over) this.focus = p
    if (over && !this.dropHover) {
      this.dropHover = true
      if (p.grounded) p.set('eat', 30)
      this.sayLine('fileHover', 2000)
      sfx.pop()
    } else if (!over && this.dropHover) this.dragLeave()
    return over
  }

  dragLeave(): void {
    if (!this.dropHover) return
    this.dropHover = false
    if (this.pet?.state === 'eat' && !this.working) this.pet.set('idle', 0.5)
  }

  dropped(paths: string[]): void {
    this.dropHover = false
    if (!paths.length) return
    this.pet?.set('happy', 1)
    this.api.report({ type: 'dropped', paths })
  }

  private show(el: HTMLElement): void {
    if (el.style.display === 'none') el.style.display = ''
  }

  private hide(el: HTMLElement): void {
    el.style.display = 'none'
  }
}

function div(cls: string, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div')
  d.className = cls
  parent.appendChild(d)
  return d
}

function rectOf(el: HTMLElement, pad: number): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 }
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
