# Semantic review wave 6

Frozen 26.19-v2 source semantics review of all 15 Akshan, Pyke, and Mordekaiser slots

Read frozen WRITER_GUIDE.md and contract.ts, full local source documents, resolved candidate views, and relevant frozen number/rank/level facts. Canonical hashes use sources.digest(parsed candidate), with a before/after stability check around each resolved view. No candidates, sources, maintained code, or ledger edits.

Reviewed: Akshan.P, Akshan.Q, Akshan.W, Akshan.E, Akshan.R, Pyke.P, Pyke.Q, Pyke.W, Pyke.E, Pyke.R, Mordekaiser.P, Mordekaiser.Q, Mordekaiser.W, Mordekaiser.E, Mordekaiser.R.

No findings: Pyke.W, Pyke.E, Mordekaiser.E, Mordekaiser.R.

Findings: 29 (11 medium, 17 high, 1 low). Rule indices are zero based; paths are JSON pointers within the candidate.

## Candidate hash snapshots

`sources.digest(parsed candidate)` is SHA-256 of `JSON.stringify(parsed candidate)`, not raw file bytes. Each resolved view was guarded by matching before/after canonical hashes.

| ID | Canonical candidate hash |
|---|---|
| Akshan.P | 250ec4540982e01333e37c5e5f003e2d799cbbd4ba1f2f44f18d30ebe0cdd880 |
| Akshan.Q | 5ad94f824288b94b507f1cf283c0e33a20a595434dcf8f15019dc3b79493ada5 |
| Akshan.W | 1e2541065c6ccac073711bf218d6af0acaed3bda0f1bbdab07b78e1b57343604 |
| Akshan.E | 7c3dfc144e3cc173c057bb9d05fdfb519f366b10f64d4deeed70d315fa0a6295 |
| Akshan.R | 01746b049dc11aed94e9a7ea732dfc26d7c9bfc4122c478d82e37ce90ec6adce |
| Pyke.P | 2c32a2513d88064cba12878398f6113ea15a47c677bc2f8f9b488d308dacbd8f |
| Pyke.Q | d0f4d04044f03287c45d76d564804499519f7b8de27c3b416151cc51117811ae |
| Pyke.W | 637e1ed2be808cf299f2305aa32a73218985b800e1b91a8ae80e13c32cc86fdb |
| Pyke.E | 3328503581386bc696f0826b5aa1fcb7a10da96323ed5b3bf84d0d7ae0eebb06 |
| Pyke.R | 0bd169fb8018ec9274135f9a6fabc012a062daf0b26ba4351f071cdbcf131d1c |
| Mordekaiser.P | e5794f3e40882ed5b72b580ca0accb1a342737ea81fcf5981eb2990cb1e79882 |
| Mordekaiser.Q | 2581b02cd259a29241b94686fbea2a1fafa679f2f0829cc946cb709fe2a70977 |
| Mordekaiser.W | c30a2fc092971c86adc8d8c15a8d49a72b73dbbdd08cfd872390377b55cf45ea |
| Mordekaiser.E | 2c4ba5abb6dec3ea3f243e78c6de124b0322793bdfb331d6ac8d082dc239d682 |
| Mordekaiser.R | 1678db400ba26274c749b8f87d2665d88f3a1385befa781ba4c987b6a4daa17f |

## Direct question checks

### Akshan.P: One basic attack followed by cancellation of the additional shot: movement speed?

Event and stat owner retained; compound formula needs the finding above

Rule 2 correctly uses attack_cancelled plus followup_status=cancelled, caster movement, caster bonusAttackSpeed, and decays over the supplied one second. Preserve (level-dependent base) × (one + caster bonus-AS coefficient), not ordinary attack cancellation or a target-owned stat. No intermediate level interpolation is justified.

### Pyke.P: Health item or another extra maximum-health gain: attack damage conversion?

Mechanics retained correctly in snapshot

Rule 3 is caster stat_gain, bonus scope, stat_conversion bonusHealth -> bonusAttackDamage, ratio_input 14 and ratio_output one, both caster owned, and replace_input. The health increase is replaced, not added alongside AD; base health is not claimed to convert. The findings on stale/conflicting gap text do not require changing this correct conversion.

## Akshan

### Akshan.P, rule 2 — medium

Path: `/rules/2/effects/0/parameters`

The cancellation event and bonus-AS owner are correct, but the movement effect drops the unit term in the explicit multiplicative formula. Its text says only that movement speed increases, and the params do not distinguish base speed times (one plus bonus-AS coefficient) from an additive bonus-AS term. This limits a direct quantitative answer to the one-attack-then-cancel question.

Source: `en:body`

> He can cancel this shot to instead gain (20 ~ 75) × (1 + 100% bonus Attack Speed) Move Speed decaying over 1 second.

Correction: Retain the full multiplicative relationship in effect text and the unit term en:body:n3 as a formula component, with caster bonusAttackSpeed. Mark the lack of an executable compound-formula representation honestly; keep the level range without inferring intermediate values. Preserve the existing followup cancellation predicate.

### Akshan.Q, rule 0 — medium

Path: `/rules/0/effects/1`

Range extension on each enemy hit is placed in the unconditional cast rule, so the structured event also extends range for a cast that hits nothing.

Source: `en:body`

> extending the range each time an enemy is hit.

Correction: Move the range-extension effect to an ability_hit rule. Keep its affected object as the boomerang in text, using unknown/scope gap if projectile subjects cannot be represented. Preserve outgoing and returning damage in text without inventing a flight-distance formula.

### Akshan.W, rule 1 — high

Path: `/rules/1/conditions`

The claim rule requires caster visibility=visible rather than caster being alive. It also names no Scoundrel mark (mark is only boolean true), and the three-second time condition has no stated origin in the rule predicate. A living camouflaged Akshan must not lose claim eligibility solely because he is unseen.

Source: `en:body`

> Akshan can only claim Scoundrels when he is alive.

Correction: Replace the visible predicate with an explicit alive condition. Name the target's Scoundrel mark and define the time condition as the interval since that target was damaged by Akshan. Keep the revive beneficiaries restricted to allies killed by that Scoundrel and preserve the genuine duplicated-source ambiguity about an additional gold partner.

### Akshan.W, rule 4 — high

Path: `/rules/4/conditions/0`

Alive is separately encoded as health > en:body:n2, but n2 is the 100-gold reward. This invents a 100-health survival threshold and leaves the real claim rule without its required alive condition.

Source: `en:body`

> Akshan can only claim Scoundrels when he is alive.

Correction: Remove the gold token from the health predicate. Attach a named alive condition directly to the claim effects; no zero-health number ref exists here, so preserve alive as text rather than borrowing a number.

### Akshan.W, rule 2 — high

Path: `/rules/2/effects`

The cast rule grants pursuit-only movement speed and missing-mana regeneration unconditionally alongside entering camouflage. These bonuses require camouflage in this way and movement toward Scoundrels, while entering camouflage itself does not require pursuing one.

Source: `en:body`

> While Camouflaged in this way, Akshan also gains 80/90/100/110/120 Move Speed and 12% missing Mana regen while moving towards Scoundrels.

Correction: Keep cast camouflage independent. Put movement speed and regeneration into their own rule gated on this W camouflage state and moving toward Scoundrels. Preserve missing-mana ownership as caster text/gap because the contract lacks missingMana or manaRegen; do not substitute maxMana.

### Akshan.W, rule 3 — medium

Path: `/rules/3/conditions/0`

A generic unseen predicate controls both detection and Scoundrel trails. Unseen is not the named W active/camouflage state, and trail visibility is specified while active, even if a nearby enemy detects Akshan. The reveal effect itself has no explicit enemy-in-detection-radius condition.

Source: `en:body`

> Camouflaged units cannot be seen unless an enemy champion is inside their detection radius. While active, Akshan also sees trails leading to Scoundrels.

Correction: Separate camouflage detection from the trail UI effect. Gate detection by this camouflage plus an enemy champion inside its detection radius, and gate trails by W active. Retain unspecified detection distance as text rather than inventing units.

### Akshan.E, rule 1 — high

Path: `/rules/1/trigger`

All three stages in rules 0, 1, and 2 are ordinary cast events, and the repeated-shot and final-shot rules have no cast-stage predicates. This makes swing damage and the final shot eligible on the first grapple cast. The first terrain hit_order is not a substitute for first/second/third cast state.

Source: `en:body`

> Second Cast: Akshan swings around the terrain, repeatedly firing at the nearest enemy

Correction: Use cast for the initial terrain attachment, and recast or explicit named stage predicates for starting the swing and jumping off. Preserve caster swing/jump movement independently from shot damage and retain the first-terrain-hit qualification.

### Akshan.E, rule 3 — high

Path: `/rules/3/conditions/0`

The targeting-priority rule uses target followup_status=empowered instead of the target's Dirty Fighting mark and champion type. It also runs after a hit rather than describing selection of the next shot target.

Source: `en:body`

> Akshan prioritizes shooting champions marked by Dirty Fighting.

Correction: Name the Dirty Fighting mark and champion target type, and preserve shooting priority as a targeting rule while swinging. Keep the relation to nearest-enemy selection unresolved if needed; do not invent empowered followup status as the mark.

### Akshan.E, rule 4 — high

Path: `/rules/4/conditions/0`

The reduced on-hit effectiveness is gated by generic caster activation=empowered. This does not identify swinging on E, and can incorrectly apply the reduction to other empowered attacks.

Source: `en:body`

> On-hits while swinging are 25% effective.

Correction: Use a named currently-swinging state on the applicable E shots. Preserve the replacement on-hit effectiveness without applying it to unrelated empowered attacks.

### Akshan.E, rule 5 — high

Path: `/rules/5/conditions`

The critical-shot formula is conditioned only on generic empowered activation. There is no critical-strike predicate or distinct swing-shot state, and the trigger's attack subject is target rather than the shooter. The normal and critical formulas can therefore both apply to the same ordinary shot.

Source: `en:body`

> Attacks can critically strike for (8/16/24/32/40 + (25% Attack Damage)) × (1 + 30% bonus Attack Speed) × (0.5 + 50% Critical Strike Damage) physical damage.

Correction: Require a critical E shot and the named swing-shot state, with caster as attack actor. Make the critical formula replace the ordinary per-shot formula rather than add a second full damage event. Preserve the nested multipliers in text/formula components and a gap if the contract cannot bind them.

### Akshan.E, rule 7 — high

Path: `/rules/7/conditions`

The collision rule requires target_type=champion and other=any, even though terrain collision is another termination route. The conjunction excludes terrain and does not actually identify a collision event.

Source: `en:body`

> Colliding with an enemy Champion or terrain ends the swing early.

Correction: Use explicit collision-with-enemy-champion and collision-with-terrain alternatives, as separate rules or a text disjunction. Gate them on an ongoing swing and remove the meaningless other=any predicate.

### Akshan.R, rule 0 — high

Path: `/rules/0/trigger`

Initial lock-on/storage, bullet damage, execution, lifesteal, and critical scaling are all placed on the first cast. The source releases stored bullets on Recast, and damage is tied to each bullet's first collision rather than starting the charge.

Source: `en:body`

> Recast: Akshan unleashes the stored bullets, each dealing at least

Correction: Separate champion lock-on and up-to charging/storage from recast release and bullet-hit effects. Add each bullet's first-hit predicate. Apply the champion restriction to the lock-on only so later bullets can hit an enemy or structure as sourced.

### Akshan.R, rule 0 — high

Path: `/rules/0/effects/3`

The minion execute is unconditional within the general damage rule. The same rule also applies to champions and structures, so it formally executes those targets too.

Source: `en:body`

> Bullets execute minions and apply Lifesteal.

Correction: Put execution in a separate bullet-hit rule restricted to target_type=minion. Keep general bullet damage and lifesteal independent of that minion-only condition.

### Akshan.R, rule 0 — high

Path: `/rules/0/effects`

The bullet's minimum formula, maximum formula, and critical-scaling annotation are three distinct damage effects with no relationship distinguishing one health-scaled damage result from additive damage. The maximum formula is not an additional unconditional hit, and the critical annotation is not a second independent damage amount.

Source: `en:body`

> increased up to (75/105/135 + (45% Attack Damage)) physical damage based on missing Health.

Correction: Represent one per-bullet damage result with minimum/maximum bounds and explicitly paired AD coefficients, scaled by the actual hit target's missing health. Keep critical scaling as a modifier or text/formula gap linked to that result. Do not sum the minimum and maximum formulas or infer the missing-health interpolation.

## Pyke

### Pyke.P, rule 1 — low

Path: `/gaps/0/detail`

The gap says the schema has no typed nearby-entity count and that this condition is retained as text. The contract contains entity_count, and rule 1 already correctly uses nearby_enemies.entity_count > the one ref.

Source: `en:body`

> when there's more than one enemy nearby.

Correction: Remove or rewrite this stale gap. Retain only genuinely unspecified nearby radius, not a claimed inability to express entity count. Leave the correctly typed count condition intact.

### Pyke.P, rule 3 — medium

Path: `/gaps/1`

The stated conflict between the Korean summary's bonus maximum health and English tooltip's maximum-health increases is not a contradiction: both describe increases rather than base health. The actual scope discrepancy is the Korean body saying all maximum health, without saying increases.

Source: `ko:body`

> 또한 파이크가 최대 체력을 모두 공격력으로 전환합니다.

Correction: Rewrite the source_conflict evidence around the Korean body versus English increases wording, if preserving that literal discrepancy. Keep caster bonusHealth to bonusAttackDamage, 14:1, replace_input; this conversion currently supports the health-item question correctly and must not be broadened to base health.

### Pyke.Q, rule 1 — medium

Path: `/rules/1/effects/0/text`

The held harpoon damage text copies 'preferring champions' from the tap branch. The held branch's source says first enemy hit and supplies no champion-priority exception.

Source: `en:body`

> Hold: Pyke throws his harpoon, dealing (100/150/200/250/300 + (75% bonus Attack Damage)) physical damage to the first enemy hit and Pulling them towards him.

Correction: Remove champion preference from the held branch, retaining first enemy hit. Keep champion preference in tap only.

### Pyke.Q, rule 1 — medium

Path: `/rules/1/effects/1`

The explicitly sourced Pull is represented only as generic movement with crowdControl=null. The contract has crowd_control/pull, so the pull CC is absent from the structured effects.

Source: `en:body`

> and Pulling them towards him.

Correction: Represent this enemy displacement as crowd_control with crowdControl=pull and subject=target. Preserve its direction toward Pyke without inventing distance or duration.

### Pyke.R, rule 2 — high

Path: `/rules/2/effects/0/parameters`

Rules 2 and 3 include both damage_multiplier=50% and the already-halved 125~275 +40% bonus AD +75% lethality formula. The source presents equivalent representations; applying the multiplier to these reduced components would halve them a second time.

Source: `en:body`

> physical damage equal to 50% of that amount (((125 ~ 275) + (40% bonus Attack Damage) + (75% Lethality))).

Correction: Choose either half of the full execution threshold or the explicit already-halved formula as the computational representation. Keep the other as an equivalence in text, not another multiplier on the reduced numbers. Retain caster ownership and the non-champion versus above-threshold branches.

### Pyke.R, rule 1 — medium

Path: `/rules/1/effects/0`

The execution text includes teleporting to the target, but the structured effects contain no caster movement event. The only effect is target execute, which does not identify the actor that teleports.

Source: `en:body`

> teleporting to and executing targets below

Correction: Preserve the sourced teleport as a separate movement effect on caster under the sourced condition, alongside execute on target. Do not infer an extra teleport condition for healthy champions from background knowledge.

### Pyke.R, rule 2 — medium

Path: `/rules/2/conditions/0`

The candidate chooses >= for surviving-champion damage. English says 'above the threshold', while Korean says 기준 이상. These differ at equality, and no source boundary gap/conflict is recorded.

Source: `en:body`

> Champions above the threshold and non-champions instead take physical damage

Correction: Retain the strict below execution predicate. Document English above versus Korean at-or-above wording and the equality uncertainty rather than treating the boundary as unqualified cross-source agreement. Follow the preferred English wording or explicitly preserve the Korean completion as an unresolved boundary.

## Mordekaiser

### Mordekaiser.P, rule 1 — medium

Path: `/rules/1/conditions`

The cloak activation in rules 1 and 2 uses generic attack_or_ability_hit and an unnamed accumulated hit_count. The source restricts qualifying hits to basic abilities or attacks against champions or jungle monsters; the rule does not preserve that basic-ability qualification or identify the qualifying count in text.

Source: `en:body`

> after hitting 3 basic Abilities or Attacks against champions or jungle monsters.

Correction: Name the counter as qualifying basic-ability/attack hits on champions or jungle monsters and preserve the basic-ability restriction as an explicit predicate/text. Keep monster versus champion alternatives; do not let arbitrary spell/minion hits silently contribute.

### Mordekaiser.P, rule 3 — high

Path: `/rules/3/effects/0/parameters/4`

duration_seconds uses en:body:n4 and n5, which are the endpoints of the health-damage percentage range. The source gives damage per second but no one-to-five-second aura duration, and the existing gap correctly says expiry is unspecified.

Source: `en:body`

> plus (1 ~ 5)% max Health magic damage per second

Correction: Remove these refs from duration_seconds. Keep per-second damage in text and retain unspecified aura expiry as a gap; do not convert the health coefficient range into a duration.

### Mordekaiser.P, rule 3 — high

Path: `/rules/3/effects/0/parameters`

The max-health damage component is assigned to caster maxHealth without a source identifying that owner. In addition, en:body:n4/n5 are percent=false in the frozen number inventory despite the surrounding '(1 ~ 5)%' wording, and min/max amount does not distinguish a health coefficient range from whole-damage bounds.

Source: `en:body`

> plus (1 ~ 5)% max Health magic damage per second

Correction: Do not assert caster health ownership; retain unknown owner with scope_ambiguous unless supplied source evidence establishes it. Preserve the level-dependent percentage coefficient as such in text/formula components. Add unresolved_number/unsupported_formula for the frozen percent metadata instead of treating raw one/five as whole-health factors or damage caps.

### Mordekaiser.Q, rule 1 — high

Path: `/rules/1/conditions/0/value/ref`

The single-enemy condition uses en:body:n1, the second-rank base damage 115. It thus requires 115 entities instead of one enemy hit.

Source: `en:body`

> if it hits only a single enemy.

Correction: Replace the borrowed damage ref with a text entity-count condition naming exactly one enemy hit. The number inventory has no ref for 'single', so do not borrow a decimal multiplier or unrelated rank number.

### Mordekaiser.Q, rule 0 — medium

Path: `/rules/0/effects/0/parameters`

The additive 0~45 level component is encoded as scalar min_amount zero and max_amount 45. It is not a minimum/maximum bound on the full damage, whose ranked base already exceeds 45, and the input's levelValues confirms the progression belongs to level.

Source: `en:body`

> (80/115/150/185/220 + (0 ~ 45) + (120% bonus Attack Damage) + (70% Ability Power)) magic damage

Correction: Keep this as an additive level_range component, separate from rank_values and caster stat coefficients. Retain the relationship in text and avoid exact interpolation from the endpoints.

### Mordekaiser.Q, rule 1 — high

Path: `/rules/1/effects/0/flags`

The isolation multiplier is a second damage effect without replaces_base, while the ordinary formula also remains eligible. The source increases that same damage to the multiplied value; it does not add a second full hit.

Source: `en:body`

> increased to (80/115/150/185/220 + (0 ~ 45) + (120% bonus Attack Damage) + (70% Ability Power)) × 1.3/1.35/1.4/1.45/1.5

Correction: Make the isolated formula/multiplier replace the ordinary damage result, using replaces_base and text linking it to the ordinary formula. Keep the bonus conditional on only one enemy hit after fixing its count predicate.

### Mordekaiser.W, rule 6 — high

Path: `/rules/6/effects/0`

The non-champion storage reduction is encoded as amount=75% with no replacement or linkage to the normal incoming 7.5% storage. Its predicate names target rather than the incoming damage source, and the text omits how much the storage is reduced. This can be read as a second storage award rather than a 75% reduction.

Source: `en:body`

> Damage stored from non-champion sources reduced by 75%.

Correction: Name the non-champion incoming damage source, and make this a reduction of the normal stored-damage amount by the referenced percentage. Preserve the remaining-factor relationship in text/formula components and use replacement semantics; do not store 75% as an additional independent amount.

### Mordekaiser.W, rule 3 — medium

Path: `/rules/3/effects`

The recast heals from remaining shield but never consumes that shield in the summary or rules. The summary source explicitly describes consumption; retaining the shield would permit an unsupported repeated-heal reading.

Source: `en:summary`

> He may consume the shield to heal.

Correction: Preserve consuming the remaining active shield alongside healing its specified fraction. Keep the shield basis as the caster's remaining shield in text because there is no shield-value statistic; do not substitute current/max health.

## Retained limitations

- **Akshan.P**: The input does not explicitly establish the ownership/lifetime of the third-hit counter. The current source gap warns against inventing same-target behavior; do not add it from background knowledge. Level-range endpoints do not justify exact intermediate values.
- **Akshan.W**: The repeated English body genuinely differs on an additional partner's gold reward and omits revival in its second repetition. Preserve the actual duplication ambiguity without denying the common caster gold reward or silently inventing a variant. Missing-mana regeneration and terrain/detection distance can remain text/gaps.
- **Akshan.E**: The bonus-AS standalone sentence may repeat the already-written multiplicative formula; the candidate's gap appropriately avoids adding the term twice. The nearest-enemy versus Dirty Fighting priority relationship can remain text/gap after correcting the mark predicate.
- **Akshan.R**: Missing-health interpolation and precise crit scaling are not given. Retain caster AD/crit ownership and actual hit target missing health in text; do not turn maximum damage into another hit. Charging is 'up to' the duration/storage cap.
- **Pyke.P**: The conversion rule directly represents the health-to-AD question and is accurate. Nearby radius and storage/healing speed are unspecified, while the nearby entity count is expressible and already retained.
- **Pyke.Q**: Tap/hold are activation states within the supplied base variant; no unprovided variant IDs are needed. Exact unsuccessful-channel timing can remain unresolved while the refund condition remains explicit.
- **Pyke.W**: Camouflage detection radius is not numeric. The sourced caster movement bonus, lethality coefficient, decay, and duration are retained; no extra rank scaling should be invented.
- **Pyke.E**: The phantom returns shortly and applies path effects to champions. The candidate retains the return, caster dash, champion scope, caster lethality stun scaling, and bonus-AD damage; exact return delay/path geometry is absent.
- **Pyke.R**: Exact intermediate level values and hit/check timing can remain unresolved. Execute threshold uses current target health and caster-owned stats, not maximum target health. Death inside the X grants the recast even without Pyke executing; the gold branches correctly distinguish that outcome.
- **Mordekaiser.P**: Exact aura expiry is unavailable. Health coefficient owner is not explicit in the provided text, and frozen percentage metadata for (one~five)% is problematic; retain these as gaps rather than silently choosing caster/target or inventing seconds.
- **Mordekaiser.Q**: The level component is additive to the ranked base. Endpoint values must not imply linear interpolation; the isolation factor is rank_values and a replacement/multiplier of the same hit.
- **Mordekaiser.W**: Shield decay rate is unknown, and remaining shield is not a named statistic. The Health wording for shield bounds does not explicitly clarify current versus maximum in the source text; retain that scope ambiguity if it cannot be confirmed from supplied evidence.
- **Mordekaiser.E**: Magic penetration, enemy pull, and magic damage with caster AP are source-faithful in the reviewed snapshot.
- **Mordekaiser.R**: The reviewed candidate explicitly retains both caster gain and target loss of the listed target-owned core stats, realm duration, same-victim kill persistence until respawn, and an honest gap for unspecified calculation details. No extra hidden death-realm rules were added.
