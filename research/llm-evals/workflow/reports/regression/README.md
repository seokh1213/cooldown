# Advisor regression and quality measurements

Profile: regression. Promotion: **needs-review**.

Automatic contracts are separate from semantic review. Historical answers are never gold.

| Suite / mode | Pass / measured | Manual |
|---|---:|---:|
| dialogue-coverage/questions / none | 42/43 | 0 |
| dialogue-coverage/edge-questions / none | 30/30 | 0 |
| request-contract/questions / none | 41/41 | 0 |
| conversational-advisor/questions / none | 66/74 | 0 |
| crowd-control/questions / none | 60/60 | 0 |
| control-audit/questions / none | 115/115 | 0 |
| champion-mechanics-v2/questions / none | 50/51 | 0 |
| champion-mechanics-v2/full-approval-questions / none | 13/18 | 0 |
| champion-mechanics-v2/integrated-fresh-questions / none | 17/17 | 0 |
| champion-mechanics-v2/pyke-akshan-questions / none | 31/32 | 0 |
| champion-mechanics-v2/variations-v1-questions / none | 55/59 | 0 |
| atoms/action-conditions/questions / none | 51/52 | 0 |
| atoms/action-conditions/holdout / none | 17/18 | 0 |
| atoms/answer-quality/questions / none | 11/20 | 0 |
| atoms/broad-replay/questions / none | 65/84 | 0 |
| atoms/conditional-fiora/questions / none | 18/18 | 0 |
| atoms/conditional-fiora/holdout / none | 11/11 | 0 |
| atoms/context-replay/questions / none | 20/20 | 0 |
| stat-conversation / none | 31/36 | 0 |
| stat-boundary / none | 16/16 | 0 |
| passive-rag / none | 27/30 | 0 |
| mechanic-schema / none | 30/38 | 0 |
| request-flow / none | 30/33 | 0 |
| request-flow-holdout / none | 12/18 | 0 |
| stat-single / none | 155/195 | 0 |
| legacy-dialogue-270 / none | 149/270 | 0 |
| legacy-route-374 / none | 146/374 | 0 |
| legacy-act-60 / none | 116/120 | 0 |
| legacy-lookup-39 / none | 70/78 | 0 |
| retired-route-60 / none | 38/60 | 0 |
| retired-matchup-4 / none | 0/0 | 10 |
| video-tips / none | 191/191 | 0 |
| dialogue-coverage/questions / offline | 42/43 | 0 |
| dialogue-coverage/edge-questions / offline | 30/30 | 0 |
| request-contract/questions / offline | 41/41 | 0 |
| conversational-advisor/questions / offline | 68/74 | 0 |
| crowd-control/questions / offline | 60/60 | 0 |
| control-audit/questions / offline | 115/115 | 0 |
| champion-mechanics-v2/questions / offline | 50/51 | 0 |
| champion-mechanics-v2/full-approval-questions / offline | 13/18 | 0 |
| champion-mechanics-v2/integrated-fresh-questions / offline | 17/17 | 0 |
| champion-mechanics-v2/pyke-akshan-questions / offline | 31/32 | 0 |
| champion-mechanics-v2/variations-v1-questions / offline | 55/59 | 0 |
| atoms/action-conditions/questions / offline | 51/52 | 0 |
| atoms/action-conditions/holdout / offline | 17/18 | 0 |
| atoms/answer-quality/questions / offline | 11/20 | 0 |
| atoms/broad-replay/questions / offline | 65/84 | 0 |
| atoms/conditional-fiora/questions / offline | 18/18 | 0 |
| atoms/conditional-fiora/holdout / offline | 11/11 | 0 |
| atoms/context-replay/questions / offline | 20/20 | 0 |
| stat-conversation / offline | 31/36 | 0 |
| stat-boundary / offline | 16/16 | 0 |
| passive-rag / offline | 27/30 | 0 |
| mechanic-schema / offline | 30/38 | 0 |
| request-flow / offline | 31/33 | 0 |
| request-flow-holdout / offline | 14/18 | 0 |
| stat-single / offline | 153/195 | 0 |
| legacy-dialogue-270 / offline | 202/270 | 0 |
| legacy-route-374 / offline | 315/374 | 0 |
| legacy-act-60 / offline | 116/120 | 0 |
| legacy-lookup-39 / offline | 70/78 | 0 |
| retired-route-60 / offline | 55/60 | 0 |
| retired-matchup-4 / offline | 0/0 | 10 |
| video-tips / offline | 191/191 | 0 |
| request-scope / fast-scope | 261/292 | 0 |
| retrieval / lexical | 448/720 | 0 |
| item-alias / lexical | 1/1 | 0 |
| item-alias / offline-item | 261/299 | 0 |

Accepted wrong numeric answers: 0.
Infrastructure checks: 6/6.
Gains: 220. Regressions: 0.

Detailed rows: results.json. Semantic review: review-packet.json. Failed checks: logs/.

Baseline provenance: completed 5,775 measurements after repair on master ed084e3f4. Same revised gold/scorers: 4,440 → 4,660 passes, 220 gains, no regressions. The explicitly allowed data changes are the two request-v1 classifier artifacts. 1,095 failed contracts and 20 historical semantic measurements remain unresolved; this baseline prevents new regressions and is not full quality approval. See ../repair-2026-10-06/README.md.
