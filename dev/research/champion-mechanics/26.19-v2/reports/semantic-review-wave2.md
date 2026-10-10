# Semantic review wave 2

Reviewed all 15 slots for Chogath, DrMundo, and Brand against their input sources and the writer guide/contract. This review changed only the two review reports. Rule indexes below are zero based.

Retained text or gaps are not errors by themselves. Findings about ambiguous values identify a concrete value or owner asserted despite the recorded uncertainty.

**Findings:** 21 across 11 slots.

## Reviewed IDs

Chogath.P, Chogath.Q, Chogath.W, Chogath.E, Chogath.R, DrMundo.P, DrMundo.Q, DrMundo.W, DrMundo.E, DrMundo.R, Brand.P, Brand.Q, Brand.W, Brand.E, Brand.R

## Findings

### 1. Chogath.E rules[0] — high

Both attack rules use hit_count <= 3 without identifying the E activation or empowered attack sequence. This turns the next three attacks after activation into an ordinary attack/hit-count predicate.

**Source:** “Cho'Gath's next 3 Attacks launch spikes”

**Correction:** Gate rules[0] and rules[1] on the empowered E attack sequence (activation=empowered). Preserve the next-three-attacks allowance with a count parameter or a retained attack-sequence condition; do not treat it as arbitrary successful hits or global attack count.

### 2. Chogath.E rules[1] — high

Monster percent-health replacement is gated by caster.resource > en:body:n18, whose source value is the unrelated 0.5% Feast damage increase per stack. The source supplies no such resource threshold.

**Source:** “Percent Health damage against monsters is replaced with 80/110/140/170/200.”

**Correction:** Remove the resource > 0.5% condition. Keep the monster condition and empowered attack scope. Restrict replacement to the percent-health component, preserving flat base damage and the caster AP component.

### 3. Chogath.R rules[0] — medium

The three damage rules are supported, but the explicit on-kill stack and 80/120/160 max-health gain have no corresponding rule or numeric preservation. The summary mentions growth while the gap does not explain why this certain health gain was omitted.

**Source:** “If this kills the target, Cho'Gath gains a stack, which causes him to grow in size and gain 80/120/160 max Health.”

**Correction:** Add a rule for this cast killing its own target, with a stack gain, size growth, and caster max-health gain using en:body:n8/n9/n10. Retain the minion/non-epic cap and any range behavior that cannot be typed as text/gaps without inventing formulas.

### 4. DrMundo.P rules[0] — medium

The rule has only a first-hit predicate on ability_hit; it does not limit the triggering incoming effect to an immobilizing effect. The effect text is correct, but the structured trigger also admits an ordinary first ability hit.

**Source:** “Dr. Mundo resists the first Immobilizing effect that hits him”

**Correction:** Add a retained condition specifying that the incoming effect is immobilizing, and identify first within that effect class. Keep the current-health loss as text because currentHealth is unavailable in STATS.

### 5. DrMundo.P rules[1] — high

Canister pickup requires caster.activation=visible, a condition absent from every supplied source. This incorrectly suppresses pickup benefits depending on visibility/activation state.

**Source:** “Moving over it reduces this Ability's Cooldown by 15 seconds and restores 4% max Health.”

**Correction:** Remove activation=visible. Retain entering/moving over the canister and the supported cooldown reduction and max-health-based heal.

### 6. DrMundo.P rules[2] — medium

The champion-type condition is attached to target, which the other condition and destruction effect identify as the canister. The source requires the moving enemy to be a champion, not the destroyed object.

**Source:** “Enemy champions moving over the cannister destroy it.”

**Correction:** Move target_type=champion to subject enemy, matching trigger.subject=enemy. Keep the canister as the target of the destruction effect.

### 7. DrMundo.Q rules[0] — high

The damage parameter references target maxHealth even though both source and effect text require target current Health. The frozen STATS enum lacking currentHealth does not authorize substituting maxHealth.

**Source:** “dealing 20/22.5/25/27.5/30% current Health magic damage to the first enemy hit”

**Correction:** Remove stat=maxHealth from this coefficient. Retain target current-health scaling in text with stat/statSubject null or an explicit unknown representation, and add an unsupported_formula gap. Preserve the supplied percentages, first-hit condition, minimum damage, and monster cap.

### 8. DrMundo.W rules[2] — high

The storage rule is gated only by time > 0.75, leaving no active-W condition or end bound. The first-phase rule also lacks an active-W condition or a declared timer origin. Outside the W duration these predicates can still store incoming damage.

**Source:** “he stores (80% ~ 95%) of damage taken for the first 0.75 seconds and 25% for the remaining duration as gray health”

**Correction:** In rules[1] and rules[2], require the W charge to be active and define the timer as elapsed time since that activation. Bound the second phase to the remaining charge duration, ending on recast/expiry. Retain text conditions if the frozen schema cannot represent that state exactly.

### 9. DrMundo.W rules[3] — medium

Burst damage and both healing branches trigger only on recast. The English summary explicitly supplies duration expiry as another burst trigger; no rule or gap retains it.

**Source:** “At the end of the duration or on Recast, Dr. Mundo deals a burst of damage to nearby enemies.”

**Correction:** Add the expiry trigger for the same burst/heal behavior, using the summary only to supplement the trigger and the English body for damage/heal values. Alternatively retain the expiry behavior in an explicit unresolved representation rather than dropping it.

### 10. DrMundo.E rules[0] — high

The passive is encoded as a maxHealth-to-totalAttackDamage stat conversion with replace_input and identical percent refs for input/output ratios. The source grants bonus AD based on max health; it neither replaces nor consumes the health stat.

**Source:** “Passive - Dr. Mundo gains bonus Attack Damage, increasing based on his max Health.”

**Correction:** Represent this as an additive stat_modifier toward bonusAttackDamage, scaled by caster maxHealth. Remove replace_input and the duplicate output ratio. Preserve the unclear 70%-missing-health passive clause in its existing gap.

### 11. DrMundo.E rules[1] — medium

A scalar damage_multiplier of 40% represents a fixed multiplier. The source says the additional attack damage is increased by up to 40% depending on missing health, so neither a constant 0.4 multiplier nor a constant 40% increase is supported.

**Source:** “increased by up to 40% based on his missing Health.”

**Correction:** Preserve 40% as the upper bound of the additional increase in text/other or unknown-shaped parameters, with the missing-health dependence and an unsupported_formula gap. Do not invent 140% or intermediate values outside the supplied number references.

### 12. DrMundo.E rules[3] — medium

The path-victim condition is attached to target, but that same target is the enemy killed and swatted away in the preceding rule. The actual damage recipients are secondary_targets. This conflates the corpse with the enemies it passes through.

**Source:** “If the enemy is killed, Mundo swats them away, dealing (5/15/25/35/45 + (5% bonus Health)) physical damage to enemies they pass through.”

**Correction:** Retain the primary target being killed by the empowered next attack and swatted away as primary-target context. Attach the path-contact condition to secondary_targets and keep the 5% bonus-health coefficient owned by caster.

### 13. DrMundo.R rules[0] — high

The max-health gain parameter scales from caster maxHealth. The source grants max health based on caster missing Health, a different quantity. The gap about whether this is also healing does not justify changing its input stat.

**Source:** “gaining 15/20/25% of his missing Health as max Health”

**Correction:** Keep statTo=maxHealth as the gained stat but remove the parameter stat=maxHealth input. Retain missing-health scaling in text with an unknown/null input and an unsupported_formula gap; do not substitute bonusHealth, currentHealth, or maxHealth.

### 14. Brand.P rules[2] — high

Detonation is gated by target.hit_count >= 3 although the source requires three Blaze stacks. Its own gap states that stack count and hit count are distinct, yet the rule still makes that substitution.

**Source:** “When a champion or large jungle monster reaches 3 stacks”

**Correction:** Replace the hit_count guard with a Blaze resource/mark stack threshold using en:body:n5, supplemented by retained text and a gap if necessary. Keep the champion branch and the documented large-monster limitation.

### 15. Brand.P rules[2] — high

Explosion max-health parameters use statSubject=target even though the scope_ambiguous gap explicitly says the source cannot establish the health owner. This is an unsupported resolution of the ambiguity.

**Source:** “max Health magic damage to surrounding enemies.”

**Correction:** Set statSubject=unknown for the explosion max-health parameters and retain the ambiguity gap. Do not select either the original victim or surrounding recipients from background knowledge.

### 16. Brand.P rules[2] — medium

The two seconds before detonation are attached to the damage effect as duration_seconds, while the effect text does not retain the delay. The source describes a delayed burst, not two seconds of explosion damage.

**Source:** “the Blaze will detonate after 2 seconds”

**Correction:** Represent two seconds as a delay/time condition or retained delayed-detonation gameplay effect, and state the delay in text. Remove it as a damage duration; preserve the four-second burn duration separately in rules[0].

### 17. Brand.Q rules[1] — medium

The damage rule explicitly requires the first enemy hit, but the separately conditional stun rule requires only Ablaze and drops that same first-hit scope.

**Source:** “magic damage to the first enemy hit. If the target is Ablaze, they will be Stunned for 1.75 seconds.”

**Correction:** Add target.hit_order=first to the stun rule alongside the Ablaze predicate, so the stun refers to the same first enemy as the damage rule.

### 18. Brand.E rules[1] — medium

Doubled propagation range is typed as movement of nearby_enemies. The source changes the blast spread radius and says nothing about moving those enemies.

**Source:** “If the target is Ablaze, the spread range is doubled.”

**Correction:** Use an other gameplay effect on caster/unknown for the ability range change, or another supported range-modifier representation. Retain the doubled spread and primary-target Ablaze condition in text; do not invent a numerical ref for the spelled-out doubling.

### 19. Brand.R rules[0] — medium

The damage effect has scalar count=5 without preserving the can/up-to qualifier in summary or effect text. The source supplies a maximum bounce allowance that can include Brand, not five guaranteed damaging enemy hits.

**Source:** “can bounce to Brand or another enemy up to 5 times”

**Correction:** Retain the maximum-five-bounce allowance and possible self bounces in gameplay text/conditions. Keep damage per enemy hit; do not interpret count=5 as five guaranteed enemy damage applications.

### 20. Brand.R rules[1] — high

The 30/45/60% rank sequence is reduced to a min_amount=30% parameter and max_amount=60% parameter. The middle-rank 45% value is dropped, and per-rank strengths are turned into generic bounds.

**Source:** “If the target is Ablaze, they are briefly Slowed by 30/45/60%.”

**Correction:** Use one amount parameter with shape=rank_values and en:body:n5/n6/n7 in order. Preserve the unspecified brief duration as text, without borrowing a duration number.

### 21. Brand.R rules[2] — medium

Bounce targeting priority is encoded as ui_information although it is a stated gameplay selection behavior.

**Source:** “Bounces prioritize stacking Blaze to max on champions.”

**Correction:** Retain this as an other gameplay effect describing bounce target priority. Keep the English source priority wording rather than inferring an exact low-stack selection algorithm from the Korean summary.

## Correctly supported slots

- **Chogath.P:** Enemy-kill health/mana recovery values are correctly retained as level ranges; no interpolation is invented.
- **Chogath.Q:** Knock-up duration, ordinary magic damage/AP coefficient, and slow percentage/duration agree with the source.
- **Chogath.W:** Silence durations, rank damage values, and caster AP scaling agree with the source.
- **Brand.W:** Ordinary and Ablaze replacement damage are separately scoped, and both AP coefficients/rank sequences are correct.

## Retained uncertainty and supported portions

- The documented gap for DrMundo.E passive behavior at 70% missing health and 140% target-type multiplier scope was retained without assuming hidden mechanics.
- The documented Brand.P large-monster branch limitation was not flagged merely because its target subtype cannot be expressed by the enum.
- Chogath.R damage formulas themselves correctly distinguish champions from minions/monsters and use caster bonusHealth, not baseHealth.
