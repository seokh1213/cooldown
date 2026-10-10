# Semantic review wave 1 — final repaired snapshots

All 15 repaired candidates were re-read against the complete supplied English/Korean source frames. All source input hashes remain unchanged. All 30 initial findings and the 3 additional findings found during repair review are resolved in the current candidate snapshots.

No concrete remaining source-semantic failure was found. This report does not grant final approval or claim hidden gameplay facts. The JSON retains the full initial review and the three additional repair findings, plus final canonical candidateHash snapshots.

| Slot | Final source-review result |
| --- | --- |
| Azir.P | no_concrete_failure_found |
| Azir.Q | no_concrete_failure_found |
| Azir.W | no_concrete_failure_found |
| Azir.E | no_concrete_failure_found |
| Azir.R | no_concrete_failure_found |
| Bard.P | no_concrete_failure_found |
| Bard.Q | no_concrete_failure_found |
| Bard.W | no_concrete_failure_found |
| Bard.E | no_concrete_failure_found |
| Bard.R | no_concrete_failure_found |
| Annie.P | no_concrete_failure_found |
| Annie.Q | no_concrete_failure_found |
| Annie.W | no_concrete_failure_found |
| Annie.E | no_concrete_failure_found |
| Annie.R | no_concrete_failure_found |

## Verified source mechanics

- **Azir.P:** rubble-based Sun Disc summon; damage and armor/MR ranges; 45-second disintegration; unknown AP owner/attack timing explicitly scoped.
- **Azir.Q:** all-soldier relocation and enemy-path damage/slow; no invented 75-hit prerequisite; no extra damage for multiple soldiers.
- **Azir.W:** basic attack replacement in soldier range; primary-target on-hit at source ratio; subsequent soldier damage replacement; non-primary-target multiplier bounds; summon proximity to enemy turret; separate two-charge capacity.
- **Azir.E:** ordinary shield/dash/path damage separated from champion collision; collision stops dash and grants soldier charge.
- **Azir.R:** forward soldier wall; enemy knockback and magic damage; five-second enemy path block.
- **Bard.P:** random Chimes; experience/mana/out-of-combat move speed; stack cap and duration; Meep generation unknowns; one Meep consumed per enhanced attack; enough-Chime AoE/slow; English/Korean timer conflict retained.
- **Bard.Q:** first/second distinct enemy damage; first-target slow; second enemy stuns both hit enemies; wall after first enemy stuns the initial target.
- **Bard.W:** first-ally activation; Bard AP input and allied move-speed output; growth lower/upper bounds with unknown interpolation; mature threshold described without automatic expiry heal; shrine consumed after allied activation; enemy-champion destruction; simultaneous capacity and charges.
- **Bard.E:** one-way terrain portal; 10-second lifetime; champion entry near entrance; ally traversal faster than enemy; lexical one excluded from distance.
- **Bard.R:** all hit units/structures stasis; 2.5-second duration; action/movement restrictions and invulnerability/untargetability.
- **Annie.P:** four ability uses build readiness; next empowered damaging ability stuns; game start/respawn grants readiness; source does not define detailed multi-target/counter sequencing.
- **Annie.Q:** fireball damage; refund/cooldown reduction tied to this fireball killing its target; mana-cost amount retained without invented numeric cost.
- **Annie.W:** cone area damage; flat rank values and caster AP coefficient.
- **Annie.E:** mutually exclusive self/other-allied-champion recipients; shield and decaying move speed follow selected recipient; retaliation while current shield holds; no invented 60-count thresholds or fired gate; Tibbers always receives stated effects when summoned.
- **Annie.R:** caster magic-penetration grant; summon damage and per-second nearby burn; summon/stun/death enrage causes; decaying attack/move speed enrage buffs; recast orders; normal summon stats with unknown pooled formula and exact evidence.

## Additional repair errors verified resolved

### Bard.W:rereview-immature-fixed-minimum — resolved

The first repaired version said every shrine younger than five seconds healed exactly the minimum, despite progressive growth and an unknown intermediate formula.

- en:body: “restores at least (25/50/75/100/125 + (40% Ability Power)) Health to the first ally to enter.”
- ko:body: “성소의 체력 회복 효과는 점차 증가해, 5초 이후에는 최대 (50/87.5/125/162.5/200 + (70% 주문력))의 체력을 회복시킬 수 있습니다.”

Verified final correction: The final heal rule states growth above the minimum and the larger amount after five seconds, preserves min/max as bounds, and keeps intermediate interpolation unresolved. No exact immature plateau remains.

### Bard.W:rereview-movespeed-output-owner — resolved

The repaired per-100 ratio incorrectly assigned the movement-speed output to caster.

- en:body: “Health to the first ally to enter.”

Verified final correction: ratio_output moveSpeed now belongs to ally; ratio_input abilityPower belongs to caster.

### Annie.E:rereview-self-and-ally-not-exclusive — resolved

Self shield/speed rules were unconditional on cast, granting self effects even on an allied-recipient cast.

- en:summary: “Grants Annie or an ally a shield, a burst of Move Speed”

Verified final correction: Other-allied-champion and self-selected recipients are explicitly mutually exclusive. Both shield and speed branches use the same recipient selection, while the independent Tibbers clause remains separate.

## Source limits and review boundary

- **all — full_rereview:** All 15 repaired candidates were read again. All 15 input file hashes are unchanged from the initial complete English/Korean source reading. Newly introduced text, conditions, source-number references and owner fields were checked. Three further repair errors were reported to root and their updated final files were re-read before this report.
- **Azir.P — honest_representation_limitation:** Sun Disc AP owner is now unknown with a matching scope gap. Unspecified damage recipient/event are not filled from external game knowledge.
- **Azir.W — honest_representation_limitation:** The tooltip's non-primary-target percentage endpoints are preserved; exact intermediate values are explicitly unknown. The primary attack target relation is no longer declared unknowable.
- **Bard.P — source_conflict_preserved:** English gives the out-of-combat movement buff a 20-second duration; Korean wording sounds like a 20-second out-of-combat prerequisite. The final candidate follows English and records both excerpts as source_conflict. Unknown experience/Meep period/cap/Chime thresholds are still gaps.
- **Bard.Q — text_preserves_schema_limit:** Second distinct enemy and wall collision are explicit text conditions because dedicated second-target/wall enums do not exist. The text correctly limits stun to enemies already hit; a generic nearby_enemies subject does not claim a new AoE stun.
- **Bard.W — honest_representation_limitation:** Intermediate shrine growth cannot be calculated from the supplied source. The final text/gap now preserve the minimum as a lower bound and larger mature endpoint, without a flat immature amount or an invented interpolation curve. Endpoint AP coefficients are retained as formula components.
- **Bard.E — lexical_number_excluded:** The one in one-way is excluded from numeric parameters, and direction remains in text. No exact portal distance was invented.
- **Annie.P — source_limit:** The source describes four ability uses and the next damaging ability, but does not fully specify counter reset or multi-target consumption sequencing. This review does not add hidden proc/counter algorithms absent from the source.
- **Annie.E — repair_verified:** The self recipient is now selected conditionally. The current-shield/enemy retaliation limit is preserved as text rather than a false count parameter; unknown internal state storage is not invented.
- **Annie.R — honest_representation_limitation:** Three English enrage causes and recast orders are preserved. The pooled unknown Tibbers stat block retains exact evidence and an unsupported_formula gap; it does not assert a resolved fabricated stat equation. The Korean omission of summon enrage is source asymmetry rather than an explicit denial.
- **all — review_boundary:** No concrete remaining source disagreement was found in these snapshots. This is not a blanket assertion of all hidden gameplay behavior and does not grant final approval; root remains responsible for ledger/approval decisions.
