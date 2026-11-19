// 사용법: npx vite build -c test/harness/vite.lab.config.mjs && npx electron test/harness/shot.cjs <페이지> <저장.png> [가로x세로] [기다림ms]
// lab.html#<페이지> 를 띄워 캡처하고, 페이지 콘솔을 터미널에 찍는다. 페이지가 window.__labDone = true 를 세우면 바로 찍는다.
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('fs')
const { join } = require('path')
const [page, out = 'lab.png', size = '1400x900', wait = '1200'] = process.argv.slice(2)
const [w, h] = size.split('x').map(Number)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: w, height: h, show: false, webPreferences: { offscreen: true } })
  win.webContents.on('console-message', (e) => console.log(`[lab:${e.level}] ${e.message}`))
  await win.loadFile(join(__dirname, '../../out-lab/lab.html'), { hash: page })
  const t0 = Date.now()
  while (Date.now() - t0 < Number(wait)) {
    if (await win.webContents.executeJavaScript('!!window.__labDone').catch(() => false)) break
    await new Promise((r) => setTimeout(r, 100))
  }
  const img = await win.webContents.capturePage()
  writeFileSync(out, img.toPNG())
  console.log('[shot]', out)
  app.quit()
})
