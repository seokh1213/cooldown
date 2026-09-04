# knowledge/ — 사람이 검증한 지식 계층

LLM 상성 코치가 참고한다. 데이터에서 자동 계산되는 사실(스탯 등급, 계수, 스킬 효과 태그)은
`scripts/llm/lib/facts.ts` 가 만든다. 여기에는 **데이터만으로 알 수 없는 "왜 / 언제"** 만 적는다.

설계 배경과 측정 결과는 `docs/local-llm-advisor.md` 참고.

## 두 종류

| 디렉터리 | 단위 | 쓰는 내용 |
|---|---|---|
| `playbooks/<ChampionId>.json` | 챔피언 하나 | 콤보, 힘의 구간, 스킬 운용, 조건부 룬·아이템·주문, 라인전·한타 원칙 |
| `tips/<ChampionId>.json` | 상성 하나 | 특정 상대 한정 지식. 상성 판정(`verdict`) 포함 |

`ChampionId` 는 DDragon id (`Aatrox`, `Fiora`, `MonkeyKing`).
상성 조합은 수만 가지이므로 **플레이북을 먼저 쓰고, 팁은 자주 나오는 상성에만** 쓴다.

## 플레이북 형식

```json
{
  "champion": "Aatrox",
  "playing": [
    {
      "id": "aatrox-rune-default",
      "category": "rune",
      "text": "핵심 룬은 정복자가 기본이다. … 최후의 일격보다 최후의 저항이 무난하다.",
      "refs": { "runes": ["정복자", "최후의 저항"] },
      "avoid": { "runes": ["최후의 일격"] },
      "source": "OP.GG Talk 아트록스 공략",
      "verifiedPatch": "26.17"
    }
  ],
  "against": []
}
```

| 필드 | 의미 |
|---|---|
| `playing` | 이 챔피언을 플레이할 때의 지식 |
| `against` | 이 챔피언을 **상대할 때**의 지식. 상대편 조언에 자동으로 실린다 |
| `category` | `combo` `phase` `rune` `summoner` `start-item` `first-item` `core-item` `situational-item` `laning` `teamfight` `skill` |
| `text` | 한 문단. **근거를 함께 적는다.** 모델이 이유를 설명할 때 이 표현을 그대로 쓴다 |
| `when` | 적용 조건. 아래 표 참고. 생략하면 항상 적용 |
| `refs` | 본문이 **권장하는** 아이템·룬·소환사 주문 이름 |
| `avoid` | 본문이 비교 대상으로만 언급하거나 **피하라고 한** 이름. 권장안에서 제외된다 |
| `source` | 출처. 커뮤니티 글, 위키, 통계 사이트 등 |
| `verifiedPatch` | 마지막으로 확인한 패치. 현재와 다르면 프롬프트에 "변동 가능" 표기 |

### `when` 조건

상대 챔피언의 사실 카드로 판정한다. 여러 조건은 모두 만족해야 한다.

| 키 | 값 | 예 |
|---|---|---|
| `enemyDamage` | `물리` `마법` `혼합` | 상대 주 피해 유형 |
| `enemyScaling` | `AD` `AP` `혼합` `체력` `없음` | 상대 계수 프로필 |
| `enemyRange` | `근접` `원거리` | "상대가 원거리면 재생의 바람" |
| `enemyHasEffects` | 효과 태그 배열 | `["강제 이동(넉백/끌기)"]` → 뼈 방패 |
| `enemyLacksEffects` | 효과 태그 배열 | 상대에게 그 효과가 없을 때만 |
| `enemyRoles` | ddragon 태그 | `["Marksman"]` |
| `enemyIds` | 챔피언 id 배열 | 특정 상대 한정 |
| `lanes` | `top` `jungle` `mid` `bot` `support` | |

효과 태그 목록은 `npm run llm:build` 출력에서 빈도와 함께 확인할 수 있다.

## 팁 형식

```json
{
  "champion": "Aatrox",
  "tips": [
    {
      "id": "aatrox-vs-fiora-verdict",
      "perspective": "playing",
      "vs": "Fiora",
      "lane": "top",
      "category": "verdict",
      "text": "피오라 쪽이 유리한 구도다. …",
      "refs": { "items": [] },
      "source": "Mobalytics / LoLalytics",
      "verifiedPatch": "26.17"
    }
  ]
}
```

| 필드 | 의미 |
|---|---|
| `perspective` | `playing` = 이 챔피언을 플레이할 때, `against` = 이 챔피언을 상대할 때 |
| `vs` | 특정 상대 한정이면 상대 id. 비우면 일반 팁 |
| `category` | `verdict` `rune` `item` `summoner` `build-order` `laning` `teamfight` `skill` `general` |
| `refs` / `avoid` | 플레이북과 동일 |

`verdict` 는 상성 판정이다. 데이터로 계산할 수 없고 소형 모델이 가장 자주 틀리는 항목이라,
승률 통계나 공략의 판단을 사람이 옮겨 적는다.

## 작성 지침

1. **한 항목 = 한 주장.** 근거를 문장 안에 함께 넣는다.
2. **수치는 쓰지 않는다.** 수치는 사실 카드가 이미 갖고 있고 패치마다 바뀐다.
3. **고유명사는 게임 내 한국어 표기 그대로** 쓰고 `refs` 에 옮겨 적는다.
   colloquial 표기(텔레포트, 닌자의 신발)는 공식 명칭(순간이동, 판금 장화)으로 바꾼다.
4. 근거 없는 메타 주장보다 **스킬 상호작용** 같은 구조적 이유를 우선한다.
5. 상성별로 쓰기 전에 **`when` 조건으로 챔피언 단위로 쓸 수 있는지** 먼저 검토한다.
6. 작성 후 `npm run llm:validate` 를 돌린다. 데이터에 없는 이름, 본문과 어긋난 `refs`,
   존재하지 않는 효과 태그를 잡아 준다.
