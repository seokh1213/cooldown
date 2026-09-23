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

route-v1: 학습 `route-train.jsonl`(851건, 평가 챔피언·이름은 뺀 합성 — advisor-qwen35-eval 워크트리의
`build-route-train.ts`), dev 89/90 으로 골라 시험 60문항 55/60. 브라우저(WebGPU, 끊어 넣기)에서 다시 재도
55/60 이었다(`scripts/llm/eval-judge-browser.ts`). 시드에 따라 54~57.
