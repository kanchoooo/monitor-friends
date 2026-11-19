import type { BrowserApi, OverlayApi, PanelApi } from '@shared/types'

declare global {
  interface Window {
    api: PanelApi
    overlayApi: OverlayApi
    browserApi: BrowserApi
  }
}

export {}
