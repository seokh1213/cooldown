# EmbeddingGemma 2 검색 튜닝, 2026-10-08

**종료 상태, 2026-10-08:** Gemma 실험은 종료했다. 선택 어댑터 사본과 로컬 모델·체크포인트·벡터 백업은 삭제했으며 아래 보존·재현 절차는 삭제 전 기록이다. 현재 상태는 [최종 정리](../gemma-retirement-20261008/README.md)를 따른다.

결론: LoRA는 기존 질문 검색을 개선했지만 현행 Qwen을 이기지 못했다. **배포 Qwen 웨이트와 인덱스를 유지한다.** 미리 정한 교체 조건을 통과하지 않아 학습 Gemma의 q4 export·WebGPU 검증으로 진행하지 않았다. 아래 수치는 문서 검색 결과이며 전체 챗봇 답변 정확도가 아니다.

## 검색 결과

Recall@3는 답이 있는 질문에서 정답 문서가 원시 벡터 검색 상위 3개에 포함된 수다. 기존 열은 실제 앱 검색 경로에 들어오는 test 316개 중 답이 있는 269개, 신규 열은 test 84개 중 답이 있는 72개다. 무근거 질문은 별도 답변 선택 점수에 포함된다.

| 모델·인덱스 | 기존 Recall@3 | 신규 Recall@3 |
|---|---:|---:|
| 실제 배포 Qwen q4, 100문서 | 261/269 | 15/72 |
| 같은 Qwen q4, 갱신한 192문서 | 251/269 | 72/72 |
| 기본 Gemma FP32, 192문서 | 209/269 | 70/72 |
| 선택된 Gemma LoRA epoch 1 FP32, 192문서 | 239/269 | 69/72 |

192문서는 언어별 문서 수다. Qwen의 72/72는 확장 문서를 넣은 비교 실험이며 현재 배포 수치가 아니다. 현행 인덱스에는 새 질문의 일부 근거 문서가 없다. 인덱스 확장은 새 질문을 개선하지만 기존 검색을 261→251건으로 낮추므로 그대로 배포하지 않았다. 문서 경쟁과 검색·라우팅을 함께 검증해야 한다.

현행 답변 임계값 0.43에서 기존 test 316개는 Qwen 배포 기준 정답 305·오답 10·미응답 1, 선택 Gemma는 정답 300·오답 12·미응답 4다. 같은 임계값은 모델별 점수 분포가 달라 공정한 교체 기준으로 단독 사용하지 않는다.

개발 검증에서만 ‘오답 0개, 정답 최대화, 동률이면 높은 임계값’으로 보정했다. 선택 Gemma 임계값은 0.8315876819699619, 동일 문서 Qwen은 0.756871509552002다. 신규 test 중 앱 검색 경로에 들어오는 40개에서 Qwen은 정답 17·오답 6·미응답 17, Gemma는 정답 10·오답 5·미응답 25다. 정답과 Recall@3 조건에서 실패했다. 개발 검증의 오답 0개 조건이 test의 오답 0개를 보장하지 않으며, 미응답 증가도 함께 봐야 한다.

Epoch 2는 기존 Recall@3 246/269, 신규 69/72지만 채택하지 않았다. 개발 검증 Recall@3가 epoch 1·2 모두 55/57로 같고, Recall@1은 50/57 대 49/57이므로 epoch 1을 선택했다. test 결과로 선택을 뒤집지 않는다. 여섯 모델의 고정·보정 점수와 28개 사실별 언어 일치율은 [scores.json](scores.json), 개별 질문의 한국어 번역과 검색 결과는 [predictions.jsonl](predictions.jsonl)에 있다.

## 질문 은행과 학습

새 질문은 81개 사실의 한국어·영어·중국어 번역 243개다. train 129·dev 30·test 84개를 모델 결과 확인 전에 동결했고, 기존 821개도 보존했다. test는 28개 사실이며 무근거 4개 사실·12개 질문을 포함한다. 공통 품질 워크플로에는 test 84개만 등록해 학습·개발 검증 질문이 회귀 점수에 섞이지 않게 했다. [질문 은행](../../../datasets/retrieval-v2/README.md)에 원문 지문, 대체 정답, 답변 가능 여부, 분할을 기록했다.

문서 주제 묶음으로 번역과 관련 원리를 같은 분할에 두었다. 해제 판정·저항 계산은 test, 생명력 흡수는 dev이며 양성·hard negative 모두 train 문서만 사용했다. 기존 train과 신규 답변 가능 train을 합친 1,331개를 학습하고, 기존 dev 36개와 신규 dev 30개로 선택했다. 기존 Qwen은 과거 문서를 이미 학습했으므로 이 주제 분할을 Qwen의 미학습 영역이라고 부르지 않는다. 질문은 프로젝트 문서에서 작성한 합성 사례이며 독립적인 사용자 질문 표본이 아니다. 번역 3개를 독립적인 지식 3개로 해석하지 않는다.

베이스는 `google/embeddinggemma-2@914f7f89142e33e77833254d9c9b90c3cef7303b`다. 이미지·음성 탑을 제외한 텍스트 모델은 271,002,648개 파라미터다. 공식 검색 프롬프트·mean pooling·768차원 정규화를 유지하고 attention q/k/v/o에 rank 8·alpha 16·dropout 0 LoRA 1,048,576개 파라미터를 학습했다. InfoNCE 온도 0.05, hard negative 3개 중 2개, batch 8, AdamW lr 0.0001, weight decay 0.01, 2 epoch·334 step이다. 학습 최대 256토큰, 평가 최대 512토큰, 문서는 앞 600글자를 사용했다.

T4 FP32 환경은 [training-environment.json](training-environment.json)에 고정했다. [공식 모델 카드](https://huggingface.co/google/embeddinggemma-2)의 FP16 제한에 따라 FP16을 사용하지 않았다. 학습 전후 효과는 native FP32끼리 비교하고 q4 결과를 별도로 측정했다. 기본 Gemma q4는 기존 205/269·신규 71/72다. q4와 native 벡터 1,640개의 cosine 중앙값은 0.9845230579, 1백분위는 0.9590111375, 최솟값은 0.91236853599였다. 학습 Gemma의 양자화 성능으로 해석할 수 없다.

학습 소스는 `a69c26262`이며 [evaluation-protocol.json](evaluation-protocol.json)에 모델 선택·임계값·교체 조건의 사전 동결을 기록했다. 실제 앱 하이브리드 검색과 Python 평가 결과의 일치를 6모델×1,064질문, 6,384건 확인했다. 최초 native NPZ에 입력 지문이 없어 원격 평가 스냅샷 일치를 확인하고 벡터 배열을 바꾸지 않은 채 메타데이터만 추가했다. [vector-provenance.json](vector-provenance.json)에 원본·변경 파일·벡터 배열 해시가 있다. 현재 러너는 처음부터 질문·문서·벡터 입력 지문을 검증한다.

## 체크포인트와 정리

학습 스텝 완료 후 60초 또는 40스텝마다 저장하고, 맥에서는 60초 간격으로 SHA256·크기·tar 경로를 검증해 최근 3개를 받았다. 선택 후보·평가 벡터·optimizer·RNG도 함께 보존한다. [resume-proof.json](resume-proof.json)은 80스텝에서 학습을 중단하고 원격 체크포인트와 후보를 삭제한 뒤 맥 백업으로 복구한 기록이다.

이후 실제 Colab 할당이 사라져 원인 추정 없이 새 T4를 할당하고 마지막 검증된 302스텝으로 복구했다. 재실행한 310스텝 loss는 종료 전후 모두 0.35808682441711426으로 정확히 같았다. [interruption.json](interruption.json), [training-progress.jsonl](training-progress.jsonl)에 남겼다. 최종 파일 검증 후 소유 GPU를 반환했고 수집기도 종료했다.

선택된 epoch-1 [당시 어댑터](https://github.com/seokh1213/cooldown/blob/9c5c07a84c8acb857a7c4bb0b1ddc0b5f53d7be8/research/llm-evals/workflow/reports/gemma-tuning-20261008/selected-adapter/adapter_config.json)는 저장소에 보존한다. 베이스 경로만 공개 저장소와 리비전으로 바꿨으며 텐서 바이트는 같다. 이미지·음성을 제외한 베이스를 먼저 로드해야 한다. 최종 334스텝 복구 체크포인트 37,686,532바이트와 동결 입력·평가 벡터 묶음 26,742,580바이트는 `~/.cache/cooldown-kev/gemma-adapters-20261008/`에 보존했다. [retention.json](retention.json)에 SHA256이 있다. 기본 모델·가상환경·중간 백업·임시 실행 폴더 네 곳은 삭제했다. 수집기와 실험 프로세스도 종료됐고 기존 사용자 Qwen 캐시의 SHA256은 그대로다. 공유 Chrome·Ollama는 유지했다. [cleanup.json](cleanup.json)에 기록했다.

## 재현

학습과 새 실험 준비는 [러너 절차](../../../../../scripts/llm/gemma-retrieval/README.md)를 따른다. 기존 평가를 재현할 때는 `prepare`로 현재 데이터로 덮어쓰지 않는다. 다음 명령은 보존한 벡터로 점수만 다시 계산하며 GPU나 모델 다운로드가 필요 없다.

```sh
mkdir -p research/.cache/gemma-replay
tar -xzf ~/.cache/cooldown-kev/gemma-adapters-20261008/evaluation-inputs.tar.gz -C research/.cache/gemma-replay
uv run --with numpy python scripts/llm/gemma-retrieval/evaluate.py research/.cache/gemma-replay research/.cache/gemma-replay-report
```

학습 상태 복구는 보존 디렉터리의 `RECOVERY.md`를 따른다. 최초 체크포인트에는 당시 코드 지문이 묶여 있으므로 `--resume --source-revision a69c26262`를 사용한다. 현재 소스와 환경을 임의로 섞어 재개하지 않는다. 기본 q4 CPU 비교는 맥에서 Colab 학습과 병렬 실행했으므로 소요 시간은 격리 측정이 아니며, 학습 모델의 브라우저 속도나 메모리를 입증하지 않는다.

## 후속 실험의 근거

다음 우선순위는 웨이트 교체보다 문서 확장 시 생기는 경쟁과 라우팅 누락을 해결하는 것이다. 새 heldout 전체 84개 중 실제 검색 경로에 들어오는 것은 40개뿐이다. 동일 문서 Qwen의 원시 Recall@3 72/72가 최종 답변 선택의 높은 정확도를 보장하지도 않는다. 이번 test는 이후 튜닝의 회귀 은행으로 취급하고, 새 선택 실험에는 별도 평가 질문을 동결해야 한다.

## 공통 회귀 기준 확장

전체 워크플로는 5,893건을 측정했고 실행·타입·문맥 등 12개 검증을 통과했다. 기존 5,809건은 소요 시간까지 모든 결과 필드를 그대로 보존했고 회귀 0건이다. 새 test 84개만 기준에 추가했다. 새 lexical 검색은 38개 통과·46개 실패이며, 미해결 사례로 기록했다. 전체 자동 실패 77개와 수동 검수 20개도 승인된 품질로 바꾸지 않았다. 임베딩 비교와 lexical 검색 점수는 별개다. [baseline-extension.json](baseline-extension.json)에 이전·확장 기준 해시와 신규 실패 목록이 있다.

Node 회귀 963개, Python 92개, 실제 앱 하이브리드 검색 일치 6,384건을 확인했다. 보존한 입력 묶음을 새 폴더에 풀어 점수를 재계산해 scores.json이 정확히 같고 6,384건의 검색 일치도 다시 통과했다. [validation.json](validation.json), [preservation-replay.json](preservation-replay.json)에 기록했다.
