// run.mjs 가 띄우는 Electron 메인 — 견본 파일을 만들고 모든 도구를 돌려 결과를 확인한다
const { app, BrowserWindow, clipboard } = require('electron')
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const T = process.env.MYPET_TEST_DIR
const F = path.join(T, 'fx') // 견본
const tools = require(path.join(T, 'bundle/tools-main.cjs'))

let pass = 0
let fail = 0
function check(name, ok, info = '') {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`)
}
function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return (r.stdout || '') + (r.stderr || '')
}
function dims(p) {
  const o = sh('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', p])
  const w = /pixelWidth: (\d+)/.exec(o)
  const h = /pixelHeight: (\d+)/.exec(o)
  return w && h ? [Number(w[1]), Number(h[1])] : null
}
function show(label, r, t0) {
  console.log(`\n[${label}] ${Date.now() - t0}ms ok=${r.ok} msg="${r.message}"`)
  for (const o of r.outputs) console.log(`   → ${path.relative(T, o)} ${fs.existsSync(o) ? fs.statSync(o).size + 'B' : '(없음)'}`)
  for (const f of r.failed) console.log(`   ✗ ${f.name}: ${f.reason}`)
}
async function go(label, req) {
  const t0 = Date.now()
  const prog = []
  const r = await tools.runTool(req, (p) => prog.push(`${p.done}/${p.total}`))
  show(label, r, t0)
  r.prog = prog
  return r
}

// ── 견본 만들기 ──

/** 방향·카메라·GPS 가 든 EXIF APP1 */
function exifApp1(orientation) {
  const t = Buffer.alloc(112)
  t.write('MM', 0, 'latin1')
  t.writeUInt16BE(42, 2)
  t.writeUInt32BE(8, 4)
  t.writeUInt16BE(3, 8)
  let e = 10
  const ent = (tag, type, count, val, isShort) => {
    t.writeUInt16BE(tag, e)
    t.writeUInt16BE(type, e + 2)
    t.writeUInt32BE(count, e + 4)
    if (isShort) t.writeUInt16BE(val, e + 8)
    else t.writeUInt32BE(val, e + 8)
    e += 12
  }
  ent(0x010f, 2, 8, 50) // Make
  ent(0x0112, 3, 1, orientation, true)
  ent(0x8825, 4, 1, 58) // GPS
  t.writeUInt32BE(0, e)
  t.write('TestCam\0', 50, 'latin1')
  t.writeUInt16BE(2, 58)
  e = 60
  t.writeUInt16BE(1, e) // GPSLatitudeRef
  t.writeUInt16BE(2, e + 2)
  t.writeUInt32BE(2, e + 4)
  t.write('N\0', e + 8, 'latin1')
  e += 12
  ent(0x0002, 5, 3, 88)
  t.writeUInt32BE(0, e)
  for (let k = 0; k < 3; k++) {
    t.writeUInt32BE([37, 33, 15][k], 88 + k * 8)
    t.writeUInt32BE(1, 92 + k * 8)
  }
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t])
  const head = Buffer.from([0xff, 0xe1, 0, 0])
  head.writeUInt16BE(body.length + 2, 2)
  return Buffer.concat([head, body])
}
function withExif(jpeg, orientation) {
  return Buffer.concat([jpeg.subarray(0, 2), exifApp1(orientation), jpeg.subarray(2)])
}

const FIXTURE_JS = `
(async () => {
  const out = {}
  const toB64 = async (blob) => { const b = new Uint8Array(await blob.arrayBuffer()); let s=''; for (let i=0;i<b.length;i+=0x8000) s+=String.fromCharCode(...b.subarray(i,i+0x8000)); return btoa(s) }
  const pic = async (w, h, type, draw, q) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); draw(x, w, h); return toB64(await c.convertToBlob({ type, quality: q })) }
  const scene = (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#3a7bd5'); g.addColorStop(1, '#f6d365'); x.fillStyle = g; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 300; i++) { x.fillStyle = 'hsl(' + (i * 37 % 360) + ',70%,' + (30 + i % 50) + '%)'; x.beginPath(); x.arc((i * 97) % w, (i * 53) % h, 5 + (i % 40) * w / 1500, 0, 7); x.fill() }
    x.fillStyle = '#c00'; x.font = 'bold ' + Math.round(h / 8) + 'px sans-serif'; x.fillText('TOP ↑ 위', w * 0.05, h * 0.18)
  }
  out.photo = await pic(3000, 2000, 'image/jpeg', scene, 0.95)
  // 저장은 가로 600×300, EXIF 방향 6 (= 오른쪽으로 90° 돌려 보여야 함) → 보이는 크기 300×600
  out.rot = await pic(600, 300, 'image/jpeg', (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#06c'; x.font = 'bold 80px sans-serif'; x.fillText('LEFT=TOP', 20, 180) }, 0.95)
  out.alpha = await pic(1200, 800, 'image/png', (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(255,0,0,0.6)'; x.beginPath(); x.arc(600, 400, 300, 0, 7); x.fill(); x.fillStyle = '#000'; x.font = '60px sans-serif'; x.fillText('투명 PNG', 450, 420) })
  out.webp = await pic(800, 800, 'image/webp', scene, 0.9)
  const shot = (n) => (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#222'; x.font = '48px sans-serif'; for (let i = 0; i < 30; i++) x.fillText('캡처 ' + n + ' — 줄 ' + (i + 1), 40, 80 + i * 80); x.fillStyle = ['#e33','#3a3','#33e'][n-1]; x.fillRect(0, 0, w, 20); x.fillRect(0, h - 20, w, 20) }
  out.s1 = await pic(1170, 2532, 'image/png', shot(1))
  out.s2 = await pic(1170, 2532, 'image/png', shot(2))
  out.s3 = await pic(1080, 1920, 'image/png', shot(3))
  out.tiny = await pic(64, 64, 'image/png', (x) => { x.fillStyle = '#0a0'; x.fillRect(0, 0, 64, 64) })

  // 동영상 (MediaRecorder): 3.5초, 움직이는 공 + 장면 번호
  const rec = async (mime) => {
    if (!MediaRecorder.isTypeSupported(mime)) return null
    const c = document.createElement('canvas'); c.width = 640; c.height = 360; document.body.appendChild(c)
    const x = c.getContext('2d'); const st = c.captureStream(30); const r = new MediaRecorder(st, { mimeType: mime, videoBitsPerSecond: 2e6 })
    const chunks = []; r.ondataavailable = (e) => chunks.push(e.data)
    let f = 0; const draw = () => { x.fillStyle = 'hsl(' + (f * 4 % 360) + ',60%,50%)'; x.fillRect(0, 0, 640, 360); x.fillStyle = '#fff'; x.beginPath(); x.arc(40 + (f * 6) % 560, 180, 30, 0, 7); x.fill(); x.font = 'bold 60px sans-serif'; x.fillText('#' + f, 20, 70); f++ }
    draw(); const iv = setInterval(draw, 33)
    r.start(200); await new Promise((res) => setTimeout(res, 3500)); r.stop(); clearInterval(iv)
    await new Promise((res) => (r.onstop = res))
    return toB64(new Blob(chunks))
  }
  out.mp4 = await rec('video/mp4;codecs=avc1.42E01F')
  out.webm = await rec('video/webm;codecs=vp9')
  return out
})()
`

async function makeFixtures() {
  fs.mkdirSync(F, { recursive: true })
  const w = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })
  await w.loadURL('data:text/html,<body></body>')
  const o = await w.webContents.executeJavaScript(FIXTURE_JS)
  w.destroy()
  const b = (k) => Buffer.from(o[k], 'base64')
  fs.writeFileSync(`${F}/photo.jpg`, withExif(b('photo'), 1))
  fs.writeFileSync(`${F}/rot.jpg`, withExif(b('rot'), 6))
  fs.writeFileSync(`${F}/alpha.png`, b('alpha'))
  fs.writeFileSync(`${F}/pic.webp`, b('webp'))
  fs.writeFileSync(`${F}/shot1.png`, b('s1'))
  fs.writeFileSync(`${F}/shot2.png`, b('s2'))
  fs.writeFileSync(`${F}/shot3.png`, b('s3'))
  fs.writeFileSync(`${F}/tiny.png`, b('tiny'))
  fs.writeFileSync(`${F}/broken.jpg`, Buffer.from('this is not a jpeg at all'))
  if (o.mp4) fs.writeFileSync(`${F}/clip.mp4`, b('mp4'))
  if (o.webm) fs.writeFileSync(`${F}/clip.webm`, b('webm'))
  console.log(`fixtures: mp4=${!!o.mp4} webm=${!!o.webm}`)
  sh('/usr/bin/sips', ['-s', 'format', 'heic', `${F}/photo.jpg`, '--out', `${F}/iphone.heic`])
  if (o.mp4) sh('/usr/bin/avconvert', ['--source', `${F}/clip.mp4`, '--preset', 'PresetHEVC1920x1080', '--output', `${F}/hevc.mov`])
  fs.writeFileSync(`${F}/자소서.txt`, '저는 문제를 끝까지 파고드는 사람입니다.\n대학 시절 동아리에서 웹 서비스를 만들며 1,000명의 사용자를 모았습니다.\n\n감사합니다. 😊\n')
  fs.writeFileSync(`${F}/utf8.txt`, '가나다 abc\n')
  spawnSync('/bin/sh', ['-c', `printf '한글 EUC-KR 문서입니다\\n둘째 줄' | /usr/bin/iconv -f UTF-8 -t EUC-KR > "${F}/euckr.txt"`])
  // 폴더 (압축용)
  fs.mkdirSync(`${F}/폴더/안쪽`, { recursive: true })
  fs.mkdirSync(`${F}/폴더/빈폴더`, { recursive: true })
  fs.writeFileSync(`${F}/폴더/메모.txt`, '안녕 '.repeat(5000))
  fs.writeFileSync(`${F}/폴더/안쪽/data.json`, JSON.stringify({ a: Array.from({ length: 2000 }, (_, i) => i) }))
  fs.copyFileSync(`${F}/photo.jpg`, `${F}/폴더/안쪽/photo.jpg`)
  fs.writeFileSync(`${F}/폴더/.DS_Store`, 'junk')
}

function gifFrames(p) {
  const b = fs.readFileSync(p)
  let n = 0
  for (let i = 0; i + 2 < b.length; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 0x04) n++
  return n
}

async function main() {
  await makeFixtures()
  const P = (n) => path.join(F, n)
  const insp = tools.inspectFiles([P('photo.jpg'), P('iphone.heic'), P('폴더'), P('없는파일.png'), P('clip.mp4'), P('자소서.txt')])
  console.log('inspect:', insp.map((f) => `${f.name}:${f.kind}${f.dir ? '/dir' : ''}`).join(' '))
  check('inspectFiles skips missing + kinds', insp.length === 5 && insp[1].kind === 'heic' && insp[2].dir === true && insp[3].kind === 'video' && insp[4].kind === 'text')

  const origNames = fs.readdirSync(F).filter((n) => fs.statSync(P(n)).isFile())
  const snap = () => origNames.map((n) => `${n}:${fs.statSync(P(n)).size}:${fs.statSync(P(n)).mtimeMs}`).join('|')
  const before = snap()

  // convert
  let r = await go('convert → webp', { tool: 'convert', files: [P('photo.jpg'), P('alpha.png'), P('iphone.heic'), P('broken.jpg'), P('자소서.txt')], opts: { to: 'webp' } })
  check('convert 3 ok + broken/text failed', r.outputs.length === 3 && r.failed.length === 2)
  check('convert outputs named _pet.webp', r.outputs.every((o) => /_pet\.webp$/.test(o)))
  check('heic → webp dims 3000x2000', JSON.stringify(dims(r.outputs[2])) === '[3000,2000]', JSON.stringify(dims(r.outputs[2])))
  r = await go('convert heic → jpg', { tool: 'convert', files: [P('iphone.heic')], opts: { to: 'jpg' } })
  check('heic → jpg', r.ok && /iphone_pet\.jpg$/.test(r.outputs[0]))
  r = await go('convert png → jpg (alpha → white)', { tool: 'convert', files: [P('alpha.png')], opts: { to: 'jpg' } })
  const alphaJpg = r.outputs[0]
  r = await go('convert jpg → jpg skip', { tool: 'convert', files: [P('photo.jpg')], opts: { to: 'jpg' } })
  check('same-format convert is a friendly skip', r.ok && r.outputs.length === 0, r.message)
  r = await go('convert again (dedupe)', { tool: 'convert', files: [P('photo.jpg')], opts: { to: 'webp' } })
  check('dedupe → "photo_pet (2).webp"', /photo_pet \(2\)\.webp$/.test(r.outputs[0]))

  // resize
  r = await go('resize 50%', { tool: 'resize', files: [P('photo.jpg')], opts: { size: '50' } })
  check('resize 50% → 1500x1000', JSON.stringify(dims(r.outputs[0])) === '[1500,1000]')
  r = await go('resize w1280 (rot.jpg EXIF 6, tiny)', { tool: 'resize', files: [P('photo.jpg'), P('rot.jpg'), P('tiny.png')], opts: { size: 'w1280' } })
  check('w1280 → 1280x853', JSON.stringify(dims(r.outputs[0])) === '[1280,853]', JSON.stringify(dims(r.outputs[0])))
  check('no upscale: rot & tiny skipped', r.outputs.length === 1 && r.failed.length === 2 && r.ok)
  r = await go('resize 50% rot.jpg (EXIF orientation)', { tool: 'resize', files: [P('rot.jpg')], opts: { size: '50' } })
  const rotHalf = r.outputs[0]
  check('orientation applied → 150x300', JSON.stringify(dims(rotHalf)) === '[150,300]', JSON.stringify(dims(rotHalf)))

  // compress
  r = await go('compress normal', { tool: 'compress', files: [P('photo.jpg'), P('alpha.png'), P('tiny.png'), P('shot1.png')], opts: { level: 'normal', format: 'auto' } })
  check('compress: jpg stays jpg, png → webp', /photo_pet( \(\d+\))?\.jpg$/.test(r.outputs[0]) && r.outputs.slice(1).every((o) => o.endsWith('.webp')))
  check('compress outputs smaller', r.outputs.every((o) => fs.statSync(o).size < fs.statSync(P(path.basename(o).replace(/_pet( \(\d+\))?\.\w+$/, '') + (/photo/.test(o) ? '.jpg' : '.png'))).size))
  r = await go('compress most', { tool: 'compress', files: [P('photo.jpg')], opts: { level: 'most' } })
  check('compress most → long edge 1280', JSON.stringify(dims(r.outputs[0])) === '[1280,853]')
  r = await go('compress tiny small jpg (should skip)', { tool: 'compress', files: [alphaJpg], opts: { level: 'normal', format: 'jpg' } })

  // crop / rotate / gray
  r = await go('crop 1:1', { tool: 'crop', files: [P('photo.jpg'), P('rot.jpg')], opts: { ratio: '1x1' } })
  check('crop 1:1 → 2000x2000, 300x300', JSON.stringify(r.outputs.map(dims)) === '[[2000,2000],[300,300]]', JSON.stringify(r.outputs.map(dims)))
  r = await go('crop 4:5', { tool: 'crop', files: [P('photo.jpg')], opts: { ratio: '4x5' } })
  check('crop 4:5 → 1600x2000', JSON.stringify(dims(r.outputs[0])) === '[1600,2000]')
  r = await go('crop 9:16', { tool: 'crop', files: [P('photo.jpg')], opts: { ratio: '9x16' } })
  check('crop 9:16 → 1125x2000', JSON.stringify(dims(r.outputs[0])) === '[1125,2000]')
  r = await go('rotate right', { tool: 'rotate', files: [P('photo.jpg'), P('alpha.png')], opts: { dir: 'right' } })
  check('rotate right → 2000x3000 / 800x1200 png', JSON.stringify(r.outputs.map(dims)) === '[[2000,3000],[800,1200]]' && r.outputs[1].endsWith('.png'))
  const rotRight = r.outputs[0]
  r = await go('rotate flip', { tool: 'rotate', files: [P('rot.jpg')], opts: { dir: 'flip' } })
  const flipped = r.outputs[0]
  check('flip keeps 300x600', JSON.stringify(dims(flipped)) === '[300,600]')
  r = await go('gray', { tool: 'gray', files: [P('photo.jpg'), P('pic.webp')], opts: {} })
  const grayOut = r.outputs[0]
  check('gray 2 ok, webp stays webp', r.outputs.length === 2 && r.outputs[1].endsWith('.webp'))

  // strip
  r = await go('strip', { tool: 'strip', files: [P('photo.jpg'), P('rot.jpg'), P('alpha.png'), P('iphone.heic')], opts: {} })
  const s0 = fs.readFileSync(r.outputs[0])
  const s1 = fs.readFileSync(r.outputs[1])
  check('strip: no Make/GPS left in jpg', !s0.includes('TestCam') && !s1.includes('TestCam') && !s0.includes('Exif') && s1.indexOf('Exif') > 0)
  const stripRot = r.outputs[1]
  const r2 = await go('resize stripped rot (orientation still applied?)', { tool: 'resize', files: [stripRot], opts: { size: '50' } })
  check('strip: orientation kept on rot.jpg (decodes as 150x300)', JSON.stringify(dims(r2.outputs[0])) === '[150,300]', JSON.stringify(dims(r2.outputs[0])))
  check('strip: photo lossless (size diff = exif only)', fs.statSync(P('photo.jpg')).size - s0.length === exifApp1(1).length, `${fs.statSync(P('photo.jpg')).size} → ${s0.length}`)
  check('strip: png without metadata → skip', r.failed.some((f) => f.name === 'alpha.png'))
  check('strip: heic → jpg re-encode', r.outputs.some((o) => /iphone_pet( \(\d+\))?\.jpg$/.test(o)))

  // pdf
  r = await go('pdf a4', { tool: 'pdf', files: [P('photo.jpg'), P('rot.jpg'), P('shot1.png'), P('iphone.heic'), P('broken.jpg')], opts: { page: 'a4' } })
  const pdfA4 = r.outputs[0]
  const pdfTxt = fs.readFileSync(pdfA4).toString('latin1')
  check('pdf: 4 pages + broken failed', (pdfTxt.match(/\/Type \/Page /g) || []).length === 4 && /\/Count 4/.test(pdfTxt) && r.failed.length === 1)
  r = await go('pdf original', { tool: 'pdf', files: [P('shot1.png'), P('shot3.png')], opts: { page: 'original' } })
  const pdfOrig = r.outputs[0]
  // 맥 PDFKit 으로 열어 쪽 수·크기 확인
  const mdOut = sh('/usr/bin/swift', ['-e', `import PDFKit; for p in CommandLine.arguments.dropFirst() { let d = PDFDocument(url: URL(fileURLWithPath: p))!; print(d.pageCount, d.page(at: 0)!.bounds(for: .mediaBox).size) }`, pdfA4, pdfOrig])
  console.log('PDFKit:', mdOut.trim())
  check('PDFKit opens both pdfs', /^4 \(595\.28, 841\.89\)/m.test(mdOut) && /^2 \(877\.5, 1899\.0\)/m.test(mdOut))

  // stitch
  r = await go('stitch', { tool: 'stitch', files: [P('shot1.png'), P('shot2.png'), P('shot3.png')], opts: {} })
  const stitched = r.outputs[0]
  // 가장 흔한 폭 1170, 1080x1920 → 1170x2080 : 2532*2 + 2080 = 7144
  check('stitch → 1170x7144 png', JSON.stringify(dims(stitched)) === '[1170,7144]' && stitched.endsWith('.png'), JSON.stringify(dims(stitched)))
  r = await go('stitch too tall', { tool: 'stitch', files: Array(13).fill(P('shot1.png')), opts: {} })
  check('stitch cap friendly error', !r.ok && /30,000px/.test(r.message))

  // gif
  const vids = ['clip.mp4', 'clip.webm', 'hevc.mov'].map(P).filter((p) => fs.existsSync(p))
  r = await go('gif 5s 480', { tool: 'gif', files: vids, opts: { len: '5', size: '480' } })
  for (const o of r.outputs) console.log(`   gif ${path.basename(o)} dims=${JSON.stringify(dims(o))} frames=${gifFrames(o)}`)
  check('gif from mp4 & webm', r.outputs.length >= 2 && r.outputs.every((o) => dims(o)?.[0] === 480 && gifFrames(o) >= 30))
  console.log('   progress samples:', r.prog.slice(0, 4).join(' '), '…', r.prog.slice(-2).join(' '))
  const gif1 = r.outputs[0]
  fs.writeFileSync(P('fake.mp4'), Buffer.alloc(5000, 7))
  r = await go('gif unsupported', { tool: 'gif', files: [P('fake.mp4')], opts: {} })
  check('gif friendly failure', !r.ok && /못 열었어/.test(r.message))

  // zip
  r = await go('zip folder + file', { tool: 'zip', files: [P('폴더'), P('자소서.txt')], opts: {} })
  const list = sh('/usr/local/bin/python3', ['-I', '-c', 'import zipfile,sys\nfor i in zipfile.ZipFile(sys.argv[1]).infolist(): print(hex(i.flag_bits), i.compress_type, i.file_size, i.compress_size, i.filename)', r.outputs[0]])
  console.log(list)
  check('zip: names, no .DS_Store, empty dir, utf8 names', /폴더\/안쪽\/data\.json/.test(list) && !/DS_Store/.test(list) && /폴더\/빈폴더\//.test(list) && /자소서\.txt/.test(list))
  check('zip: integrity (unzip -t)', /No errors detected/.test(sh('/usr/bin/unzip', ['-t', r.outputs[0]])))

  // count
  r = await go('count', { tool: 'count', files: [P('자소서.txt'), P('euckr.txt'), P('photo.jpg')], opts: {} })
  console.log(r.text)
  check('count: euc-kr decoded', /한글|EUC/.test(r.text) && r.text.includes('euckr.txt') && /글자 수 \(공백 포함\) 20자/.test(r.text.split('📄 euckr.txt')[1]))
  r = await go('count utf8 small', { tool: 'count', files: [P('utf8.txt')], opts: {} })
  check('count "가나다 abc\\n" = 8 incl newline? / 6 no-space', /공백 포함\) 8자/.test(r.text) && /공백 제외\) 6자/.test(r.text), r.text.split('\n').slice(1, 3).join(' | '))

  // copypath — 사용자 클립보드를 건드리지 않게 writeText 를 가로챈다 (읽기는 맥 붙여넣기 허용 창이 뜰 수 있어 안 함)
  const realWrite = clipboard.writeText
  let copied = null
  clipboard.writeText = (t) => (copied = t)
  r = await go('copypath', { tool: 'copypath', files: [P('photo.jpg'), P('폴더')], opts: {} })
  clipboard.writeText = realWrite
  check('copypath', copied === `${P('photo.jpg')}\n${P('폴더')}`)

  // rename (복사본으로)
  const RD = path.join(T, 'ren')
  fs.mkdirSync(RD)
  for (const n of ['b.txt', 'a.txt', 'c.txt', 'b_02.txt', 'x_02.txt', 'x_01.txt']) fs.writeFileSync(path.join(RD, n), n)
  fs.utimesSync(path.join(RD, 'c.txt'), new Date('2024-03-05T10:00:00'), new Date('2024-03-05T10:00:00'))
  r = await go('rename seq (collision with b_02.txt)', { tool: 'rename', files: ['b.txt', 'a.txt', 'c.txt'].map((n) => path.join(RD, n)), opts: { how: 'seq' } })
  check('seq names', r.outputs.map((o) => path.basename(o)).join(',') === 'b_01.txt,b_02 (2).txt,b_03.txt' && fs.readFileSync(path.join(RD, 'b_02.txt'), 'utf8') === 'b_02.txt')
  r = await go('rename seq swap', { tool: 'rename', files: ['x_02.txt', 'x_01.txt'].map((n) => path.join(RD, n)), opts: { how: 'seq' } })
  check('swap via temp names', fs.readFileSync(path.join(RD, 'x_01.txt'), 'utf8') === 'x_02.txt' && fs.readFileSync(path.join(RD, 'x_02.txt'), 'utf8') === 'x_01.txt')
  r = await go('rename date', { tool: 'rename', files: [path.join(RD, 'b_03.txt')], opts: { how: 'date' } })
  check('date prefix from mtime', r.outputs[0] && path.basename(r.outputs[0]) === '240305_b_03.txt')
  r = await go('rename date again (skip)', { tool: 'rename', files: r.outputs, opts: { how: 'date' } })
  check('already dated → friendly skip', r.ok && r.outputs.length === 0)
  console.log('   ren dir:', fs.readdirSync(RD).sort().join(', '))

  // 쓰기 안 되는 폴더 → 대신 폴더
  const RO = path.join(T, 'ro')
  fs.mkdirSync(RO)
  fs.mkdirSync(path.join(T, 'fallback'))
  fs.copyFileSync(P('tiny.png'), path.join(RO, 'tiny.png'))
  fs.chmodSync(RO, 0o555)
  r = await go('read-only folder', { tool: 'convert', files: [path.join(RO, 'tiny.png')], opts: { to: 'jpg' } })
  check('fallback dir used', r.outputs[0]?.startsWith(path.join(T, 'fallback')))
  fs.chmodSync(RO, 0o755)

  // trash (임시 폴더에서 만든 것만)
  fs.writeFileSync(path.join(T, 'trashme.txt'), 'bye')
  r = await go('trash', { tool: 'trash', files: [path.join(T, 'trashme.txt'), path.join(T, '없는.txt')], opts: {} })
  check('trash', r.ok && !fs.existsSync(path.join(T, 'trashme.txt')))

  // 작업 창 다시 만들기
  tools.disposeTools()
  r = await go('after dispose → recreate', { tool: 'gray', files: [P('tiny.png')], opts: {} })
  check('worker recreated', r.ok)

  // 원본 그대로인지
  check('originals untouched (size+mtime of every fixture)', snap() === before)

  // 눈으로 볼 것 모으기
  fs.writeFileSync(path.join(T, 'look.json'), JSON.stringify({ rotHalf, rotRight, flipped, grayOut, stitched, gif1, alphaJpg, pdfA4 }, null, 1))
  console.log(`\n== ${pass} PASS / ${fail} FAIL ==`)
  tools.disposeTools()
  app.exit(fail ? 1 : 0)
}

app.dock?.hide()
app.on('window-all-closed', () => {})
app.whenReady().then(() =>
  main().catch((e) => {
    console.error(e)
    app.exit(2)
  })
)
