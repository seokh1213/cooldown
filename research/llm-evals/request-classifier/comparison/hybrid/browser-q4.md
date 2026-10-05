# 낮은 확신 요청을 실제 앱 0.8B로 보완

운영 후보는 한 경로다. 기존 요청 판정기를 먼저 쓰고, 기각된 요청만 이미 적재한 0.8B로 판정한다. 전체 요청의 두 판정을 다시 비교하는 정책은 대화 14/33으로 나빠져 적용하지 않는다.

## 최종 처리

1. 현재 문자 로지스틱의 최고 점수가 0.6 이상이고 1·2위 차이가 0.2 이상이면 그대로 사용한다.
2. 기각됐고 사용자 동의·WebGPU 사용·모델 적재가 완료됐으면 같은 Qwen3.5 0.8B Q4 워커를 한 번 부른다. 다른 모델을 다운로드하지 않는다.
3. 한국어·영어·중국어 학습 예시 각 15개와 11범위 설명으로 `scope`, `slots`, `breadth`를 JSON으로 생성한다.
4. JSON 형식·범위·슬롯·폭의 일관성을 검사한다. 예를 들어 전체 스킬 `skills`와 단일 스킬 `specific`, 또는 `skills`와 슬롯 하나는 동시에 승인하지 않는다. 잘못된 결과는 기존 계획기로 돌려보낸다.
5. 모델 부재·미동의·사용 불가·생성 실패·30초 시간 초과에도 기존 계획기를 사용한다. 시간 초과 뒤에는 모델을 다시 적재하기 전까지 요청 생성 보완을 반복하지 않는다.

운영 프롬프트는 `src/lib/advisor/requestScopePrompt.json` 하나다. 해석·검증은 `requestScopeModel.ts` 하나이며 브라우저 평가도 이를 직접 사용한다. 단어에 맞춰 범위를 바꾸는 한국어 정규식은 추가하지 않았다. 실험 프롬프트는 `archive-browser-pack*.json`으로 보존하고 실행 코드의 변형 분기는 제거했다.

슬롯 필드는 일관성 검사에만 사용한다. 모델이 콤보 질문에서 원문에 없는 Q/E/R을 넣는 사례가 있으므로 스킬 대상이나 대화 기억에 쓰지 않는다. 대상·슬롯·기억은 기존 코드가 유지한다. `confidence: 0`은 LLM의 확률이 없다는 표시이며 계획기의 판정 기준이 아니다.

## 같은 대화 33턴 비교

앱의 계획·답변·기억 코드를 Node에서 실행하고 매 턴을 저장·복원했다. Q4 출력은 Chrome의 실제 앱 워커에서 얻어 주입했다.

| 방식 | 처리 조건 충족 / 33 | 생성 호출 |
| --- | ---: | ---: |
| 현재 앱 경로 | 27 | 0 |
| 이전 Ollama Q8 혼합 | 28 | 6 |
| Q4의 같은 단일 필드 프롬프트 | 28 | 6 |
| Q4의 예시 보강 | 30 | 6 |
| 최종 Q4 구조 검사 | 31 | 6 |

최종 경로는 한국어·영어·중국어의 짧은 딜교 질문 3턴과 중국어의 기본 정보·스킬 동시 요청 1턴을 고쳤다. 기존에 맞던 답을 깨뜨린 턴은 0개였다. 영어 R 요청에서 모델은 여전히 `skills + [R] + specific`을 내지만, 이 모순을 기각해 기존의 R 답변을 보존한다.

남은 2턴은 높은 점수의 기존 판정 오류다. 한국어 “기본 능력치는 알았으니 … 스킬 구성 전체”는 0.6214495·차이 0.433692로 `statsAll`, 영어 기본 프로필·스킬 동시 요청은 0.6699724·차이 0.464983으로 `skills`를 승인하므로 생성 보완을 타지 않는다. 점수는 실사용 정답 확률로 보정된 수치가 아니다.

`flows-browser-structured.json`에 답변과 판정, `browser-q4-structured-flow.json`에 실제 생성 출력을 보존했다. 이 비교는 전체 게임 사실 정확도나 사용자 만족도 점수가 아니다.

## 범위 판정 135문장

기존 최고 점수·차이 기준으로 기각된 일반 43개와 부정·정정 29개, 합계 72개만 실제 Q4로 생성했다. 승인된 나머지는 기존 판정을 유지했다.

일반 요청에서는 모델 결과 38개를 승인해 그중 25개가 맞았고 5개를 기각했다. 기존에 승인된 정답 53개를 합치면 **78/99**다. 부정·정정에서는 24개를 승인해 그중 14개가 맞았고 5개를 기각했다. 기존 승인 정답 6개를 합치면 **20/36**이다. 기각은 정답으로 세지 않았다. 기존 최고 점수 라벨은 각각 75/99, 20/36이었다.

이 범위 점수는 기각 후 기존 계획기가 만든 답변을 채점한 결과가 아니다. 전체 앱 흐름에서의 개선은 위 33턴 시험으로 판단했다. 현재 작은 수작업 모음에서 얻은 결과이며 프롬프트를 이 모음의 실패를 보고 보강했으므로 독립 일반화 정확도가 아니다.

72회 생성의 중앙 시간은 데스크톱 Chrome에서 **2.040초**였다. 모델 적재 시간은 포함하지 않았고 모바일 지연 시간으로 해석하지 않는다. Ollama에는 JSON 강제 디코딩이 있지만 브라우저에는 없으므로 Q8과 Q4 결과를 구분한다. Q4 출력·토큰 수·시간은 `browser-q4-structured-classification.json`에 있다.

## 실제 앱 확인

별도 작업폴더의 Chrome 앱에서 모델 동의·적재 후 아래 세 요청을 연속으로 확인했다. JSON 중간 출력은 채팅에 노출되지 않았고 브라우저 오류 로그는 없었다.

- 한국어 딜교 순서: 전체 스킬 목록 대신 상황별 콤보 답변.
- 영어 R 정보: R 설명만 답변하고 스킬 카드의 R에 포커스.
- 중국어 기본 정보·스킬 동시 요청: 기본 능력치와 P/Q/W/E/R 요약을 함께 답변.

## 검증과 재현

운영 코드와 검증 예시는 분리했다. `request-scope-holdout.json`은 최종 프롬프트를 고정한 뒤 만든 새 변형 18문장이며 앱 번들에 포함하지 않는다.

새 변형도 같은 앱 계획·답변 코드에서 **7→12/18**로 개선됐으며 기존 정답을 깨뜨린 건 0개였다. 18개 중 13개에 모델을 호출했다. 범위 라벨만 채점하면 11/18이었지만, 기각 후 기존 답변으로 복귀한 결과를 포함해 실제 요청 조건 충족은 12/18이다. 낮은 확신의 소개·전체 스탯 요청 5건을 추가로 고쳤다. 새 변형의 콤보 표현 등 6건은 여전히 실패했으므로 충분한 일반화 성능을 주장하지 않는다.

두 모음 합계는 34→43/51이며 33턴의 기존 대화와 18개의 새 독립 질문을 구분한다. 결과는 `browser-q4-structured-holdout.json`과 `flows-browser-structured-holdout.json`에 보존했다. 추가 실패를 본 뒤 프롬프트를 다시 조정하지 않았다.

```sh
node --import tsx --test tests/unit/request-scope-model.test.ts tests/unit/request-scope-worker.test.ts tests/unit/request-intent.test.ts
npm run type-check
npm run test
npm run build
npx tsx scripts/llm/offline-classifier/prepare-request-browser.ts
# 개발 서버에서 scripts/llm/offline-classifier/request-browser.html의 버튼 실행
npx tsx scripts/llm/offline-classifier/evaluate-request-hybrid-flow.ts --browser-report research/llm-evals/request-classifier/comparison/hybrid/browser-q4-structured-flow.json
npx tsx scripts/llm/offline-classifier/evaluate-request-hybrid-flow.ts --browser-report research/llm-evals/request-classifier/comparison/hybrid/browser-q4-structured-holdout.json --holdout
```

집중 검사 8건과 전체 단위·데이터 2,172건, 타입 검사와 빌드를 통과했다. 생성 비공개, 잘못된 JSON·모순, 승인된 요청의 모델 미호출, 중단·시간 초과·늦은 응답·워커 실패·종료를 검사했다. 실험 재판정 Python 검사 6건도 통과했다.

직전 결과와 비교하려면 [혼합·단독 시험](README.md), 적용하지 않은 정책은 [불일치 재판정](dual-review.md)을 참조한다. 연구 결과의 `sources` 해시는 각 실행 시점의 파일을 가리키므로 이후 실행 코드 정리로 바뀔 수 있다. 보존한 JSON 입력과 출력으로 당시 프롬프트를 확인한다.
