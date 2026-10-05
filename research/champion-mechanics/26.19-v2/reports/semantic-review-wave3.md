# Semantic review wave 3

Source semantics review of Darius, Draven, and Caitlyn against frozen 26.19-v2 inputs and candidates

Read the frozen WRITER_GUIDE.md, contract.ts, and resolved review views for all 15 slots. Findings concern source meaning; strict schema validity is not semantic approval. No candidate, source, or maintained code was edited.

Reviewed: Darius.P, Darius.Q, Darius.W, Darius.E, Darius.R, Draven.P, Draven.Q, Draven.W, Draven.E, Draven.R, Caitlyn.P, Caitlyn.Q, Caitlyn.W, Caitlyn.E, Caitlyn.R.

No findings: Darius.E, Draven.W, Draven.E, Caitlyn.E.

Findings: 25 (15 high, 10 medium). Rule indices are zero based.

## Darius

### Darius.P, rule 1 — high

The buff threshold is target.hit_count >= five. The source requires the target to reach maximum Hemorrhage stacks, which is a current mark state rather than a lifetime or recent hit count. Repeated hits and current stacks can differ after expiry or an empowered application.

> When an enemy reaches max stacks or is killed by Noxian Guillotine

Correction: Gate this branch on the target's Hemorrhage maximum-stack state. Use a named mark/resource or an explicit text condition if the schema cannot express a counted mark, retaining the supplied stack-cap ref. Do not call the mark count hit_count. Keep the separate Noxian Guillotine kill branch.

### Darius.P, rule 1 — medium

In both buff branches (rules 1 and 2), duration_seconds uses en:body:n7, the five in 'applies 5 Hemorrhage stacks'; the actual buff duration is en:body:n8. The attack/ability-hit mark application is also embedded in a caster stat_modifier with storage_cap taken from the ordinary stack cap instead of a distinct application effect.

> applies 5 Hemorrhage stacks on all Attack or damaging Ability hits for 5 seconds.

Correction: Use en:body:n8 for buff duration and en:body:n7 for stacks applied. Preserve the caster AD buff separately from a buff-gated attack_or_ability_hit rule that applies the target's Hemorrhage mark. A text condition can name the active buff; exact hidden refresh behavior need not be invented.

### Darius.Q, rule 0 — high

Rules 0 and 1 are unconditional cast damage rules for the same target, so the distinct blade and handle formulas are not mutually scoped. Rules 2 and 3 likewise omit structured handle/edge and heal-eligible target conditions. These known qualitative predicates are available even though exact geometry is not.

> physical damage with the edge and (17.5/28/38.5/49/59.5 + (35/38.5/42/45.5/49% Attack Damage)) damage with the handle.

Correction: Add explicit text conditions for edge versus handle hit to the separate hit rules. Apply the no-Hemorrhage effect only on handle hit. Apply healing only when the edge hits an enemy champion or large jungle monster, preserving that disjunction as text if needed. Retain the geometry gap without making the formulas unconditional.

### Darius.Q, rule 3 — high

Both heal percentage parameters reference caster.maxHealth, contradicting the source's missing Health. The existing scope_ambiguous gap correctly recognizes the missing statistic, but it does not make substituting maxHealth accurate.

> Darius restores 17% missing Health per enemy champion and large jungle monster hit with the edge, up to a max of 51%.

Correction: Remove the maxHealth stat and statSubject from these percentage refs. Keep the missing-health basis, eligible-hit count, and cap explicit in text and retain an unsupported_formula/scope gap. Do not present the percentages as percentages of maximum health.

### Darius.W, rule 2 — high

The mana refund and cooldown reduction trigger on an unrestricted target kill. The rule does not say the empowered W attack must deliver the killing blow; the effect text also says only 'on a kill'. This would grant the refund for unrelated kills.

> This Ability refunds its Mana cost and reduces its Cooldown by 50% if it kills the target.

Correction: Add an explicit condition that this W empowered attack kills the target and state that qualifier in the effect text. Preserve the refund of this ability's spent mana and its cooldown reduction.

### Darius.R, rule 0 — medium

The ordinary damage effect has both the base 75% bonus-AD coefficient and the maximum-damage 150% bonus-AD coefficient under the same stat_coefficient role. Only the flat maximum has max_amount, so the second coefficient is not associated with the cap and can be mistaken for another ordinary damage term.

> up to a max of (250/500/750 + (150% bonus Attack Damage)) damage.

Correction: Separate the ordinary formula from the maximum formula, or retain the cap's complete relationship in text with a formula gap. Make clear that en:body:n8 belongs to the maximum damage formula and is not added to en:body:n3 as another base coefficient.

### Darius.R, rule 2 — high

The duration ref en:body:n9 (20 seconds) is reused as count, which encodes twenty recasts although the source permits one recast.

> Darius may Recast this Ability once within 20 seconds.

Correction: Keep en:body:n9 only as duration_seconds. Preserve 'once' in the effect text because this input has no number ref for it; do not borrow another numeric token or invent a count ref.

### Darius.R, rule 2 — high

The kill-triggered recast window is unqualified, and the rank-specific cooldown refresh in rule 4 also lacks a this-ability killing-blow condition. The source's preceding conditional is explicitly that R kills the target, while the candidate permits unrelated kills.

> If this kills the target, Darius may Recast this Ability once within 20 seconds.

Correction: Add a named condition that Noxian Guillotine kills the target for the kill-dependent behavior. State the ability-specific kill in both effect texts. If the final rank sentence is considered ambiguous about kill scope, retain that ambiguity as a source/scope gap instead of silently asserting a generic kill reset.

### Darius.R, rule 3 — medium

Rules 3 and 4 encode caster.other == the bare number three, and their texts say '3레벨'. Nothing identifies that this is the ability's rank, so it can be read as champion level rather than R rank.

> At rank 3, this Ability has no Mana cost and kills refresh the Cooldown completely.

Correction: Identify the dimension as Noxian Guillotine's ability rank in the condition and text. Use an explicit text predicate plus the existing rank ref if necessary; do not introduce champion-level semantics.


## Draven

### Draven.P, rule 0 — medium

The stack-gain rule has a generic other event and target_type == any. Its structured predicate fails to exclude champion kills or to identify catching an axe, even though the effect prose contains the correct alternatives.

> Draven gains 1 stack whenever he kills a non-champion unit or turret, catches a Spinning Axe.

Correction: Split a kill rule restricted to non-champion units/turrets from an other rule with an explicit 'catches a Spinning Axe' condition. Keep the stack amount on each branch. Do not leave an any-target predicate in place of the non-champion kill scope.

### Draven.Q, rule 0 — high

The target != structure condition restricts the bonus damage as well as the ricochet. In the supplied source, the structure exception applies only to whether the axe ricochets; the bonus-damage sentence has no such restriction.

> Attacking a turret or structure will not cause Draven's Spinning Axes to richochet.

Correction: Remove the structure exclusion from the bonus-damage rule. Keep it on the separate ricochet rule and preserve the empowered-next-attack condition. Do not infer a structure damage exclusion from the ricochet exception.

### Draven.Q, rule 2 — high

Preparing another axe is triggered by attack_or_ability_hit, rather than catching the airborne axe, and a target != structure condition is copied onto this separate event. Hitting an enemy is not the catch event.

> If Draven catches it, he readies another Spinning Axe.

Correction: Use event other with an explicit caster catch condition, as the W candidate already does. Remove the target-type restriction from catching; the separate ricochet rule controls which attacks produce an airborne axe.

### Draven.Q, rule 3 — high

Dropping axes requires followup_status == cancelled. The source requires no attacks during the interval, which includes simply remaining idle without cancelling any attack. Cancellation is an unsupported additional requirement.

> Draven will drop any Spinning Axes if he does not attack for 6 seconds.

Correction: Replace the cancellation predicate with a text condition that no attack occurred for the referenced interval, or elapsed time since the last attack. Keep the expiry/drop effect and the six-second ref.

### Draven.Q, rule 0 — medium

The simultaneous two-axe capacity is absent from the summary, rules, and gaps. The frozen input provides an unambiguous capacity and a dedicated number ref en:body:n10.

> Draven can hold two Spinning Axes at once.

Correction: Preserve the simultaneous holding limit as storage_cap using en:body:n10, with text naming held Spinning Axes. A cast/preparation rule can also name the initial readiness action; do not turn the capacity into damage or axes spawned per hit.

### Draven.R, rule 4 — high

health_threshold <= en:body:n9 encodes an unqualified 100% health threshold instead of remaining health after R damage compared to Draven's current Adoration stack count. It also selects <= despite the preferred English tooltip saying strictly less than; the Korean tooltip says 이하, and no source_conflict is recorded.

> If Whirling Death would leave an enemy champion with less health than 100% of Draven's current League of Draven stacks (1), he will execute them.

Correction: Use a text threshold predicate naming post-damage target health and caster-owned current stacks, with strict < from the English tooltip. Preserve the 100% relationship as text/ratio data without asserting a percentage of target health. Keep the live displayed '(1)' ambiguity as a gap rather than a fixed stack threshold, and add source_conflict for the English < versus Korean <= wording.

### Draven.R, rule 1 — medium

Rules 1 and 2 describe returning axes as movement of caster, and rule 3 represents the reversal as transform of caster. The source changes the projectile trajectory; it does not move or transform Draven.

> Upon hitting a champion or Recasting, they reverse direction and return to Draven.

Correction: Retain the axes as the affected object in text and use unknown subject with a scope gap if the contract cannot name projectiles. Represent trajectory reversal with other/recast/hit conditions rather than a caster transformation, and attach the damage-falloff reset to that reversal.


## Caitlyn

### Caitlyn.P, rule 0 — high

The count-two parameter is on an unconditional attack rule. Although the prose mentions brush, the structured rule makes every attack contribute the brush bonus.

> Attacks while in brush count as 2 for building towards a Headshot.

Correction: Gate the count-two contribution on an explicit caster-in-brush condition. Preserve ordinary attack accumulation separately without inventing an unavailable numeric ref.

### Caitlyn.P, rule 2 — high

The doubled Headshot range is encoded as damage_multiplier using the two from the brush accumulation sentence. Its condition is a generic immobilized mark, which does not identify the trap/net marks and does not cover a merely slowed net target. It is also not restricted to a Headshot.

> They have double range against enemies affected by 90 Caliber Net and Yordle Snap Trap.

Correction: Require a Headshot and name the Yordle Snap Trap or 90 Caliber Net target mark. Preserve doubled attack range in text; the schema lacks an attack-range statistic and the number inventory has no ref for 'double' in this sentence. Remove damage_multiplier and the borrowed brush count. The summary's explicit 'trapped or netted' supports the disjunction.

### Caitlyn.P, rule 3 — high

The trap bonus is on any attack against the marked target. The source restricts this additional physical damage to Headshots, and the candidate lacks an activation/Headshot condition.

> Headshots against enemies hit by Yordle Snap Trap deal a further (35/80/125/170/215 + (30% bonus Attack Damage)) physical damage.

Correction: Add a named Headshot/empowered-attack condition while retaining the specific trap mark. Keep it as additional damage with caster bonus AD; using a damage effect with physical damageType makes the damage explicit.

### Caitlyn.P, rule 1 — high

The only rule that provides the ordinary Headshot damage is gated on the accumulated hit count. No rule preserves the independent Headshot activation against trapped or netted targets, and the candidate summary omits it. The existing gap about exact counts does not preserve the known alternative trigger as a rule.

> Every few basic attacks, or against a target she has trapped or netted, Caitlyn will fire a headshot

Correction: Preserve the attack-against-trap/net alternative as an attack rule with named mark conditions, and apply the ordinary Headshot bonus to Headshots from either route. Keep the exact per-mark availability/count relationship unresolved if absent; do not require the normal attack counter for this alternative.

### Caitlyn.P, rule 1 — medium

The source summary states that Headshot bonus damage scales with Caitlyn's critical strike chance. The candidate omits this material dependency from its summary, effects, and gaps. The body supplies the AD portion but does not contradict the critical-strike dependency.

> Caitlyn will fire a headshot dealing bonus damage that scales with her critical strike chance.

Correction: Retain caster-owned critChance scaling in the Headshot text and add unsupported_formula for the absent exact critical-strike formula. Keep the supplied AD coefficient range without inventing a crit coefficient.

### Caitlyn.Q, rule 0 — medium

The shot's one-second windup is entirely absent even though both language summaries supply it and en:summary:n0 is available. The candidate says only that she aims before firing.

> Caitlyn revs up her rifle for 1 second to unleash a penetrating shot

Correction: Preserve a cast/windup effect before the shot with duration_seconds referencing en:summary:n0. Keep the subsequent damage formulas and trap full-damage override separate.

### Caitlyn.W, rule 2 — medium

The maximum simultaneously active traps are attached as count to the summon-on-cast effect. This conflates the active cap with traps created by one cast; the tooltip does not say a cast creates that many traps.

> 3/3/4/4/5 traps may be active at once.

Correction: Keep the cast effect as setting a trap and preserve the rank-varying active limit as storage_cap with text naming concurrently active traps. Keep the separate charge capacity and recharge interval refs distinct.

### Caitlyn.W, rule 4 — high

The bonus damage rule requires only a generic immobilized mark and triggers on any attack. The source requires a target rooted by this ability and damage from Headshot, so unrelated immobilization and ordinary attacks are incorrectly eligible.

> Targets rooted by this Ability take an additional (35/80/125/170/215 + (30% bonus Attack Damage)) physical damage from Headshot.

Correction: Require the target's Yordle Snap Trap mark/root from this ability and the caster's Headshot activation. Preserve physical additional damage and caster bonus AD without applying it to all immobilized targets.

### Caitlyn.R, rule 1 — medium

The visibility rule uses time > the text '정신 집중 중'. This is an ordering comparison against a state label; the source says the vision exists during the channel, rather than after or greater than that state.

> This Ability grants True Sight of the target during the channel.

Correction: Represent the caster channeling state with an eq/present text predicate or another explicit 'during this channel' condition. Keep the duration unknown; the missing exact duration does not require an invalid ordering comparison.

## Retained limitations

- **Darius.P**: The level-dependent endpoints can remain level_range; exact intermediate progression must not be inferred from those endpoints. The stack application and duration refs still require the corrections above.
- **Darius.Q**: Exact blade/handle geometry and a missingHealth statistic are absent from the contract. Text predicates and a formula/scope gap are appropriate; a maxHealth substitute is a separate error.
- **Darius.R**: The recast needs no separate variant to preserve a recast event/state within base. An unavailable numeric ref for 'once' should remain text. The complete relationship between base, per-stack amplification, and maximum formula may remain text with a gap.
- **Draven.P**: Adoration stacks and gold are not named statistics in STATS. The current per-stack gold relation is accurately described in text, so a null-stat unknown coefficient is not evidence of caster/target AD ownership error. The UI counters are displayed values, not additional gold awards.
- **Draven.Q**: There is no dedicated catch event. other plus a named catch predicate is supported; exact hidden catch geometry need not be inferred.
- **Draven.R**: The linear-versus-compounding falloff calculation and the live '(1)' display may remain unresolved. Do not infer a fixed stack threshold or add a second damage multiplier blindly. The schema also lacks a projectile subject, so trajectory effects should retain their object in text and a scope gap.
- **Caitlyn.P**: Attack range and a precise critical-strike formula are absent from the contract/input. Preserve doubled Headshot range and critical-strike dependency as text with gaps rather than repurposing a brush-count number as a damage multiplier. Exact per-mark Headshot availability can remain unresolved while the known alternate activation is retained.
- **Caitlyn.Q**: The trap override currently retains 'always take full damage' in text with replaces_base; absence of a duplicated damage formula on that effect is not itself a source-meaning error. Exact widened-shot geometry is not supplied.
- **Caitlyn.R**: Critical strike chance and critical damage scaling, interception, and channel visibility are retained in text with honest gaps for missing formulas or detailed timing. No numeric crit formula or interception geometry should be invented.
