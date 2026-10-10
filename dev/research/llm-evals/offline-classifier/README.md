# 오프라인 판정기 — 모델 없는 기기의 판정 헤드 대용 (2026-09-30)

0.8B 모델을 받지 않은 기기는 한국어 낱말 목록(`askWords.ts`, `spellFocus.ts`, `conversation.ts` actFromWords …)으로
갈랐다. 대화 270턴에서 낱말 규칙 114, 판정기(kev 헤드) 240 이었다. 여기서는 판정 헤드의 학습 자료로 글자 n-gram
로지스틱 회귀를 학습해 같은 판정기 꼴(`PlanDeps.judge`)로 끼운다. 모델·서버·워커 없이 0.8MB 파일 둘과 순수 TS 로 돈다.

- 학습: `dev/scripts/advisor/offline-classifier/train.py` (uv, numpy + scikit-learn)
- 추론: `src/features/advisor/model/offlineJudge.ts` — `offlineJudge(read)` 가 `Judge` 를 돌려준다. `read(path)` 는 `models/offline/judge.json|bin` 을
  받아 바이트를 준다(브라우저 `fetch(BASE_URL + path).arrayBuffer()`, Node `fs.readFile`). 헤드 이름은 무시한다.
- 파일: `public/models/offline/judge.json` (2.3KB) + `judge.bin` (832KB, fp16). 세 언어 갈래·주제·흐름·내 챔피언 네 헤드
- 시험: `dev/tests/unit/offline-judge.test.ts` — 파이썬과 TS 가 같은 해시(FNV-1a 32)·버킷·확률을 내는지(`dev/tests/fixtures/offline-judge.json`)
- 재기: `JUDGE=offline npx tsx dev/scripts/advisor/kev-agent/eval-{a,b3,lookup}.ts`, `npx tsx dev/scripts/advisor/offline-classifier/bench.ts`
- 앱: `PlanContext.judge`(`JudgeTier` = model · offline · none)가 판정기 단계다. `useAskAdvisor` 가 모델을 받아 동의한 기기는 모델
  판정기(거절하면 오프라인), 그 밖은 오프라인 판정기를 `PlanDeps.judge` 에 끼운다. 오프라인 파일은 판정 헤드와 같은 캐시(`fetchJudgeFile`)에
  둔다. 낱말 규칙은 판정이 거절될 때(파일도 못 받음)의 마지막 길로만 남는다. 측정 스크립트의 `--no-model` 은 그 낱말 규칙 기준선이다.

## 결과 (낱말 규칙 / 오프라인 판정기 / 모델 판정기)

| 시험 | 낱말 규칙(모델 없음) | 오프라인 판정기 | 모델 판정기(kev-b3e) |
|---|---|---|---|
| 대화 270턴 전체 | 114 | **221** | 240 |
| ㄴ T1(첫 질문) 98 | 43 | 84 | 97 |
| ㄴ F(이름 없는 이어 묻기) 112 | 41 | 95 | 104 |
| ㄴ R(새 질문) 36 | 25 | 24 | 24 |
| ㄴ P(새 이름 하나) 24 | 5 | 18 | 15 |
| route-large3 374(앱이 읽은 갈래·내 챔피언) | — | 318 (챔피언 4갈래 277/299, 그 밖 41/75) | 338 |
| route-large3 374(답 꼴로, `route3-shape.ts`) | 253 | 297 | — |
| act 60(판정기만) | — | 39 | 55 |
| 흐름 60(앱) | 57 | 58 | 59 |
| lookup 39 흐름(앱) | 32 | 32 | 27 |
| lookup 39 흐름(앱, 헤드 분리·lookup 칸 뒤 다시 잼) | 34 | 35 | — |
| 주제 72(손으로 쓴 것, 판정기만) | 낱말 25 | 64 | 64 |

언어별(대화 270턴, 오프라인): T1 ko 29/32 · en 29/33 · zh 26/33, F ko 33/36 · en 34/38 · zh 28/38.
route-large3 분류기만(앱 보정 없이): 329/374 (ko 112/124, en 106/125, zh 111/125).

- 크기: json 2,257B + bin 851,968B = 0.83MB (버킷 2^14 × (9+8+7+2)칸 × fp16). 2^15 로 늘려도 개발·시험 점수가 같았다(1.6MB).
- 속도: 판정 한 번(특징 뽑기 + 내적) 0.07ms(M 시리즈, Node). 파일 읽고 fp16 풀기 7ms.
- 모델 판정기 기준 값은 `dev/research/llm-evals/kev-agent/a-results-app.json` 과 앞선 기록(route3 338, act 55, 흐름 59, lookup 27).
- 앱에 끼운 뒤(판정마다 헤드 분리 + 흐름 lookup 칸이 든 갈래 위에서, 2026-09-30) 서버 없이 다시 잼: 대화 270턴 114 → 221, route3 318,
  흐름 60 은 57 → 58, lookup 39 흐름은 34 → 35(그 갈래에서 낱말 규칙 기준선이 32 → 34). 흐름 판정기만의 act 는 일곱 칸 질문으로 38/60.

### 틀리는 자리

- **내 챔피언 고르기**(mine 헤드, 후보마다 ★ 표시해 yes 확률): 서로 다른 문항이 122개뿐이라 대화 270턴에서 시점 뒤집힘 13턴
  (T1)이 남는다. 중국어 "我这把维克托", "我玩的辛德拉", "我操控的是蝎子" 와 한국어 별칭("말파인데" — 이름 목록의 정식 이름과 달라
  ★ 를 못 찍는다)이 대부분이다. F 턴 13개가 그 T1 을 따라 틀린다.
- **흐름(act)**: more(왜?·풀어서) 1/6, mine 1/6, flip 2/6 — 판정기만의 정확도는 39/60 으로 모델(55)에 한참 못 미친다. 앱에서는
  문형(`actFromWords`, `sideOfNewName`)이 먼저라 흐름 58/60 이 나오지만, 문형이 못 잡는 영어·중국어 "would wukong do better",
  "what's the plan for the darius player" 는 그대로 틀린다.
- **갈래 그 밖 5칸**(item·rune·spell·game·chat): 41/75. item→guide 7, spell→guide 6, rune→guide 5 — 아이템·룬·주문 이름을 모른다
  (분류기는 글자 n-gram 뿐이다). 앱에서는 아이템·룬 자료가 이름으로 먼저 받으므로 답 꼴은 낱말 규칙과 같은 61/75 다.
- **주제**: 손 시험 72 에서 64. 틀린 8 은 `general`(두루 묻는 말)과 한 갈래 사이. `TOPIC_MIN_CONFIDENCE` 0.6 은 모델 판정기에
  맞춘 값이라 이 분류기의 확률과는 다르게 논다(C=8 이라 확신이 높다).

### 학습 자료와 방법

- 자료: kev 헤드 자료(`head_train`·`head_train_rest`·`head_dev`·`act_contrast`·`kind_lookup`·`lookup_dev`·`topic-train`, `dev/data/` 에 복사,
  저장소에 넣지 않음). 시험 문항과 같은 글(597개: route-large3·act-test·lookup-test·a-set·topicCases)은 학습에서 뺐다 —
  lookup-test 8, act-test 5 문항이 자료에 섞여 있었다.
- 이름을 자리표(◇)로 바꾼 글이 같으면 한 예로 친다. 같은 글이 상성 쌍만 바꿔 되풀이돼 있어(act 는 서로 다른 글이 300여 개)
  파일 단위 개발 세트는 점수가 부풀었다(act 59% → 글 단위 78%). 개발은 글 해시 15%.
- 과제 사이에 예를 빌린다(`borrowed`): 흐름의 이어 묻기 → 갈래 guide, 갈래 공략(이름 하나) → 흐름 enemy, 주제 문항 → 갈래
  matchup/guide. 그리고 이름을 뗀 꼴(`strip_names`: "그레이브즈로 언제 진입해" → "언제 진입해")을 갈래 guide·흐름 followup 으로 넣는다.
  이것이 가장 컸다 — 이름 없는 이어 묻기를 갈래 판정기가 잡담(chat)으로 갈라 앞 상성에서 떼어 내던 30턴이 돌아왔다
  (대화 270턴 175 → 180 → 221, 마지막 단계에 mine 헤드도 함께).
- 특징: 코드 포인트 1~3-gram + 낱말 + 깃발(이름 수, 문자 체계), FNV-1a 32 → 2^14 버킷, 1/sqrt(n) 정규화. 다항 LR, class_weight
  balanced, C 는 개발로 고름(kind 16, topic 8, act 8, mine 16).

### 판단

낱말 규칙 대신 쓸 만하다. 대화 270턴 114 → 221 로 모델 판정기(240)의 92% 에 닿고, 흐름·lookup 흐름은 낱말 규칙보다 나쁘지
않다(58/60, 32/39). 비용은 0.83MB 정적 파일과 순수 TS 몇십 줄, 판정 0.1ms 미만이라 모델 동의 전·저사양 기기에서 바로 돌릴 수 있다.

다만 세 가지를 알고 넣어야 한다. (1) 내 챔피언 고르기가 약해 시점이 뒤집히는 T1 이 13/98 남는다 — 문형 규칙(`matchupSidesByPhrase`)이
먼저이므로 규칙이 잡는 만큼만 좋아지고, 중국어 "我玩的X" 꼴은 규칙에 더하는 편이 빠르다. (2) 흐름 판정기만의 정확도(39/60)는
낮아 문형 규칙 뒤에 두는 지금 순서를 지켜야 한다(판정기의 new 를 믿지 않는 것도 그대로). (3) 갈래의 그 밖 5칸은 이름 자료가
받쳐 줘야 한다. 모델 판정기를 받은 기기에서는 여전히 모델 판정기가 낫다(240 vs 221, route3 338 vs 318).
