# 챗봇 회귀·품질 검사

모델·분류기·문서·대화 규칙을 바꿀 때 이 폴더의 질문 은행과 공통 실행기를 사용한다. 과거 답변을 정답으로 재사용하지 않는다. 앱 전체 검사와 모델 단독 수치 추출 점수는 따로 읽는다.

문맥 보관·선택을 변경할 때는 [문맥 비교 절차](CONTEXT_FRAMES.md)도 사용한다. 일반 `regression` 실행에 기본 문맥 정책의 기존 성공·보호 답변 유지 검사와 문맥 단위 검사가 포함된다.

2026-10-06 최종 조사에서 37개 평가 묶음, 등록된 4,076개 질문 턴과 현행 브랜치 이력의 삭제 기록 83개를 확인했다. 기대값이 없는 과거 질문 1,919개는 별도 의미 검토 은행에 보존한다. 최근 원본·실행 결과는 `inventory.json`과 `reports`에서 확인한다.

## 데이터 구조

```text
workflow/
  inventory.json                  현존 파일·삭제된 파일의 커밋·SHA-256·역할
  datasets/
    regression/cases.jsonl        질문·전체 대화·기대값·원본 출처를 합친 질문 은행
    regression/reviewed-contracts.jsonl  수동 턴의 검수한 기대값·이유·패치, 원래 ID 유지
    review/archive.jsonl          기대값이 없는 과거 질문, 수동 의미 검토용
    qa/
      train/natural.jsonl         자연 질문 SFT 학습 415개
      dev/natural.jsonl           개발·선택용 110개
      heldout/numeric.jsonl       시험 212개, 상충 근거 6개는 수동 검토
      manifests/splits.json       원본 SHA-256·문서 ID·행 수
      manifests/models.json       세 베이스의 고정 Hugging Face revision
    archive/retired/              Git에서 복구한 옛 판정·라우팅·상성 자료와 출처
  reports/                        재현 기준과 검증 요약, 실시간 로그는 .cache에 저장
```

학습·dev·새 heldout 문서 ID는 겹치면 실패한다. 옛 질문 36개는 알려진 회귀 표본이며 새 일반화 점수에 합치지 않는다. 212개 중 자동 수치 채점은 206개, 이 중 새 정답 질문 132개는 앱의 근거 선택도 검사한다. 같은 사실의 두 표현을 독립 사실 두 개로 보고하지 않는다.

질문이 같아도 이전 대화·언어·기대값·초기 기억·분할이 다르면 별도 사례다. 완전히 같은 사례만 합치고 원본 파일과 행, 소속 테스트를 모두 보존한다. 생성 질문 은행은 직접 수정하지 않고 원본 기대값을 검토한 뒤 갱신한다.

## 실행 순서

프로젝트 루트에서 Node 24, pnpm과 설치된 의존성을 사용한다.

```sh
pnpm llm:test:audit
pnpm llm:test --profile regression \
  --baseline research/llm-evals/workflow/reports/regression/baseline.json \
  --out research/.cache/quality/current
pnpm llm:test --profile infrastructure --out research/.cache/quality/infrastructure
```

`audit`는 현존 평가 자료, 실행기, 단위·데이터·E2E 검사, 영상 팁 질문과 Git의 삭제 기록을 조사한다. 새 평가 폴더가 등록되지 않았거나 질문 은행·수동 질문이 바뀌면 일반 실행은 중단한다. `audit --refresh`에 해당하는 위 명령은 승인 버튼이 아니며, 갱신된 데이터·출처·분할 diff를 확인해야 한다.

등록된 시험 입력과 실행 코드는 저장소에 유지한다. `inventory.json`의 `localOnly` 자료는 로컬 연구 산출물이며, 깨끗한 CI checkout에 없어도 된다. 그 자료에서 복구한 질문·대화·출처는 `datasets/review/archive.jsonl`에 보존한다. 필수 파일 누락, 등록 입력 변경, 수동 질문 은행 변경은 계속 실패한다.

삭제 기록은 시험 중인 브랜치의 `HEAD` 이력을 기준으로 계산한다. 아직 합쳐지지 않은 다른 브랜치의 진행 중 실험 파일을 삭제 자료로 분류하지 않는다. 이미 복구한 역사적 질문과 출처는 계속 보존한다.

`regression`은 챗봇 관련 Node 검사, 스크립트 타입 검사, 배포의 챔피언 메커니즘 회귀 검사, 모델 없는 실제 대화, 오프라인 분류 대화, 빠른 요청 분류, 검색·아이템 검사를 실행한다. 메커니즘 배포 검사에도 `reviewed-contracts.jsonl`의 같은 검수 계약을 적용하며 기존 승인 성공 항목의 보호를 유지한다. 대화마다 답변의 대상·수치·조건·관점·저장 후 복원한 기억을 확인한다. 역사적 기대값과 현행 동작의 불일치는 실패 행으로 남으며 자동으로 정답을 바꾸지 않는다.

CI도 위 baseline 비교 명령을 실행하고 결과·검토 패킷을 14일 보관한다. `advisor-quality.yml`을 PR·브랜치 검사에서 호출하고 master push에서도 실행한다. PR·브랜치의 기존 `test` 작업은 이 회귀 검사를 통과해야 실행된다. master의 검사 결과는 자동 배포 작업과 별개로 보고된다. baseline에는 이미 존재하는 실패도 남긴다. CI는 새로운 회귀를 막는 검사이며, 실패를 포함한 현행 상태를 품질 승인하지 않는다. 자료·질문·채점기를 변경하면 기존 baseline 비교를 거부하므로 변경 이유와 실패 목록을 검토하고 전체 실측으로 기준을 갱신한다.

기준을 갱신할 때는 `--baseline` 없이 전체 회귀를 실행하고 `summary.json`의 `infrastructurePassed: true`, `logs/coverage.json`의 누락 0건, 실패·수동 검토 목록을 확인한다. 기존 실패와 정답 변경 이유를 기록한 뒤 완결된 `results.json`을 `reports/regression/baseline.json`으로 복사한다. 점수만 적거나 중간 저장 파일을 기준으로 삼지 않는다. 모델 비교 기준은 별도의 완결된 `--profile model` 실측이다.

`infrastructure`는 같은 Node·타입 검사에 Colab 백업·복원·export·학습 도구의 Python 검사와 원격 실행 도구, 생성 결과 재개 검사를 더한다. Python 의존성은 `uv`의 별도 환경을 사용한다.

## 실제 브라우저 모델 비교

Mac의 설치된 Chrome과 WebGPU를 사용한다. 초기 ONNX 외부 가중치·토크나이저는 모델 설정의 원본 위치에서 내려받으며 Chrome 프로필은 실행 전용 `.cache/quality/browser`다. 이미 사용 중인 포트나 WebGPU 실패를 다른 판정기로 대체하지 않는다.

```sh
pnpm llm:test --profile model \
  --graph public/models/kev/b3e/model_q4.onnx --base-weights \
  --out research/.cache/quality/base
pnpm llm:test --profile model \
  --graph public/models/kev/b3eqa-20261006/model_q4.onnx \
  --baseline research/.cache/quality/base/results.json \
  --out research/.cache/quality/candidate
```

두 실행 사이에 질문·데이터·채점기를 바꾸면 비교를 거부한다. 앱 코드 변경 자체의 비교는 가능하지만 데이터와 채점기는 고정해야 한다. 원본 그래프에는 QA gate가 없으므로 `--base-weights`가 필요하다. 두 실행 모두 현행 앱 코드를 쓰며, 과거 master 앱 전체와의 비교로 해석하면 안 된다.

분류기와 앱 경로를 함께 바꿀 때는 새 채점기·은행을 동결한 master 앱에도 적용해 대조군을 먼저 재측정한다. 후보 실행에 `--pipeline-baseline MASTER_RESULTS_JSON`을 사용하면 게임 데이터·QA 웨이트를 고정하고 `public/models/offline/request-v1.bin`과 `.json`의 교체만 허용한다. 출처 목록이 실측 해시와 다르거나 다른 데이터가 변하면 거부하며 허용한 두 파일의 해시 차이를 비교 결과에 명시한다. `--baseline`의 엄격한 동일 데이터 조건은 바꾸지 않는다. 상세 수정과 미해결 실패는 [요청 분류·답변 회귀 수정 기록](reports/repair-2026-10-06/README.md)을 따른다.

교체 그래프는 파일 내용의 SHA-256마다 다른 주소로 제공한다. 같은 Chrome 캐시에서 원본과 후보를 차례로 실행해도 이전 그래프를 재사용하지 않는다. 실행 도중 그래프 파일이 바뀌면 실패한다.

`--suite numeric-qa,request-flow`로 범위를 좁힐 수 있다. 선택 범위의 해시가 달라지므로 부분 실행과 전체 실행은 비교하지 않는다. `--resume`은 완료한 사례를 건너뛰며, 대화가 중간에 끊기면 해당 대화 전체를 처음부터 재생한다. 코드·모델·문서·질문이 바뀌면 재개를 거부한다.

결과는 25개 측정마다 로컬에 저장한다. 중간 저장은 `complete: false`이며 완결된 기준으로 사용할 수 없다. SIGINT·SIGTERM이나 성공·실패 후 브라우저와 서버를 닫는다. 검사 중 코드·문서가 바뀌거나 누락된 측정이 있으면 인프라 실패로 남긴다.

## Ollama, 같은 수치 질문의 빠른 비교

```sh
pnpm llm:test:generation --model qwen3.5:0.8b \
  --out research/.cache/quality/ollama-base
pnpm llm:test:generation --model YOUR_TUNED_MODEL \
  --baseline research/.cache/quality/ollama-base/results.json \
  --out research/.cache/quality/ollama-candidate
```

설치된 모델을 사용하며 자동 다운로드하지 않는다. temperature 0, thinking 끔, 최대 24 출력 토큰으로 동일한 문서·질문을 준다. 질문 낱말로만 1,300자 문맥을 고르며 정답 문장 위치는 사용하지 않는다. 생성 결과는 매 질문 원자적으로 저장한다. 중단 후 같은 명령에 `--resume`을 붙인다.

`--limit 12`는 동작 확인용 표본이며 206개 전체 점수를 대신하지 않는다. 기존에 로드되어 있던 모델과 Ollama 서버는 유지하고, 이번 실행이 새로 로드한 모델만 완료 후 메모리에서 내린다. Ollama GGUF 점수는 앱의 ONNX 분류·검색·QA gate 성능과 별도다.

## Colab, 동일 입력 export와 로컬 채점

```sh
pnpm llm:test:generation --export research/.cache/quality/colab-tasks.json
```

출력에는 공통 프롬프트·작업 ID·입력 해시만 있고 정답은 없다. Colab에는 이 파일, `datasets/qa/manifests/models.json`, `scripts/llm/quality/generate_tasks.py`, 기존 `scripts/llm/tuning` 의존 모듈을 올린다. 학습에서 사용한 환경 버전과 고정 HF revision을 유지한다.

```sh
python scripts/llm/quality/generate_tasks.py TASKS_JSON MODELS_JSON OUTPUT_JSON \
  --key qwen35 --adapter VERIFIED_ADAPTER_DIRECTORY \
  --backup-root /content/cooldown-tuning
```

기반 모델은 `--adapter`를 생략한다. 이 실행은 native CUDA FP16 생성이며 배포 q4/WebGPU와 같은 결과로 취급하지 않는다. GPU가 없거나 공통 1,900토큰 입력 한도를 넘으면 실패한다. 모델·adapter 해시와 입력 해시가 다르면 재개하지 않는다.

생성 결과는 매 질문 저장하고 60초마다 `generation-native` archive와 SHA-256 manifest를 공개한다. **별도로 소유한 평가 런타임**의 private metadata에 `checkpointStages: ["generation-native"]`, `requiredResults: ["generation-native"]`를 지정하고 맥에서 다음 수집기를 실행한다. 다른 GPU 작업과 공유하는 런타임에는 평가 완료 종료 표식을 사용하지 않는다.

```sh
research/.cache/tuning/python/bin/python scripts/llm/tuning/collect_checkpoints.py PRIVATE_METADATA_JSON
```

맥이 켜져 있고 네트워크에 연결되어 있어야 주기 다운로드가 가능하다. 수집기는 60초 간격으로 확인하고 크기·SHA-256·tar 경로를 검증한 최근 사본 3개를 유지한다. GPU_DONE 확인 뒤 원격 최종 manifest를 다시 읽고 필수 stage의 SHA-256이 로컬 검증 receipt와 같은 경우에만 종료한다. 직전 사본만 내려받았으면 다음 주기에 최종 결과를 회수하며, 최종 결과의 검증된 사본이 확보되기 전에는 런타임을 종료하지 않는다. 학습 optimizer·scaler·난수 복원 규칙은 [학습 실행 문서](../../../scripts/llm/tuning/README.md)를 따른다.

검증된 백업에서 `checkpoints/generation-native/generation-artifact.json`을 복원해 같은 로컬 채점기를 사용한다.

```sh
pnpm llm:test:generation --import VERIFIED_OUTPUT_JSON \
  --out research/.cache/quality/colab-base
pnpm llm:test:generation --import VERIFIED_TUNED_OUTPUT_JSON \
  --baseline research/.cache/quality/colab-base/results.json \
  --out research/.cache/quality/colab-candidate
```

작업 해시, 모든 작업의 유일한 출력, 모델 revision·adapter 해시를 검증하며 산출물에 적힌 correct 값을 믿지 않고 로컬 정답으로 다시 채점한다. 서로 다른 backend는 직접 baseline 비교할 수 없다.

## 의미 검토·품질 게이트

```sh
pnpm llm:test --profile quality --out research/.cache/quality/full-quality
pnpm llm:test:ui --out research/.cache/quality/ui
```

`quality`는 자동 은행에 과거 수동 질문을 더하고 모델 없는 대화·오프라인 대화·실제 모델·Python 검사를 모두 실행한다. 맥에서 오래 걸릴 수 있다. `ui`는 앱의 local-preview 빌드를 만들고 전용 포트 53678에서 그 빌드를 열어 `e2e/advisor-*`를 재생한다. 기존 사용자 미리보기나 오래된 dist 서버를 재사용하지 않는다.

결과 폴더의 `README.md`는 테스트별 점수, `results.json`은 각 답변·근거·실패 이유, `review-packet.json`은 의미 검토 대상이다. 기대값이 없는 옛 자료, 상충 근거, 모델이 만든 과거 판정 라벨은 자동 정답률에서 제외한다. 일부 역사적 결과에는 초기 맥락이 없으므로 질문 재생 결과만으로 과거 모델과 동등 비교하지 않는다.

요청 범위 검사는 실제 답변의 카드 종류·스킬 슬롯·능력치 필드·관점을 `observed`로 남긴다. ‘공격 속도만’은 단일 챔피언 카드와 비교 카드 모두 정확히 공격 속도 한 항목이면 통과하며, 다른 필드나 여러 항목이면 실패한다.

품질 패킷의 각 행에 근거를 읽은 판정과 이유를 적고 같은 입력·모델의 `--review REVIEW_JSON`으로 검증한다. 파일 해시가 다르거나 누락·중복·추가 검토 행이면 거부한다. 자동 실패는 검토 패킷에서 명시적으로 확인한다.

승격 조건은 동일한 입력·데이터·채점기의 baseline, 이전 정답의 회귀 0개, 보호 답변의 변경 0개, 채택한 잘못된 수치 0개, 인프라 실패 0개, 미해결 의미 검토 0개다. 평균 점수 상승으로 특정 회귀를 가리지 않는다. 자동 계약 통과만으로 한국어 자연스러움·답변 유용성을 보증하지 않는다.

새 모델은 실제 워커에서 분류→QA→검색 순서의 gate 복원도 확인해야 한다. QA 수치 후보가 채택되지 않았으면 raw QA 점수 상승을 사용자 답변 개선으로 보고하지 않는다. [최근 조합 실측](../combined-qa-2026-10-06/README.md)에는 이 구분과 현행 대비 결과가 있다.

## 현재 지식 원문 변경

2026-10-07 로컬 26.20 갱신은 [패치·자동 회귀 기록](reports/patch-26.20/README.md)에 있다. 변경 전후 자동 회귀는 `--patch-baseline BEFORE_RESULTS_JSON`으로 비교한다. 질문·채점기·앱 코드·모델은 같아야 하며 게임/지식 데이터만 바뀔 수 있다. 이전 통과 행이나 통과 하위 검사가 사라지면 실패한다. 소스 갱신 CI가 이 전후 측정과 검토 HTML 생성을 수행하고 결과를 14일 보관한다. 실제 바뀐 콤보·스킬 지식의 의미 검수는 자동 승인하지 않는다. 이 워크플로 변경은 아직 GitHub에서 실행되지 않았다.

참조만 담은 평가 초기 문맥은 현재 패치에 맞춰 재생한다. 답변·계산 조건·문맥 프레임·기타 사실이 들어 있는 초기 문맥과 실제 사용자 저장 기록은 패치 값을 바꾸지 않는다. 과거 mechanic-schema 입력 두 개는 별도 연구 fixture에 동결해 배포 데이터 정리와 독립적으로 재현한다.

2026-10-06 후속 검수 `5c53aa957`에서 Kled Q/E/R, RekSai Q/W/E, Rell W 7개를 재검수했다. 최종 통합 시 승인 스킬 규칙은 865개이며 `research/champion-mechanics/reports/drift.json`의 regenerate·removed·metadata는 모두 0개다. 이전 858개·변경 7개는 후속 검수 전의 상태다. `pnpm llm:mechanics-drift`의 최신 변경 기록과 검토 절차를 따르며 원문이 다시 바뀌면 자동 승인하지 않는다. 테스트는 고정된 과거 개수보다 현재 유효한 승인 목록의 ID·원문 해시가 앱에 빠짐없이 적재되는지 검사한다.

## 브라우저에서 사람 판정하기

`npm run llm:review`는 [41문항 HTML](reports/review-20261007/review.html)을 만든다. 의도 분류 실패 31개와 과거 상성 질문 10개이며, 상성의 none/offline 중복 측정 20건을 10개 질문으로 묶었다. HTML은 서버 없이 열 수 있고 판정·의도·메모를 저장하며 결과 JSON 복사/다운로드/불러오기를 지원한다. 입력 해시가 다른 JSON은 거부한다. `npm run llm:test:review`로 실제 Chrome의 모바일/데스크톱·밝은/어두운 화면과 판정 동작을 검사한다. [검토 방법](reports/review-20261007/README.md)을 따른다. 사용자 판정을 학습 정답이나 배포 승인으로 자동 전환하지 않는다.

## 후속 실험 결과

새 [숫자·단위 span 후보 네 개](reports/span-ranker-20261007/README.md)는 같은 132개 앱 근거에서 기존 학습 Qwen 92개보다 모두 낮아 채택하지 않았다. 기존 92개는 92%나 현행 웹의 전체 정확도가 아니다.

[문맥 후보 실험](reports/context-selector-20261007/README.md)은 중복 제거 학습과 guarded-residual 조합을 추가했다. 실제 WebGPU 250턴에서 현행 guarded 250개, 기존/새 순수 학습형 각각 249개, 조합 250개로 개선 근거가 없어 기본값을 유지한다. 최종 자료의 offline 250턴과 792턴 overflow 승인도 별도로 확인했다. 실험 모델과 결과는 연구 경로에 보존하고 기본 문맥은 `guarded:32` 리스트를 유지한다.

## 코드·기록 정리 정책

공통 실행기·채점기는 `scripts/llm/quality`에서 유지한다. 신규 테스트는 원본 기대값을 기존 해당 도메인 파일에 추가하고 `llm:test:audit`로 등록한다. 새 평가 계열은 `sources.ts`에 자동·수동·보관 역할을 지정한다. 상충하거나 낡은 패치의 기대값은 현재 패치 검토 전 자동 정답으로 올리지 않는다.

새 실행기가 대체한 `evaluate_combined_qa.ts`, `evaluate_legacy_conversation.ts`와 단순 re-export `app_sft_evidence.ts`는 제거했다. 앱과 학습 근거 선택 모두 `src/lib/advisor/answerEvidence.ts`를 사용한다. 기존 개별 연구 실행기는 독자적인 학습·export·분석 목적이 있어 유지하며, 옛 결과와 삭제된 파일의 커밋은 `inventory.json`에서 찾는다.

실행 기록·체크포인트·브라우저 캐시는 `.cache`에 보관하고 모델·인증·런타임 정보를 질문 은행이나 Vault에 넣지 않는다. 완료한 작업의 전용 프로세스·브라우저·서버만 회수하며 공용 Ollama·사용자 브라우저·다른 실험은 종료하지 않는다.
