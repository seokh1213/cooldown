#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT/research/translation-runs/$(date -u +%F)}"
PROGRESS="$RUN_DIR/progress.log"
STATUS="$RUN_DIR/status.log"
LOCK_DIR="$RUN_DIR/worker.lock"
cd "$ROOT"
export TRANSLATION_RUN_LOG="$RUN_DIR/token-usage.jsonl"
export CODEX_MODEL=gpt-6-luna
RUN_STATE=running
MATCHUP_CONCURRENCY="${MATCHUP_CONCURRENCY:-4}"

if [[ ! "$MATCHUP_CONCURRENCY" =~ ^[1-8]$ ]]; then
  printf 'MATCHUP_CONCURRENCY must be an integer from 1 to 8\n' >&2
  exit 2
fi
mkdir -p "$RUN_DIR"

clear_lock() {
  node -e 'const fs=require("node:fs");const path=process.argv[1];if(fs.existsSync(path+"/pid"))fs.unlinkSync(path+"/pid");if(fs.existsSync(path))fs.rmdirSync(path)' "$LOCK_DIR"
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  owner="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  owner_command=""
  if [[ "$owner" =~ ^[0-9]+$ ]] && kill -0 "$owner" 2>/dev/null; then
    owner_command="$(ps -p "$owner" -o command= 2>/dev/null || true)"
  fi
  if [[ "$owner_command" == *run-translation-background.sh* ]]; then
    printf '%s another worker is active pid=%s\n' "$(date -u +%FT%TZ)" "$owner" >> "$STATUS"
    exit 1
  fi
  clear_lock
  mkdir "$LOCK_DIR"
fi
printf '%s\n' "$$" > "$LOCK_DIR/pid"
printf '%s state=running pid=%s\n' "$(date -u +%FT%TZ)" "$$" >> "$STATUS"

finish() {
  local code=$?
  local state=$RUN_STATE
  if (( code != 0 )); then state=failed; fi
  printf '%s state=%s exit=%s\n' "$(date -u +%FT%TZ)" "$state" "$code" >> "$STATUS"
  if [[ "$(cat "$LOCK_DIR/pid" 2>/dev/null || true)" == "$$" ]]; then clear_lock; fi
  exit "$code"
}
trap finish EXIT

mkdir -p "$RUN_DIR/seed" "$RUN_DIR/candidates"
for lang in en_US zh_CN; do
  if [[ ! -d "$RUN_DIR/seed/$lang" ]]; then
    mkdir -p "$RUN_DIR/seed/$lang"
    if [[ -d "$ROOT/knowledge/matchup-translations/$lang" ]]; then
      cp -R "$ROOT/knowledge/matchup-translations/$lang/." "$RUN_DIR/seed/$lang/"
    fi
  fi
  if [[ ! -d "$RUN_DIR/candidates/$lang" ]]; then
    mkdir -p "$RUN_DIR/candidates/$lang"
    cp -R "$RUN_DIR/seed/$lang/." "$RUN_DIR/candidates/$lang/"
  fi
done
if [[ ! -d "$RUN_DIR/seed/atoms" ]]; then
  cp -R "$ROOT/knowledge/atoms" "$RUN_DIR/seed/atoms"
fi
if [[ ! -d "$RUN_DIR/candidates/atoms" ]]; then
  cp -R "$RUN_DIR/seed/atoms" "$RUN_DIR/candidates/atoms"
fi
mkdir -p "$RUN_DIR/seed/note-translations" "$RUN_DIR/candidates/note-translations"
for lang in en_US zh_CN; do
  note="$ROOT/knowledge/note-translations/$lang.json"
  if [[ ! -f "$RUN_DIR/seed/note-translations/$lang.json" && -f "$note" ]]; then
    cp "$note" "$RUN_DIR/seed/note-translations/$lang.json"
  fi
  if [[ ! -f "$RUN_DIR/candidates/note-translations/$lang.json" && -f "$RUN_DIR/seed/note-translations/$lang.json" ]]; then
    cp "$RUN_DIR/seed/note-translations/$lang.json" "$RUN_DIR/candidates/note-translations/$lang.json"
  fi
done

step() {
  printf '%s start' "$(date -u +%FT%TZ)" >> "$STATUS"
  printf ' %q' "$@" >> "$STATUS"
  printf '\n' >> "$STATUS"
  "$@" >> "$PROGRESS" 2>&1
}

for lang in en_US zh_CN; do
  step npx tsx scripts/llm/translate-matchups.ts --lang "$lang" --model gpt-6-luna --checker none --batch 8 --concurrency "$MATCHUP_CONCURRENCY" --emit-every 0 --store "$RUN_DIR/candidates/$lang" --run-log "$TRANSLATION_RUN_LOG"
done

for lang in en_US zh_CN; do
  step npx tsx scripts/llm/translate-atoms.ts --lang "$lang" --model gpt-6-luna --checker none --concurrency 1 --champions all --store "$RUN_DIR/candidates/atoms"
done

for lang in en_US zh_CN; do
  step npx tsx scripts/llm/polish-note-translations.ts --lang "$lang" --checker none --concurrency 1 --atoms "$RUN_DIR/candidates/atoms" --store "$RUN_DIR/candidates/note-translations/$lang.json"
done
RUN_STATE=waiting_review
