// 내 펫 만들기: ChatGPT 에 붙여 넣을 그림 요청문 + 앱에서 보여 줄 안내
// 포즈 순서는 pet.ts 의 POSES 와 같아야 한다 (가져오기가 이 순서로 칸을 읽는다).
// 강아지·고양이만이 아니라 사람·캐릭터·다리 없는 것(물고기·새·슬라임)·물건까지 — 종류에 맞게 포즈 설명을 바꾼다.

export type PetKind = 'any' | 'animal' | 'character' | 'nolegs' | 'object'
export type PetStyle = 'chibi' | 'keep'

export interface PromptOptions {
  kind: PetKind
  style: PetStyle
  /** 사용자가 적은 특징 (예: "갈색 푸들, 빨간 목도리") */
  note?: string
}

export const PET_KINDS: { id: PetKind; label: string; hint: string }[] = [
  { id: 'any', label: '✨ 첨부한 캐릭터 그대로', hint: '무엇이든 — 첨부한 캐릭터의 생김새·색·옷·특징을 그대로 살려요' },
  { id: 'animal', label: '🐶 동물', hint: '강아지·고양이·토끼·햄스터·새 등 다리가 있는 동물' },
  { id: 'character', label: '🧑 사람·캐릭터', hint: '나·친구·아이돌 팬아트·내가 그린 캐릭터·인형' },
  { id: 'nolegs', label: '🐟 다리 없는 것', hint: '물고기·뱀·문어·슬라임·유령·식물 — 걷기 대신 통통 튀거나 둥둥' },
  { id: 'object', label: '🍙 물건·음식', hint: '머그컵·삼각김밥·과자·로봇 — 작은 팔다리를 달아서' }
]

export const PET_STYLES: { id: PetStyle; label: string }[] = [
  { id: 'chibi', label: '귀여운 2~3등신' },
  { id: 'keep', label: '원래 그림체 그대로' }
]

const SUBJECT_EN: Record<PetKind, string> = {
  any: 'the character in the attached image',
  animal: 'the animal in the attached photo',
  character: 'the person or character in the attached image',
  nolegs: 'the creature or thing in the attached image (it has no legs)',
  object: 'the object or food in the attached image, turned into a living mascot'
}
const SUBJECT_KO: Record<PetKind, string> = {
  any: '첨부한 이미지 속 캐릭터를',
  animal: '첨부한 사진 속 동물을',
  character: '첨부한 그림·사진 속 사람(또는 캐릭터)을',
  nolegs: '첨부한 그림 속 생물(또는 물건, 다리 없음)을',
  object: '첨부한 사진 속 물건(또는 음식)을 살아 움직이는 마스코트로 바꿔서'
}

/** 종류마다 다른 포즈 설명 (12칸 순서는 같음) */
function poses(kind: PetKind, ko: boolean): string[] {
  const legs = kind !== 'nolegs'
  const hand = kind === 'animal' ? (ko ? '앞발' : 'paw') : ko ? '손' : 'hand'
  if (ko)
    return [
      '정면으로 서 있기 (기본 자세)',
      '1번과 똑같은데 눈만 감음 (눈 깜빡임)',
      legs ? '오른쪽을 보고 걷기 — 왼발이 앞' : '오른쪽으로 이동하기 1 — 통통 튀어 오른 순간 (또는 헤엄·둥둥)',
      legs ? '오른쪽을 보고 걷기 — 오른발이 앞 (3번과 다리가 반대)' : '오른쪽으로 이동하기 2 — 몸이 납작하게 내려앉은 순간',
      '깜짝 놀람 — 눈 동그랗게, 몸을 쭉 펴고, 땀방울',
      legs ? '앉아 있기' : '바닥에 편하게 내려앉아 쉬기',
      '웅크리고 잠자기 (눈 감음, zzz 글자는 넣지 않기)',
      '신남 — 두 팔(또는 지느러미·몸) 번쩍, 눈웃음, 살짝 점프',
      '작은 노트북으로 타자 치기',
      '뭔가를 냠냠 먹기 (볼 빵빵)',
      `삐짐·화남 — 볼 부풀리기${legs ? ', 팔짱' : ''}`,
      `한 ${hand} 흔들며 인사${legs ? '' : ' (팔이 없으면 몸을 기울이며 윙크)'}`
    ]
  return [
    'Standing, facing the viewer (default pose)',
    'Exactly like pose 1 but with eyes closed (blink)',
    legs ? 'Walking, facing RIGHT — left foot forward' : 'Moving to the RIGHT, frame 1 — mid-hop in the air (or swimming / floating)',
    legs ? 'Walking, facing RIGHT — right foot forward (legs opposite to pose 3)' : 'Moving to the RIGHT, frame 2 — squished down on landing',
    'Surprised — wide round eyes, body stretched out, sweat drops',
    legs ? 'Sitting' : 'Resting, settled down on the ground',
    'Curled up sleeping, eyes closed (do not draw "zzz" letters)',
    'Very happy — arms (or fins / body) up, smiling closed eyes, small jump',
    'Typing on a tiny laptop',
    'Eating something, cheeks puffed',
    `Sulking / angry — puffed cheeks${legs ? ', arms crossed' : ''}`,
    `Waving hello with one ${hand}${legs ? '' : ' (if it has no arms, tilt the body and wink)'}`
  ]
}

export function buildPetPrompt(o: PromptOptions, lang: 'ko' | 'en'): string {
  const note = (o.note ?? '').trim().slice(0, 200)
  const ko = lang === 'ko'
  const ps = poses(o.kind, ko)
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n')
  if (ko) {
    const style =
      o.style === 'keep'
        ? '- 원본 그림체·옷·머리 모양·색을 최대한 그대로 살려 주세요. 다만 몸 전체가 보이는 작은 데스크톱 마스코트 비율로.'
        : '- 머리가 크고 몸이 작은 2~3등신 치비 스타일, 동글동글하고 귀엽게.\n- 원본의 색·무늬·특징(귀 모양, 얼룩, 옷, 머리 모양 등)은 그대로 살려 주세요.'
    return `${SUBJECT_KO[o.kind]} 데스크톱 펫으로 만들어서, 스프라이트 시트 한 장으로 그려 주세요. 첨부한 캐릭터와 똑같은 캐릭터여야 해요 — 얼굴·색·무늬·옷·머리 모양·소품 같은 특징을 바꾸지 말고 그대로 살려 주세요.${note ? `\n특징: ${note}` : ''}

[전체 형식]
- 가로로 긴 1536×1024 그림 한 장.
- 가로 4칸 × 세로 3줄 = 12칸. 칸마다 같은 캐릭터를 한 번씩, 아래 순서대로 (왼쪽 위에서 오른쪽으로, 다음 줄로).
- 12칸 모두 똑같은 캐릭터: 같은 얼굴, 같은 색·무늬, 같은 몸 비율.
- 모든 칸에서 크기와 카메라 거리가 같게. 머리부터 발끝(몸 끝)까지 전체가 다 보이게.
- 포즈 사이를 넉넉히 띄워 주세요. 서로 겹치거나 칸 경계를 넘는 부분이 없게.
- 배경은 무늬 없는 단색 자홍색(#FF00FF)으로 가득. (또는 투명 배경)
- 글자·숫자·이름표·칸 테두리·그림자·바닥선은 넣지 마세요.

[그림체]
${style}
${o.style === 'keep' ? '- 선·채색 방식도 원본 그대로. 작은 크기에서도 형태가 잘 보이게만 해 주세요.' : '- 깔끔하고 진한 외곽선, 작은 크기에서도 잘 보이게.'}

[12칸 포즈 순서]
${ps}

3·4번은 반드시 오른쪽을 향하게 그려 주세요.`
  }
  const style =
    o.style === 'keep'
      ? '- Keep the original art style, outfit, hairstyle and colors as faithfully as possible, just in a small full-body desktop-mascot proportion.'
      : '- Cute chibi desktop mascot: big round head, small chubby body.\n- Keep the colors, markings and features from the image (ear shape, spots, outfit, hairstyle…).'
  return `Turn ${SUBJECT_EN[o.kind]} into a desktop pet and draw it as ONE sprite sheet image. It must be the SAME character as in the attached image — keep its face, colors, markings, outfit, hairstyle and accessories exactly; do not redesign it.${note ? `\nDetails: ${note}` : ''}

LAYOUT
- One landscape image, 1536×1024.
- A grid of 4 columns × 3 rows = 12 cells. Each cell shows the same character once, in the order below (left to right, then next row).
- The exact same character in all 12 cells: same face, same colors and markings, same body proportions.
- Same size and same camera distance in every cell. Whole body visible.
- Leave generous empty space between poses. Nothing overlaps and nothing crosses into another cell.
- Background: plain solid magenta #FF00FF filling the whole image (or a transparent background).
- No text, no numbers, no labels, no grid lines, no shadows, no ground line.

STYLE
${style}
${o.style === 'keep' ? "- Keep the original line and coloring style too; just make sure the shape reads at small size." : '- Clean dark outline, readable at small size.'}

THE 12 POSES, IN ORDER
${ps}

Poses 3 and 4 must face RIGHT.`
}

export const PET_PROMPT_KO = buildPetPrompt({ kind: 'any', style: 'keep' }, 'ko')
export const PET_PROMPT_EN = buildPetPrompt({ kind: 'any', style: 'keep' }, 'en')

export const PET_GUIDE_STEPS: { title: string; body: string }[] = [
  {
    title: '사진과 요청문 준비',
    body: '무엇으로 만들지(동물·사람·캐릭터·다리 없는 것·물건)와 그림체를 고르면 요청문이 맞춰져요. ChatGPT 를 열고 사진이나 그림을 첨부한 뒤 요청문을 붙여 넣어요. 영어 요청문이 더 잘 맞을 때가 많아요.'
  },
  {
    title: '그림 받기',
    body: '12가지 포즈가 4칸 × 3줄로 그려진 그림이 나오면 PNG 로 내려받아요. 배경은 자홍색(분홍보라) 단색이거나 투명하면 가장 깔끔해요.'
  },
  {
    title: '앱에 끌어다 놓기',
    body: '내려받은 그림을 이 창에 끌어다 놓으면 배경을 지우고 포즈 12개를 알아서 잘라 맞춰요.'
  },
  {
    title: '미리 보기 확인',
    body: '칸마다 포즈가 순서대로 들어갔는지 봐요. 순서가 틀리거나 빠진 포즈가 있으면 "포즈 순서를 지켜서, 서로 더 띄워서 다시 그려 줘" 라고 부탁해 다시 받아요.'
  },
  {
    title: '다듬기',
    body: '걷는 방향이 반대면 "걷기 뒤집기"를 켜요. 테두리에 배경색이 남으면 "배경 지우기" 막대를 오른쪽으로, 몸 일부가 지워지면 왼쪽으로 옮겨요.'
  }
]
