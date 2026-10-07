# Local patch 26.20 and automatic regression, 2026-10-07

This work is local on `work/patch-review-context-experiments`; it has not changed master or the deployed site.

## Patch migration

Current sources: Data Dragon 16.20.1 and CommunityDragon 16.20. Local static data, cards in three languages, knowledge bundles, mechanics, images and patch history were rebuilt for 26.20. The official [26.20 patch notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes/) were checked alongside source differences. The generated patch viewer is a mapped numeric diff, not a complete substitute for Riot's notes; unmapped source changes remain marked for review.

865 champion ability jobs were compared by semantic content. 849 drafts/reviews were reused; 16 changed slots were updated and reviewed by the coding agent, then all 865 drafts passed validation and were exported with 0 pending reviews. These counts describe structured rule validation and recorded agent review, not independent human/in-game verification. Current pointer: `research/champion-mechanics/26.20-v1`.

Exact full-tooltip hashes now protect cross-patch CC reuse, including numeric changes. Legacy numeric-insensitive hashes are accepted only within their original patch. Metadata such as form icon versions does not invalidate otherwise identical rules. Reviewed mechanics can be reused across patches only when prompt/semantic content match and the draft validates against current source inputs. Changed rules are excluded until reviewed.

Twelve combo guides had 13 changed skill bodies. Full old/new hashes, text differences, retained combo reasoning and explicit agent review are in `combo-review.json`. All 865 CC entries were fingerprinted; 852 exact bodies were reused and 13 changed bodies reviewed for the stored CC classifications (`crowd-control-review.json`). The video-note patch gate previously removed 44 unchanged notes; all referenced English skill bodies/summaries and relevant official patch changes were checked before advancing that collection (`video-notes-review.json`). Source evidence dates remain historical.

## Cached matchup migration

All 7,262 existing cached-pair hashes were stale under current master material generation even before this patch. A one-time migration compared each old/new generation material using identical current code. All 7,262 complete generation materials match, so all pairs were retained with current material hashes. Future ordinary carry continues to require exact stored material hashes; it does not silently repeat this legacy migration.

A separate diagnostic compares complete Korean skill text/summary/effects/CC and actual champion stat values, excluding relative percentile/grade fields. It finds 5,910 unchanged full-fact pairs and 1,352 differences outside the actual cached-answer generation input. Requiring that additional equality dropped two existing passing answer contracts without changing the cached generation material, so that extra cache dependency was not adopted. The old prose is not newly certified semantic gold; the ten historical matchup questions remain pending human review. `matchup-carry-review.json` records every stored/before/after hash and both equality checks.

## Patch-independent evaluation seeds

Ninety-eight apparent regressions came from context fixtures fixed to patch 26.19. They supply reference-only champion/skill/stat state, while production correctly rejects old-patch user history. The evaluator now binds only these fact-free seed references to its current data patch. Seeds with answers, calculation conditions, mechanic state, context frames or unrecognised fields retain their original patch. Questions, expected answers, IDs and scorer remain unchanged; production user history is not migrated by this helper. Archived mechanic-schema examples retain their own two-card 26.19 source fixture outside public deployment data.

## Automatic workflow

Hourly upstream detection already exists. The new source-update workflow measures the complete current advisor regression before data generation, rebuilds changed data/cards/knowledge, checks combo and mechanics drift, then remeasures and compares after the patch. Code, model, cases and scorer must be identical between this before/after pair; only game/knowledge data may differ. Lost passing rows or passing subchecks stop deployment. Answer text changes are recorded separately and are not automatically considered semantically correct.

Combo review inputs and patch before/after reports are retained as CI artifacts for 14 days, including failures. Successful patch regression also generates a standalone pending-review HTML artifact. The 31 scope-label failures and 10 historical matchup questions retain their manual status. The current patch was tested locally; the edited GitHub Actions workflow itself has not yet run on GitHub.

This removes full manual reruns each patch, not review of actual changed/ambiguous knowledge. A source change or an uncertain matchup can still require a decision. No PR was opened. The trained QA weights and default `guarded:32` bounded context list remain unchanged.

## Final verification

The full 5,809-measurement local regression has 5,758 passes, 31 existing request-scope classifier failures and 20 historical manual measurements, with all 12 infrastructure checks passing and 0 accepted wrong numeric answers. Compared with the historical 26.19 reference, no passing row or passing subcheck was lost. Case/scorer hashes and question/gold contracts are unchanged. This comparison changes code and data, so it is a contract diagnostic, not a controlled model-quality gain. The local canonical reference was refreshed only after those checks; the previous reference remains in Git at `6c0d126eec8783ae009b23286da8f928596d7fff` with its SHA-256 recorded in `contract-diagnostic.json`.

Eighteen answer texts differ: 16 only change the visible version suffix; the other two are none/offline copies of a Chinese Khazix skill summary following current source wording. That source no longer states the +200 evolution range. The source-summary changes were reviewed by the coding agent; they are not independent in-game measurements.

Node unit/data tests passed 1,411/1,411, followed by the two new fixture-seed tests and the final full regression's Node suite. The complete production browser suite passed 199/199. After final cache restoration, production was rebuilt and all 72 advisor/PWA-update browser tests passed again. Types, lint, source audit and the standalone review HTML's 12 Chrome checks passed. The review HTML remains 0/41 human verdicts and has a separate [delivery gate](delivery-gate.md).

[Numeric extraction](../span-ranker-20261007/README.md) and [context selection](../context-selector-20261007/README.md) experiments did not justify changing the deployed weights or default policy. The final guarded/residual offline context pair passes 250/250 and preserves 788 stress successes, 14 numeric requirements and four required evicted-frame clarifications. The full browser-model 250-turn comparisons use the separately recorded earlier snapshot.

This local branch is ready for owner review. Master, remote CI and the deployed site were not changed by this work. Completion cleanup removes only owned evaluation servers/browser caches and preserves training checkpoints/adapters and experiment evidence.
