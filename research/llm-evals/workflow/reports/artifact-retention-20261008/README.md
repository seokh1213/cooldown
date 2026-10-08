# 완료된 실험 자료 보존, 2026-10-08

실험을 다시 검증하는 데 필요한 입력·실측 답변·최종 QA LoRA를 Git에 보존한다. 완료된 실행의 임시 캐시와 워크트리 백업은 삭제한다. 이 정리는 모델 교체나 새로운 품질 승인이 아니다.

## 보존 범위

- `manifest.json`: 원본과 보존 파일의 SHA-256, 바이트 수, 고정 베이스 revision, 보존 이유와 정리 결과.
- `frozen-inputs/`: 당시 앱이 선택한 근거와 언어별 원문. train 415개, dev 110개, heldout 212개와 모델 revision은 기존 `workflow/datasets/qa` 파일을 참조해 중복 저장하지 않는다.
- `base-comparison/`: Qwen3.5 0.8B, Qwen2.5 0.5B, LFM2.5 350M의 native/q4/브라우저 측정. 완료하지 못한 실행도 원래 범위대로 남기며 전체 점수로 승격하지 않는다.
- `models/qwen35-natural-qa/`: 검증된 최종 415개 학습 결과의 LoRA 원본과 PEFT 설정. optimizer·중간 스텝은 보존하지 않는다.
- `training/`: 최종 학습 평가와 환경. 베이스 가중치는 고정 Hugging Face revision에서 다시 받는다.
- `patch/`: 제거한 워크트리에서 회수한 26.20 웹 답변과 콤보 호환성 실측. 최신 회귀 기준은 기존 `reports/regression/baseline.json`과 `reports/patch-26.20`을 따른다.

QA 배포 그래프 `public/models/kev/b3eqa-20261006/model_q4.onnx`는 이미 Git에 있다. 보존한 실험 export와 SHA-256이 같으므로 그래프와 베이스 가중치를 중복 저장하지 않는다. LoRA 원본은 이어 학습하거나 다시 export할 때 필요하므로 별도로 보존한다.

추가한 문맥 선택기·숫자 span·한국어 검수 HTML의 코드와 결과는 원격 `work/patch-review-context-experiments` 브랜치에 보존한다. 기준 커밋은 `5801f3c942935a49c7b1e0401e45a9ca15454259`다. 이 브랜치에는 당시 생성한 패치 자료도 있으므로 master로 통째로 합치지 않는다. 최신 master의 배포 데이터와 품질 기준은 유지한다.

## 숫자 span 실험 재현

위 연구 브랜치에서 프로젝트 루트를 기준으로 실행한다. 출력 경로는 비어 있는 임시 폴더를 사용한다.

```sh
mkdir -p research/.cache/span-replay/data
mkdir -p research/.cache/span-replay/results/qwen35-trained-q4-browser-full
cp research/llm-evals/workflow/datasets/qa/train/natural.jsonl research/.cache/span-replay/data/natural-train.jsonl
cp research/llm-evals/workflow/datasets/qa/dev/natural.jsonl research/.cache/span-replay/data/natural-dev.jsonl
cp research/llm-evals/workflow/datasets/qa/heldout/numeric.jsonl research/.cache/span-replay/data/qa-followup.jsonl
cp research/llm-evals/workflow/reports/artifact-retention-20261008/frozen-inputs/app-evidence.json research/.cache/span-replay/data/app-evidence.json
cp research/llm-evals/workflow/reports/artifact-retention-20261008/base-comparison/qwen35-trained-q4-browser-full/answers.jsonl research/.cache/span-replay/results/qwen35-trained-q4-browser-full/answers.jsonl
uv run --python 3.13 --with numpy==2.5.3 --with scipy==1.18.1 --with scikit-learn==1.9.1 python scripts/llm/tuning/experiment_span_ranker.py --data research/.cache/span-replay/data --out research/.cache/span-replay/report
```

기대값을 새로 만들지 않고 기존 `reports/span-ranker-20261007/summary.json`과 `answers.jsonl`을 비교한다. 제공 문서 206개와 앱 근거 132개는 각각 비교한다.

## 削除対象と今後の扱い

완료된 실험의 `research/.cache`와 다시 받을 수 있는 `research/.patch-cache`를 삭제한다. 내려받은 베이스 모델, 미채택 후보 가중치, 중간 optimizer, 중복 체크포인트, 브라우저 캐시, 가상환경, 생성한 배포 파일, 실행 로그, 인증·런타임 정보, 워크트리 정리 때 만든 임시 백업이 대상이다.

학습 중에는 기존처럼 60초마다 회수하고 최근 검증된 체크포인트 3개를 유지한다. 완료 후 채택할 모델 원본·고정 데이터·실측 결과·재현 코드의 push를 확인한 뒤 임시 파일을 지운다. 미채택 후보는 결론·입력·결과를 남기고 가중치는 버린다.
