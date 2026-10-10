# Aatrox candidate review

Corrected the five existing candidates against their supplied English tooltips and the revised schema.

- `Aatrox.P`: separated ordinary damage, non-minion healing, and minion healing. The minion heal uses its own conditional replacement at 25%; ordinary healing remains 100%. Cooldown reduction rules now distinguish champion targets from large jungle monsters, require the passive to be down, and route Darkin Blade edge hits to the separate 4-second reduction instead of 2 seconds.
- `Aatrox.Q`: removed unsupported first-hit restrictions from edge knockup and edge damage, retaining the edge condition. Removed the recast-count predicate that incorrectly borrowed a number from the damage increase; the two-recast fact stays in text, with a gap because the input number table has no count reference. Monster knockup duration and added damage are preserved as a source-limited gap.
- `Aatrox.W`: retained the first-hit condition on both ordinary damage and slow, supported by the complete first sentence. Converted the 1.5-second exit window to a duration, and added the missing pull crowd control for champions and large jungle monsters that remain in the impact area. Minion double damage is a target-specific replacement; its multiplier remains in text with an unresolved-number gap because no numeric reference is supplied.
- `Aatrox.E`: removed the winding-up state as a prerequisite. The ordinary dash is available on cast, with the additional permission retained in effect text.
- `Aatrox.R`: scoped fear to nearby minions, typed movement speed and attack damage modifiers, and left self-healing amplification as a text-only `other` effect with a gap rather than assigning an unrelated stat enum. Takedown duration extension and the duration cap use their proper duration/max amount parameters.

## Validation

Ran `node --import tsx dev/scripts/advisor/champion-mechanics/check.ts dev/research/champion-mechanics/26.19-v2 Aatrox.P Aatrox.Q Aatrox.W Aatrox.E Aatrox.R`.

- Checked: 5; valid: 5.
- Warnings: Aatrox.P 4 text conditions; Aatrox.Q 3 text conditions and 3 documented source gaps; Aatrox.W 2 text conditions and 1 documented source gap; Aatrox.R 1 unresolved effect and 1 documented source gap; Aatrox.E no warnings.
- The text conditions retain edge-hit, large-monster, and impact-area predicates that the schema cannot type more specifically. The unresolved effect is self-healing amplification, for which the schema has no dedicated stat target.

These remain offline candidates and have not received production approval.
