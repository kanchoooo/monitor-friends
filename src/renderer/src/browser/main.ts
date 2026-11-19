// 인터넷 창 위쪽 막대 (뒤로·앞으로·주소·항상 위·투명도·숨기기)
import './browser.css'
import { accelLabel } from '@shared/accel'

const api = window.browserApi
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const url = $<HTMLInputElement>('url')
const op = $<HTMLInputElement>('op')
let editing = false

if (navigator.userAgent.includes('Mac')) document.body.classList.add('mac')
$('back').onclick = () => api.back()
$('fwd').onclick = () => api.forward()
$('reload').onclick = () => api.reload()
$('home').onclick = () => api.home()
$('hide').onclick = () => api.hide()
url.onfocus = () => {
  editing = true
  url.select()
}
url.onblur = () => (editing = false)
$('f').onsubmit = (e) => {
  e.preventDefault()
  api.go(url.value)
  url.blur()
}
op.oninput = () => api.setOpacity(Number(op.value) / 100)
let onTop = false
$('ontop').onclick = () => api.setOnTop(!onTop)
window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey
  if (mod && (e.key === '=' || e.key === '+')) api.zoom(1)
  else if (mod && e.key === '-') api.zoom(-1)
  else if (mod && e.key === '0') api.zoom(0)
  else if (mod && e.key.toLowerCase() === 'l') url.focus()
})

api.onState((s) => {
  if (!editing) url.value = s.url
  $<HTMLButtonElement>('back').disabled = !s.canBack
  $<HTMLButtonElement>('fwd').disabled = !s.canForward
  $('reload').textContent = s.loading ? '×' : '↻'
  onTop = s.onTop
  $('ontop').classList.toggle('on', s.onTop)
  op.value = String(Math.round(s.opacity * 100))
  $('key').textContent = s.bossKey ? accelLabel(s.bossKey, s.platform) : ''
  document.body.classList.toggle('loading', s.loading)
})
