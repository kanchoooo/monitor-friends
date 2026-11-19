// 단축키 (Electron accelerator) ↔ 보기 좋은 글자 · 키 입력 → accelerator

const MAC: Record<string, string> = { Command: '⌘', Cmd: '⌘', CommandOrControl: '⌘', CmdOrCtrl: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Super: '⌘', Meta: '⌘' }
const WIN: Record<string, string> = { Command: 'Win', Cmd: 'Win', CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Control: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Option: 'Alt', Shift: 'Shift', Super: 'Win', Meta: 'Win' }
const KEY: Record<string, string> = { Space: 'Space', Escape: 'Esc', Return: 'Enter', Up: '↑', Down: '↓', Left: '←', Right: '→', Backspace: '⌫', Delete: 'Del', Plus: '+' }

export function accelLabel(accel: string, platform: string): string {
  if (!accel) return ''
  const mac = platform === 'darwin'
  const parts = accel.split('+')
  const out = parts.map((p) => (mac ? MAC[p] : WIN[p]) ?? KEY[p] ?? p.toUpperCase())
  return mac ? out.join('') : out.join('+')
}

/** keydown → accelerator. 보조 키만 눌렀거나 보조 키가 없으면 null */
export function accelFromEvent(e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; code: string }, platform: string): string | null {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Control')
  if (e.metaKey) mods.push(platform === 'darwin' ? 'Command' : 'Super')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const k = keyName(e.code)
  if (!k || !mods.length) return null
  // Shift 하나만으로는 글자 입력과 겹친다
  if (mods.length === 1 && mods[0] === 'Shift') return null
  return [...mods, k].join('+')
}

function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^F\d{1,2}$/.test(code)) return code
  const m: Record<string, string> = {
    Space: 'Space',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Escape',
    Enter: 'Return',
    Tab: 'Tab'
  }
  return m[code] ?? null
}
