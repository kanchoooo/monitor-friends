// 파일 도우미 시험: node test/tools/run.mjs
// 작업 창(tools.html)·preload·메인 도구 코드를 임시 폴더에 따로 빌드하고, Electron 으로 harness.cjs 를 띄워 모든 도구를 돌려 본다
// (본체 electron-vite 빌드와 안 섞이게 — 결과·견본 파일은 전부 /private/tmp/claude-501/mypet-tools-test/)
import { build as viteBuild } from 'vite'
import { build as esbuild } from 'esbuild'
import { spawnSync } from 'child_process'
import { mkdirSync, rmSync } from 'fs'
import { resolve } from 'path'

const repo = resolve(import.meta.dirname, '../..')
const T = process.env.MYPET_TEST_DIR || '/private/tmp/claude-501/mypet-tools-test'
rmSync(T, { recursive: true, force: true })
mkdirSync(T, { recursive: true })
const shared = resolve(repo, 'src/shared')

await viteBuild({
  configFile: false,
  root: resolve(repo, 'src/renderer'),
  base: './',
  resolve: { alias: { '@shared': shared, '@': resolve(repo, 'src/renderer/src') } },
  worker: { format: 'es' },
  build: { outDir: `${T}/build`, emptyOutDir: true, rollupOptions: { input: { tools: resolve(repo, 'src/renderer/tools.html') } } },
  logLevel: 'warn'
})

const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], alias: { '@shared': shared }, logLevel: 'warning' }
await esbuild({ ...common, entryPoints: [resolve(repo, 'src/main/tools/index.ts')], outfile: `${T}/bundle/tools-main.cjs` })
await esbuild({ ...common, entryPoints: [resolve(repo, 'src/preload/tools.ts')], outfile: `${T}/bundle/tools-preload.cjs` })

const electron = resolve(repo, 'node_modules/.bin/electron')
const r = spawnSync(electron, [resolve(import.meta.dirname, 'harness.cjs')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MYPET_TEST_DIR: T,
    MYPET_TOOLS_HTML: `${T}/build/tools.html`,
    MYPET_TOOLS_PRELOAD: `${T}/bundle/tools-preload.cjs`,
    MYPET_TOOLS_FALLBACK_DIR: `${T}/fallback`,
    ELECTRON_RENDERER_URL: ''
  }
})
process.exit(r.status ?? 1)
