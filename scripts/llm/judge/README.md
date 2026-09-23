# 판정 헤드 학습

0.8B(`onnx-community/Qwen3.5-0.8B-Text-ONNX`, q4)의 판정 위치 logits 2048개 위에
kev(jaredpalmer/kev) 의 PointerHead 만 학습한다. 모델 가중치는 건드리지 않는다.
앱 쪽 계산은 `src/lib/advisor/judge.ts`, 워커 쪽 특징 추출은 `advisor.worker.ts` 의 `judge`.

```bash
# 1. 특징 (CPU, 학습 851건에 약 7분). 입력은 kev 요청 꼴 JSONL — 질문마다 label
uv run --python 3.13 --with onnxruntime --with tokenizers --with huggingface_hub --with numpy \
  python features.py train.jsonl featL_train.npy        # dev·test 도 같게
# 2. 헤드 (dev 점수로 고른다. test 는 고른 뒤 한 번만 본다)
SEED=1 FEAT=featL OUT=head.pt uv run --python 3.13 --with torch --with numpy python train_head.py 1e-4
# 3. 내보내기 → public/models/judge/<name>.json · .bin
uv run --python 3.13 --with torch --with numpy python export_head.py head.pt ../../../public/models/judge/route-v1 meta.json
```

route-v2 (앱이 쓰는 것): 학습 `route-train.jsonl` 851건 + `route-train-v2.jsonl` 598건, dev 90 으로 골라(87/90)
큰 세트 `route-large` 374문항에서 판정기만 302, 앱 보정(이름 하나면 matchup→guide, 영어·중국어 시점 문형)
포함 322(한국어 103/124 · 영어 113/125 · 중국어 106/125). 같은 세트에서 4B 생성 310, kev LoRA 329, 0.8B 생성 183.

route-v1 (걷어냄): 학습 `route-train.jsonl`(851건, 평가 챔피언·이름은 뺀 합성 — advisor-qwen35-eval 워크트리의
`build-route-train.ts`), dev 89/90 으로 골라 시험 60문항 55/60. 브라우저(WebGPU, 끊어 넣기)에서 다시 재도
55/60 이었다(`scripts/llm/eval-judge-browser.ts`). 시드에 따라 54~57. 큰 세트에서는 앱 보정 포함 294.

## topic-v1 — 주제·관점

질문이 어느 갈래(콤보·라인전·한타·운영·아이템·진입 타이밍·스킬·일반)를 묻는지, 챔피언이 하나면
내가 그 챔피언인지 상대하는지를 가른다. `noteSelect` 의 한국어 낱말 표를 대신한다.

```bash
npx tsx scripts/llm/build-topic-train.ts --n 2000 --out topic-train.jsonl   # 합성, 시험 챔피언 19명 제외
npx tsx scripts/llm/build-topic-train.ts --test topic-test.jsonl             # 손으로 쓴 72문항(세 언어 24씩)
# 학습 자료 앞 1800 을 train, 뒤 200 을 dev 로 나눠 위와 같이 features → train_head → export
```

질문 꼴은 `src/lib/advisor/topicJudge.ts`. 낱말 표 기준선(시험 72문항): 주제 한국어 19/24 · 영어 3/24 ·
중국어 3/24, 관점 한국어 16/23 · 영어 7/23 · 중국어 6/23.
