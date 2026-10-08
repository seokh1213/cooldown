# EmbeddingGemma 2 검색 LoRA

기본 모델은 `google/embeddinggemma-2@914f7f89142e33e77833254d9c9b90c3cef7303b`다. 이미지·음성 탑을 제외하고 검색 query/document 프롬프트와 mean pooling을 유지한다. Attention q/k/v/o에 rank 8, alpha 16 LoRA를 붙여 다중 정답 contrastive loss로 학습한다. 신규 질문 은행과 기존 train을 합친 1,331개로 2 epoch, 334 step을 실행하며, 개발 검증 66개로 epoch를 선택한다.

[공식 모델 카드](https://huggingface.co/google/embeddinggemma-2)는 FP16 사용 시 수치가 깨질 수 있다고 명시한다. T4에서는 FP32, Ampere 이상에서는 BF16을 사용한다. 최근 torch가 T4의 BF16 에뮬레이션도 지원한다고 표시하므로 GPU compute capability로 네이티브 지원을 구분한다. Colab에 기본 설치된 오래된 torchao는 현재 PEFT와 충돌해 전용 런타임에서 제거한다.

Mac 환경:

```sh
uv venv --python 3.13 research/.cache/gemma-tuning/.venv
uv pip install --python research/.cache/gemma-tuning/.venv/bin/python -r scripts/llm/gemma-retrieval/requirements.txt
python3 scripts/llm/gemma-retrieval/run.py prepare research/.cache/gemma-tuning
```

준비 명령은 현재 앱 데이터에서 문서·BM25·라우팅 스냅샷을 만들고, 새 질문과 주제 분할을 재생성한다. 기존 실험을 이어갈 때는 `prepare`로 입력을 덮어쓰지 않는다. 설치 환경을 확인한 뒤 맥의 MPS 또는 Colab GPU 중 하나를 선택한다.

```sh
research/.cache/gemma-tuning/.venv/bin/python scripts/llm/gemma-retrieval/run.py colab research/.cache/gemma-tuning
# 맥에서 학습하려면 colab 대신 local
# 새 Colab에서 이전 검증 백업을 복원하려면 colab 뒤에 --resume 추가
```

Colab CLI의 기존 OAuth 로그인을 사용한다. CLI가 없거나 로그인이 만료됐다면 먼저 계정 연결이 필요하다. Colab에 이미 진행 중인 이 실험의 런타임 소유 기록이 있으면 중복 GPU를 할당하지 않는다. 학습 로그는 작업 폴더의 `training.log`를 원격에서 받아 확인하며, 수집 상태는 `backup-status.json`에 남는다.

체크포인트에 묶인 학습 코드가 현재 master와 다르면 원래 커밋을 명시한다. 2026-10-08 체크포인트는 `--resume --source-revision a69c26262`로 복원한다. 실제 세션 복구에도 이 커밋의 학습 소스를 업로드했다. 이 옵션은 해당 커밋의 학습 파일을 업로드하며, 체크포인트 입력·환경 지문 검사는 그대로 적용한다. 현재 러너는 평가 스냅샷도 체크포인트 입력에 포함한다.

학습 스텝 완료 후 60초 또는 40 step마다 체크포인트를 원자적으로 발행한다. 맥 수집기는 60초 간격으로 내려받아 크기·SHA256·tar 경로를 검증하고 최근 3개를 보존한다. LoRA, optimizer, RNG, 입력·모델·환경 지문, hard negative, 이전 최우수 후보와 평가 벡터를 함께 복원한다. epoch 평가 전에도 체크포인트를 저장하고, 평가 중 끊기면 평가부터 재실행한다. CPU↔GPU 또는 라이브러리 버전이 다른 환경을 같은 학습 상태로 간주하지 않는다.

학습 완료 후 최종 파일이 맥에 검증돼야 해당 GPU를 반환한다. 실패한 학습은 발행된 체크포인트 수집 후 소유한 GPU만 반환한다. 진단용 `HOLD_GPU` 파일이 있으면 자동 반환을 보류하므로, 진단이 끝나면 지운다. 정상 종료 때 맥 수집기도 끝난다. 설정·세션 정보는 무시된 작업 폴더에만 저장하며 저장소나 로그에 출력하지 않는다.

같은 질문을 현행 Qwen q4와 기본 Gemma q4로 맥에서 병렬 평가한다.

```sh
research/.cache/gemma-tuning/.venv/bin/python scripts/llm/vector-search/embeddinggemma_eval.py embed research/.cache/gemma-tuning --model qwen
research/.cache/gemma-tuning/.venv/bin/python scripts/llm/vector-search/embeddinggemma_eval.py embed research/.cache/gemma-tuning --model gemma
```

최종 `gemma-results` 백업이 맥에 검증되면 아래 명령으로 비교한다. 러너가 최종 아카이브 해시를 다시 확인하고 `candidates/gemma`를 자동 복원한다.

```sh
research/.cache/gemma-tuning/.venv/bin/python scripts/llm/gemma-retrieval/run.py evaluate research/.cache/gemma-tuning --out research/.cache/gemma-report
python3 -m unittest discover -s scripts/llm/gemma-retrieval -p 'test_*.py'
```

이 비교는 문서 검색 품질이다. 전체 챗봇 답변 정확도는 별도이며, 기존 질문의 반복 검증과 합성 질문의 한계를 보고서에 남긴다. 신규 test에서 같은 192문서 Qwen 대비 정답·Recall@3가 줄지 않고 오답이 늘지 않아야 하며, 기존 test의 Recall@3도 실제 배포 Qwen보다 줄지 않아야 q4 export와 브라우저 검증으로 진행한다. 학습 결과만으로 배포 파일을 바꾸지 않는다.

평가기는 질문·정답·분할·문서 지문과 임베딩 입력 지문을 확인한다. 최초 실험의 native NPZ에는 입력 지문이 없었으므로, 원격 스냅샷 일치를 확인한 뒤 벡터 배열을 바꾸지 않고 메타데이터만 추가했다. 원본 체크포인트와 변경 전후 해시는 [실험 보고서](../../../research/llm-evals/workflow/reports/gemma-tuning-20261008/README.md)에 기록한다.

완료 후 기본 모델·가상환경·중간 백업은 정리하고, 결과·선택된 어댑터·최종 복구 백업만 보존한다.
