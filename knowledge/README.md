# 지식 원본과 작성 지침

LLM 상성 코치가 참고한다. 데이터에서 자동 계산되는 사실(스탯 등급, 계수, 스킬 효과 태그)은
`src/lib/knowledge/facts.ts` 가 만든다. 여기에는 **데이터만으로 알 수 없는 "왜 / 언제"** 만 적는다.

현재 답변 구조와 검증 경계는 [도우미 설계](../docs/advisor-answer-pipeline.md)를 따른다.
Ollama 초기 설계와 당시 측정은 [역사 기록](../docs/local-llm-advisor.md)으로 보존한다.
남은 작업은 [제품 로드맵](../docs/product-roadmap.md)에서 관리한다.

## 지식 자료

| 디렉터리 | 단위 | 쓰는 내용 |
|---|---|---|
| `playbooks/<ChampionId>.json` | 챔피언 하나 | 콤보, 힘의 구간, 스킬 운용, 라인전·한타 원칙, 조건부 아이템 예외 |
| `tips/<ChampionId>.json` | 상성 하나 | 특정 상대 한정 지식. 상성 판정(`verdict`) 포함 |
| `crowd-control.json` | 챔피언·스킬 슬롯 하나 | CC 종류, 대상, 발동 조건, 출처. 현재 패치와 한국어 본문 지문이 같은 경우에만 확인된 판정을 적용 |
| `mechanics-notes.json` | 상호작용 하나 | 강타·부활·정화·수은·강인함·치유 감소 등의 세부 판정. 출처·검토일·질문 조건과 세 언어 본문 포함 |

`ChampionId` 는 DDragon id (`Aatrox`, `Fiora`, `MonkeyKing`).
상성 조합은 수만 가지이므로 **플레이북을 먼저 쓰고, 팁은 자주 나오는 상성에만** 쓴다.

원본 파일은 검토·부분 수정을 위해 챔피언별로 유지한다. 배포할 때는
`npm run llm:bundle`이 `public/data/<patch>/llm/advisor-knowledge.json`으로 필요한 지식을 묶는다.
원본과 배포 번들은 용도가 다르며, 번들이 있다고 원본을 삭제하지 않는다.

### CC와 세부 판정 갱신

`crowd-control.json`은 PC 롤의 스킬 툴팁과 위키를 대조한 자료다. 이동 불가·강제 행동을
하드, 일부 행동 제한을 소프트로 표시한다. 강타 사용 가능 여부는 이 분류와 별개로 판단한다.
자기 둔화·미니언 한정 효과를 적 챔피언 CC와 구분하고, 스택·변신·무기 등의 발동 조건을 남긴다.
훔치거나 반사하는 스킬은 `borrowed`로 표시해 `CC 없음`으로 읽지 않는다.

스킬 본문이나 수치를 다시 만들지 않고 현재 카드에 메타데이터만 붙이려면 다음을 실행한다.

```bash
npx tsx scripts/llm/attach-crowd-control.ts
npm run llm:bundle
```

`npm run llm:build`도 CC를 붙인다. 패치나 한국어 스킬 본문이 달라지면 과거 보정을 적용하지
않고 `inferred`로 표시한다. 새 자료를 대조한 뒤 CC 입력 파일의 패치·본문 지문을 갱신한다.

`mechanics-notes.json`의 `questionGroups`는 각 묶음에서 하나 이상, 모든 묶음에서 일치해야 한다.
예를 들어 `강타/스마/smite`와 `수호천사/가엔/guardian angel`이 함께 나온 질문에 부활 판정을 쓴다.
이 조건을 일반 검색에도 적용해 공통 낱말만으로 무관한 노트가 선택되는 것을 막는다.
숫자가 필요한 예외 판정은 날짜와 원출처를 함께 남긴다. 게임 안에서 재현한 시험과는 구분한다.

이번 자료의 검토 범위와 시험 결과는 [CC·판정 검토 기록](../research/llm-evals/crowd-control/review.md)에 있다.

### 지식 카드가 답하지 않는 것

**무엇을 사는가, 무엇을 찍는가, 어떤 룬을 드는가**는 통계 없이 확정할 수 없어 지식 카드에 적지 않는다.
카드는 **왜 그런가, 언제 예외인가**만 답한다. 스킬 판정, 콤보 순서, 캔슬 타이밍, 힘의 구간,
웨이브 운영, 한타 진입 조건이 여기에 든다.

`start-item` `core-item` `rune` `summoner` 카테고리는 **쓰지 않는다.**
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
| `category` | `combo` `phase` `skill` `laning` `teamfight` `situational-item`. 레거시 카테고리 `rune` `summoner` `start-item` `first-item` `core-item`은 새로 작성하지 않는다 |
| `text` | 한 문단에 근거를 함께 적는다. 도우미가 조건에 맞는 노트를 조립할 때 사용한다 |
| `when` | 적용 조건. 아래 표 참고. 생략하면 항상 적용 |
| `refs` | 본문이 **권장하는** 아이템·룬·소환사 주문 이름 |
| `avoid` | 본문이 비교 대상으로만 언급하거나 **피하라고 한** 이름. 권장안에서 제외된다 |
| `reviewRefs` | 작성 단계에서 대조할 이름. 실행 번들에는 포함하지 않으며 본문의 추천으로 취급하지 않는다 |
| `source` | 출처. 커뮤니티 글, 위키, 통계 사이트 등 |
| `verifiedPatch` | 작성자가 마지막으로 확인한 패치. 번호만 최신으로 바꿔 검토 완료로 취급하지 않는다 |

`generated` 노트도 실제 생성된 최종 본문에서 `refs`·`avoid` 이름과 충돌을 검사한다.
`reviewRefs`는 본문에 없는 검토용 이름을 보존할 때만 사용한다. 데이터에 존재하는 이름인지와
협곡 구매 가능 여부를 검사하며, 본문의 실제 추천을 이 필드로 옮겨 검증을 피하지 않는다.

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
npm run llm:source-pack -- --todo          # 아직 안 쓴 챔피언 목록
```

묶음의 4장에는 **과거 패치 소급 결과**가 실린다. 현재 툴팁이 `?` 로 비어 있는 자리를 과거 패치
본문으로 메운 것, 예전에는 있었고 지금은 사라진 문장, 소급해도 못 채운 자리 세 가지다.
마지막 항목에 걸린 스킬은 본문 서술을 피하고 사실 카드의 계수·쿨타임만 쓴다.
자세한 내용은 `docs/patch-fallback.md` 참고.

소급 조사는 `data/ability-research/<조사 기준 패치>/`에서 읽고 파일 내부 패치도 검사한다.
26.19 폴더에 섞였던 26.18 결과는 원본 그대로 26.18 조사 폴더에 보존했다.
현재 패치의 조사 파일이 없으면 이전 패치 결과를 대신 싣지 않는다. 다시 조사한 결과도 생성일·현재 툴팁을 확인한 뒤 채택한다.
전체 조사의 재실행은 `history/<파일명 stem>/<UTC시간+UUID>.json`에 이전 원문을 보존한다.
`--champ` 결과는 `partial/<챔피언 범위>/`에 따로 저장하며 자료 묶음은 전체 조사 파일만 읽는다.

묶음이 읽어 오는 파일은 아래와 같다. 개별로 볼 일이 있을 때만 직접 연다.

| 파일 | 내용 |
|---|---|
| `public/data/<patch>/llm/champion-wiki-tips.json` | LoL Wiki 의 플레이 팁·상대 팁·스킬 슬롯별 운용 노트 (영문, 스킬 이름은 한국어) |
| `public/data/<patch>/llm/champion-wiki-meta.json` | 하위 클래스(저거너트·스커미셔 …)와 포지션 |
| `public/data/<patch>/llm/champion-riot-meta-ko_KR.json` | 라이엇 피해 유형·특성·플레이스타일 지표 |
| `public/data/<patch>/llm/item-wiki-meta.json` | 아이템 상점 역할군 탭 |
| `data/ability-research/<patch>/ability-fallbacks.json` | 해당 기준 패치의 자리표시자를 과거 본문으로 메운 조사 결과 |
| `data/ability-research/<patch>/ability-lost-descriptions.json` | 해당 기준 패치에서 사라진 문장 (확인 대기) |

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

## 영상 판정 팁

`video-tips.json`은 `tip`·`mechanics`·`interaction` 태그, 대상 스킬, 조건을 포함한 답변, 세 언어, 내부 출처와 주장 ID를 보존한다. 패치가 일치할 때만 번들에 가져오며, 출처는 화면과 복사문에 표시하지 않는다. [영상별 기록과 평가](../research/video-notes/mangdasu-20261006/README.md)에 포함·보류 상태와 질문 세트가 있다.

## 원천 감시와 갱신 대기

`Watch Game Knowledge`는 공식 PC 패치노트의 사이트맵과 목록 페이지를 함께 탐색한다. 정상일 때는 하루 한 번 수집하며, 매시 UTC 37분의 확인에서 같은 UTC 날짜의 완전 수집이 있으면 건너뛴다. 예약 시작이 지연돼도 날짜를 기준으로 일일 수집을 놓치지 않는다. 정적 데이터가 실제 생성된 뒤와 수동 실행에서도 수집한다.

CI의 필수 원천 사전 확인과 지식 원천 감시는 HTTP 429·5xx, 네트워크 연결 오류와 시간 초과를 `deferred`로 기록한다. 장애 시작 시각은 Actions 캐시에 회차별로 저장·복원하고 보고서 artifact에도 보존한다. 대기 중에는 매시간 재시도하며 연속 장애가 **6시간 미만**일 때만 경고로 대기한다. **정확히 6시간부터 실패**한다. 403·404, 잘못된 JSON·본문·스키마와 코드 오류는 바로 실패한다. 완전한 원천 확인만 장애 시각을 해제한다. 캐시는 정적 자료 사전 확인과 지식 감시에서 각각 관리한다.

정적 자료 사전 확인은 최신 DDragon 버전과 그 버전의 CommunityDragon 아이템 계산 원천을 확인한다. 선택 자료인 빌드 표식이 없으면 갱신을 시도하지만, 필수 원천 오류에는 다른 패치를 대신 쓰지 않는다. 대기 회차는 생성·발행·배포를 건너뛴다. 이후 실제 생성·검증 과정의 오류는 계속 실패하며, 코드 push는 저장소의 마지막 검증 자료로 검사·배포한다.

지식 감시의 대기는 성공한 원천과 실패 목록을 함께 보존하는 **불완전 수집**이다. `report.json`의 `complete: false`, `availability`, `firstUnavailableAt`과 원천별 HTTP 상태로 확인한다. 8분의 수집 예산을 소진하면 남은 항목도 미수집 시간 초과로 기록해 CI 강제 종료 전에 상태를 보존한다. 승인된 원천 기준, 게임 패치와 노트의 검수 완료 패치를 바꾸지 않으며, 영향 항목 0개를 전체 변경 없음으로 해석하지 않는다. 로컬 기본 명령은 불완전 수집에 계속 실패하고, CI 정책은 `npm run llm:watch-game-knowledge -- --ci`에서만 적용한다.

품질 평가의 앱 자료 로더와 데이터 지문은 `public/data/version.json`의 현재 패치를 읽는다. 과거 패치 화면의 수치·스킬 검사는 해당 보관 패치를 명시적으로 선택하고, 기본 화면은 현재 발행 패치와 일치하는지 별도로 검사한다. 새 패치의 데이터 해시가 달라지면 기존 패치의 평가 점수와 직접 비교하지 않으며, 같은 새 자료로 맞춘 평가 기준이 필요하다. 이 기준과 노트 검수 패치를 자동 초기화하거나 승인하지 않는다.
