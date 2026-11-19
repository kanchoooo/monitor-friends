// 마우스 버튼 상태 읽기 (60Hz). 펫을 누르고·끌고·놓는 걸 모두 이걸로 판단한다.
// 윈도우에서는 포커스를 받지 않는 창(오버레이)을 클릭하면 Chromium 이 클릭을 버려서
// (WM_MOUSEACTIVATE → MA_NOACTIVATEANDEAT) 렌더러에 pointerdown 이 오지 않는다 (비둘기 모니터에서 겪음).
// 그래서 두 플랫폼 모두 메인이 직접 읽은 버튼 상태를 오버레이에 보낸다.
import koffi from 'koffi'

export interface Buttons {
  left: boolean
  right: boolean
}

/** 지금 눌려 있는 버튼. 읽을 수 없으면 null */
export function createButtonReader(): (() => Buttons) | null {
  try {
    if (process.platform === 'win32') return winReader()
    if (process.platform === 'darwin') return macReader()
  } catch (err) {
    console.warn('[buttons] 마우스 버튼을 읽을 수 없어요:', (err as Error)?.message ?? err)
  }
  return null
}

function winReader(): () => Buttons {
  const user32 = koffi.load('user32.dll')
  const GetAsyncKeyState = user32.func('int16_t __stdcall GetAsyncKeyState(int vKey)')
  const GetSystemMetrics = user32.func('int __stdcall GetSystemMetrics(int nIndex)')
  const SM_SWAPBUTTON = 23
  // 가장 높은 비트: 지금 눌림, 가장 낮은 비트: 지난 호출 이후 눌렸다 뗌 (아주 짧은 클릭 → 한 번은 눌린 걸로)
  const read = (vk: number): boolean => {
    const s = GetAsyncKeyState(vk) as number
    return (s & 0x8000) !== 0 || (s & 1) !== 0
  }
  return () => {
    const swap = GetSystemMetrics(SM_SWAPBUTTON) !== 0
    return { left: read(swap ? 0x02 : 0x01), right: read(swap ? 0x01 : 0x02) }
  }
}

function macReader(): () => Buttons {
  const objc = koffi.load('/usr/lib/libobjc.A.dylib')
  const objc_getClass = objc.func('void *objc_getClass(const char *name)')
  const sel_registerName = objc.func('void *sel_registerName(const char *name)')
  const msgSend = objc.func('uint64_t objc_msgSend(void *self, void *op)')
  const NSEvent = objc_getClass('NSEvent')
  const sel = sel_registerName('pressedMouseButtons')
  if (!NSEvent || !sel) throw new Error('NSEvent 없음')
  return () => {
    // 권한 없이 읽을 수 있는 현재 눌린 버튼 (bit0 = 왼쪽, bit1 = 오른쪽)
    const m = Number(msgSend(NSEvent, sel))
    return { left: (m & 1) !== 0, right: (m & 2) !== 0 }
  }
}
