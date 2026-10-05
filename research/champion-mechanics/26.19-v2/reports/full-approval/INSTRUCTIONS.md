# 전체 잔여 스킬 감독 검수

목적: 미승인 774개를 모두 실제 원문 대조·수정·재검증하여 사실 승인에 제출한다. 스키마 통과 또는 screen 지적 없음만으로 승인하지 않는다. 상위 감독자는 각 보고서의 해시와 근거를 확인하고 ledger를 합친다.

## 파일 소유권

본인 assignment-N.json의 records에 있는 candidates/<id>.json 및 reports/full-approval/group-N/<id>.json만 수정한다. inputs, schema, guide, 코드, 공통 ledger, manifest, records 출력, 다른 그룹은 수정하지 않는다. 원본 후보는 작업 전에 그룹 디렉터리의 before/<id>.json에 보존한다. 작성 모델 원본은 gpt-6-luna / medium이며 이번 수정은 감독 검수다.

## 반드시 할 검수

각 슬롯의 공급된 en/ko 본문·요약 전체와 draft.summary, rules, gaps를 읽는다. review-view.ts는 기존 큰 시뮬레이션을 제외하고 숫자 참조를 풀어 준다. 1~3개 슬롯씩 읽어 출력 잘림 없이 검수한다.

1. summary의 주장과 전체 규칙의 원문 대응, 조건 누락·부정 조건 반전·시간 단위.
2. trigger 사건·행위자, 효과 대상, 자기/상대/아군/충돌 대상 및 기본/추가 스탯 주인.
3. conditions의 종류·연산자·횟수·시간·상한·순서. 보유량과 실제 발동 횟수를 혼동하지 않는다.
4. damageType, CC 종류, 효과 분류, flags. 원문이 말하지 않는 판정을 추가하지 않는다.
5. parameter 숫자 참조의 값·백분율·랭크/레벨 범위·역할·스탯 주인. 숫자의 존재만으로 의미가 맞다고 판단하지 않는다.
6. variant와 출처 인용 범위, complex formula의 구성요소를 선형식으로 잘못 실행하지 않는지.
7. gaps가 실제 부족·충돌을 기록하는지. en/ko 요약이 본문과 다르면 더 구체적인 본문을 우선하고 충돌을 기록한다.
8. unverified-screen-proposals.json의 본인 슬롯 지적을 전부 원문 재대조하여 실제 오류/오탐/출처 한계로 판정한다. 매 지적에 이유를 남긴다. old candidateHash가 바뀌었더라도 원문 지적은 확인한다.

오류는 본인 후보만 최소 수정하고 check.ts로 검증한 뒤 수정본을 다시 읽는다. 출처 부족은 정확한 gap으로 남길 수 있지만 오류를 gap으로 숨기거나 핵심 규칙을 통째로 삭제하지 않는다. 공급 원문에 없는 게임 지식을 추측해서 넣지 않는다. 해결 못한 실제 오류는 needs_revision으로 보고하며 승인이라고 쓰지 않는다.

## 슬롯별 보고서

파일명 group-N/<id>.json. 최소 구조:

```json
{
  "id": "Champion.Q",
  "sourceHash": "input sourceHash",
  "beforeCandidateHash": "digest(before draft)",
  "candidateHash": "digest(final draft)",
  "verdict": "accepted",
  "scope": "supplied tooltip and summary; supervisor semantic review",
  "checkedRuleCount": 1,
  "checkedGapCount": 0,
  "summaryCheck": "요약에서 어떤 핵심 주장과 적용 범위를 대조했는지",
  "ruleChecks": [{"index": 0, "sourceIds": ["en:body"], "note": "실제로 확인한 조건·대상·수치의 의미"}],
  "repairs": [{"path": "rules.0", "issue": "확정 오류", "correction": "수정 내용", "sourceId": "en:body", "quote": "원문 그대로"}],
  "proposalDecisions": [{"index": 0, "verdict": "repaired", "reason": "원문 근거와 판정 이유"}],
  "limitations": [],
  "validation": {"valid": true, "errors": []}
}
```

수정 없음은 repairs=[], 지적 없음은 proposalDecisions=[]. proposal verdict는 repaired / false_positive / documented_gap. 규칙마다 ruleChecks를 남긴다. checkedRuleCount는 최종 draft.rules.length와 같아야 한다. gaps도 전부 검토하여 limitations에 남긴다. JSON 해시는 node:crypto sha256(JSON.stringify(parsedObject)) 또는 sources.ts digest를 사용한다. 파일 바이트 해시나 Python의 기본 JSON 직렬화 해시를 쓰지 않는다.

완료된 슬롯의 보고서는 즉시 저장해 감독자가 진행을 볼 수 있게 한다. 20~30개마다 감독자에게 개수와 실제 오류·오탐 수를 짧게 알린다. 최종에는 assigned 전체 완료·승인 가능 수·미해결 수·수정 수·proposal 판정 수를 보고한다. 커밋/푸시/배포는 하지 않는다.
