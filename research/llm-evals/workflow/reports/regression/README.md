# Advisor regression and quality measurements

Profile: regression. Promotion: **needs-matched-baseline**.

Automatic contracts are separate from semantic review. Historical answers are never gold.

| Suite / mode | Pass / measured | Manual |
|---|---:|---:|
| dialogue-coverage/questions / none | 42/43 | 0 |
| dialogue-coverage/edge-questions / none | 30/30 | 0 |
| request-contract/questions / none | 41/41 | 0 |
| conversational-advisor/questions / none | 61/74 | 0 |
| crowd-control/questions / none | 60/60 | 0 |
| control-audit/questions / none | 115/115 | 0 |
| champion-mechanics-v2/questions / none | 33/34 | 17 |
| champion-mechanics-v2/full-approval-questions / none | 10/18 | 0 |
| champion-mechanics-v2/integrated-fresh-questions / none | 17/17 | 0 |
| champion-mechanics-v2/pyke-akshan-questions / none | 30/32 | 0 |
| champion-mechanics-v2/variations-v1-questions / none | 54/55 | 4 |
| atoms/action-conditions/questions / none | 51/52 | 0 |
| atoms/action-conditions/holdout / none | 17/18 | 0 |
| atoms/answer-quality/questions / none | 11/20 | 0 |
| atoms/broad-replay/questions / none | 65/84 | 0 |
| atoms/conditional-fiora/questions / none | 0/0 | 18 |
| atoms/conditional-fiora/holdout / none | 0/0 | 11 |
| atoms/context-replay/questions / none | 0/0 | 20 |
| stat-conversation / none | 18/36 | 0 |
| stat-boundary / none | 16/16 | 0 |
| passive-rag / none | 0/0 | 30 |
| mechanic-schema / none | 11/38 | 0 |
| request-flow / none | 26/33 | 0 |
| request-flow-holdout / none | 7/18 | 0 |
| stat-single / none | 94/195 | 0 |
| legacy-dialogue-270 / none | 148/270 | 0 |
| legacy-route-374 / none | 0/374 | 0 |
| legacy-act-60 / none | 114/120 | 0 |
| legacy-lookup-39 / none | 70/78 | 0 |
| retired-route-60 / none | 0/60 | 0 |
| retired-matchup-4 / none | 0/0 | 10 |
| video-tips / none | 191/191 | 0 |
| dialogue-coverage/questions / offline | 42/43 | 0 |
| dialogue-coverage/edge-questions / offline | 30/30 | 0 |
| request-contract/questions / offline | 41/41 | 0 |
| conversational-advisor/questions / offline | 63/74 | 0 |
| crowd-control/questions / offline | 60/60 | 0 |
| control-audit/questions / offline | 115/115 | 0 |
| champion-mechanics-v2/questions / offline | 33/34 | 17 |
| champion-mechanics-v2/full-approval-questions / offline | 10/18 | 0 |
| champion-mechanics-v2/integrated-fresh-questions / offline | 17/17 | 0 |
| champion-mechanics-v2/pyke-akshan-questions / offline | 30/32 | 0 |
| champion-mechanics-v2/variations-v1-questions / offline | 54/55 | 4 |
| atoms/action-conditions/questions / offline | 51/52 | 0 |
| atoms/action-conditions/holdout / offline | 17/18 | 0 |
| atoms/answer-quality/questions / offline | 11/20 | 0 |
| atoms/broad-replay/questions / offline | 65/84 | 0 |
| atoms/conditional-fiora/questions / offline | 0/0 | 18 |
| atoms/conditional-fiora/holdout / offline | 0/0 | 11 |
| atoms/context-replay/questions / offline | 0/0 | 20 |
| stat-conversation / offline | 19/36 | 0 |
| stat-boundary / offline | 16/16 | 0 |
| passive-rag / offline | 0/0 | 30 |
| mechanic-schema / offline | 11/38 | 0 |
| request-flow / offline | 27/33 | 0 |
| request-flow-holdout / offline | 10/18 | 0 |
| stat-single / offline | 92/195 | 0 |
| legacy-dialogue-270 / offline | 200/270 | 0 |
| legacy-route-374 / offline | 315/374 | 0 |
| legacy-act-60 / offline | 114/120 | 0 |
| legacy-lookup-39 / offline | 70/78 | 0 |
| retired-route-60 / offline | 55/60 | 0 |
| retired-matchup-4 / offline | 0/0 | 10 |
| video-tips / offline | 191/191 | 0 |
| request-scope / fast-scope | 240/292 | 0 |
| retrieval / lexical | 448/720 | 0 |
| item-alias / lexical | 1/1 | 0 |
| item-alias / offline-item | 257/299 | 0 |

Accepted wrong numeric answers: 0.
Infrastructure checks: 6/6.
A matched baseline is required before deciding a model change.

Detailed rows: results.json. Semantic review: review-packet.json. Failed checks: logs/.

Baseline provenance: complete `push-regression-final` after integrating origin/master d852a92b9. Current data fingerprints differ from c4189e502; every measured verdict and answer is unchanged. 4,036 automatic contracts pass, 1,519 historical contracts fail, 220 manual measurements. Related Node tests: 804. This baseline preserves pending failures and does not approve their semantic quality.
