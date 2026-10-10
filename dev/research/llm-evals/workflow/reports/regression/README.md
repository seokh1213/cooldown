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

2026-10-09 틱 자료 갱신: 세 언어 카드와 검수 JSON에 반복 판정 정보를 추가해 dataHash가 바뀌었다. 동일 질문·채점기로 5,893건 전체를 다시 실측했다. 통과 5,796건, 기존 실패 77건, 수동 검수 20건으로 신규 실패·누락·보존 답변 변경·잘못 수락한 수치 답변 모두 0건이다. 인프라 검사 12/12 통과. 실패 77건과 수동 20건을 해결하거나 승인한 것으로 간주하지 않는다.

도트와 수면을 묻는 질문의 두 모드에서 기존 정답을 유지하고 졸음 전환 설명만 추가된 것을 확인했다. 상세 차이와 기존 실패 목록은 [틱 기준 갱신 기록](../../../../ability-ticks/26.20/baseline-refresh.json)에 보존한다. 실측 직후 UI의 다크 모드 출처 글자색만 보완했으며, 최종 빌드·브라우저 검증 및 master Actions 전체 회귀로 확인한다. baseline과 provenance는 동일한 완결 실측 산출물을 사용한다.

2026-10-10 구조 정리: 폴더 이동으로 낡아진 caseHash·scorerHash·dataHash를 전체 5,893건 실측으로 갱신했다. 기존 master Actions 실측과 비교해 실행 시간을 제외한 결과 필드가 모두 동일하다. 통과 5,796건, 기존 실패 77건, 수동 검수 20건이며 누락·신규 회귀·보호 답변 변경·잘못 수락한 수치 답변은 0건이다. 인프라 검사 12/12 통과. 문맥 승인도 기존 성공 ID와 필수 확인 문구를 보존한 채 검증했다.

예전 기준에 아직 기록되지 않았던 제목·공백 변경 560건과 같은 질문의 두 모드에서 기존 지식 공백 문구가 바뀐 내용은 [구조 정리 기준 갱신 기록](../structure-20261010/baseline-refresh.json)에 남겼다. 이번 구조 변경에서 답변이 추가로 바뀐 것은 없다. 기존 실패와 수동 검수는 미해결 상태로 유지하며, 비교 조건과 승인 계약은 완화하지 않았다.
