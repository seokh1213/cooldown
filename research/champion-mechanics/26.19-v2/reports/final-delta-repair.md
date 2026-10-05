# Final candidate delta repair

Applied exactly two requested JSON corrections.

| Candidate | Change | Canonical hash before | Canonical hash after |
|---|---|---|---|
| Graves.P | Replaced the unrelated two-shell hit-count threshold with a named multiple-bullets text condition; revised the matching gap and removed unrelated evidence. | `2de7d345e9a60645f813a7fb4675dc273bf2f5c649ba8b043ec6dc1e363498f6` | `2b52cf085a4a53a2cf033533dbedde98eae3f888bf12f744d3dc8457132da0de` |
| Nami.E | Made “next 3 attacks and abilities for 6 seconds” explicit in the summary and empowered-mark text. Typed count and duration refs are unchanged. | `f7f1ea737f5905380259ba558b528dc721a08ce6f7f8e6f02c9ed27a1f05819f` | `a69617073d3991172d2bfb7e34a5a5b7d66678f194524503b9883eb72d7aea5b` |

Graves source: “Non-champions struck by multiple bullets are Knocked Back.” The source’s two shells describe reload capacity, not the knockback threshold. Nami source: “Nami empowers an allied champion's next 3 Attacks and Abilities for 6 seconds.”

Validation: all 2 candidates pass `check.ts`.
