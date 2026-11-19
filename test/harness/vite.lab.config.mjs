// 그림·도구 확인용 lab 페이지만 따로 빌드 (본체 빌드와 섞이지 않게) → out-lab/
import { resolve } from 'path'
import { defineConfig } from 'vite'

const root = resolve(import.meta.dirname, '../../src/renderer')
export default defineConfig({
  root,
  base: './',
  resolve: { alias: { '@shared': resolve(root, '../shared'), '@': resolve(root, 'src') } },
  worker: { format: 'es' },
  build: { outDir: resolve(import.meta.dirname, '../../out-lab'), emptyOutDir: true, rollupOptions: { input: { lab: resolve(root, 'lab.html') } } },
  logLevel: 'warn'
})
