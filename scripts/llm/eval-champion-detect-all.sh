#!/bin/bash
# 챔피언 찾기 세 세트를 한 번에 잰다: 큰 정답 세트, 별명 위주 세트, 헛잡음 점검용 아이템 설명.
#   bash scripts/llm/eval-champion-detect-all.sh <세트 디렉터리> [--names <champion-names.json>]
DIR="$1"
shift
for f in route-large route-train-v2 items-corpus; do
  npx tsx scripts/llm/eval-champion-detect.ts "$DIR/$f.json" "$@" 2>&1 | grep -v "npm notice" | tail -4
done
