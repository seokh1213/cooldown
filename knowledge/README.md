# knowledge/ — 사람이 검증한 지식 계층

LLM 상성 코치가 참고한다. 데이터에서 자동 계산되는 사실(스탯 등급, 계수, 스킬 효과 태그)은
`scripts/llm/lib/facts.ts` 가 만든다. 여기에는 **데이터만으로 알 수 없는 "왜 / 언제"** 만 적는다.

설계 배경과 측정 결과는 `docs/local-llm-advisor.md` 참고.

## 두 종류

| 디렉터리 | 단위 | 쓰는 내용 |
|---|---|---|
| `playbooks/<ChampionId>.json` | 챔피언 하나 | 콤보, 힘의 구간, 스킬 운용, 라인전·한타 원칙, 조건부 아이템 예외 |
| `tips/<ChampionId>.json` | 상성 하나 | 특정 상대 한정 지식. 상성 판정(`verdict`) 포함 |

`ChampionId` 는 DDragon id (`Aatrox`, `Fiora`, `MonkeyKing`).
상성 조합은 수만 가지이므로 **플레이북을 먼저 쓰고, 팁은 자주 나오는 상성에만** 쓴다.

### 통계 오라클과의 분업

`npm run oracle:build` 가 만든 lol.ps 통계(`public/data/<patch>/oracle/`)가
**시작·코어 아이템, 신발, 룬 페이지, 파편, 소환사 주문, 선마 순서**를 채운다.
그래서 지식 카드에는 통계가 답하지 못하는 것만 적는다.

| 통계가 답한다 | 지식 카드가 답한다 |
|---|---|
| 무엇을 사는가, 무엇을 찍는가 | 왜 그런가, 언제 예외인가 |
| 어떤 룬을 드는가 | 스킬 판정, 콤보 순서, 캔슬 타이밍 |
| 14분 지표와 라인 내 순위 | 힘의 구간, 웨이브 운영, 한타 진입 조건 |

`start-item` `core-item` `rune` `summoner` 카테고리는 **더 이상 쓰지 않는다.**
"상대가 회복형이면 처형인의 대검" 처럼 조건이 붙는 예외만 `situational-item` 으로 쓴다.
전체 173종의 플레이북이 이 규칙으로 작성되어 있다.

## 플레이북 형식

```json
{
  "champion": "Aatrox",
  "playing": [
    {
      "id": "aatrox-combo-w",
      "category": "combo",
      "text": "W 연계는 Q 1타 → W → 끌려오기 전에 Q 2타 → 끌려온 직후 Q 3타 순서다. …",
      "source": "스킬 툴팁 판정",
      "verifiedPatch": "26.17"
    },
    {
      "id": "aatrox-item-antiheal",
      "category": "situational-item",
      "text": "상대에게 회복 수단이 있으면 코어 사이에 처형인의 대검을 끼운다. …",
      "when": { "enemyHasEffects": ["회복"] },
      "refs": { "items": ["처형인의 대검"] },
      "source": "아이템 효과",
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
| `category` | `combo` `phase` `skill` `laning` `teamfight` `situational-item` (레거시: `rune` `summoner` `start-item` `first-item` `core-item` — 통계가 대신하므로 새로 쓰지 않는다) |
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

## 원자료

새 카드는 **자료 묶음 한 번으로 끝낸다.** 챔피언 하나에 필요한 사실 카드, 분류, 통계,
위키 팁, 작성 지침이 한 번에 나온다. 웹을 다시 뒤질 필요가 없다.

```bash
npm run llm:source-pack -- --champ Nasus
npm run llm:source-pack -- --champ 아이번 --lane jungle
npm run llm:source-pack -- --todo          # 아직 안 쓴 챔피언 (표본 많은 순)
```

묶음의 5장에는 **과거 패치 소급 결과**가 실린다. 현재 툴팁이 `?` 로 비어 있는 자리를 과거 패치
본문으로 메운 것, 예전에는 있었고 지금은 사라진 문장, 소급해도 못 채운 자리 세 가지다.
마지막 항목에 걸린 스킬은 본문 서술을 피하고 사실 카드의 계수·쿨타임만 쓴다.
자세한 내용은 `docs/patch-fallback.md` 참고.

묶음이 읽어 오는 파일은 아래와 같다. 개별로 볼 일이 있을 때만 직접 연다.

| 파일 | 내용 |
|---|---|
| `public/data/<patch>/llm/champion-wiki-tips.json` | LoL Wiki 의 플레이 팁·상대 팁·스킬 슬롯별 운용 노트 (영문, 스킬 이름은 한국어) |
| `public/data/<patch>/llm/champion-wiki-meta.json` | 하위 클래스(저거너트·스커미셔 …)와 포지션 |
| `public/data/<patch>/llm/champion-riot-meta-ko_KR.json` | 라이엇 피해 유형·특성·플레이스타일 지표 |
| `public/data/<patch>/llm/item-wiki-meta.json` | 아이템 상점 역할군 탭 |
| `public/data/<patch>/llm/ability-fallbacks.json` | 자리표시자를 과거 패치 본문으로 메운 결과 |
| `public/data/<patch>/llm/ability-lost-descriptions.json` | 예전에는 있었고 지금은 없는 문장 (확인 대기) |

위키 팁은 최신 패치 기준이 아닐 수 있다. 구조적 상호작용(스킬 판정, 콤보 순서)은 신뢰도가 높지만
아이템·룬 이름은 반드시 현재 데이터로 검증한다.

## 작성 지침

0. **`npm run llm:source-pack -- --champ <챔피언>` 을 먼저 돌린다.** 필요한 자료가 전부 나온다.
1. **한 항목 = 한 주장.** 근거를 문장 안에 함께 넣는다.
2. **수치는 쓰지 않는다.** 수치는 사실 카드가 이미 갖고 있고 패치마다 바뀐다.
3. **고유명사는 게임 내 한국어 표기 그대로** 쓰고 `refs` 에 옮겨 적는다.
   colloquial 표기(텔레포트, 닌자의 신발)는 공식 명칭(순간이동, 판금 장화)으로 바꾼다.
4. 근거 없는 메타 주장보다 **스킬 상호작용** 같은 구조적 이유를 우선한다.
5. 상성별로 쓰기 전에 **`when` 조건으로 챔피언 단위로 쓸 수 있는지** 먼저 검토한다.
6. 작성 후 `npm run llm:validate` 를 돌린다. 데이터에 없는 이름, 본문과 어긋난 `refs`,
   존재하지 않는 효과 태그를 잡아 준다.
