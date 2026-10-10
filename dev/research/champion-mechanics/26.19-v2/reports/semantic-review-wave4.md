# Semantic review wave 4

All 15 requested Aurora/Hwei/Aphelios slots were reviewed against complete supplied sources, including every variant source. This is a source-extraction review, not final approval. Candidates, code and ledger were not edited.

27 findings across 11 slots (11 high, 16 medium). No concrete failure was found in Aurora.W, Aurora.E, Aphelios.W, Aphelios.E; these are not blanket approvals.

Snapshots include both raw file SHA-256 and actual candidateHash using the same sha256(JSON.stringify(parsedCandidate)) digest as dev/scripts/advisor/champion-mechanics/sources.ts.

| Slot | Role | Variant rule counts | Findings |
| --- | --- | --- | --- |
| Aurora.P | ability | base: 2 | 1 |
| Aurora.Q | ability | base: 6 | 2 |
| Aurora.W | ability | base: 3 | 0 |
| Aurora.E | ability | base: 3 | 0 |
| Aurora.R | ability | base: 6 | 1 |
| Hwei.P | ability | base: 2 | 1 |
| Hwei.Q | ability | base: 0, QQ: 1, QW: 4, QE: 1 | 3 |
| Hwei.W | ability | base: 0, WQ: 1, WW: 1, WE: 1 | 4 |
| Hwei.E | ability | base: 0, EQ: 1, EW: 3, EE: 1 | 1 |
| Hwei.R | ability | base: 4 | 4 |
| Aphelios.P | ability | base: 2 | 4 |
| Aphelios.Q | ability | base: 0, Calibrum: 1, Severum: 1, Infernum: 1, Crescendum: 1, Gravitum: 1 | 3 |
| Aphelios.W | ability | base: 1 | 0 |
| Aphelios.E | interface_only | base: 1 | 0 |
| Aphelios.R | ability | base: 1, Calibrum: 1, Severum: 1, Infernum: 1, Crescendum: 1, Gravitum: 1 | 3 |

## Aurora.P:max-health-and-per-hundred (medium)

Paths: `rules[0].effects[0].parameters[0]`, `rules[0].effects[0].parameters[1]`

The damage is maximum-health proportional, but the base percent has no maxHealth stat/owner. The AP coefficient combines 2.7% and the denominator 100 as undifferentiated coefficient inputs; no text or gap preserves how those inputs form the ratio.

- en:body: “dealing (1% + (2.7% per 100 Ability Power)) max Health magic damage”

Correction: Preserve the target maximum-health input and the AP-per-100 relationship. Use explicit ratio roles/formula-component text, or unknown ownership plus a truthful gap if ownership cannot be established from the supplied source. Do not turn 100 into an AP coefficient or guess interpolation.

## Aurora.Q:replacement-multipliers (medium)

Paths: `rules[2].effects[0].flags`, `rules[4].effects[0].flags`, `rules[5].effects[0].flags`

The reduced recast damage is encoded as additional damage rules beside the ordinary recast damage, without identifying the reduced amount as replacing it.

- en:body: “Damage beyond the first hit is reduced to 20%.”
- en:body: “Recast deals 40% damage to minions and monsters.”

Correction: Mark the reduced-damage rules as replaces_base (or use explicit damage modification effects) and retain their own conditions. Preserve both reductions without inventing an unprovided stacking formula.

## Aurora.Q:first-hit-scope-invented (medium)

Paths: `rules[2].conditions[0]`, `rules[2].effects[0].subject`, `gaps`

The source only says damage beyond the first hit is reduced. The candidate assigns that reduction specifically to secondary_targets by projectile target order, without establishing whether the source means later distinct victims or multiple return hits on one victim.

- en:body: “Damage beyond the first hit is reduced to 20%.”

Correction: Preserve the first-hit limitation in explicit text and add scope_ambiguous/unresolved_condition unless the supplied source establishes the counting scope. Do not assert that every downstream distinct enemy is a secondary target subject to this reduction.

## Aurora.R:boundary-trigger-and-fired (high)

Paths: `rules[4].trigger`, `rules[4].conditions[0]`, `gaps[1]`

Boundary slow uses only enter_area and requires activation=fired. The source includes attempts to enter or leave, and has no fired prerequisite. The gap incorrectly says the source lacks entry/exit conditions even though both are stated.

- en:body: “Enemies attempting to enter or leave the area are Slowed by 50% for 1.5/1.75/2 seconds.”

Correction: Remove fired and preserve the entry-or-exit attempt condition. Use other with explicit boundary-attempt text for the exit branch if no leave_area event exists. The lack of a dedicated event is a schema limitation, not missing source evidence.

## Hwei.P:explosion-delay-omitted (medium)

Paths: `summary`, `rules[1].effects[0].text`

The explosion is represented on the second damaging ability hit without preserving the short detonation delay supplied in the summary.

- en:summary: “The signature detonates after a short delay, dealing magic damage to all enemies in range.”

Correction: Preserve that the second damaging ability creates a signature beneath the target and it detonates after a short, numerically unspecified delay. Do not invent a delay duration.

## Hwei.Q:qw-duplicate-and-unconditional-cap (high)

Paths: `rules[1]`, `rules[2]`

QW has two unconditional normal-damage rules. rules[1] also mixes the conditional increased maximum and its stronger AP coefficients into an unconditional damage effect, alongside the separate replacement rules.

- variant:QW:en: “dealing (60/85/110/135/160 + (30% Ability Power)) magic damage.”
- variant:QW:en: “Hitting an Isolated or Immobilized target increases the damage up to (120/201.875/302.5/421.875/560 + (60/71.25/82.5/93.75/105% Ability Power)) magic damage, based on the target's missing health.”

Correction: Keep one ordinary QW damage rule and one conditional replacement representation. Remove the leftover unconditional mixed rule. Use rank_values for the five increased AP coefficients, and retain the unresolved missing-health formula gap.

## Hwei.Q:qw-or-overlap (medium)

Paths: `rules[3]`, `rules[5]`

Isolated and immobilized are represented as independent identical replacement damage rules. A target satisfying both conditions matches both rules, while the source states one increase for the OR condition.

- variant:QW:en: “Hitting an Isolated or Immobilized target increases the damage up to”

Correction: Use a single text condition for isolated OR immobilized, or make two branches mutually exclusive. Preserve a single increased damage result, not two damage applications.

## Hwei.Q:qe-upfront-and-ticks-mixed (medium)

Paths: `rules[4].effects[0]`

The initial QE hit and lava damage per second are merged into one damage effect with two base amounts, two AP coefficients and one duration. The text distinguishes them, but the parameter groups do not identify which coefficient belongs to the instant hit versus the recurring damage.

- variant:QE:en: “dealing (20/35/50/65/80 + (30% Ability Power)) magic damage in an area”
- variant:QE:en: “deal (20/35/50/65/80 + (24% Ability Power)) magic damage per second for 2.5 seconds.”

Correction: Split the initial damage and the lava per-second damage into separate effects/rules, attaching 2.5 seconds only to the recurring lava effect/area lifetime. Retain the in-pool slow condition without guessing lingering slow duration.

## Hwei.W:allies-as-casters (high)

Paths: `rules[0].trigger.subject`, `rules[1].trigger.subject`

WQ and WW are triggered by an ally casting. The source says Hwei launches the water current and forms the pool; allies receive the effects.

- variant:WQ:en: “Hwei launches a current of swift waters in a line”
- variant:WW:en: “Hwei forms a protective pool”

Correction: Use caster as the cast actor. Keep ally/caster recipient conditions/effects distinct from who casts the spell.

## Hwei.W:wq-per-hundred-missing (high)

Paths: `rules[0].effects[0].parameters[1]`, `rules[0].effects[0].text`, `gaps`

WQ stores 3% as a scalar AP coefficient and omits the source denominator 100 entirely. This changes the AP scaling relationship.

- variant:WQ:en: “(30/32.5/35/37.5/40% + (3% per 100 Ability Power)) Move Speed”

Correction: Preserve the per-100 AP relationship using ratio roles/formula components or exact relation text with a truthful unsupported_formula gap. Do not leave a plain 3%-per-AP coefficient.

## Hwei.W:ww-recipient-and-reduction (medium)

Paths: `rules[1].effects[0].subject`, `rules[1].effects[0].parameters[2]`, `rules[1].effects[0].text`

WW only represents ally recipients and attaches the 15% shield reduction as a positive amount parameter on the same shield effect. The common body explicitly describes utility for Hwei himself and allied champions; the reduced allied shield should not imply that every recipient gets the same reduced amount.

- en:body: “provide utility for himself and allied champions.”
- variant:WW:en: “Shields over time to allied champions inside reduced by 15% for allies.”

Correction: Preserve the caster/other-allied-champion distinction conservatively. Record the 15% as a reduction of the ally shield, not another positive shield amount. If the malformed ally/self wording leaves scope uncertain, mark that exact uncertainty in a gap rather than discarding the self recipient. Do not invent an unreferenced replacement percentage.

## Hwei.W:we-mana-on-later-use (high)

Paths: `rules[2].trigger`, `rules[2].effects[1]`

WE mana restoration is bundled under the initial cast with no empowered-use condition. The source restores mana for each of the next three empowered abilities/attacks, not as an immediate cast refund.

- variant:WE:en: “empower his next three Abilities or Attacks to deal an additional (20/30/40/50/60 + (15% Ability Power)) magic damage and restore 45/50/55/60/65 Mana each.”

Correction: Keep creation of three lights/empowerment on cast. Put damage and mana restoration on the subsequent empowered ability/attack use events with remaining-light conditions. Do not infer a hit-versus-cast consumption rule beyond the supplied wording.

## Hwei.E:entry-order-as-hit-order (medium)

Paths: `rules[2].conditions[1]`

The first enemy champion entering the eye area is tested with hit_order=first. Acquisition by entry is a different event from the later homing missile hitting its first enemy; the next rule already models that later hit order.

- variant:EW:en: “locking onto the first enemy champion that enters and launching a homing missile that Roots the first enemy hit”

Correction: Preserve first champion entry as an explicit other/activation text condition on enter_area. Keep hit_order=first only for the projectile collision rule; do not add a champion restriction to the projectile victim.

## Hwei.R:ongoing-effects-on-expiry (high)

Paths: `rules[1].trigger`, `rules[1].effects[0].parameters[1]`

The accumulating slow and per-second damage occur on expiry instead of while the painting expands. The 0.25-second stacking interval is also encoded as slow duration.

- en:body: “The vision expands over time applying a Slow to enemies for 10% stacking every 0.25 seconds, and dealing (10/20/30 + (5% Ability Power)) magic damage per second.”

Correction: Represent the effects as ongoing while the vision is active, with explicit recurring-event text/conditions. Keep 0.25 seconds as a stack interval (role other or a documented interval component), not a debuff duration. Reserve expiry for the final explosion.

## Hwei.R:total-cap-as-extra-hit (high)

Paths: `rules[3].trigger`, `rules[3].effects[0]`

The aggregate maximum damage is a separate damage effect on expiry beside the real explosion. It describes the total of recurring damage plus explosion, not a third damage application.

- en:body: “Maximum damage possible is (230/385/540 + (95% Ability Power)) magic damage.”

Correction: Keep this as total-damage information or an aggregate bound that is not a separate triggered damage event. Preserve the actual per-second damage and completion explosion independently.

## Hwei.R:death-completion-omitted (medium)

Paths: `summary`, `rules[2].trigger`, `rules`

The candidate only explodes on ordinary expiry and omits explosion when the attached champion dies.

- en:summary: “The vision explodes after reaching its maximum size or when the champion dies.”

Correction: Add the marked/attached champion death completion branch with the same final explosion. Do not assume the full maximum periodic damage has already occurred if the champion dies early.

## Hwei.R:first-champion-selection (medium)

Paths: `rules[0].conditions`, `rules[0].effects[0].text`, `summary`

The attachment rule identifies a champion but omits that the first enemy champion struck is the painting center.

- en:summary: “The first enemy champion struck becomes the center of an expanding painting”

Correction: Preserve first enemy-champion hit order for attachment and identify that champion as the center. Do not apply attachment to every champion the projectile could encounter.

## Aphelios.P:ammo-use-not-hit (high)

Paths: `rules[0].trigger.event`

Ammo is spent only on attack_or_ability_hit in the candidate. The source spends ammo on attacks and abilities, without requiring a successful hit.

- en:body: “Attacks and Abilities consume a weapon's ammo.”
- ko:body: “기본 공격과 스킬 사용 시 탄약을 소모하며”

Correction: Use attack and ability-use/cast rules or explicit use-event text rather than a successful-hit gate. Do not add unprovided miss refunds or off-hand consumption details.

## Aphelios.P:unlock-levels-omitted (medium)

Paths: `summary`, `rules`, `gaps`

Weapon Q unlocking at level 2 and the ultimate unlocking at level 6 are absent from the candidate.

- en:body: “Aphelios unlocks his weapon's Ability [Q] at level 2 and his Ultimate at level 6.”

Correction: Preserve these unlock thresholds using source-number references with state/UI information or text conditions. Do not copy conventional champion ability unlock assumptions.

## Aphelios.P:permanent-stat-rankups-omitted (medium)

Paths: `summary`, `rules`, `gaps`

The permanent-stat rank-up system replacing ability powering-up is missing.

- en:body: “Instead of powering up his Abilities, Aphelios' rank-ups grant him permanent stats.”

Correction: Preserve the permanent-stat upgrade mechanic and its replacement of ability rank upgrades. Do not invent which stat amounts are granted; the supplied body does not list them.

## Aphelios.P:arsenal-mechanics-omitted (medium)

Paths: `summary`, `rules`, `gaps`

The candidate only records ammo and replacement. It omits the five-weapon arsenal and unique attack/Q identity, including the supplied weapon-specific attack traits.

- en:body: “Aphelios wields 5 Lunari Weapons”
- en:body: “Each weapon has a unique Attack and Ability [Q].”
- en:body: “Calibrum (Rifle): Long range Attacks. Severum (Scythe Pistol): Life Steal and Move Speed. Infernum (Flamethrower): Area of effect damage. Crescendum (Chakram): High damage at close range. Gravitum (Cannon): Slowing + Immobilizing effects.”

Correction: Preserve the five named weapons and their supplied qualitative identities as base rules/text. The P input has only base variant: do not invent new variant IDs, detailed hidden effects, numeric stats, or an unprovided weapon-queue algorithm. Deduplicate the repeated copied roster.

## Aphelios.Q:calibrum-followup-omitted (medium)

Paths: `rules[0].effects`, `summary`

Calibrum marks the victim but the candidate does not preserve the long-range follow-up attack granted by that mark.

- en:summary: “Calibrum (Rifle): Long range shot that marks its target for a long-range follow-up attack.”
- ko:summary: “표식을 소모해 추가로 원거리 공격을 가할 수 있습니다.”

Correction: Preserve the mark-granted long-range follow-up permission and mark consumption in text or attack_followup rules. Do not guess its exact range, damage, or off-hand interactions.

## Aphelios.Q:crescendum-two-clocks (high)

Paths: `rules[3].trigger`, `rules[3].effects[0].parameters`, `rules[3].effects[1]`

The 20-second sentry lifetime and 4-second firing window are both assigned as summon durations. The active damage shares the cast trigger rather than the enemy-approach activation; the text retains approach but never associates 4 seconds with firing.

- variant:Crescendum:en: “Aphelios deploys a lunar sentry equipped with Aphelios' off-hand weapon that lasts 20 seconds.”
- variant:Crescendum:en: “Sentries activate when an enemy approaches and fire at them”
- variant:Crescendum:en: “physical damage per shot over 4 seconds.”

Correction: Keep the 20-second lifetime on summoning. Split activation on enemy approach and per-shot damage over the 4-second active firing period. Do not assert two conflicting summon lifetimes or immediate damage on placement.

## Aphelios.Q:infernum-cone-omitted (medium)

Paths: `rules[2].effects[0].text`, `summary`

Infernum is described only as a generic flame wave; the supplied cone targeting shape is omitted.

- en:summary: “Infernum (Flamethrower): Blast enemies in a cone and attack them with your off-hand weapon.”

Correction: Preserve the cone shape in the initial hit text, retaining the subsequent off-hand attack against each enemy hit. Do not invent a cone angle or range.

## Aphelios.R:flat-amounts-labelled-as-stats (high)

Paths: `rules[0].effects[0].parameters[0]`, `rules[3].effects[0].parameters[0]`

The generic flat base values 125/175/225 are labelled totalAttackDamage, and Infernum flat bonus values 50/100/150 are labelled bonusAttackDamage. The source separates each flat base from its actual stat coefficient.

- en:body: “dealing (125/175/225 + (20% bonus Attack Damage) + (100% Ability Power)) physical damage”
- variant:Infernum:en: “an additional (50/100/150 + (25% bonus Attack Damage)) physical damage”

Correction: Set stat and statSubject to null for those flat amount parameters. Keep the separate bonusAttackDamage/AP stat_coefficient parameters and their caster ownership.

## Aphelios.R:infernum-blast-and-splash-mixed (high)

Paths: `rules[3].effects[0]`

The added moonlight blast damage and 90%-of-follow-up-attack splash are merged into one damage effect. The 90% multiplier is consequently not tied to each subsequent attack's own damage and can be read as modifying the added blast.

- variant:Infernum:en: “The moonlight blast deals an additional (50/100/150 + (25% bonus Attack Damage)) physical damage, and the subsequent Attacks explode, each dealing 90% of their damage to surrounding targets.”

Correction: Split the additional initial blast damage from the per-follow-up-attack splash. Tie the 90% input to each subsequent attack's damage and the surrounding targets of that attack, preserving the blast as an added flat-plus-bonus-AD component.

## Aphelios.R:generic-attack-tail-weapon-scope (medium)

Paths: `rules[5].effects[0].text`, `rules[5].effects[0].parameters[2]`, `gaps`

On-hit application and the normal-damage critical-strike restriction are assigned only to Gravitum. In the combined body, the standalone The Attacks sentence refers back to the main-hand follow-up attack sequence; the derived final Gravitum variant absorbs this tail without proving a weapon-only scope.

- en:body: “Then, Aphelios attacks all champions hit with his main-hand weapon.”
- en:body: “The Attacks apply on-hits. Critical strikes deal 100% of normal damage instead.”

Correction: Preserve this tail as modifiers of the shared follow-up attacks rather than silently making it Gravitum-exclusive. If placement in the derived variant prevents confident scope resolution, record scope_ambiguous and retain the exact common-source text. Keep Gravitum slow/root-specific effects separate; do not infer external crit multipliers.

## Preserved limitations and source asymmetry

- **Aurora.P — source_limit:** The source gives three damaging attacks/abilities on an enemy but does not specify counter reset or cooldown behavior. This review does not invent a reset algorithm or hidden proc cooldown merely from the candidate gte threshold.
- **Aurora.Q — honest_representation_limitation:** The missing-health recast interpolation is not supplied and is explicitly marked unsupported_formula. The maximum rank values are retained as an upper bound, rather than treated as guaranteed ordinary damage.
- **Aurora.W — text_preserves_scope:** Directional hop, landing invisibility/Realm Hopper movement speed, and enemy-champion takedown cooldown reset are preserved. Landing has no dedicated event enum, and event other plus explicit effect text is acceptable.
- **Aurora.E — text_preserves_scope:** Area damage, decaying one-second 80% slow, and the short backward hop after casting are preserved. No exact hop distance is supplied or invented.
- **Aurora.R — honest_representation_limitation:** The source separately supplies area duration and Realm Hopper duration but does not fully specify the relationship between all jump availability and those timers. The scope gap preserves that uncertainty. The invented fired boundary condition remains an actual error.
- **Hwei.P — representation_quality:** second damaging ability is retained as a text condition despite being placed under hit_count. A dedicated other condition would be clearer, but it does not assert two arbitrary attacks; no extra failure is counted for that wording. The source does not give a numeric detonation delay.
- **Hwei.Q — variant_coverage:** QQ, QW, QE all have supplied variant evidence. Referencing repeated numbers from the common body is not itself a wrong fact when their values and local mechanic match the cited variant. QQ explosion radius and QW delay length are not supplied; do not infer them.
- **Hwei.Q — honest_representation_limitation:** QW interpolation based on target missing health is explicitly unresolved. That uncertainty does not justify the duplicate unconditional QW rules or dropping the isolated/immobilized condition.
- **Hwei.W — source_limit:** The common body and WW excerpt have awkward self/ally shield wording. The review asks for preserving that distinction or a scoped gap; it does not infer a duration, accumulation formula, or a numeric replacement percentage absent from the frame.
- **Hwei.E — honest_representation_limitation:** EW eye vision extent/duration are unspecified and appropriately not invented. The unrelated immunity-interaction gap is unnecessary for this extraction task but does not claim an external interaction. All EQ/EW/EE subforms are present.
- **Hwei.R — source_asymmetry:** The summary adds the first-enemy-champion center and death-triggered explosion; the tooltip's shorter attachment/completion wording does not explicitly deny either condition. These are valid summary supplements rather than a proven source conflict.
- **Hwei.Q — mode_selection_text:** The Q/W/E summaries describe selecting subordinate abilities, and the variants remain separate. A base mode-selection/ability-replacement rule would improve completeness, but no failure is added here merely because base has no rules: it would be wrong to describe all three subspells as firing at once.
- **Aphelios.P — source_limit:** The repeated weapon roster is duplicate copied prose, not five independent sets of weapons. Rank-up permanent stat quantities and an exact ammo cost are not supplied; preserve the described mechanics without inventing those values.
- **Aphelios.Q — honest_formula_components:** Severum retains the explicit shot-count components, bonus attack-speed ownership, attack-damage range and 1.75-second window from its variant source. No invented shot schedule is needed. The base damage endpoint metadata could be clearer, but no intermediate level values were fabricated.
- **Aphelios.W — text_preserves_scope:** Main-hand/off-hand swap is preserved in the summary and its basic-attack/active-ability change is preserved in the effect text. The merged body weapon names are not treated as equipping all five simultaneously.
- **Aphelios.E — interface_only_preserved:** E is explicitly non-castable and is represented as UI information about the next weapon and queue order. Its merged combat/weapon tooltip is excluded from E combat rules with an honest scope_ambiguous gap. Do not move those paragraphs into a castable E effect.
- **Aphelios.R — honest_trigger_limitation:** The supplied weapon bonus excerpts do not fully specify every generic hit/attack timing interaction. Existing gap plus event other is preferable to inventing whether Severum healing needs a hit or exactly when mirror chakrams are created. Those uncertain events are not independently rejected here.

Empty base-rule coverage for Hwei selector slots is not interpreted as no effect. Aphelios E remains interface_only. Reported gaps are not a license to add unseen game rules.
