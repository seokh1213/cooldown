# Numeric span selection pilot, 2026-10-07

Decision: keep the existing Qwen QA weights. None of the four CPU candidates improves accuracy on the frozen comparison set.

## Method

Train 415 examples, calibrate on 110 development examples, then evaluate 212 held-out examples. Document and context-document identifiers are disjoint across these splits; the runner asserts this. Six conflicting-source examples are excluded from the 206-example clean comparison. The app comparison uses the same 132 supported, non-conflicting question IDs and frozen evidence for every candidate and both archived Qwen variants.

Candidates select complete numeric spans, including units, ranges and composite durations. Features use only the question and evidence: character n-grams, local sentence overlap, unit interactions and position. No answer, champion-specific exception or evaluation verdict enters inference. The 55-character local window is an exploratory feature setting, not an adopted production constant.

Four variants: lexical overlap; balanced pointwise logistic selection; pointwise selection with development-calibrated refusal; pairwise good-span/distractor logistic selection with development-calibrated refusal. There are 16,825 learned features, 1,991 training candidates and 2,778 paired contrasts. Thresholds/margins are selected on development data only. The chosen pointwise threshold is 0.2, pairwise threshold 0.95; both selected margins are 0.

## Results, exact answer equality

| Candidate | Clean supplied evidence, /206 | Frozen app evidence, /132 |
| --- | ---: | ---: |
| Lexical overlap | 80 | 49 |
| Pointwise logistic | 77 | 42 |
| Calibrated pointwise | 84 | 20 |
| Calibrated pairwise | 92 | 26 |
| Archived trained Qwen, same IDs/scorer | 171 | 92 |

The archived untrained Qwen scores 113/206 and 67/132. These are re-counts of existing answer artifacts on the exact paired subsets, not a fresh model run or current 26.20 website accuracy. The 92/132 count is not a 92% score.

Provided evidence contains the gold span for all 154 clean answerable examples. Only 112/132 frozen app examples contain the exact gold span. Selection is therefore a major limitation even when retrieval contains the value. Refusal improves unanswerable decisions (50/52 for both calibrated variants) but discards too many valid answers; this does not justify adoption. Pairwise selection wrongly accepts 28/70 supplied-evidence answers and 20/46 app answers.

Next useful direction would need labels tying a value to its effect, target and condition, rather than choosing from nearby numeric strings alone. This experiment does not establish that another large-model training run would help.

## Artifacts and reproduction

`summary.json` contains input SHA-256 hashes, counts and paired Qwen results. `answers.jsonl` contains every candidate prediction. Input training/evidence and historical browser answers remain in the preserved local training cache, not a fabricated current-patch replacement.

```sh
uv run --python 3.13 --with numpy==2.5.3 --with scipy==1.18.1 --with scikit-learn==1.9.1 python scripts/llm/tuning/experiment_span_ranker.py
python3 -m unittest discover -s scripts/llm/tuning -p test_span_candidates.py
```

No production graph, LoRA adapter or QA weight changed. These small classifiers ran on the Mac CPU; no Colab session or GPU training checkpoint was needed.
