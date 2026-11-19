// 그림·도구 확인용 페이지 (앱에는 안 들어감). lab.html#<이름> → pages/<이름>.ts 의 default 함수를 실행
const pages = import.meta.glob<{ default: (root: HTMLElement) => void | Promise<void> }>('./pages/*.ts')
const name = location.hash.slice(1) || 'index'
const root = document.getElementById('app')!
const load = pages[`./pages/${name}.ts`]
if (!load) {
  root.textContent = `없는 페이지: ${name} (있는 것: ${Object.keys(pages).join(', ')})`
} else {
  void load()
    .then((m) => m.default(root))
    .catch((err) => console.error(err))
}
