# Context selector experiments, 2026-10-07

Decision: keep the deployed `guarded:32` policy. It stores a bounded list with LRU deduplication, not a push/pop stack. Neither new candidate improves measured correctness.

## New ideas and matched browser results

The deduplicated-training candidate passes synthetic candidate frames through production `recordFrame` before training. This removes artificial duplicate keys and matches the actual 32-frame candidate list. The logistic selector uses 19,378 training pairs from 107 independent query templates and 3,804 development pairs from 21 templates. Development exact selection is 61.3757%, with C=1, confidence=0.4 and margin=0.2. These are synthetic examples, not real user feedback. The experimental model is 339,828 bytes and is not loaded by production.

The guarded-residual candidate uses this learned selector while retaining existing ambiguity, evicted-context and explicit-owner decisions. It also retains a guarded resume when the learned selector disagrees. This is a general decision rule, without case IDs or champion-specific exceptions.

All four variants ran through the real Chrome WebGPU QA worker on the same 250-turn bank, scorer, application source, game data and QA graph. Each run's source/data/graph checks passed and worker errors were empty. The data fingerprint includes the selector model, so differing selector files intentionally produce differing overall data hashes. Comparing the recorded input manifests confirms that the non-selector inputs match exactly.

| Variant | Passing turns /250 | p95 seconds |
| --- | ---: | ---: |
| Existing guarded list | 250 | 4.808 |
| Existing learned selector | 249 | 4.745 |
| New deduplicated training | 249 | 4.807 |
| New guarded-residual selector | 250 | 4.759 |

Both pure learned selectors miss `context-pyke-return:2`, “아까 패시브에서 체력 140이면?”. They keep the current context rather than resume the earlier passive calculation, returning “회복 · 추가 공격력 800%” instead of the required “추가 공격력 10”. The residual candidate recovers that existing guarded success. Matching 250/250 adds no demonstrated benefit over the current policy; these single sequential runs do not establish a speed improvement. Correctness here means these fixed contracts, not general chatbot accuracy.

## Final data snapshot and overflow verification

After correcting evaluation-only patch seeds and completing the cached-pair migration, guarded and residual policies were remeasured on identical final inputs in offline mode. Both pass 250/250 expanded turns. Both preserve all 788 previously approved stress successes, all 14 numeric-text requirements and the four required clarifications after the referred frame has been evicted at 33 distinct contexts. The raw stress scorer is 788/792 for each, because those four original resume checks intentionally remain false; the separate safety approval requires clarification rather than a guessed answer. There are 20 clarifications overall, including ordinary ambiguous queries.

These final 792-turn stress measurements are offline, not full GPU reruns. An incomplete duplicate model-stress attempt was stopped and is not promotion evidence. The earlier matched WebGPU snapshot and the final offline snapshot are recorded separately, without pooling their scores.

`summary.json` records report/model hashes, per-run checks, worker calls, failed rows and training selection. `webgpu-paired.jsonl` preserves all 250 questions and four answers/checks/decisions; `final-offline-paired.jsonl` preserves the final paired answers. The input manifests record the earlier browser snapshot and final snapshot. Full local execution reports remain under the recorded `research/.cache/context-frames/20261007/` paths. No production model, context capacity or routing default changed.

## Reproduction

```sh
npx tsx scripts/llm/context-frames/build-dedup-training.ts
uv run --python 3.13 --with numpy==2.5.3 --with scipy==1.18.1 --with scikit-learn==1.9.1 python scripts/llm/context-frames/train.py --cache research/.cache/context-frames/20261007/dedup-training --out research/llm-evals/workflow/models/context-selector-dedup.json
npm run llm:test:contexts -- --mode model --split all --configs guarded:32,learned:32 --rank-model research/llm-evals/workflow/models/context-selector-dedup.json --rank-policy guarded-residual --out research/.cache/context-selector-recheck
npm run llm:test:contexts -- --bank stress --split all --configs guarded:32,learned:32 --rank-model research/llm-evals/workflow/models/context-selector-dedup.json --rank-policy guarded-residual --out research/.cache/context-selector-stress-recheck
```

Use a new output folder and remeasure both variants on the same snapshot after changing sources. Historical hashes must not be relabelled as a current run. A stronger next experiment would need held-out, owner-labelled context transitions or a task memory representation that preserves calculation conditions, rather than more synthetic frame-kind labels.
