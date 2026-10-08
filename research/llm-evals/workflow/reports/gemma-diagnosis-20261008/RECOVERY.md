# Gemma 진단 재현과 보존

retention.json의 SHA256과 크기를 검증한 뒤 사용한다. archive에는 베이스 모델이나 인증 정보가 없다. 원래 평가 입력은 ../gemma-adapters-20261008/evaluation-inputs.tar.gz에 보존돼 있다.

## 점수 재생, GPU 불필요

```sh
mkdir -p research/.cache/gemma-diagnosis-replay
tar -xzf ~/.cache/cooldown-kev/gemma-adapters-20261008/evaluation-inputs.tar.gz -C research/.cache/gemma-diagnosis-replay
tar -xzf ~/.cache/cooldown-kev/gemma-diagnosis-20261008/analysis-inputs.tar.gz -C research/.cache/gemma-diagnosis-replay
tar -xzf ~/.cache/cooldown-kev/gemma-diagnosis-20261008/diagnostic-results.tar.gz -C research/.cache/gemma-diagnosis-replay
uv run --python 3.13 --with numpy==2.5.3 --with onnxruntime==1.30.0 --with tokenizers==0.23.2 python scripts/llm/gemma-retrieval/diagnose.py research/.cache/gemma-diagnosis-replay research/.cache/gemma-diagnosis-replay/report
uv run --python 3.13 --with numpy==2.5.3 --with onnxruntime==1.30.0 --with tokenizers==0.23.2 python scripts/llm/gemma-retrieval/diagnostic_score.py research/.cache/gemma-diagnosis-replay research/.cache/gemma-diagnosis-replay/candidates/diagnostic research/.cache/gemma-diagnosis-replay/report/controlled-results.json
```

저장소 root에서 실행하고 Node 의존성은 npm ci로 설치한다. 원래 결과는 research/llm-evals/workflow/reports/gemma-diagnosis-20261008에 있다.

## 학습 상태

진단 동결 입력·frozen 코드·시작 어댑터는 diagnostic-inputs.tar.gz, 문서 범위 실험의 최종 optimizer·RNG·전체 완료 출력은 coverage-checkpoint.tar.gz에 있다. 새 작업 디렉터리에서 해제한다. eval-snapshot.json이 학습·출력용 이름이고 snapshot.json은 채점용 이름이다. coverage-mined.json은 체크포인트의 artifacts/coverage-mined.json을 원래 root에 복원해야 입력 지문이 일치한다.

베이스는 google/embeddinggemma-2@914f7f89142e33e77833254d9c9b90c3cef7303b의 원본 native 가중치를 별도로 받는다. 토치 2.11.0+cu130, Transformers 5.19.0, PEFT 0.21.2, T4 FP32 환경 기록을 따른다. 복구 검사는 frozen 코드·데이터·베이스 지문을 유지한다. 이 체크포인트는 모든 학습 56 step이 끝난 상태이며 추가 학습을 명령하지 않는다. 새 학습 실험은 별도 프로토콜과 새 작업 디렉터리를 사용한다.

원격 원본 diagnostic-results-original.tar.gz와 로컬 경로 정리본 diagnostic-results.tar.gz는 텐서가 같다. 원본은 초기 archive-layout 실수의 감사 기록으로 함께 보존한다. 최종 모델을 production으로 선택한 것이 아니다. GPU와 수집기는 종료됐다.
