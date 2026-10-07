# 최신 master 통합과 문맥 32개 검증

2026-10-07. 로컬 후보의 기본 정책을 `guarded:32`로 정했다. 기준 master는 `ca879f6aa91fffdfde77a76b1160cde7a333b269`, 최종 검사한 앱·실행기 소스는 `a615bc27b42257a15e3ea2b5badd95d8bba87248`이다. master 반영·push·PR 생성은 하지 않았다. 사용자가 채팅에서 반영 여부를 결정한다.

## 요청한 세 작업

1. 12개보다 큰 16·24·32개 비교: 동일 입력 비교를 완료했고, 긴 복귀 성공 수와 메모리 관측에 따라 32개를 선택했다.
2. 닫힌 PR #40의 개선을 최신 master 위에 검토·통합: 유용한 처리는 유지하고 이득 없는 추가 분류기 배포와 미사용 코드는 제거했다. 기존 master와 #40은 모두 후보의 조상이다.
3. PR #41 문맥 처리와 통합 회귀·실제 브라우저 검증: 기존 대비 회귀 0건, 문맥 250건 및 긴 대화 보호 게이트, 실제 WebGPU와 UI 검사를 완료했다. 기존 실패 31건과 수동 20건은 아래에 별도로 남긴다.

## 보관 개수 선택

같은 소스 `7e3ebc1a599a3875c07f9c605b2570ce5fad8eb1`에서 `12, 16, 24, 32`개를 비교했다. 기존 문맥 250턴은 모델 없는 경로와 오프라인 경로 모두 12개에서 248/250, 나머지는 250/250이었다. 변경 전 `legacy`는 213/250이다. [selection.json](selection.json)에 각 입력 해시와 측정 요약을 보존한다.

긴 대화 자료는 작성·생성한 32개 대화, 792턴이다. 그중 760턴은 사이에 끼운 질문이고, 마지막 요청 32개 중 명확한 과거 복귀는 16개다. 13·17·25·33개의 서로 다른 주제를 거친 뒤 스킬·계산으로 복귀하거나, 여러 대상이 모호하거나, 옛 대상이 사라지고 새 대상이 남는 상황을 검사한다. 아래 전체 점수를 실제 사용자 정확도로 해석하지 않는다.

| 보관 개수 | 전체 성공 / 792 | 명확한 과거 복귀 / 16 | 측정한 문맥 참조 최대 바이트 |
|---|---:|---:|---:|
| 12 | 776 | 0 | 2,503 |
| 16 | 780 | 4 | 3,261 |
| 24 | 784 | 8 | 4,801 |
| 32 | 788 | 12 | 6,325 |

모호함·옛 대상 유실을 다루는 나머지 마지막 요청 16개는 네 후보 모두 통과했다. 32개에서도 33개 주제를 거친 복귀 4개는 한도를 넘어 다시 묻는다. 실패 4개를 성공으로 바꾸지 않았다. 시험 범위를 넘는 개수의 최적성은 주장하지 않는다.

## 최종 구현과 통합 판단

- 닫힌 PR #40의 유용한 오타 정규화·능력치 조회·스킬 조건·계산 근거 처리와 PR #41의 문맥 리스트를 최신 master의 몬스터·CC·스킬 메커니즘 수정 위에 통합했다.
- 답변 본문·문서를 복사하지 않고 대상·슬롯·질문 조건·근거 해시를 최대 32개 보관한다. 실제 대화 기록 한도는 별도로 80메시지다.
- 개수 초과나 80메시지 기록 절단으로 참조가 사라지면 종류·스킬 슬롯만 최대 12종의 표식으로 남긴다. 대상 이름은 숨겨 보관하지 않는다. 다른 주제로 전환한 뒤 생략된 과거 대상을 요청하면 남은 대상 하나로 추정하지 않고 확인한다. 같은 주제의 일반 후속 질문과 명시한 새 대상은 처리한다.
- 계산 14개의 수치는 승인된 근거의 비율에서 독립 계산해 보호한다. 대상·슬롯만 맞고 숫자가 틀리면 실패한다. 기록 절단 안전성은 80메시지를 실제 적용한 단위 검사로도 보호한다.
- 능력치 분류기 추가 배포는 제외했다. 같은 195개 조회 계약에서 최신 master, 분류기 포함 후보, 분류기 없는 후보가 모두 195/195였다. 이득을 확인하지 못한 3,730,651바이트의 `stat-v1.json`과 앱 연결을 제거하고 연구 자료는 보존했다.
- 개별 오타 목록 대신 일반 자모·문자 거리와 의미 보호를 사용한다. 조건 질문을 기본 이동속도로 잘못 처리하는 문제, 영어 `as Ahri`의 관점 손실, 전환 계산 표현 `바뀜`의 회귀를 수정했다.
- 사용하지 않는 `dialogueCandidates.ts`, `abilityDescriptionPlan.ts`, `itemMatching.ts`, 능력치 분류기용 `browser.ts`를 제거했다. `APP_TEST.md`의 옛 실행 방식은 역사 기록으로 표시했다.
- Qwen 0.8B QA 웨이트는 바꾸지 않았다. Colab 학습·새 GPU 세션도 사용하지 않았다.

## 기존 전체 회귀와 남은 제한

기존 전체 은행 5,775측정은 성공 5,724, 실패 31, 수동 20이다. 같은 사례·데이터·채점기를 사용하는 기존 기준 결과와 성공→실패 전환 0건, 보호 답변 변경 0건이다. 입력 불변을 포함한 인프라 검사 12개가 모두 통과했다.

31개 실패는 기존 요청 분류기의 `request-scope / fast-scope` 단독 검사이며 기준 결과와 동일하다. 수동 20개는 기대값 없는 퇴역 상성 질문 10개를 두 경로로 측정한 값이다. 자동 성공에 합산하지 않았고 의미 검토도 미완료다. 따라서 공통 실행기의 배포 판정은 `needs-review`이며 전체 품질 완전 통과나 자동 배포 승인을 주장하지 않는다. 이번 문맥 개선이 이전 시점의 816건을 모두 해결했다는 뜻도 아니다.

## 실제 브라우저 검사

최종 소스에서 Chrome WebGPU의 기존 워커로 문맥 250/250, 긴 대화 788/792를 확인했다. 입력 불변·완료·워커 대체 없음 검사는 모두 통과했고, 워커 오류는 0개다. 문맥 250개 성공 보호와 긴 대화 788개 성공·4개 확인 질문·14개 계산 수치 보호도 통과했다.

긴 대화에서 문맥 참조 최대 크기는 6,325바이트, 대화 기록은 403,639바이트였다. 이 자료에서 관측한 값이며 모든 입력의 최대 메모리 보장은 아니다. 문맥 검사 p95는 4.73초, 긴 대화는 0.113초였으나 다른 CPU 검사와 병행했으므로 독립 속도 비교로 사용하지 않는다.

단위·데이터 검사 1,396개, 앱·스크립트 타입, 경고 0개 린트, 로컬 미리보기 빌드, 브라우저 55개가 통과했다. 앞선 중간 소스 실행에는 CPU 병행 중 5초 UI 타임아웃 1개가 있었다. 같은 중간 소스의 관련 4개 집중 검사는 통과했고, 최종 소스의 전체 55개는 단일 worker로 통과했다. 타임아웃이나 기대값을 완화하지 않았다.

## 회귀 재실행

Node 24와 프로젝트 의존성, 실제 Chrome WebGPU가 필요하다. 아래 명령은 새 출력 경로를 사용한다. `regression` 프로필은 기존 은행과 문맥·긴 대화 승인 게이트를 함께 검사한다.

```sh
npm run llm:test -- --profile regression --baseline /Users/seokh1213/workspace/projects/cooldown/research/.cache/context-frames/20261007/integration-regression/results.json --out research/.cache/quality/my-change
npm run llm:test:contexts -- --split all --mode model --configs guarded:32 --out research/.cache/context-runs/my-change-webgpu
npx tsx scripts/llm/context-frames/verify.ts --report research/.cache/context-runs/my-change-webgpu/guarded-32.json --approved research/llm-evals/workflow/reports/context-followup-20261007/approved.json
npm run llm:test:contexts -- --bank stress --split all --mode model --configs guarded:32 --out research/.cache/context-runs/my-change-stress-webgpu
npx tsx scripts/llm/context-frames/verify.ts --report research/.cache/context-runs/my-change-stress-webgpu/guarded-32.json --approved research/llm-evals/workflow/reports/context-followup-20261007/stress-approved.json
```

매 25턴 로컬 결과를 저장하고 `--resume`은 같은 입력 해시만 허용한다. 완료된 대화만 건너뛰며 중단된 대화는 기억을 재구성한다. 워커 실패를 다른 backend로 대체하지 않는다. CPU 실행에도 이벤트 루프를 양보해 중단 요청이 처리되게 했다.

되돌릴 때 `src/lib/advisor/contextFrameTypes.ts`의 기본 정책을 `legacy`로 바꾸고 같은 회귀를 실행한다. 개수를 바꿀 때 지원 목록·직렬화 상한과 승인 성공을 함께 검사한다. 새 모델이나 학습형 선택기를 채택할 때도 기존 성공 후퇴 0건과 실제 WebGPU 확인을 요구한다.

## 증거 위치와 범위

원본 결과는 주 작업 폴더의 `research/.cache/context-frames/20261007-followup`에 SHA-256 manifest와 함께 보존한다. `final-regression`, `final-context-webgpu`, `final-stress-webgpu`, `e2e-verified`가 최종 결과다. `*-incomplete`, `*-partial`, `*-preliminary`, `*-b77*`, `stress-diagnostic`은 수정 전·중단·진단 결과이며 최종 점수로 사용하지 않는다. 개수 선택은 `context-none`, `context-offline`, `stress-none`의 동일 소스 비교다.

소스가 다른 개수 선택 실험과 최종 앱 검증을 한 번의 동일 입력 실험으로 합산하지 않는다. 합성·검토한 회귀 자료의 성공을 실제 사용자의 일반화 정확도로 해석하지 않는다. [verification.json](verification.json)에 최종 입력 해시·검사·잔여 실패를 남긴다.
