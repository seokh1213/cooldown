# Semantic repair wave 6

Resolved 29 source-review findings across all 15 Akshan, Pyke, and Mordekaiser candidates.

Validation: all 15 candidates pass `check.ts`. The JSON report records source evidence and canonical candidate hashes for every finding and candidate.

| Champion | Slots | Findings |
|---|---|---:|
| Akshan | P, Q, W, E, R | 14 |
| Pyke | P, Q, W, E, R | 7 |
| Mordekaiser | P, Q, W, E, R | 8 |

The Akshan.P cancellation formula retains the base movement-speed unit multiplied by (1 + caster bonus attack speed), with the cancellation predicate intact. Pyke.P retains the caster bonus-health to bonus-attack-damage 14:1 conversion with input replacement; the revised gap records the English/Korean wording difference without converting base health.

Text conditions and unresolved gaps remain where the schema cannot express the source relation or the tooltip omits a formula, timing, or range.

## Final source-review corrections

Applied six final corrections with source verification: corrected Akshan.W damage subject and removed duplicate duration; separated Akshan.R minimum damage from its maximum cap and preserved critical effectiveness without a global multiplier; aligned Pyke.R summary with its strict greater-than condition; and kept Mordekaiser.P percent metadata and Mordekaiser.W reduction as text/gaps where frozen numeric units do not support executable coefficients. Existing Mordekaiser passive damage and shield rules remain intact. The repair JSON records canonical parsed-candidate hashes.
