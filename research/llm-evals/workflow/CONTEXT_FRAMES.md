# 문맥 보관·선택 비교

서로 다른 작업의 참조를 리스트로 보관한다. 같은 작업을 다시 다루면 최신 상태로 갱신한다. 작업 키는 스킬의 챔피언·슬롯, 능력치의 대상 목록, 아이템 ID, 상성의 양쪽 대상이다. 답변 본문이나 지식 문서를 복사하지 않는다.

## 후보와 보관 개수

- `legacy`: 변경 전 대화 처리.
- `lifo`: 아이템·규칙 질문 다음에 직전 작업으로 돌아가는 단순 스택.
- `typed`: 질문 종류와 같은 가장 최근 작업으로 복귀.
- `guarded`: 종류에 맞는 작업이 여러 대상이면 확인. 숫자만으로 과거 계산을 다시 시작하지 않고, 새 대상의 생략 질문도 보호한다.
- `learned`: 질문과 작업 후보의 적합도를 학습한 로지스틱 선택기. 문자 1~4그램과 최근성·대상·슬롯 특징을 사용한다. 공통 대상·수치 승계 제한은 함께 적용한다.

첫 실험은 `2, 4, 6, 8, 12`개와 다섯 정책의 21조합이었다. 후속 실험은 `guarded` 정책의 `12, 16, 24, 32`개를 비교했고 기본값을 **32개**로 정했다. 실행기가 지원하는 개수는 `2, 4, 6, 8, 12, 16, 24, 32`다. 모든 정책의 확장 개수를 검증했다는 뜻은 아니다. 기본 정책과 개수는 `src/lib/advisor/contextFrameTypes.ts` 한 곳에서 관리한다.

보관 한도는 작업 참조 리스트에 적용한다. 전체 대화나 모델 입력 토큰 수를 32개로 줄이는 설정은 아니다. 저장된 대화를 잘라 복원하더라도 실제 남아 있는 답변에 연결된 작업만 사용한다. 패치·챔피언·슬롯·승인 근거 해시가 맞지 않는 참조는 사용하지 않는다.

개수 초과와 80메시지 대화 기록 절단으로 유실된 문맥은 종류·스킬 슬롯만 12종 이내의 표식으로 남긴다. 대상 이름이나 본문을 우회 보관하지 않는다. 다른 주제로 전환한 뒤 관련 종류의 이름 없는 복귀 요청을 받으면 남은 대상 하나를 정답으로 확정하지 않고 다시 묻는다. 같은 주제의 일반 후속 질문과 사용자가 현재 대상을 명시한 새 요청은 처리한다.

## 자료와 학습

`datasets/context-frames/development.jsonl`과 `validation.jsonl`에는 46개 대화, 250턴의 작성한 계약이 있다. 긴 거리 복귀, 다른 대상, 중첩 작업, 숫자 승계, 모호한 질문의 확인과 영어·중국어 질문을 포함한다. 다른 주제를 1·3·5·7·9·11·13개 거치는 거리 시험도 포함한다. 보관 한도를 넘긴 질문의 복귀 실패는 점수에 그대로 남긴다.

이 자료는 실험 중 검토한 회귀 자료다. 독립된 실제 사용자 트래픽이나 최종 미관측 일반화 시험으로 보고하지 않는다. 기존 질문 은행의 정답·보호 조건과 공통 채점기는 수정하지 않았다. 새 숫자 복귀 질문에는 과거 패시브를 명시했으며, 확인 후 계산은 사용자가 새로 제시한 140으로 계산하도록 계약을 검토했다.

`stress-development.jsonl`, `stress-validation.jsonl`은 후속 긴 대화 시험 32개·792턴이다. 서로 다른 주제 13·17·25·33개를 거친 스킬 복귀, 수치 계산 복귀, 두 대상의 모호한 복귀, 옛 대상 유실 뒤 새 대상이 남은 경우를 나눈다. 생성기는 `scripts/llm/context-frames/build-stress.ts`다. 각 응답을 저장·복원하고 실제 앱의 80메시지 한도를 적용한다. 합성 회귀 자료이며 대부분의 턴은 사이에 끼운 능력치 질문이다. 전체 턴 통과율을 실제 복귀 성공률로 해석하지 않는다.

`selector-train.jsonl`과 `selector-dev.jsonl`은 질문 템플릿에서 생성한 학습 세션이다. 기존 평가 질문과 새 문맥 질문을 숫자 마스킹·정규화한 후 학습 템플릿에서 제외한다. 템플릿과 세션은 실사용 독립 표본 수와 다르다. `models/context-selector.json`은 연구용 선택기이며 Qwen·Kev의 기존 웨이트를 학습한 결과가 아니다. 기본 정책은 이 모델 파일을 브라우저로 다운로드하지 않는다.

```sh
pnpm llm:train:contexts
```

Node 24와 `uv`가 필요하다. Python 3.13, NumPy 2.5.3, SciPy 1.18.1, scikit-learn 1.9.1을 고정한다. 맥 CPU로 학습하며 Colab 세션은 사용하지 않는다. 학습 로그와 Python/TypeScript 확률 일치 기록은 `research/.cache/context-frames/20261007/training`에 생성한다.

## 반복 실행

새 결과를 보존하려면 실행별로 별도의 `--out` 경로를 지정한다. 모든 정책은 같은 코드·데이터·정답·Qwen 그래프에서 순차 비교하며, 입력이 달라지면 `--resume`을 거부한다.

```sh
pnpm llm:test:contexts --mode offline --split all --configs legacy,guarded:12,guarded:16,guarded:24,guarded:32 --out research/.cache/context-runs/my-change-offline
pnpm llm:test:contexts:compare --directory research/.cache/context-runs/my-change-offline --require guarded-32 --approved research/llm-evals/workflow/reports/context-followup-20261007/approved.json
pnpm llm:test:contexts --bank stress --mode offline --split all --configs guarded:32 --out research/.cache/context-runs/my-change-stress
npx tsx scripts/llm/context-frames/verify.ts --report research/.cache/context-runs/my-change-stress/guarded-32.json --approved research/llm-evals/workflow/reports/context-followup-20261007/stress-approved.json
pnpm llm:test:contexts --mode model --split all --configs legacy,guarded:32 --out research/.cache/context-runs/my-change-webgpu
pnpm llm:test:contexts:compare --directory research/.cache/context-runs/my-change-webgpu --require guarded-32 --approved research/llm-evals/workflow/reports/context-followup-20261007/approved.json
pnpm llm:test:contexts --mode offline --bank regression --configs legacy,guarded:32 --out research/.cache/context-runs/my-change-existing
pnpm llm:test:contexts:compare --directory research/.cache/context-runs/my-change-existing --require guarded-32
```

`regression` 은행은 공통 질문 은행의 대화 2,232턴이다. 요청 분류·검색·아이템 별칭·수치 QA·퇴역 판정기 같은 단일 구성요소 시험은 이 비교에서 제외하며 기존 `pnpm llm:test`가 계속 검사한다. 기대값 없는 10턴은 자동 성공에 합산하지 않는다.

WebGPU 실행은 실제 Chrome의 기존 모델 워커를 사용하며, 워커 실패를 다른 backend로 숨기지 않는다. 매 25턴 로컬 결과를 저장한다. 중단된 대화는 기억을 다시 구성하며, 완료된 대화만 건너뛴다. 작업 종료 시 자신이 띄운 Chrome과 Vite를 닫는다.

`pnpm llm:test --profile regression`은 기본 정책과 `legacy`의 문맥 계약 비교 및 문맥 단위 검사를 자동 실행한다. `--require` 비교는 기존 성공의 실패 전환이나 보호 답변 변경을 발견하면 실패한다. 최초의 성공 248턴 승인은 보존하고, 후속 `context-followup-20261007/approved.json`으로 250턴을 보호한다. `stress-approved.json`은 성공 788턴과 보관 범위를 넘긴 4턴의 확인 질문, 승인 근거의 비율에서 계산한 숫자 답변 14개를 고정한다. 이 4턴에 답을 추정하거나 보호한 계산 수치가 틀리면 실패한다. 질문 계약이나 채점기를 바꾸면 이 기준도 검토해야 한다. 새 후보 채택에는 이 게이트와 기존 대화 은행의 회귀 0건, 실제 WebGPU 확인을 함께 요구한다.

기본 동작을 되돌릴 때는 `DEFAULT_CONTEXT_POLICY`를 `legacy`로 바꾸고 같은 검사들을 실행한다. 개수를 바꾸려면 목록·직렬화 상한도 함께 검토하고 전체 비교를 다시 한다. [최신 32개 통합 검증](reports/context-followup-20261007/README.md)과 [최초 21조합 기록](reports/context-frames-20261007/README.md)에 결과·실패 행·SHA-256을 보존한다.
