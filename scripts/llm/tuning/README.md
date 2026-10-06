# Qwen 0.8B 튜닝 실험

새 모델 비교와 회귀 검사는 [공통 워크플로우](../../../research/llm-evals/workflow/README.md)를 사용한다. 학습·dev·heldout 고정 데이터, Ollama 실행, Colab 입력 export·결과 import, 실제 WebGPU 앱 비교가 이 경로에 모여 있다.

실험 후보는 다섯 가지이고, 현행 모델을 포함해 여섯 그룹을 비교한다.

1. 분류 pointer head 재학습과 temperature 보정
2. hard negative를 사용한 검색 LoRA 추가 학습
3. 배포 ONNX q4 투영 가중치에 맞춘 분류 LoRA 추가 학습
4. 문서에 답이 있는지 YES/NO 판정한 뒤 수치를 추출하는 두 단계 호출
5. 문서를 근거로 답하는 QA SFT

DPO는 이번 다섯 후보에 포함하지 않는다. 실험 파일은 `research/.cache/tuning`
아래에 두고, 앱에 실린 모델이나 헤드를 덮어쓰지 않는다. 현행 앱 소스·데이터·모델을
동결한 스냅샷에서 평가하며, 실험 도중 바뀐 앱 코드를 섞지 않는다.

## Colab 체크포인트와 맥 백업

학습기는 optimizer 업데이트가 끝난 시점에 체크포인트를 만든다. 약 60초마다,
또는 40스텝마다 저장 조건을 확인한다. gradient accumulation 도중에는 저장하지 않는다.
체크포인트에는 다음 상태가 들어간다.

- LoRA adapter와 설정
- optimizer와 GradScaler
- 완료한 학습 스텝과 Python·NumPy·PyTorch 난수 상태
- 학습 입력 및 기반 q4 가중치 fingerprint
- 검색 실험의 hard negatives와 초기 검증 점수

파일을 임시 경로에 완전히 쓴 뒤 archive를 공개하고, SHA-256과 바이트 크기가 담긴
manifest를 원자적으로 갱신한다. 맥의 별도 프로세스는 60초 간격으로 새 manifest를
확인하고, 새 archive를 내려받아 크기·SHA-256·tar 경로를 검증한다. 검증된 백업만
복구 대상으로 등록하며, 실패한 다운로드가 기존 백업을 덮어쓰지 않는다.
각 실험의 최근 검증된 백업 3개를 유지한다. 다운로드에 60초 이상 걸리면 다음 확인은
다운로드 종료 직후 시작한다.

현재 실행 정보는 무시되는 `research/.cache/tuning/latest.json`에 있다.
맥이 켜져 있고 네트워크에 연결된 동안 다음 명령으로 백업을 유지할 수 있다.

```sh
research/.cache/tuning/python/bin/python scripts/llm/tuning/collect_checkpoints.py \
  research/.cache/tuning/latest.json
```

상태는 실행 폴더의 `backup-status.json`, 검증된 사본은 `backups/`,
각 사본의 검증 기록은 `receipt.json`에 있다. 연결 오류는 안전한 오류 종류만 기록한다.
인증 토큰과 런타임 식별자는 출력하지 않는다. 프록시 인증 만료로 생기는 404도
소유권을 확인한 새 접속 정보로 한 번 재시도하며, 주기마다 공식 keep-alive 요청을 보낸다.

q4 분류 실험은 `quantized-budget.json`의 `maxRows`로 파일럿 크기를 제한할 수 있다.
이번 비교는 세션 종료 전에 맥에 확보한 480개 학습 체크포인트를 사용했다.
1,120개 전체 학습의 완료로 세지 않는다. 같은 순서의 나머지 질문을 학습하려면
예산 파일을 지우거나 늘리고 저장된 optimizer·scaler·난수 상태를 복구한다.

세션이 사라지면 동일한 스냅샷과 라이브러리로 새 런타임을 준비한 뒤 복원한다.
큰 파일은 8MiB 조각으로 업로드하고, 런타임에서 합친 파일의 SHA-256을 다시 확인한다.

```sh
research/.cache/tuning/python/bin/python scripts/llm/tuning/resume_checkpoints.py \
  research/.cache/tuning/latest.json
```

복원 후 동일한 `train_retrieval.py`, `train_quantized.py`, `train_sft.py`를 실행하면
마지막 완료 스텝 다음부터 학습한다. 입력 fingerprint가 다르면 재개를 거부한다.
pickle을 포함한 optimizer 상태는 이 도구가 직접 저장하고 검증한 파일만 읽는다.

## SFT 후속 검증

추가 학습 전에 기존 adapter를 자연스러운 질문과 실제 앱이 선택한 문서에서 검증한다.
`prepare_followup.py`는 학습·dev 문서와 겹치지 않는 새 질문 176개와 기존 36개를 만든다.
새 질문의 정답 있는 136개는 68개 사실의 두 표현이며 독립 표본 136개로 취급하지 않는다.
문맥은 질문 낱말로만 1,300자까지 고르고 정답·정답 문장 위치를 읽지 않는다.

`export_generation.py`는 기존 분류·검색 adapter를 바꾸지 않고 `qa_scale`을 추가한다.
각 작업은 하나의 gate만 켠다. `verify_generation.py`는 기존 초기값과 실제 q4 특징,
기존 SFT 그래프의 greedy 응답이 같은지 검사한다. 외부 q4 가중치 파일은 기존 파일을
그대로 사용하며 ONNX Runtime을 위해 일반 파일 또는 hard link로 준비한다.

```sh
research/.cache/tuning/python/bin/python scripts/llm/tuning/verify_generation.py \
  research/.cache/tuning/sft-followup-latest.json
research/.cache/tuning/python/bin/python scripts/llm/tuning/evaluate_sft_followup.py \
  research/.cache/tuning/sft-followup-latest.json provided
```

실제 앱 평가에는 동결 소스의 `select_sft_evidence.ts`, 분류 헤드, 현행 문서 벡터와
loopback `serve_features.py`가 필요하다. `RETRIEVAL_EVAL=1`과 `HIDDEN_JUDGE`를 지정하고
별도의 `JUDGE_CACHE_FILE`·`JUDGE_CACHE_NAMESPACE`를 사용한다. 질문 기록은 비우며
자료에 상충하는 보상 값과 문맥 제공용 음성 사례는 검색 점수에서 제외한다.

```sh
research/.cache/tuning/python/bin/python scripts/llm/tuning/evaluate_sft_followup.py \
  research/.cache/tuning/sft-followup-latest.json app
research/.cache/tuning/python/bin/python scripts/llm/tuning/benchmark_sft_followup.py \
  research/.cache/tuning/sft-followup-latest.json
```

앱 카드가 근거에 도달했는지와 생성 모델이 숫자·단위를 정확하게 답했는지는 다른 지표다.
`supported_scalar`는 숫자·단위가 근거에 존재하는지만 검사하며 잘못 고른 다른 숫자도
통과할 수 있다. 이 검사만으로 답의 의미가 맞다고 보증하지 않는다.

워커는 `purpose: "grounded-numeric"` 요청에 한해 QA gate를 켜고 최대 24토큰을 만든다.
완료 전 조각은 화면에 보내지 않는다. adapter가 없는 그래프의 해당 요청은 거부하고
성공·실패 후에는 gate를 다시 끈다. 기본 모델 설정과 일반 생성은 기존 경로를 사용한다.
실험용 그래프를 지정하는 호출부·후보의 의미 검증·브라우저 실측을 마친 뒤 활성화한다.

GPU 파이프라인이 완료되고 검색·q4 분류 실험의 최종 archive 두 개가 맥에 확보되면,
백업 프로세스가 로컬 SHA-256을 다시 확인하고 소유권을 확인한 Colab 런타임을 종료한다.
다른 실험은 metadata의 `checkpointStages`와 `requiredResults`로 백업 대상과 종료에
필요한 최종 산출물을 지정한다. 기존 실행 파일은 검색·q4 분류 결과 두 개가 기본값이다.

## 세 베이스의 자연 질문 SFT

`bases-latest.json`은 Qwen3.5 0.8B, Qwen2.5 0.5B Instruct, LFM2.5 350M의 별도 실행이다.
세 베이스의 immutable HF revision을 `data/models.json`에 고정한다. 도메인 지식을
문서에서 선택하는 의미 질문 105개를 수작업으로 작성하고 네 가지 표현으로 바꾼다.
학습 415개, dev 110개이며 잘못된 문서를 준 거절 질문도 포함한다. 시험용 212개와
정답·음성 문서가 겹치면 준비를 거부한다. 실제 사용자 질문 로그로 간주하지 않는다.

```sh
research/.cache/tuning/python/bin/python scripts/llm/tuning/prepare_natural_training.py \
  research/.cache/tuning/bases-20261006-011137
research/.cache/tuning/python/bin/python scripts/llm/tuning/collect_checkpoints.py \
  research/.cache/tuning/bases-latest.json
```

Colab에는 `train_base_pilot.py`와 의존 모듈·고정 데이터·provenance를 올린다.
설치 환경의 구형 `torchao`가 Transformers 5.12 import를 막아 제거했다. 이 파일럿은
TorchAO와 Unsloth에 의존하지 않는다. 라이브러리 버전은 `environment.json`에 기록한다.
노트북 kernel의 foreground 셀에서 학습 파이프라인을 실행한다.

```python
import subprocess, sys
from pathlib import Path
root = Path('/content/cooldown-tuning')
with (root / 'pilot-private.log').open('ab') as log:
    subprocess.run([sys.executable, str(root / 'scripts/train_base_pilot.py'), str(root)],
                   stdout=log, stderr=log, check=True)
```

학습은 backbone 전체를 고정한 FP32 가중치·FP16 autocast, fresh all-linear LoRA
rank 16·alpha 32, AdamW 1e-4, accumulation 8, seed 20261006, 1 epoch다.
문서·질문 토큰은 loss에서 제외하고 정답 토큰만 학습한다. optimizer·scaler·난수와
입력 해시가 있는 checkpoint를 복원하면 이미 완료한 질문은 재학습하지 않는다.
별도 환경을 준비한 뒤 `resume_checkpoints.restore(metadata, stages)`로 결과 archive와
학습 checkpoint를 선택 복원할 수 있다. 마지막 415개 상태에서 이어지면 남은 평가만 한다.

각 베이스는 native weights에서 제공 문서 212개와 동결 앱 선택 근거 132개를 전후 비교한다.
Qwen의 배포 q4에는 기존 분류·검색 adapter를 보존한 QA gate를 추가한다. 다른 두
베이스는 독립 ONNX graph에 QA gate를 붙이며 Qwen 분류·검색 헤드를 대신하지 않는다.
native 점수, Mac CPU q4 점수, WebGPU 점수를 서로 같은 것으로 취급하지 않는다.

```sh
research/.cache/tuning/python/bin/python scripts/llm/tuning/verify_base_exports.py \
  research/.cache/tuning/bases-latest.json
research/.cache/tuning/python/bin/python scripts/llm/tuning/prepare_base_browser.py \
  research/.cache/tuning/bases-latest.json
research/.cache/tuning/python/bin/python scripts/llm/tuning/serve_base_browser.py \
  research/.cache/tuning/bases-latest.json
research/.cache/tuning/python/bin/python scripts/llm/tuning/evaluate_browser_pilot.py \
  research/.cache/tuning/bases-latest.json qwen25-trained-q4
```

브라우저 서버는 loopback에 모델·토크나이저·ORT asset만 공개한다. 인증 설정과 백업
폴더는 공개하지 않는다. agent-browser 0.38.2의 실험 전용 세션을 `--webgpu`로 켜고
Apple Metal adapter를 확인한다. 12개 질문은 호환성·시간 확인용이고 전체 정확도를
대신하지 않는다. 전체 평가는 212+132개를 두 gate에서 수행하고 응답을 매번 맥에 쓴다.
gate=0 시간에도 QA 계산 비용이 포함되므로 원본 모델의 속도로 일반화하지 않는다.
실험 그래프·gate를 기본 앱에 활성화하지 않는다.

## 검증

```sh
research/.cache/tuning/python/bin/python -m unittest discover \
  -s scripts/llm/tuning -p 'test_*.py'
pnpm run type-check:scripts
```

체크포인트 테스트는 중단 없이 학습한 결과와 optimizer·난수 상태를 복원해 이어 학습한
결과가 동일한지 확인한다. 손상 파일, 잘못된 tar 경로, 입력 변경, 백업 보존, 최종
파일 확보 전 런타임 종료 방지를 각각 검사한다. 실제 T4 학습도 맥 백업 20스텝을
복원해 25스텝 이후로 이어지는 것을 확인했다.
