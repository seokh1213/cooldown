# Semantic repair wave 3

Reviewed and resolved 25 findings from `semantic-review-wave3.json` across 15 Darius, Draven, and Caitlyn candidates. Five follow-up corrections and three final-review blockers were also resolved.

Validation: all 15 candidates pass `check.ts`. Text-condition and unresolved-effect warnings remain where the schema cannot represent named marks, idle/catch events, projectile trajectory, exact geometry, or unstated formulas.

| Champion | Slots | Findings |
|---|---|---:|
| Darius | P, Q, W, E, R | 9, plus final review findings |
| Draven | P, Q, W, E, R | 7 |
| Caitlyn | P, Q, W, E, R | 9 |

The JSON report records source evidence and canonical SHA-256 hashes of parsed candidate JSON.

## Follow-up corrections

Applied five corrections: strict-less-than summary wording for Draven.R; recurring Headshot preparation counter and separated trap/net activation from common Headshot damage for Caitlyn.P; removed the duplicate Headshot ratio parameter; and separated Darius.Q per-target missing-Health recovery from its cap.

## Final review blockers

Resolved all three blockers in `semantic-final-wave3.json`: Darius.P's five-stack rule now recognizes both Noxian Might activation routes; Darius.R ordinary damage contains only its base coefficient; the cap annotation retains one maximum-value series and the separate sourced cap coefficient. Unspecified cap arithmetic remains a gap.
