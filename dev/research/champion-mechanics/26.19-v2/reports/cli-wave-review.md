# CLI wave semantic review: Alistar and Ahri

Reviewed the ten candidate kits against their individual input documents and the frozen writer guide. Findings below are read-only review notes; candidates remain untouched.

## High severity

- **Alistar.P `rules[0]`: trigger does not model either stack event.** The rule uses `trigger.event=other` with no conditions, while combining stack gain from crowd control and enemy deaths in two effects. Source: “Alistar gains a stack whenever he Stuns or Knocks an enemy champion, or whenever an enemy dies.” Split the causes into separate rules and retain each event condition as precisely as the schema permits; the current trigger does not preserve when a stack is gained.
- **Alistar.P `rules[0]` / `rules[1]` / `rules[2]`: source scope conflict and epic-monster overreach.** Summary says “when nearby enemies die”; body says “whenever an enemy dies.” Body also says “Enemy champion and epic jungle monster deaths fully charge this Ability.” The candidate uses the broader body wording without recording the summary/body discrepancy, and `rules[2]` uses `target_type=monster`, which also admits non-epic monsters. Add a `source_conflict` gap for the death radius wording; preserve epic-jungle-monster scope as text because the typed target enum has no epic-monster value.
- **Alistar.P `rules[3]`: stack threshold is encoded as a hit count.** It gates healing with caster `hit_count == 7`; the source says “At 7 stacks”. Use a resource/stack condition rather than a hit-count condition. The heal percentages' Health basis is already correctly left unresolved in a gap.
- **Alistar.W `rules[0]`: unsupported champion-only gate.** Both knockback and damage share `target_type=champion`, but the body says “Alistar rams into an enemy” and gives no champion-only restriction. Remove the champion condition so ordinary enemy targets are not excluded.
- **Alistar.E `rules[1]`: pulse-hit actor is misidentified.** `trigger.event=ability_hit` has `subject=caster` while the condition refers to a champion target. The source says “Each pulse that damages a champion grants a stack.” Set the hit subject to the damaged enemy/target and retain the champion condition.
- **Ahri.P `rules[0]`: monster shard gain is accidentally gated out.** Its condition requires `target_type=minion`, but both effects claim the source rule covers monster kills too. Source: “Killing minions or monsters grants Ahri an Essence Fragment.” Split minion and monster kill rules, or use a target condition that includes both; do not put the monster grant under a minion-only condition.
- **Ahri.R `rules[3]`: unsupported recast-ready gate.** The recast rule adds caster `spell_ready == ready`, which the tooltip never states and which can prevent representing a valid recast during the stated window. Source: “Spirit Rush can be Recast up to 2 more times within 15 seconds.” Remove this condition; retain the recast-window condition and any actual recast availability state only if supported by the input.

## Medium severity

- **Alistar.E `rules[2]`: empowered-attack gating is sound, but stack state uses the wrong field.** The rule requires caster `hit_count == 5` for “At 5 stacks”. Replace that with a stack/resource threshold while keeping the next champion attack restriction and `activation=empowered` distinction.
- **Ahri.P `rules[2]`: the takedown timer is duplicated as a heal parameter.** `en:body:n4` (3 seconds) correctly appears in the condition `target.time <= 3` with the additional “after Ahri damaged that champion” condition, but it is also attached to the heal as `duration_seconds`. The source attaches the window to the takedown trigger, not the restoration amount. Remove the duration parameter from the heal.
- **Ahri.W `rules[4]`: “below 20%” is represented inclusively.** The source says “Minions below 20% Health take 200% damage.” Change `health_threshold` from `lte` to `lt` so a minion at exactly 20% is not included.
- **Ahri.R `rules[2]`: recast availability is labeled as UI information.** The source says “Spirit Rush can be Recast up to 2 more times within 15 seconds”; this is a gameplay recast limit/window, not merely information shown to the player. Use a gameplay effect representation (or retain it as `other` if the schema cannot express the recast allowance) and preserve the initial cast plus two recasts distinction.
- **Ahri.R `rules[4]`: 10 seconds is a duration extension, not `max_amount`.** Source: “extends the recast window by up to 10 seconds”. Represent `en:body:n7` as `duration_seconds` and preserve the “up to” qualifier in text; `max_amount` describes a generic amount and loses the time unit.
- **Ahri.E `rules[1]`: summary mechanics are omitted.** The English summary says the kiss “instantly stop[s] movement abilities and caus[es] them to walk harmlessly towards her,” while the body says only “This Ability Knocks Down enemies.” Preserve the summary-only movement-interruption/forced-walk fact as a separately scoped effect or document it as an unresolved condition/effect gap; do not silently equate it to knockdown.

## Low severity / semantic review

- **Ahri.W `rules[0]`: fox-fire release is typed as `attack_followup`.** Source says “Ahri releases 3 fox-fires that seek nearby enemies”. This is a projectile/effect release, not an attack follow-up. `summon` or `other` may fit better; keep hit damage in its separate first/subsequent damage rules.
- **Ahri.W `rules[1]` / `rules[2]`: first-versus-subsequent hit interpretation needs a note.** The source says damage is reduced “beyond the first” but does not state whether “first” is the first target hit or the first fox-fire projectile. The candidate's `hit_order` split assumes the former. Keep the split only if that interpretation is supported by the supplied summary; otherwise add an `unresolved_condition` gap and retain the ambiguity.

## Reviewed areas with no finding

- Alistar.Q has no unjustified target-type condition; its knock-up duration and damage coefficient/amount are separately parameterized.
- Alistar.R's cleanse and 55/65/75% damage reduction for 7 seconds match the source scope and timing.
- Ahri.Q correctly separates outbound magic damage from return true damage.
- Ahri.E's first-hit charm and damage are scoped to the first enemy; the separately stated knockdown is not incorrectly constrained to the first-hit rule.
- Ahri.R's bolt damage is per bolt and correctly uses the caster's ability power.

## Applied corrections and verification

The coordinator-authorized edits are now applied to the ten reviewed candidates:

| Candidate | Before | After |
|---|---|---|
| Alistar.P | CC-caused stacks and death-caused stacks shared an untyped trigger; 7 stacks used `hit_count`; all monsters matched the epic-monster full-charge rule. | CC and death stack causes are separate; the 7-stack gate uses a generic resource threshold; epic-monster deaths require both `monster` and a retained `epic jungle monster` text condition. Added gaps for the absent stack field, epic subtype, and summary/body death-radius conflict. |
| Alistar.W | Knockback and damage were gated to champions. | Removed the unsupported champion-only condition; target remains the source's generic enemy. |
| Alistar.E | Pulse hit was attributed to the caster; 5 stacks used `hit_count`. | Pulse hit subject is the enemy champion; the threshold uses a resource condition while retaining champion-target and empowered next-attack conditions. Added a stack-field gap. |
| Ahri.P | One minion-only condition also gated monster shards; the 3-second takedown window was repeated as a heal duration. | Split minion and monster kill rules; removed the duration parameter from healing while preserving its damage-before-takedown timer condition. |
| Ahri.W | Fox-fire release was typed as `attack_followup`; the minion threshold used `lte`; first-versus-subsequent meaning was implicit. | Release is `other`; “below 20%” uses `lt`; retained the first-hit split with a gap documenting whether “first” refers to target or projectile. |
| Ahri.E | The English summary's movement-ability interruption and forced walk were absent. | Added a summary-evidenced movement effect to the first-hit charm rule and a gap for its unspecified duration/termination details. |
| Ahri.R | Recast allowance was UI information; recasts required an unsupported `spell_ready`; a static 15-second gate blocked an extended window; 10 seconds used `max_amount`. | Recast allowance is a gameplay `other` effect. Removed `spell_ready`; represented the active, extendable recast window as retained text with a gap. Changed the 10-second extension to `duration_seconds`; 3 stored is only a cap, not three recasts granted per trigger. |

Alistar.Q, Alistar.R, and Ahri.Q needed no source-backed edits from this review.

The checker passed all ten candidates: **10 checked, 10 valid, 0 errors**. Warnings remain for retained text conditions, gaps, and effects whose semantics need review because the frozen schema has no precise typed representation.
