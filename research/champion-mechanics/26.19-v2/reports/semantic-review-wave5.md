# Semantic review wave 5

Reviewed Jayce, Nidalee, and Gnar P/Q/W/E/R: all 15 requested candidates. Only these two review reports were written; candidates, source code, schema, and ledger were left untouched. Rule indexes are zero based.

**Findings:** 27 across 13 slots (14 high, 13 medium).

Retained text and documented gaps were not treated as errors merely for retaining uncertainty. Concrete coefficient/owner assertions, condition changes, and unit changes were compared with the supplied source.

## Candidate snapshots

Hashes use `sources.digest(candidate)`: SHA-256 of `JSON.stringify` on parsed candidate JSON. Nidalee P/W/E/R and Gnar R were initially absent; review waited for their generation. All 15 hashes still matched at completion.

| ID | Canonical candidateHash |
| --- | --- |
| Jayce.P | `88599c4dcdab64702b3d4060c559c6b4f1d91df0d79be6c3565f31ed78c74b7c` |
| Jayce.Q | `f3de15563cafab6627cb2e378a8972a02808a2c8692b1ab3f4284c91b0f6d73c` |
| Jayce.W | `fa3fe0db158ae19385c42f5eb13433c021e6fa5eb5cc39dc92cd186cfa2518fe` |
| Jayce.E | `16de7741828c8c8e65a2ee5244f0ba9d2ea2bb862c10d3ef4a4e1527dbcfd32c` |
| Jayce.R | `189f17007711e6b917b3281f74b74fa3af7776197db632c7c5d80252b76f18d0` |
| Nidalee.P | `c542431913b7497a4f62718c81f9438991947c253b24d342c500d60c7b23ae10` |
| Nidalee.Q | `8d9b85cfacad42c14113dc138c5a18b1985168b33c7aa68590dc06ad5b5d74ff` |
| Nidalee.W | `307c901bbd57c00f1636330b54b5db35ff016aa955a5c396a8600da8327a6c23` |
| Nidalee.E | `46ebc6082a4b2624e7ed31c06d72b007d8049e8a92f980c566abc81e386cae52` |
| Nidalee.R | `8ea35bca8eb564015a66cd3cd7e104f5b2bb9c9bbfdbe05c781687531843d37d` |
| Gnar.P | `49a59ab2432aaf159d9ad6c4b05d9896d6b04965a049b00e7955fd84890a3ee6` |
| Gnar.Q | `4f006bd06bed094622f9a6cda372237214252c1c3526a2a5c3a6e2570a84bd03` |
| Gnar.W | `a84bfb25e61da91981cf1a619020d53a96b8512726c5c6a942c8b8137e46b154` |
| Gnar.E | `cb79b3e1d3f00d4a5899e4e58b12e678aed71786bf8d45a84110c46690c9ceef` |
| Gnar.R | `89492bc354cbafbb46742dac1e95415cd0cda6bb42989c9b24ca3be46f4cc079` |

## Findings

### 1. Jayce.Q rules[2] — medium

**Path:** `rules[2].trigger`

Cannon projectile damage is attached to cast without a hit predicate. The source describes first-enemy impact or path-end detonation, which the current rule does not distinguish.

**Source (form:B:en):** “physical damage to the first enemy hit and all surrounding enemies.”

**Correction:** Keep projectile release under cast, and represent damage at impact/detonation with the first enemy and surrounding recipients. Preserve path-end detonation from en:summary as retained text without inventing a timing value.

### 2. Jayce.Q rules[4] — high

**Path:** `rules[4].effects[0].subject`

Gate-enhanced replacement damage has subject nearby_enemies only, while the source applies the increased orb damage to both the first enemy and surrounding enemies. Ordinary first-target damage in rules[2] has no corresponding enhanced first-target replacement.

**Source (form:B:en):** “Firing this orb through Acceleration Gate increases the range, speed and raises the damage to (112/169.4/226.8/284.2/341.6/399 + (182% bonus Attack Damage)).”

**Correction:** Represent enhanced replacement damage for target and surrounding/secondary enemies, with matching recipients to the ordinary branch. Keep caster bonusAttackDamage and replaces_base; preserve gate passage, range, and projectile-speed changes.

### 3. Jayce.Q rules[3] — medium

**Path:** `rules[3].conditions[0].subject`

The cannon monster bonus is limited to target being a monster, although the orb also damages surrounding enemies. A surrounding jungle monster is not represented by this primary-target guard; the hammer bonus has the same recipient mismatch.

**Source (form:B:en):** “Deals 10 bonus damage to jungle monsters.”

**Correction:** Scope the bonus per damaged jungle monster, including eligible surrounding recipients. Keep the primary and secondary subjects distinct and use the appropriate form-specific 10 ref; do not add the monster bonus to non-monsters.

### 4. Jayce.W rules[2] — high

**Path:** `rules[2].effects[0].parameters`

The cannon attack modifier carries the full 70/78/86/94/102/110% rank sequence as bare amounts and also carries 110% as an unconditional scalar AD coefficient. This fixes every rank to the final-rank coefficient or duplicates it. The gap falsely claims only the final numeric ref is available; all six refs exist.

**Source (form:B:en):** “These Attacks deal (70/78/86/94/102/110% Attack Damage) physical damage.”

**Correction:** Use one rank_values stat_coefficient with form:B:en:n1 through n6 and caster totalAttackDamage. Remove the redundant bare percentage amount vector and fixed 110% coefficient; correct the obsolete missing-ref gap. Preserve the next-three-attacks allowance and maximum attack-speed benefit.

### 5. Jayce.E rules[2] — high

**Path:** `rules[2].effects[1]`

Gate creation and the conditional ally speed benefit share the cast trigger without an ally-pass-through condition. The speed effect is therefore unconditional on gate deployment, while the source grants it to allied champions that pass through the gate.

**Source (form:B:en):** “Move Speed decaying over 3 seconds to allied champions that pass through it.”

**Correction:** Split gate deployment (caster cast, 4-second lifetime) from the ally entering/passing through the gate (ally enter_area plus champion and gate-contact predicates). Retain the 35/40/45/50/55/60% speed and 3-second decay for that recipient.

### 6. Nidalee.P rules[1] — medium

**Path:** `rules[1].conditions`

The directional brush-speed branch omits the active brush buff/window condition. It also drops the visible-target and 1400-range qualifiers explicitly supplied by the English summary, with no retained uncertainty or source note.

**Source (en:summary):** “Moving through brush increases Nidalee's Move Speed by 10% for 2 seconds, increased to 30% toward visible enemy champions within 1400 range.”

**Correction:** Scope 30% to the active two-second brush benefit, movement toward the enemy champion, visibility=visible, and the supplied distance bound. Cite the summary for its extra qualifiers or record the source scope difference explicitly; do not grant 30% on entering an arbitrary area.

### 7. Nidalee.P rules[4] — high

**Path:** `rules[4].conditions`

Hunted is represented as mark=empowered. The same rule applies a toward-the-target condition to both the ordinary 10% benefit and the directional 30% benefit, removing the ordinary Hunted movement-speed benefit unless moving toward the target.

**Source (en:body):** “While an enemy is Hunted, they are revealed with True Sight and Nidalee gains 10% Move Speed, increased to 30% Move Speed toward the Hunted enemy.”

**Correction:** Use the explicit Hunted mark. Split ordinary 10% while a target is Hunted from directional 30% toward that same Hunted target; represent 30% as replacing the ordinary speed benefit rather than an additional 30%.

### 8. Nidalee.Q rules[0] — medium

**Path:** `rules[0].effects[0].parameters`

The distance-scaled damage effect has minimum/maximum base amounts but two unqualified scalar AP coefficients (50% and 162.5%) in the same effect. Their minimum versus maximum roles are lost and the structured parameter list can imply both coefficients apply together.

**Source (form:A:en):** “increased up to (227.5/292.5/357.5/422.5/487.5 + (162.5% Ability Power)) magic damage based on distance flown.”

**Correction:** Associate 50% AP with the minimum endpoint and 162.5% AP with the maximum endpoint, using min_amount/max_amount stat-bearing parameters or an explicit retained endpoint representation. Preserve distance dependence without inventing its intermediate formula or adding both endpoint coefficients.

### 9. Nidalee.Q rules[2] — medium

**Path:** `rules[2].effects[0].parameters[0]`

30% increased damage is stored as a scalar damage_multiplier=30%, which does not distinguish an increase by 30% from dealing 30% of base damage.

**Source (form:B:en):** “If the enemy was Hunted, deals 30% increased damage.”

**Correction:** Preserve 30% as the increase amount in text/other or an unknown formula representation, and state that it increases the empowered Q damage. Do not treat it as a 0.3 total-damage multiplier or invent a 130% numeric ref.

### 10. Nidalee.W rules[0] — high

**Path:** `rules[0].effects[0].parameters[0]`

The trap lifetime source is 2 minutes, but its numeric ref is placed under duration_seconds, asserting a two-second lifetime. The effect text omits the original unit.

**Source (form:A:en):** “Nidalee places an invisible trap for 2 minutes.”

**Correction:** Retain the two-minute lifetime explicitly in text and an other/unknown parameter with a unit-conversion gap. Do not use the raw 2 ref as seconds or invent a new 120 ref outside the frozen number catalog.

### 11. Nidalee.W rules[2] — medium

**Path:** `rules[2].effects[0].parameters`

The simultaneous trap capacity range is encoded as min_amount=4 and max_amount=10, which loses that these are bounds on maximum active-trap capacity rather than a required minimum number of active traps.

**Source (form:A:en):** “(4 ~ 10) traps may be active at once.”

**Correction:** Represent the range as storage_cap using the supplied endpoint refs and retain that it limits simultaneous active traps. Do not infer exact intermediate capacities or require at least four active traps.

### 12. Nidalee.W rules[4] — medium

**Path:** `rules[4].effects[0].parameters[0].role`

The cooldown-to values 3/2.5/2/1.5 seconds are stored as generic amount values. The same unit is lost in the Hunted pounce branch at rules[5].

**Source (form:B:en):** “Killing a unit in Cougar Form reduces this Ability's Cooldown to 3/2.5/2/1.5 seconds.”

**Correction:** Use cooldown_seconds for both rank sequences in rules[4] and rules[5]. Preserve that cooldown is reduced to those values, not by those values, and keep the Cougar-form kill and Hunted-pounce triggers separate.

### 13. Nidalee.W rules[5] — high

**Path:** `rules[5].conditions[0].value`

The long-range pounce and cooldown benefit use mark=empowered instead of the specific Hunted enemy mark required by the source.

**Source (form:B:en):** “Pouncing at a Hunted enemy can be done from a greater distance and reduces this Ability's Cooldown to 3/2.5/2/1.5 seconds.”

**Correction:** Use mark present/eq text Hunted on the same enemy being pounced at. Retain the greater-distance allowance and the cooldown-to sequence without inventing a range value.

### 14. Nidalee.E rules[0] — medium

**Path:** `rules[0].conditions[0]`

Both human heal and attack-speed rules use target_type=any despite the supplied English summary identifying allies as the recipient. The gap ignores that available recipient evidence and leaves benefits open to arbitrary targets.

**Source (en:summary):** “In human form, Nidalee channels the spirit of the cougar to heal her allies and imbue them with Attack Speed for a short duration.”

**Correction:** Retain ally recipient scope for both rules[0] and rules[1], either with effect subject ally or an explicit allied-target condition. Preserve uncertainty about any narrower valid target subtype; do not infer enemy eligibility from them.

### 15. Nidalee.E rules[0] — medium

**Path:** `rules[0].effects[0].parameters`

The variable missing-health heal has an ordinary amount endpoint and max_amount endpoint but two unqualified AP ratio_output parameters (35% and 70%). It does not associate each coefficient with its endpoint and can imply both apply together.

**Source (form:A:en):** “Health increased up to (100/150/200/250/300 + (70% Ability Power)) based on missing Health”

**Correction:** Retain minimum/base and maximum heal endpoints with their matching 35% and 70% caster AP coefficients. Use explicit endpoint roles or an unknown formula representation, rather than two simultaneous flat coefficients; keep the target missing-health dependence in text.

### 16. Nidalee.R rules[2] — high

**Path:** `rules[2].trigger`

Cooldown refresh triggers on ability_hit with an already-present empowered mark. The source requires applying Hunted while Human, which is a new mark-application event rather than any hit against an already marked target.

**Source (en:body):** “Passive: While in Human Form, applying Hunted refreshes this Ability's Cooldown.”

**Correction:** Require the current event to apply the Hunted mark while caster is Human. Replace empowered with explicit Hunted and use a retained mark-application condition/other event if the enum cannot represent it; do not refresh on unrelated hits against existing Hunted targets.

### 17. Gnar.P rules[1] — high

**Path:** `rules[1].trigger`

Rage generation from dealing damage is modeled only as ability_hit with caster as the hit subject. This excludes ordinary attack damage and does not distinguish actually dealing damage from a non-damaging ability hit.

**Source (en:body):** “Gnar generates Rage by dealing and receiving damage.”

**Correction:** Represent the damage-dealt event itself with retained text if necessary, or cover attack/ability hits with an actual-damage condition and the damaged target as the hit subject. Keep incoming damage separate; do not narrow the source to spell hits.

### 18. Gnar.P rules[2] — high

**Path:** `rules[2].conditions[0].value`

The transform gate uses caster.resource=empowered rather than maximum Rage. Empowered is an activation enum and does not preserve the named resource threshold.

**Source (en:body):** “At max Rage his next Ability transforms him into Mega Gnar for 15 seconds.”

**Correction:** Use a textual maximum-Rage resource-state condition, preserving next ability use and the 15-second Mega duration. Do not invent a numeric Rage cap or treat a generic empowered state as max Rage.

### 19. Gnar.Q rules[1] — high

**Path:** `rules[1].effects[0].flags`

The 50% subsequent-target damage override uses replace_input, the stat-conversion flag, while the ordinary full-damage branch remains unconditional. The candidate does not encode a valid damage replacement for targets after the first.

**Source (form:A:en):** “Deals 50% damage to enemies beyond the first.”

**Correction:** Use a damage replacement representation with replaces_base and the 50% multiplier, or split first-target and subsequent-target damage explicitly. Keep the slow applicable to all eligible hits; do not constrain it inadvertently when splitting damage.

### 20. Gnar.Q rules[2] — high

**Path:** `rules[2].trigger.event`

The boomerang cooldown benefit is triggered by recast. The source requires catching the returning boomerang and does not authorize an ability recast.

**Source (form:A:en):** “Catching the boomerang reduces its Cooldown by 40%.”

**Correction:** Replace recast with a retained boomerang-catch event/condition (other or an appropriate contact event). Preserve the 40% cooldown reduction and Mini form; do not model another cast button press.

### 21. Gnar.Q rules[5] — high

**Path:** `rules[5].trigger.event`

The boulder cooldown benefit is also triggered by recast. The source requires physically picking up the boulder.

**Source (form:B:en):** “Picking up the boulder reduces this Ability's Cooldown by 70%.”

**Correction:** Use a boulder-pickup/contact event with an explicit pickup condition, such as enter_area plus pickup text. Preserve the 70% cooldown reduction and Mega form; do not grant it merely on recast.

### 22. Gnar.W rules[0] — high

**Path:** `rules[0].effects[0].parameters[2].statSubject`

The max-health damage coefficient asserts statSubject=target even though its own scope_ambiguous gap says that the source does not explicitly establish the owner.

**Source (form:A:en):** “plus 6/8/10/12/14% max Health magic damage”

**Correction:** Set the max-health coefficient owner to unknown and retain the ambiguity gap. Keep caster ownership only for the explicitly caster AP coefficient; do not resolve the health owner from background mechanics.

### 23. Gnar.W rules[1] — medium

**Path:** `rules[1].effects[0]`

The exit-Mega speed benefit is treated as having no specified amount, despite the source calling it the Move Speed, referring back to the preceding speed benefit. The exact referenced values and decay are not retained in this rule.

**Source (form:A:en):** “Gnar also gains the Move Speed when he leaves Mega Gnar form.”

**Correction:** Retain the referenced 20/40/60/80% speed benefit and 3-second decay on leaving Mega, citing the antecedent sentence as well. If the antecedent is left unresolved, document that specific reference ambiguity rather than claiming the supplied source has no amount.

### 24. Gnar.E rules[1] — medium

**Path:** `rules[1].conditions[0].subject`

The bounce predicate checks caster.target_type=any, which is always the caster unit, rather than requiring a unit under the landing point. The cast/leap and conditional bounce are therefore not separated by the source landing condition.

**Source (form:A:en):** “If Gnar lands on a unit he will bounce off it, traveling further.”

**Correction:** Retain a landing-on-a-unit condition on target/unknown, with a landing/contact event. Keep bounce movement on caster and allow allied or enemy units, while enemy-only damage and slow stay in their own branch.

### 25. Gnar.E rules[2] — high

**Path:** `rules[2].conditions[0]`

Mini bounce damage and slow require target_type=champion. The source says an enemy, with no champion-only restriction, so eligible non-champion enemy units are excluded.

**Source (form:A:en):** “Bouncing off an enemy deals (50/85/120/155/190 + (6% Health)) physical damage and briefly Slows by 80%.”

**Correction:** Remove the champion-only gate. Require an enemy unit that Gnar lands on and bounces from, retaining Mini form, the supplied damage, unknown health owner, and unspecified brief slow duration.

### 26. Gnar.R rules[0] — medium

**Path:** `rules[0].effects[2]`

The ordinary slow is unconditional for tossed enemies, while the wall branch states the enemies instead take its replacement damage and are stunned. The structured rules do not retain the alternate normal-versus-wall crowd-control behavior.

**Source (en:body):** “Enemies that hit a wall instead take (300/450/600 + (150% Ability Power) + (75% bonus Attack Damage)) physical damage and are Stunned.”

**Correction:** Split the ordinary non-wall slow from the wall stun branch while keeping knockback on all tossed enemies. Preserve replacement damage and leave stun duration unspecified; if the scope of instead is considered ambiguous, record that explicitly rather than asserting an unconditional slow alongside stun.

### 27. Gnar.R rules[1] — medium

**Path:** `rules[1].conditions`

The wall-impact rule omits Mega form and the relation to enemies tossed by this R. The other active R rule is explicitly Mega-only; a generic hits-a-wall predicate does not carry that source scope.

**Source (en:body):** “Mega Gnar: Gnar tosses nearby enemies”

**Correction:** Retain caster Mega form and that this wall collision is caused by the R toss on the same affected enemy. Keep wall-dependent damage/stun separate from Mini passive and the transformation Rage lockout.

## Correctly supported slots

- **Jayce.P:** Weapon swapping, skill replacement, flat 30 move speed and 0.75-second duration match the source.
- **Jayce.R:** Both transformation directions, next-attack effects, resistance gain ranges, 5-second shred, and caster bonus-AD coefficients are supported without invented intermediate level values.

## Supported portions and retained uncertainty

- Gnar E correctly retains unknown ownership for its 6% Health coefficients; no hidden caster/target owner was inferred.
- Gnar W same-enemy every-third attack-or-ability condition is retained as text without borrowing a damage number for the count. Mega W damage, 100% total AD and 1.25-second stun are supported.
- Gnar R retains the unnumbered Mini Hyper increase, the 15-second post-transformation Rage restriction, and unspecified wall-stun duration without borrowing the ordinary slow durations.
- Nidalee Cougar-Q missing-health and Hunted-order formulas remain documented uncertainties; those gaps were not flagged merely for retaining unknown formulas.
- All variant-source refs and numeric values were checked against their corresponding form documents. No candidates, code, schema or ledger files were edited.

## Verification

15 unique candidate snapshots; 27 source quotations verified as exact substrings in the named source; all zero-based rule indexes verified. Canonical hashes rechecked at 2026-10-04T04:54:50.378Z.
