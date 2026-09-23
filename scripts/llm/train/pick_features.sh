#!/bin/bash
# 원자 선별 헤드 특징(학습·dev·평가). 출력 디렉터리를 받는다.
#   bash scripts/llm/train/pick_features.sh <출력 디렉터리>
set -e
OUT="$1"
A=research/llm-evals/atoms
mkdir -p "$OUT"
run() {
  uv run --python 3.13 --with onnxruntime --with tokenizers --with huggingface_hub --with numpy \
    python scripts/llm/train/features_chunked.py "$1" "$OUT/$2.npy" > "$OUT/$2.log" 2>&1
  echo "특징 $2 완료"
}
run "$A/pick-dev-split.jsonl" pick_dev
run "$A/pick-train-split.jsonl" pick_train
run "$A/pick-eval.jsonl" pick_test
