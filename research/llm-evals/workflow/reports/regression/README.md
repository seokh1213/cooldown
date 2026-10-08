# Advisor regression and quality measurements

Profile: regression. Promotion: **needs-review**.

Automatic contracts are separate from semantic review. Historical answers are never gold.

| Suite / mode | Pass / measured | Manual |
|---|---:|---:|
| dialogue-coverage/questions / none | 43/43 | 0 |
| dialogue-coverage/edge-questions / none | 30/30 | 0 |
| request-contract/questions / none | 41/41 | 0 |
| conversational-advisor/questions / none | 74/74 | 0 |
| crowd-control/questions / none | 60/60 | 0 |
| control-audit/questions / none | 115/115 | 0 |
| champion-mechanics-v2/questions / none | 51/51 | 0 |
| champion-mechanics-v2/full-approval-questions / none | 18/18 | 0 |
| champion-mechanics-v2/integrated-fresh-questions / none | 17/17 | 0 |
| champion-mechanics-v2/pyke-akshan-questions / none | 32/32 | 0 |
| champion-mechanics-v2/variations-v1-questions / none | 59/59 | 0 |
| atoms/action-conditions/questions / none | 52/52 | 0 |
| champion-mechanics-v2/live-web-questions / none | 17/17 | 0 |
| atoms/action-conditions/holdout / none | 18/18 | 0 |
| atoms/answer-quality/questions / none | 20/20 | 0 |
| atoms/broad-replay/questions / none | 84/84 | 0 |
| atoms/conditional-fiora/questions / none | 18/18 | 0 |
| atoms/conditional-fiora/holdout / none | 11/11 | 0 |
| atoms/context-replay/questions / none | 20/20 | 0 |
| stat-conversation / none | 36/36 | 0 |
| stat-boundary / none | 16/16 | 0 |
| passive-rag / none | 30/30 | 0 |
| mechanic-schema / none | 38/38 | 0 |
| request-flow / none | 33/33 | 0 |
| request-flow-holdout / none | 18/18 | 0 |
| stat-single / none | 195/195 | 0 |
| legacy-dialogue-270 / none | 270/270 | 0 |
| legacy-route-374 / none | 374/374 | 0 |
| legacy-act-60 / none | 120/120 | 0 |
| legacy-lookup-39 / none | 78/78 | 0 |
| retired-route-60 / none | 60/60 | 0 |
| retired-matchup-4 / none | 0/0 | 10 |
| video-tips / none | 191/191 | 0 |
| dialogue-coverage/questions / offline | 43/43 | 0 |
| dialogue-coverage/edge-questions / offline | 30/30 | 0 |
| request-contract/questions / offline | 41/41 | 0 |
| conversational-advisor/questions / offline | 74/74 | 0 |
| crowd-control/questions / offline | 60/60 | 0 |
| control-audit/questions / offline | 115/115 | 0 |
| champion-mechanics-v2/questions / offline | 51/51 | 0 |
| champion-mechanics-v2/full-approval-questions / offline | 18/18 | 0 |
| champion-mechanics-v2/integrated-fresh-questions / offline | 17/17 | 0 |
| champion-mechanics-v2/pyke-akshan-questions / offline | 32/32 | 0 |
| champion-mechanics-v2/variations-v1-questions / offline | 59/59 | 0 |
| atoms/action-conditions/questions / offline | 52/52 | 0 |
| champion-mechanics-v2/live-web-questions / offline | 17/17 | 0 |
| atoms/action-conditions/holdout / offline | 18/18 | 0 |
| atoms/answer-quality/questions / offline | 20/20 | 0 |
| atoms/broad-replay/questions / offline | 84/84 | 0 |
| atoms/conditional-fiora/questions / offline | 18/18 | 0 |
| atoms/conditional-fiora/holdout / offline | 11/11 | 0 |
| atoms/context-replay/questions / offline | 20/20 | 0 |
| stat-conversation / offline | 36/36 | 0 |
| stat-boundary / offline | 16/16 | 0 |
| passive-rag / offline | 30/30 | 0 |
| mechanic-schema / offline | 38/38 | 0 |
| request-flow / offline | 33/33 | 0 |
| request-flow-holdout / offline | 18/18 | 0 |
| stat-single / offline | 195/195 | 0 |
| legacy-dialogue-270 / offline | 270/270 | 0 |
| legacy-route-374 / offline | 374/374 | 0 |
| legacy-act-60 / offline | 120/120 | 0 |
| legacy-lookup-39 / offline | 78/78 | 0 |
| retired-route-60 / offline | 60/60 | 0 |
| retired-matchup-4 / offline | 0/0 | 10 |
| video-tips / offline | 191/191 | 0 |
| request-scope / fast-scope | 261/292 | 0 |
| retrieval / lexical | 758/804 | 0 |
| item-alias / lexical | 1/1 | 0 |
| retrieval-v2 / lexical | 38/84 | 0 |
| item-alias / offline-item | 299/299 | 0 |

Accepted wrong numeric answers: 0.
Infrastructure checks: 12/12.
기존 기준 5,809건의 모든 결과 필드를 보존하고 신규 test 84건만 추가했다. 기존 결과 회귀 0건. 새 lexical 검색은 38/84 통과, 46건 실패이며 해결 또는 승인된 정답으로 간주하지 않는다.

동결된 결과: baseline.json. 확장 근거와 새 실패 목록: ../gemma-tuning-20261008/baseline-extension.json. 의미 검수는 아직 남아 있다.

2026-10-08 확장: 총 5,893건, 자동 5,873건·수동 20건. 모델별 임베딩 비교는 별도 Gemma 보고서를 참고한다. lexical 점수를 임베딩 모델 점수와 섞지 않는다.
