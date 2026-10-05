# 변경 감지와 갱신 절차

## 현재 범위

활성 기준 자료는 [current.json](current.json)이 가리키는 `26.19-v2`다. 173개 공통 정보와 감독자가 원문 검수·수정한 865개 승인 스킬을 보존한다. 현재 승인 대기는 0개다. 새 패치에서 변경된 슬롯은 다시 작성·검수하며 자동 승인하지 않는다. [전수 검수 결과](26.19-v2/reports/final-review.md)에 각 슬롯의 수정·검수·해시 기록을 남겼다.

CI가 변경 감지, 다음 입력 준비, 기존 자료 재사용, 답변 회귀 검사를 맡는다. CI에는 Codex 인증이 없어 변경된 스킬의 Luna 작성과 최종 사실 검수는 로컬에서 수행한다. 새 자료를 준비해도 활성 포인터나 앱 답변 경로는 자동으로 바꾸지 않는다.

## CI에서 하는 일

| 실행 경로 | 작업 |
|---|---|
| PR 검사 | 현재 원문과 기준 자료 비교 → 답변 회귀 검사 → 보고서 보관 |
| 정적 데이터 갱신 | 새 원문 수집 → 비교 → 변경이 있으면 별도 디렉터리에 다음 입력 준비 → 답변 회귀 검사 → 보고서·입력 보관 |

기존 정적 데이터 워크플로는 매시 17분에 상류 표식을 확인한다. DDragon 패치나 CommunityDragon 빌드가 바뀌면 갱신하며, 표식이 그대로여도 하루 한 번 원문을 다시 수집한다. master 푸시와 수동 실행도 갱신을 거친다. 단순 PR 검사는 저장소의 원문을 비교하며 외부 데이터를 다시 받지 않는다.

변경 보고서는 Actions 작업 요약과 `champion-mechanics-drift` 또는 `champion-mechanics-update` artifact에 남는다. 갱신 artifact에는 `mechanics-next` 입력도 포함되며 14일 보관한다. 이번 구현은 로컬에서 검증했고 원격 Actions 실행은 아직 확인하지 않았다. GitHub의 [작업 요약](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary)과 [artifact](https://docs.github.com/en/actions/tutorials/store-and-share-data)를 사용한다.

## 무엇을 다시 작성하는가

| 변경 | 처리 |
|---|---|
| 원문 문장, 수치, CC, 스킬 형태 변경 | 해당 슬롯만 재작성 대기. 이전 승인 제거 |
| 스키마·작성 가이드 변경 | 새 계약으로 전체 슬롯 재작성. 이전 승인 제거 |
| 새 챔피언·누락 후보 | 필요한 슬롯 작성 대기 |
| 삭제된 챔피언·슬롯 | 새 자료에서 제외 |
| 패치 번호, 수집 경로·진단만 변경 | 의미가 같고 새 입력 검증을 통과하면 기존 초안 재사용 |
| 챔피언 공통 스탯 변경 | 코드로 공통 정보 다시 복사. 스킬이 그대로면 모델 호출 없음 |

재사용 승인은 기존 원문·후보 해시가 검수 기록과 정확히 맞아야 유지된다. 이전 출처 해시와 재사용 이유를 새 검수 기록에 남긴다. 이전 디렉터리는 덮어쓰지 않는다.

의미 검사 보고서도 원문·후보가 같은 슬롯만 옮긴다. 이전 검사 해시와 “새 모델 검사를 수행하지 않았다”는 기록을 보존한다. 변경된 슬롯이나 검사 누락 슬롯은 `screen`이 다시 검사한다. 모델의 의미 검사 지적은 감독자가 확인하며 사실 승인으로 취급하지 않는다.

## 로컬 갱신 순서

먼저 현재 정적 데이터가 갱신된 상태에서 실행한다. 출력 디렉터리는 반드시 새 이름으로 지정한다.

```sh
npm run llm:mechanics-drift
npm run llm:mechanics-refresh -- research/champion-mechanics/next-v2
node --import tsx scripts/llm/champion-mechanics/author.ts research/champion-mechanics/next-v2 12
node --import tsx scripts/llm/champion-mechanics/screen.ts research/champion-mechanics/next-v2 16
```

`author`는 유효한 기존 후보를 건너뛰고 변경·누락 슬롯만 gpt-6-luna / medium으로 작성한다. 패치·공통 정보만 바뀌어 재작성 대기가 0개면 모델 작성과 의미 검사는 생략한다.

감독자는 변경 슬롯의 원문, 조건, 대상, 숫자, 형태를 확인하고 `review-ledger.json`에 해당 원문·후보 해시로 결정을 기록한다. 검수되지 않은 자료는 `validated`로 남길 수 있다. 모든 초안이 유효해졌으면 내보낸다.

```sh
node --import tsx scripts/llm/champion-mechanics/export.ts research/champion-mechanics/next-v2
```

새 디렉터리와 검수 결과를 확인한 뒤 `current.json`의 `directory`를 변경한다. 그 다음 비교 평가를 실행한다.

```sh
npm run llm:mechanics-eval -- research/champion-mechanics/reports/answer-quality.json --check
```

## 답변 회귀 기준

평가는 실제 앱의 대화 함수와 대화 저장·복원 함수를 사용한다. 현행이 맞힌 질문을 실험이 틀리거나, 같은 원문·후보에서 이전에 성공한 승인 규칙 답변이 실패하면 CI를 멈춘다. 질문 기준 자체가 바뀌어도 명시적인 기준 검토가 필요하다.

패치에서 원문이 바뀌면 이전 정답을 새 원문에 강제하지 않는다. 기존 승인은 현재 원문과 맞지 않아 검색에서 빠지고, 이전 원문에 연결된 성공 기준도 적용하지 않는다. 보고서의 `reviewedSlots`와 변경 목록으로 적용 범위 감소를 확인한 뒤 새 사실을 검수하고 기준을 갱신해야 한다.

질문 파일을 유리하게 바꾸거나 평가 결과에서 성공 기준을 자동 재작성하지 않는다. [답변 비교 보고서](../llm-evals/champion-mechanics-v2/README.md)에 고정 질문, 결과, 제한을 기록했다.

## 검증 결과

- 현재 26.19 원문: 865개 재사용, 재작성 0개, 승인 유지 가능 865개, 공통 정보 변경 0개.
- 격리된 가짜 패치에서 Q 하나만 변경: 1개 재작성, 4개 재사용, 기존 승인 P 유지. 이전 파일 보존과 불완전한 내보내기 거절 확인.
- 같은 패치에서 공통 스탯만 변경: 변경 감지, 스킬 재작성 0개.
- 이전 스키마의 정상 자료: 손상으로 오인하지 않고 새 계약으로 모든 슬롯 재작성.
- 추출·변경 감지·답변 관련 시험 42건과 스크립트 타입 검사·대상 파일 ESLint 통과.
- 전체 승인 후 기존 51턴 비교 26→50, 별도 신규 18턴 비교 2→7. 질문 기준을 변경하지 않았고 현행 대비 퇴보는 없었다. 신규 질문셋은 아직 CI 성공 기준에 합치지 않은 보완 평가다.
