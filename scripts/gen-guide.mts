// docs/펫만들기_가이드.md 를 petPrompt.ts 에서 만든다 (요청문을 한 곳에서만 고치게)
import { writeFileSync } from 'node:fs'
import { PET_GUIDE_STEPS, PET_PROMPT_EN, PET_PROMPT_KO } from '../src/shared/petPrompt.ts'
const md = `# 🐾 나만의 모니터 프렌즈 만들기 (ChatGPT 이미지 생성)

> 이 문서는 \`npm run guide\` 로 \`src/shared/petPrompt.ts\` 에서 만들어요. 요청문을 고칠 때는 그 파일을 고치세요.

![예시 시트](img/example-sheet.png)

## 순서

${PET_GUIDE_STEPS.map((s, i) => `${i + 1}. **${s.title}** — ${s.body}`).join('\n')}

## 요청문 (영어 · 추천)

\`\`\`text
${PET_PROMPT_EN}
\`\`\`

## 요청문 (한국어)

\`\`\`text
${PET_PROMPT_KO}
\`\`\`

## 잘 안 될 때

- **포즈가 12개가 아니거나 순서가 다름** → "포즈 순서를 지켜서, 서로 더 띄워서 다시 그려 줘"
- **포즈끼리 붙어 있음** → "칸마다 여백을 넉넉히, 칸 경계를 넘지 않게"
- **크기가 칸마다 다름** → "모든 칸에서 같은 크기·같은 카메라 거리로"
- **배경이 얼룩덜룩** → "배경은 무늬 없는 단색 #FF00FF 로 꽉 채워 줘"
- **걷는 방향이 왼쪽** → 앱의 "걷기 뒤집기" 를 켜면 돼요
- **흰 강아지·고양이** → 흰 배경은 몸까지 지워질 수 있어요. 자홍(#FF00FF) 배경이나 투명 배경으로 받으세요

## 앱이 그림을 처리하는 법

1. 배경 지우기: 투명 PNG 면 그대로, 아니면 가장자리 색을 배경으로 보고 바깥에서부터 지워요 (\`src/renderer/src/common/sheet.ts\`)
2. 포즈 나누기: 빈 가로줄로 3줄, 빈 세로줄로 4칸을 찾아요. 안 되면 4×3 칸으로 고르게 잘라요
3. 크기 맞추기: '서기' 포즈 키를 기준으로 모든 포즈를 같은 배율로 줄이고, 발바닥을 같은 높이에 맞춰요
4. 결과는 1024×768 투명 PNG (4×3, 칸 256) 로 저장돼요. 이 파일(\`.프렌즈.png\`)을 친구에게 보내면 친구도 그대로 가져올 수 있어요
`
writeFileSync(new URL('../docs/펫만들기_가이드.md', import.meta.url), md)
console.log('ok')
