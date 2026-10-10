# Final semantic review — wave 6

This evaluates faithful extraction from the frozen English/Korean summaries and tooltips, not absolute validation of live game mechanics. Honest unresolved text/gaps are allowed; definite typed falsehoods, typed/text contradictions and missing material source scope block acceptance.

All 15 slots are **accepted** at the recorded canonical snapshots. There are **no open findings**. The 29 original checks and 7 final-review verification records are resolved; some final records continue earlier issues rather than represent distinct additional defects.

## Slot decisions and snapshots

| ID | Decision | Candidate hash | Source hash |
| --- | --- | --- | --- |
| Akshan.P | accepted | `dbe1a58dfa9b61d7f91ff88034e196e0e4f833b20ca44c7ad96ed58468048824` | `72fbd9e655a84348de189d57357167058ea986ab63dfa7b1e7e215e073ae0d81` |
| Akshan.Q | accepted | `491f0ac233795759a3f373bbd1b763649bf81559b406366b4ec9917d2800abb2` | `be3c250575c912590cb890038162e70a631a54ad8acbb24733fb08d6e0ee113e` |
| Akshan.W | accepted | `1b883197523882552bc36c998c768758396a7910bf2c56c3e9d65042205cd11a` | `b2563d682e3a7d54fcc038656b9a3f7a0d5c65cc839d01eef6bd507592d566f6` |
| Akshan.E | accepted | `f9a4bf75a19e5446c3369703c320dd8e26e19bb4a2c8e3418756d09baf28085b` | `7f86f994dd5fae4a766cff933c175beff0c568c925bf63ff72e20d099335792d` |
| Akshan.R | accepted | `00b922a55e9e7db9d02e2b3315ed15d60a544273d853a9bed9e39f3a1cf29669` | `820cedfc9e2b6231467a5349b1f3d384dedf3fa9363afa308f6922ee7eb5a1ba` |
| Pyke.P | accepted | `675423eef4df3107372d1df4367568df02e18b3407edeb6f7b3cdd20d3280d8a` | `881c36cfa3fa029952ecf5ee269e8d89047bd86839594a5fb654524019859088` |
| Pyke.Q | accepted | `e0bb30454fb7f92a930dd3098045aaff95f76b8a0153ec451cc5b3594e61099f` | `f742d23643f9f2c258d26e911e38343c3a838daaab3427649c727f19abe44744` |
| Pyke.W | accepted | `637e1ed2be808cf299f2305aa32a73218985b800e1b91a8ae80e13c32cc86fdb` | `27b232ac0d075982d5bffce310a0ac388c0323e805c52548a2b5494964bcd95c` |
| Pyke.E | accepted | `3328503581386bc696f0826b5aa1fcb7a10da96323ed5b3bf84d0d7ae0eebb06` | `009062694b6883aae7a7818309cc82271611ebdd9deff92908876512896a75d4` |
| Pyke.R | accepted | `5f307233f1b4d5d4d750a275b701b8b024448c13eb47d48f7f845187fb6a1be4` | `f44e2d7eff5788e564ada90d1f7d9112b64f11a246d9310d628d6b816f0e9916` |
| Mordekaiser.P | accepted | `7ba6e808f07e242918354b4d8d82b648f50ed4627e7b0a843e80f24667860803` | `a9a31b80f399adc0f54fe1091583427b2c696326010b736fa6d8215bb3a79e9f` |
| Mordekaiser.Q | accepted | `37d5dca46f90173dc1b9477cee43cb5779a8ebb56f6919f2893db66979650929` | `a54c73848e58e18c0270aed78ecf38e9b505584a1c592464a554933c6cce3373` |
| Mordekaiser.W | accepted | `00fa65e3b36512eea21db6904e47d21bc0c6d8dca15093a51abe41fbaa44f051` | `c43ce1c2fa625f8f2512f3b8dff43db139bdb585992eff1d6f68a7b62806918d` |
| Mordekaiser.E | accepted | `2c4ba5abb6dec3ea3f243e78c6de124b0322793bdfb331d6ac8d082dc239d682` | `3c29b74bb8aadfb9ff059fc36f4e6da8830624e678eb93b584085ccb866fd94d` |
| Mordekaiser.R | accepted | `1678db400ba26274c749b8f87d2665d88f3a1385befa781ba4c987b6a4daa17f` | `410aa44b999d5ce28d752e3ffa7ef44374f91b19225f25556969a3fd7d746d96` |

Hashes use `sources.digest`: SHA-256 of `JSON.stringify(parsed candidate object)`. Source hashes are copied from frozen input jobs. Rule indices are zero based; paths are JSON Pointers into the relevant candidate.

## Source review basis

### Akshan.P

Cancellation applies to the additional shot and grants the sourced flat speed range times (1 + caster bonus-AS coefficient), decaying over one second. The unit term, full multiplication, followup status, third-hit magic damage and champion-only shield are retained; exact intermediate level values are not invented.

- en:body: “He can cancel this shot to instead gain (20 ~ 75) × (1 + 100% bonus Attack Speed) Move Speed decaying over 1 second.”

### Akshan.Q

Hit-dependent range extension moved off cast. Ranked base and bonus AD, outgoing/returning behavior, non-champion damage replacement, champion-only speed/AP ratio, and brief reveal are retained; projectile ownership remains honestly unknown.

- en:summary: “Akshan throws a boomerang that deals damage going out and coming back, extending its range each time it hits an enemy.”

### Akshan.W

Alive eligibility, Scoundrel identity, damage by Akshan within three seconds, 100-gold amount, victim-specific revive, other-mark removal, camouflage/pursuit bonuses, detection and active trails are preserved. Damage direction is corrected and duplicate gold-duration records are removed.

- en:body: “Akshan can only claim Scoundrels when he is alive.”
- en:body: “Takedowns on a Scoundrel within 3 seconds of being damaged by Akshan grant him 100 Gold, resurrects the slain allies, and removes all other Scoundrels.”

### Akshan.E

First attachment, second-stage swing, third-stage jump/final shot, Dirty Fighting priority, swinging-only on-hit reduction, critical-shot replacement, champion takedown reset, and terrain-or-champion collision are retained. Nested formulas and unresolved priority are explicitly text/gaps.

- en:body: “Third Cast: Akshan dives off the rope, firing a final shot.”
- en:body: “Colliding with an enemy Champion or terrain ends the swing early.”

### Akshan.R

Charging/storage, recast release and each bullet's first hit are separate. Minimum damage with caster 15% total AD is distinct from the named maximum-cap annotation with 45% total AD. Missing-health dependence, minion-only execute, lifesteal and 30% critical-effectiveness annotation remain; no blanket critical damage multiplier is asserted.

- en:body: “Bullet damage scales with Critical Strike Chance and Critical Strike Damage at 30% effectiveness.”

### Pyke.P

Champion damage storage, nearby-enemy count replacement, stored-damage cap, unseen regeneration, and bonusHealth to bonusAttackDamage conversion 14:1 are preserved. No baseHealth input exists; the actual Korean-body scope conflict and unknown nearby radius are correctly retained.

- ko:summary: “파이크가 획득한 추가 최대 체력은 모두 추가 공격력으로 전환됩니다.”
- en:body: “Additionally, Pyke converts all Maximum Health increases to Attack Damage instead at a rate of 14 Health to 1 Attack Damage.”

### Pyke.Q

Tap-only champion preference, held first-hit damage with typed pull, separate slows, champion-hit refund and failed-channel refund are preserved without importing preference into the held branch.

- en:body: “Hold: Pyke throws his harpoon, dealing (100/150/200/250/300 + (75% bonus Attack Damage)) physical damage to the first enemy hit and Pulling them towards him.”

### Pyke.W

Caster camouflage, conditional detection in text, and decaying flat 45 + 200% caster lethality move-speed bonus over five seconds are retained.

- en:body: “Pyke gains Camouflage and (45 + (200% Lethality))Move Speed decaying over 5 seconds.”

### Pyke.E

Caster dash and returning phantom are retained; champion-only path stun and damage use caster lethality duration and caster bonus AD damage, with rank values preserved.

- en:summary: “Pyke dashes and leaves behind a phantom that will return to him, stunning enemy champions along its path.”

### Pyke.R

The already-halved non-execute formula has no extra 50% multiplier, caster teleport is explicit, and death/recast/gold branches are scoped. Summary and typed non-execute champion condition both follow strict above (>); source equality disagreement is honestly documented.

- en:body: “Champions above the threshold and non-champions instead take physical damage equal to 50% of that amount (((125 ~ 275) + (40% bonus Attack Damage) + (75% Lethality))).”

### Mordekaiser.P

Qualifying basic-attack/basic-ability counter, champion/jungle-monster alternatives, AP attack bonus, per-second aura and move-speed range are preserved. Duration and health owner are not guessed. Source 1~5% health coefficient is text/other only because the frozen endpoints have wrong percentage metadata.

- en:body: “Mordekaiser cloaks himself in negative energy after hitting 3 basic Abilities or Attacks against champions or jungle monsters.”
- en:body: “plus (1 ~ 5)% max Health magic damage per second”

### Mordekaiser.Q

The single-target count is no longer borrowed from rank damage. Ranked base, additive level-range component, caster bonus AD/AP and isolated replacement multiplier are distinct; intermediate level values remain unresolved.

- en:body: “increased to (80/115/150/185/220 + (0 ~ 45) + (120% bonus Attack Damage) + (70% Ability Power)) × 1.3/1.35/1.4/1.45/1.5 if it hits only a single enemy.”

### Mordekaiser.W

Incoming and outgoing storage, active shield, remaining-shield consumption/heal, shield bounds and decay are preserved. Non-champion incoming source and replacement are explicit, while 75% reduction is a text/other annotation without falsely applying a remaining 75% multiplier.

- en:summary: “He may consume the shield to heal.”
- en:body: “Damage stored from non-champion sources reduced by 75%.”

### Mordekaiser.E

Passive ranked magic penetration and active enemy pull/magic damage with caster AP are preserved.

- en:body: “Passive: Mordekaiser gains 5/7.5/10/12.5/15% Magic Penetration.”

### Mordekaiser.R

Seven-second champion realm, target-sourced six-stat theft on caster and loss on target, and caster kill in the realm retaining the stolen stats until that target respawns are retained. Exact application mechanics remain honestly unresolved.

- en:body: “If Mordekaiser kills that enemy in the Death Realm he consumes their soul, keeping the stats he stole until the target respawns.”

## Direct user questions

### Akshan.P: One basic attack followed by cancelling its additional shot: movement speed and coefficient units

**accepted**. The cancellation rule retains bonus move speed B(level) × (1 + 100% × caster bonus attack speed), where B is the flat move-speed amount 20~75. The 100% is the source coefficient on bonus attack speed, the unit term is dimensionless, and one second is the decay duration. It is not 20~75% of current/base movement speed. No cancellation proc requires waiting for a third hit; additional-shot damage belongs to the separate fired-followup branch. The supplied endpoints do not determine exact intermediate level values.

Paths: `/rules/1`, `/rules/2`.

### Pyke.P: Health-item conversion 14:1 and preservation of base health

**accepted**. The stat_gain rule requires bonus scope and converts caster bonusHealth to bonusAttackDamage, 14 input to 1 output, replacing the bonus-health increase. Base health is not an input to this rule and is therefore retained under the English tooltip/Korean-summary reading. The Korean body wording that appears to cover all health is explicitly recorded as a source conflict. This supports the question from the supplied sources without claiming independently verified live-game behavior.

Paths: `/rules/3/conditions/0`, `/rules/3/effects/0/statFrom`, `/rules/3/effects/0/statTo`, `/rules/3/effects/0/parameters`, `/gaps/1`.

## Final-review repair history

### final6-1 — Akshan.W, rule 1: resolved

Original path: `/rules/1/effects/0/text` (high).

The claim conditions correctly require Akshan to have damaged the Scoundrel within three seconds, but the gold effect says 자신에게 피해를 입힌 Scoundrel, reversing the damage direction to a Scoundrel that damaged Akshan. The effect contradicts its own predicate, summary, and both tooltips.

Source en:body: “Takedowns on a Scoundrel within 3 seconds of being damaged by Akshan grant him 100 Gold, resurrects the slain allies, and removes all other Scoundrels.”

Correction checked: Damage direction now explicitly runs from Akshan to the Scoundrel; alive and prior-three-second conditions are preserved.

Current paths: `/rules/1/effects/0/text`, `/rules/1/conditions`.

Previous candidate: `d38311987d562930bc228ceac686d7202c580f537899492327c82a834bc1539e`.
Current accepted candidate: `1b883197523882552bc36c998c768758396a7910bf2c56c3e9d65042205cd11a`.

### final6-2 — Akshan.W, rule 1: resolved

Original path: `/rules/1/effects/0/parameters/2` (medium).

The gold effect repeats the identical duration_seconds parameter for en:body:n1 twice (indices 1 and 2). The source gives one eligibility interval since Akshan damaged the Scoundrel, rather than two durations of a gold effect.

Source en:body: “Takedowns on a Scoundrel within 3 seconds of being damaged by Akshan grant him 100 Gold”

Correction checked: Both erroneous gold-duration records are removed; the single eligibility interval remains in the time predicate with named damage origin.

Current paths: `/rules/1/effects/0/parameters`, `/rules/1/conditions/1`, `/rules/1/conditions/2`.

Previous candidate: `d38311987d562930bc228ceac686d7202c580f537899492327c82a834bc1539e`.
Current accepted candidate: `1b883197523882552bc36c998c768758396a7910bf2c56c3e9d65042205cd11a`.

### final6-3 — Akshan.R, rule 2: resolved

Original path: `/rules/2/effects/0/parameters/3` (high).

The minimum 15% total-AD coefficient and maximum 45% total-AD coefficient remain ordinary stat_coefficient parameters in the same bullet-damage effect. Although flat bounds and text now describe one damage result, no typed binding pairs each AD coefficient to its corresponding bound. As in Darius R, the cap coefficient still reads as another ordinary coefficient; the prior min/max relationship defect is only partly fixed.

Source en:body: “Recast: Akshan unleashes the stored bullets, each dealing at least (25/35/45 + (15% Attack Damage)) physical damage to the first enemy or structure hit, increased up to (75/105/135 + (45% Attack Damage)) physical damage based on missing Health.”

Correction checked: Minimum formula's 15% AD coefficient remains in the damage effect; maximum flat rank bounds and 45% AD are now a separate explicitly named other cap annotation.

Current paths: `/rules/2/effects/0`, `/rules/2/effects/1`.

Previous candidate: `36d71abe5c9802cedb5b29749661ba06353973401f7122bf6269b6270920c862`.
Current accepted candidate: `00b922a55e9e7db9d02e2b3315ed15d60a544273d853a9bed9e39f3a1cf29669`.

### final6-4 — Akshan.R, rule 2: resolved

Original path: `/rules/2/effects/0/parameters/4` (high).

The source's 30% effectiveness of critical chance and critical damage is typed as an unqualified damage_multiplier on the entire bullet damage. This incorrectly asserts that ordinary bullet damage is multiplied by 0.30, even though the text and gap correctly say the critical contribution formula is unspecified.

Source en:body: “Bullet damage scales with Critical Strike Chance and Critical Strike Damage at 30% effectiveness.”

Correction checked: Blanket 30% damage_multiplier is removed. Critical-effectiveness ref is now other/unknown in its separate annotation with formula uncertainty.

Current paths: `/rules/2/effects/2`, `/gaps/2`.

Previous candidate: `36d71abe5c9802cedb5b29749661ba06353973401f7122bf6269b6270920c862`.
Current accepted candidate: `00b922a55e9e7db9d02e2b3315ed15d60a544273d853a9bed9e39f3a1cf29669`.

### final6-5 — Pyke.R, rule 2: resolved

Original path: `/summary` (medium).

The new source_conflict gap explicitly selects English strict above-threshold damage, and rule 2 now uses gt. The candidate summary still says 기준 이상인 챔피언, unqualified at-or-above damage. That summary asserts the equality behavior the gap says remains uncertain and contradicts the chosen typed boundary.

Source en:body: “Champions above the threshold and non-champions instead take physical damage”

Correction checked: Summary now says 기준보다 높은 and agrees with the gt branch; English/Korean equality conflict remains documented.

Current paths: `/summary`, `/rules/2/conditions/0`, `/gaps/2`.

Previous candidate: `9aeafcc64517c35a31891dbc0a5b16bc1bcec899731990a323e18edb56df958d`.
Current accepted candidate: `5f307233f1b4d5d4d750a275b701b8b024448c13eb47d48f7f845187fb6a1be4`.

### final6-6 — Mordekaiser.P, rule 3: resolved

Original path: `/rules/3/effects/0/parameters/2` (high).

Health ownership is now honestly unknown and the spurious duration is removed. However, the 1~5 percentage endpoints remain stat_coefficient with percent=false in the frozen numbers. The frozen guide states code normalizes percent values by /100, so this typed coefficient encodes 1~5 times max health instead of 1~5%. The gap and correct percentage text do not repair the false numeric unit assertion.

Source en:body: “plus (1 ~ 5)% max Health magic damage per second”

Correction checked: The percent=false endpoints are downgraded to other, null stat/owner and unknown shape. Correct 1~5% source text, unknown health owner and unit-inventory gap remain.

Current paths: `/rules/3/effects/0/parameters/2`, `/rules/3/effects/0/text`, `/gaps/1`, `/gaps/3`.

Previous candidate: `cb7139c58d92c13cc1ffb58cdfc9f8e360bf17abb6389f50fb3f702601dfd273`.
Current accepted candidate: `7ba6e808f07e242918354b4d8d82b648f50ed4627e7b0a843e80f24667860803`.

### final6-7 — Mordekaiser.W, rule 6: resolved

Original path: `/rules/6/effects/0/parameters/0` (high).

The source owner and replacement relationship are improved, but a 75% reduction of stored damage is now typed as damage_multiplier=75%. That states a remaining factor of 0.75 rather than the source's reduction by 0.75 (remaining 0.25). It also assigns a damage multiplier to storage reduction. The text correctly says 75% 감소, so the typed role still contradicts the text.

Source en:body: “Damage stored from non-champion sources reduced by 75%.”

Correction checked: 75% is now an other/unknown reduction annotation; normal-storage reduction and remaining portion are explicit in text with replaces_base. No 75%-remaining multiplier or invented 25% ref remains.

Current paths: `/rules/6/effects/0/parameters/0`, `/rules/6/effects/0/text`, `/rules/6/effects/0/flags`, `/gaps/2`.

Previous candidate: `808cbf0744944675a60d4551511595e63ff1992d4314c60da49324ed5cc5f5f8`.
Current accepted candidate: `00fa65e3b36512eea21db6904e47d21bc0c6d8dca15093a51abe41fbaa44f051`.

## Original 29 findings

| Original finding | ID | Result | Verification |
| --- | --- | --- | --- |
| 1 | Akshan.P | resolved | Full formula, unit term, caster bonus AS and explicit compound-formula limitation are retained. |
| 2 | Akshan.Q | resolved | Range extension now occurs on ability_hit rather than unconditional cast. |
| 3 | Akshan.W | resolved | Claim conditions now explicitly name Scoundrel, alive caster and damage by Akshan within three seconds. |
| 4 | Akshan.W | resolved | No gold token is used as a health threshold; the claim uses text alive. |
| 5 | Akshan.W | resolved | Camouflage cast is independent; pursuit-only bonuses have W camouflage and moving-toward-Scoundrel conditions. |
| 6 | Akshan.W | resolved | Camouflage detection and active trails now have separate named states and predicates. |
| 7 | Akshan.E | resolved | Second/third stages are recasts with named stage predicates; initial first-terrain attachment is distinct. |
| 8 | Akshan.E | resolved | Priority now identifies Dirty Fighting champion marks while swinging before shot selection. |
| 9 | Akshan.E | resolved | On-hit effectiveness is now scoped to E swing shots. |
| 10 | Akshan.E | resolved | Critical E shot now requires a critical-hit predicate, caster attack actor, swing-shot state and replaces_base. |
| 11 | Akshan.E | resolved | Swing termination condition explicitly includes enemy-champion OR terrain collision. |
| 12 | Akshan.R | resolved | Champion lock-on/storage, recast release and first-hit bullet damage are separated. |
| 13 | Akshan.R | resolved | Execute is now a minion-only bullet-hit effect. |
| 14 | Akshan.R | resolved | Minimum damage, separate maximum cap and critical effectiveness annotations no longer assert additive min/max coefficients or a blanket critical multiplier. |
| 15 | Pyke.P | resolved | Nearby entity_count is retained and the stale schema-lacks-count statement is removed. |
| 16 | Pyke.P | resolved | Actual Korean-body all-health wording is contrasted with English increases; bonusHealth 14:1 conversion is unchanged. |
| 17 | Pyke.Q | resolved | Held harpoon text no longer claims champion preference. |
| 18 | Pyke.Q | resolved | Held harpoon now has crowd_control pull on the target. |
| 19 | Pyke.R | resolved | Both non-execute branches retain only already-halved components and text equivalence, with no extra 50% multiplier. |
| 20 | Pyke.R | resolved | Execution branch now includes movement on caster. |
| 21 | Pyke.R | resolved | Typed non-execute gt and summary strict-above wording agree; source conflict explicitly retains equality uncertainty. |
| 22 | Mordekaiser.P | resolved | Counter predicates specify basic ability/attack hits on champions or jungle monsters. |
| 23 | Mordekaiser.P | resolved | Health coefficient endpoints are no longer encoded as seconds; aura expiry remains unresolved. |
| 24 | Mordekaiser.P | resolved | Known percentage range is text/other only; health ownership remains unknown and frozen percent metadata is documented without an executable false coefficient. |
| 25 | Mordekaiser.Q | resolved | Single enemy predicate now uses explicit text rather than damage ref 115. |
| 26 | Mordekaiser.Q | resolved | Additional 0~45 is now additive amount level_range, separate from ranked base and scaling. |
| 27 | Mordekaiser.Q | resolved | Isolation multiplier now replaces the ordinary damage result. |
| 28 | Mordekaiser.W | resolved | Non-champion incoming source and replacement remain; the 75%-reduction number is now other/unknown with explicit reduction text, not an independent award or remaining multiplier. |
| 29 | Mordekaiser.W | resolved | Recast now consumes the remaining shield alongside healing its fraction. |

## Retained limitations

- **Akshan.P**: Exact level values and executable multiplication tree are unspecified/unavailable; full source formula and dimensionless unit term are retained. Third-hit damage source conflict and shield timing remain honest gaps.
- **Akshan.Q**: Projectile ownership and range-extension amount are not guessed; outgoing/returning damage is retained in summary text.
- **Akshan.W**: Duplicated gold-partner wording and revive omission, missing-mana/regen stats and numerical detection range remain honest text/gaps. The corrected claim actor and interval now agree across text and predicates.
- **Akshan.E**: Nested AS/critical multipliers and targeting-priority interaction are text with gaps; no guessed standalone second AS bonus or collision mechanics are introduced.
- **Akshan.R**: Missing-health interpolation and exact critical formula are not sourced. Minimum damage, separate maximum annotation and critical-effectiveness annotation retain their scope without claiming an executable complete formula.
- **Pyke.P**: Nearby radius is unspecified. Korean all-health wording is recorded against English/Korean-summary increases wording, with base health excluded from the chosen conversion.
- **Pyke.Q**: Exact failed-channel conditions are unspecified.
- **Pyke.W**: No numerical detection radius or camouflage duration beyond what source explicitly gives is invented.
- **Pyke.R**: Execution level interpolation, English > versus Korean >= equality conflict and health-check timing remain unresolved. Summary follows the chosen English branch.
- **Mordekaiser.P**: Health owner and aura expiry are unresolved. Known 1~5% source units are text with inventory-unit gaps and other/unknown refs; they are no longer false non-percent coefficients.
- **Mordekaiser.Q**: The additive level term's exact intermediate progression is not inferred.
- **Mordekaiser.W**: Shield decay rate and finer non-champion source classes are unspecified. Known 75% storage reduction is retained in text/other, without requiring a new residual-factor number ref.
- **Mordekaiser.R**: Six stolen stats and kill-retention duration are explicit in text; detailed application formulas are not invented.

Read the frozen writer guide/contract and all supplied source text, inspect resolved candidate number refs in one-champion batches, recheck all previous findings and the two direct user questions. Candidate snapshots were canonically hashed before and after each read. No candidates, code, source inputs or ledger were edited. Five subsequently revised slots were reread directly against all English/Korean source text; seven final-review checks, including partially resolved prior issues, are preserved as resolved history. Acceptance refers only to the recorded canonical snapshots.
