# Semantic repair wave 2

Repaired all 21 findings from `semantic-review-wave2.json` against the corresponding supplied source text. All findings are marked `resolved`; none were declined. Each entry in the JSON report includes direct source evidence and the final candidate file SHA-256.

## Resolved findings

- Finding 1 — `Chogath.E` rule 0: Removed hit_count from both follow-up attack rules; added a cast-time attack_modifier with count=3 and retained activation=empowered on the resulting spike attacks.
- Finding 2 — `Chogath.E` rule 1: Removed the unsupported Feast-resource threshold and separated the ordinary flat/AP damage from the max-health component, so monster replacement affects only that component.
- Finding 3 — `Chogath.R` rule 0: Separated general Feast stack gain and benefits from the six-stack cap, which now applies only to minion and non-epic jungle monster kills.
- Finding 4 — `DrMundo.P` rule 0: Uses an `other` event for the first immobilizing effect that hits Mundo, preserving non-damaging immobilizing effects; current-health loss remains text.
- Finding 5 — `DrMundo.P` rule 1: Removed the unsupported visible-activation condition from canister pickup.
- Finding 6 — `DrMundo.P` rule 2: Moved champion type to the moving enemy actor and retained the canister as the destruction target.
- Finding 7 — `DrMundo.Q` rule 0: Removed maxHealth as the coefficient stat, preserved current-health scaling in text, and added an unsupported-formula gap.
- Finding 8 — `DrMundo.W` rule 2: Added active-W and activation-relative timer text conditions, bounded the later storage phase by the W duration, and stated that storage ends on recast or expiry.
- Finding 9 — `DrMundo.W` rule 3: Added the summary-supported expiry trigger for burst damage and both champion-hit-dependent gray-health recovery branches.
- Finding 10 — `DrMundo.E` rule 0: Replaced stat_conversion with an additive stat_modifier to bonusAttackDamage scaled by caster maxHealth; removed replace_input and duplicate output ratio.
- Finding 11 — `DrMundo.E` rule 1: Replaced the fixed 40% multiplier interpretation with an upper-bound text/unknown parameter and an unsupported-formula gap for missing-health dependence.
- Finding 12 — `DrMundo.E` rule 3: Moved path-contact to secondary_targets while retaining the killed, swatted primary target as context; bonusHealth remains owned by caster.
- Finding 13 — `DrMundo.R` rule 0: Removed the maxHealth input stat, retained missing-health scaling as null/untyped text, and added an unsupported-formula gap.
- Finding 14 — `Brand.P` rule 2: Replaced hit_count with an Ablaze mark presence and mark threshold using en:body:n5; a text target_type condition preserves both champion and large-jungle-monster branches, with the enum limitation documented.
- Finding 15 — `Brand.P` rule 2: Set both explosion max-health coefficient statSubject values to unknown and corrected the gap to match the unknown owner representation.
- Finding 16 — `Brand.P` rule 2: Removed the 2-second value from damage duration and represented delayed detonation as a separate text effect with a duration parameter.
- Finding 17 — `Brand.Q` rule 1: Added hit_order=first to the stun rule and cited the full sentence sequence linking first-hit damage and Ablaze stun.
- Finding 18 — `Brand.E` rule 1: Changed the spread-range effect from movement of nearby enemies to an other effect on the caster, preserving the Ablaze condition and doubled spread text.
- Finding 19 — `Brand.R` rule 0: Updated summary and effect text to say up to five bounces and include Brand as a possible bounce destination; damage remains per enemy hit.
- Finding 20 — `Brand.R` rule 1: Replaced min/max slow bounds with a single ordered rank_values amount parameter using 30/45/60%.
- Finding 21 — `Brand.R` rule 2: Changed the UI information effect to an other gameplay effect and used the source wording for champion Blaze stacking priority without adding selection details.

## Validation

Checked 15 assigned IDs; all 15 passed `validateDraft` through the assigned checker. Remaining warnings are retained text predicates/effects and documented source gaps for mechanics not fully represented by the frozen schema or input number references.

## Final recheck corrections

- `DrMundo.P` rule 0: Removed the damage-taken prerequisite; the tooltip says the first immobilizing effect that hits Mundo, including one with no damage. Canonical hash: `2e68f8782acd3b9539c092622afce92fe01b4e4191b431c4422ccf73544a5af1`.
- `DrMundo.E` rules 4–5: Removed target.activation=empowered and retained the 140% values as unknown-shaped other parameters because the affected E damage component is unspecified. Canonical hash: `ed5b5b391da30f3f140c76016dc9f2eb2e1db0423d2ff99c9b5d628d21bfb0ec`.
- `Chogath.R` rules 3–4: Separated generic kill stack gain from the six-stack cap, scoped only to minions and non-epic jungle monsters. Canonical hash: `9491c79f981f582f99f901281088dd6ec0e5c2eefe4aa7e66a7c5032495796ee`.
- Revalidated all 15 assigned candidates: 15 valid.
