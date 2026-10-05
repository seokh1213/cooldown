# Final semantic review — wave 3

This is a source-extraction review against the frozen local 26.19-v2 inputs and contract. It is not absolute validation of live-game behavior, hidden interactions, exact runtime simulation, or numerical formulas not supplied by those sources.

All 15 slots are **accepted** at the recorded canonical snapshots, with **no open findings**. The 25 original findings, 5 root checks and 3 final-review blockers are resolved. The final 3 blockers are retained below as history.

## Slot decisions and snapshots

| ID | Decision | Candidate hash | Source hash |
| --- | --- | --- | --- |
| Darius.P | accepted | `eba2e24b7e214d44ab28f8ad3c60915c7fd5f134e6eb2c3b9aa06d791aeb1efa` | `508a9fc195f14926ef9f66fe41b21efbe0a242e6befed4b9523bf463d57cee9e` |
| Darius.Q | accepted | `66cb37b3921c598efbb2077af4693bc2157a5fc20a51b46b1ad326df6d3dd579` | `822b46454379b38994f2dd788b906b13e35cd59874c60bbc6fcb13a4d4f955ec` |
| Darius.W | accepted | `0d4f5495250ed06d1663348f182e4c8b5a45f3f94c996b2602801ab4863c7c5c` | `5b286222fe048a6c0de49bb781dcd0b8564590c59cdea467e53d37bb1a8296a3` |
| Darius.E | accepted | `6ea46060d36bb7ceeba908a6cc78cf0b3e9f2eaa9beabd5603ed6aa43529d18f` | `5f004970142045ab1774bc40f5fe06868eebe4f48f83b31748890ffbc7dc73f2` |
| Darius.R | accepted | `6b2d0eb98a68c0ec76bcc37624b934401d2f855af6ad50cfcb79724b9e7c439c` | `f183ec66ae0f088e52fcfa09ab893b48a9c82ab42f0fbd3a7afcd251c2356245` |
| Draven.P | accepted | `7911cc14a25ec2ed593ef3a6bb49fc326b93c69b08bdd2fd776aec9780c1f168` | `144b661651c026bc7ca66f00ef22ec64adc43011dddbd40902e681a50c7b1354` |
| Draven.Q | accepted | `10c7b08e40c17feb81222951009b257cdee2d2d53fd7f18100d1570905c77968` | `b7e355efe1727eb19851954ba70e5702b692a81f752edd2ef691ce9acccd9f03` |
| Draven.W | accepted | `2ce9ecbf43b458d427aa6b76aebfd118476b05383ef00b37b2a2280c41c4cfca` | `eb49fbb6c1db34d7048eed15730d7ece4dbb586b0e6a7490a60c6a9276b48933` |
| Draven.E | accepted | `1adae3853f03df5403bc42cf7f4e38e8886881ac1bfa3512a987df2ddf3ad6d3` | `d63290490402bac2b9c4b8242172e3be1bd4c71dcab50dc882bf7a7b18d72cce` |
| Draven.R | accepted | `c6be545aac4ffdcd919e68044c16e37fbf3d6935497dca703c285470282190db` | `9a779ef4a56ad9e07fa06bd546ec721ecf54ba8117e451c687f86a70c8f3051c` |
| Caitlyn.P | accepted | `bb5ca183418d3e4288724b29429f9e2dc706a298c4e59b10fba420c01bdb8928` | `4064e9f804355be0dc8ceb090cd9879ba432720b6fa0933355fb648ff5483a35` |
| Caitlyn.Q | accepted | `cf2bd5677991b4a73d3ccdf6b78dbf8a9c0fc7b18699145baaa0af161ba36383` | `cd9284f606ce53f7b531a94195f50dab90d5f3ef076a3e6fdb076881ba475dff` |
| Caitlyn.W | accepted | `c670e0660615d7e3912f854ce91377341461e3378430cd809363d25cdad31555` | `548b832b120678b3f2e44ba3a8084e4abe1019d0f6877574a7c6062b3cadde26` |
| Caitlyn.E | accepted | `16da1cec46c40a2f32dc7493d5ffc498c39856ba589f77904e06bca4d94102ff` | `598d038cd928ff60ad16ff1abc9b90fd999dd8e5d46d4aeadd188efb3373d1c5` |
| Caitlyn.R | accepted | `8db6e8ec48e67dd28abcf0b13618385c1703a0c65b20f6f5a87ee4d5936a33f0` | `714542ad2cb2fc8eca176d477b104af59ad54b7c4376bc9a9a01b03141b1053f` |

Hashes use `sources.digest`: SHA-256 of `JSON.stringify(parsed candidate object)`. Source hashes are frozen input job hashes. Rule indices are zero based; paths are JSON Pointers into the relevant candidate.

## Source review basis

### Darius.P

Maximum Hemorrhage-stack activation is a named mark state; duration and applied-stack refs are separate. The common active amplification condition now includes both maximum-stack and Noxian Guillotine-kill origins, so all qualifying hits apply five stacks after either route.

- en:body: “When an enemy reaches max stacks or is killed by Noxian Guillotine”

### Darius.Q

Edge and handle damage and no-Hemorrhage conditions are separated. Healing is restricted to edge hits on enemy champions/large jungle monsters, with missing-health text, amount 17%, cap 51%, and no maxHealth substitute.

- en:body: “Darius restores 17% missing Health per enemy champion and large jungle monster hit with the edge, up to a max of 51%.”

### Darius.W

Empowered attack damage uses caster total AD; slow has its own amount/duration. The kill refund text now names this W empowered attack as the killing blow, with a matching empowered predicate.

- en:body: “This Ability refunds its Mana cost and reduces its Cooldown by 50% if it kills the target.”

### Darius.E

Caster armor penetration and target pull, knockup, and slow remain distinct effects with the sourced rank and slow duration values.

- en:body: “Active: Darius hooks with his axe, Pulling, and Knocking Up and Slowing by 40% for 1 second.”

### Darius.R

Ordinary true damage and its 75% caster bonus-AD coefficient are separate from the maximum-cap annotation with one ranked flat cap and its 150% bonus-AD coefficient. Target Hemorrhage growth, R-specific kills, one recast within 20 seconds and rank-3 behavior are preserved without duplicated cap records.

- en:body: “If this kills the target, Darius may Recast this Ability once within 20 seconds.”

### Draven.P

Non-champion kills and axe catches now have distinct rules; champion gold is caster-owned and stack based, while death removes the sourced portion of stacks. UI counters are not modeled as rewards.

- en:body: “Draven gains 1 stack whenever he kills a non-champion unit or turret, catches a Spinning Axe.”

### Draven.Q

The structure exclusion applies only to ricochet; empowered bonus damage keeps caster bonus AD. Catch is a named other event, idle expiry no longer requires cancellation, and simultaneous axe capacity is retained.

- en:body: “Attacking a turret or structure will not cause Draven's Spinning Axes to richochet.”

### Draven.W

Caster ghosting, decaying movement speed, attack speed duration, and a catch-dependent cooldown refresh match the supplied source.

- en:body: “When Draven catches a Spinning Axe, this Ability's Cooldown is refreshed.”

### Draven.E

Physical damage uses caster bonus AD; knockback and rank-valued slow/duration are distinct target effects.

- en:body: “Draven chucks a sideways axe that deals (75/110/145/180/215 + (50% bonus Attack Damage)) physical damage, Knocks Back, and Slows by 20/25/30/35/40% for 2 seconds.”

### Draven.R

Execute rule and summary both use strict lower-than post-R health versus current caster Adoration stacks, with English/Korean boundary conflict retained. Axe reversal is unknown projectile text rather than caster movement/transform, and reversal resets falloff.

- en:body: “If Whirling Death would leave an enemy champion with less health than 100% of Draven's current League of Draven stacks (1), he will execute them.”

### Caitlyn.P

Brush doubling is gated; the attack counter explicitly reaccumulates every cycle. Both activation routes refer to one ordinary Headshot damage rule with a single total-AD coefficient range. Trap bonus is separate and Headshot gated; range is text rather than damage multiplication, and crit scaling has an honest formula gap.

- en:body: “Every 5 Attacks, Caitlyn fires a Headshot. Attacks while in brush count as 2 for building towards a Headshot.”

### Caitlyn.Q

The supplied windup duration is retained. Primary and widened secondary formulas preserve caster total AD, and the trap full-damage override is preserved as a replacement in text.

- en:body: “Enemies revealed by Yordle Snap Trap always take full damage.”

### Caitlyn.W

Active trap cap is storage_cap distinct from charge cap/recharge. Root and true sight have separate durations; Headshot bonus requires this trap's mark and Headshot activation rather than any immobilization.

- en:body: “Targets rooted by this Ability take an additional (35/80/125/170/215 + (30% bonus Attack Damage)) physical damage from Headshot.”

### Caitlyn.E

Slow and caster-AP magic damage apply to the first hit target; caster recoil is an independent cast movement effect.

- en:body: “Caitlyn fires a net, pushing her backwards.”

### Caitlyn.R

Channel sight is now an equality/state condition rather than time greater-than a state label. Caster bonus AD, crit scaling text/gap, and enemy-champion interception remain sourced.

- en:body: “This Ability grants True Sight of the target during the channel.”

## Final-review repair history

### final3-1 — Darius.P, rule 3: resolved

Original path: `/rules/3/conditions/0/value` (high).

The five-stack hit rule requires the AD buff specifically obtained from reaching maximum Hemorrhage stacks. This excludes the same buff obtained when Noxian Guillotine kills an enemy, although the source grants the five-stack application after either origin.

Source en:body: “When an enemy reaches max stacks or is killed by Noxian Guillotine, Darius gains an additional (30 ~ 230) Attack Damage and applies 5 Hemorrhage stacks on all Attack or damaging Ability hits for 5 seconds.”

Correction checked: The active amplification condition now explicitly includes maximum Hemorrhage-stack activation OR Noxian Guillotine kill; the five-stack hit effect is shared by both origins.

Current paths: `/rules/3/conditions/0/value`, `/rules/3/effects/0`.

Previous candidate: `9e19c638647926fe98f9f1c48af1d5bff39f837ad4d5fcbc4b39499920a155d6`.
Current accepted candidate: `eba2e24b7e214d44ab28f8ad3c60915c7fd5f134e6eb2c3b9aa06d791aeb1efa`.

### final3-2 — Darius.R, rule 0: resolved

Original path: `/rules/0/effects/0/parameters/4` (high).

The cap's en:body:n8 (150% bonus AD) remains a stat_coefficient of the same ordinary damage effect as en:body:n3 (75% bonus AD). The new text/gap says the cap is not added to base damage, but the typed parameter roles still do not distinguish the cap coefficient from the ordinary coefficient. The prior coefficient-binding issue is not fully corrected.

Source en:body: “up to a max of (250/500/750 + (150% bonus Attack Damage)) damage.”

Correction checked: The ordinary damage effect contains only 75% caster bonus AD. Flat maximum series and 150% caster bonus AD are now a separate explicitly named other cap effect that is not added as damage.

Current paths: `/rules/0/effects/0/parameters`, `/rules/0/effects/1`.

Previous candidate: `caf580424e5f060d00940875f2b681cd88d8f27a3983b4ddf4b704b8fffc18db`.
Current accepted candidate: `6b2d0eb98a68c0ec76bcc37624b934401d2f855af6ad50cfcb79724b9e7c439c`.

### final3-3 — Darius.R, rule 0: resolved

Original path: `/rules/0/effects/0/parameters/3` (medium).

The identical max_amount parameter for en:body:n5,n6,n7 occurs twice consecutively in one damage effect (parameter indices 2 and 3). The source states one maximum formula. This duplicate numeric record has no distinct meaning and introduces another route to double interpretation.

Source en:body: “up to a max of (250/500/750 + (150% bonus Attack Damage)) damage.”

Correction checked: There is exactly one maximum rank-series parameter in the separate cap annotation, with no duplicate cap record in ordinary damage.

Current paths: `/rules/0/effects/1/parameters`.

Previous candidate: `caf580424e5f060d00940875f2b681cd88d8f27a3983b4ddf4b704b8fffc18db`.
Current accepted candidate: `6b2d0eb98a68c0ec76bcc37624b934401d2f855af6ad50cfcb79724b9e7c439c`.

## Original 25 findings

| Original finding | ID | Result | Verification |
| --- | --- | --- | --- |
| 1 | Darius.P | resolved | Target mark=max Hemorrhage state replaces hit_count. |
| 2 | Darius.P | resolved | Duration n8 and applied-stack n7 are separate; the five-stack hit rule's common amplification state explicitly includes both max-stack and R-kill origins. |
| 3 | Darius.Q | resolved | Separate edge/handle predicates and edge plus eligible-target healing predicate are retained. |
| 4 | Darius.Q | resolved | Heal percentages no longer reference maxHealth; missing health is explicit in text and gap. |
| 5 | Darius.W | resolved | W-killing-blow qualification is explicit in the effects and the rule is empowered. |
| 6 | Darius.R | resolved | Ordinary 75% bonus-AD coefficient remains in damage; one max-amount series and 150% bonus AD belong to the explicitly named separate cap annotation. |
| 7 | Darius.R | resolved | Twenty remains only the recast-window duration; once remains text. |
| 8 | Darius.R | resolved | R-specific kill predicates guard both kill-dependent branches. |
| 9 | Darius.R | resolved | The condition and effect text now identify Noxian Guillotine's skill rank. |
| 10 | Draven.P | resolved | Non-champion kill and explicit axe-catch events are separate. |
| 11 | Draven.Q | resolved | Bonus damage no longer excludes structures; ricochet still does. |
| 12 | Draven.Q | resolved | Catch is an other event with a named catch condition and no target-type filter. |
| 13 | Draven.Q | resolved | Idle interval predicate replaces cancelled followup status. |
| 14 | Draven.Q | resolved | Two-axe simultaneous storage_cap is sourced by the dedicated two ref. |
| 15 | Draven.R | resolved | Current stack-derived post-damage threshold, strict lt, and English/Korean source conflict are retained. |
| 16 | Draven.R | resolved | Projectile reversal is unknown text and reversal condition, not caster movement/transform. |
| 17 | Caitlyn.P | resolved | Brush predicate guards count two. |
| 18 | Caitlyn.P | resolved | Named net/trap marks plus Headshot guard, no borrowed brush multiplier; doubled range retained as text/gap. |
| 19 | Caitlyn.P | resolved | Trap bonus requires Headshot activation and the trap mark. |
| 20 | Caitlyn.P | resolved | Trap/net attacks produce Headshot and refer to the single general Headshot damage rule. |
| 21 | Caitlyn.P | resolved | Critical strike chance dependency retained in text and unsupported_formula gap. |
| 22 | Caitlyn.Q | resolved | Windup rule uses the supplied summary duration ref. |
| 23 | Caitlyn.W | resolved | Concurrent active limit is storage_cap, not count spawned per cast. |
| 24 | Caitlyn.W | resolved | Specific W trap mark and Headshot activation guard physical bonus damage. |
| 25 | Caitlyn.R | resolved | During-channel state uses eq text rather than gt state label. |

## Additional 5 root checks

| ID | Check | Result | Verification |
| --- | --- | --- | --- |
| Draven.R | Strict execution threshold in summary | resolved | The summary now says post-damage health is lower than the current stack threshold, matching lt and the preferred English source. |
| Caitlyn.P | Attack counter recurring activation | resolved | Named counter predicate states each five-attack-equivalent cycle, brush weighting, and reaccumulation after firing. |
| Caitlyn.P | Ordinary Headshot damage duplicated across activation paths | resolved | Attack-count and trap/net activation rules only generate/reference Headshot; only rule 2 supplies the ordinary additional damage. |
| Caitlyn.P | Duplicate ordinary AD coefficient | resolved | General Headshot damage contains one stat_coefficient level range for n2/n3 and no duplicate ratio_output copy. |
| Darius.Q | Per-hit 17% heal versus 51% cap | resolved | One amount n20 and one max_amount n21, both null stat, with explicit missing-health per-hit/cap text and eligible-hit scope. |

## Retained limitations

- **Darius.Q**: Missing-health and exact edge/handle geometry lack dedicated representations; named text predicates and unsupported formula gap are acceptable. Amount and cap are now distinct.
- **Darius.R**: Exact formula-tree representation can remain text/gap. Ordinary and cap formulas now have distinct effects with no duplicated cap records. R skill rank and once-within-window behavior remain explicit text.
- **Draven.P**: Adoration/gold is not a STATS entry; the source relation is accurately retained in text, with null-stat unknown coefficient rather than falsely assigning an AD owner.
- **Draven.Q**: Catch geometry and readiness details are unspecified; a named other event is sufficient. No live-game inference about structure damage is made beyond the supplied source.
- **Draven.R**: Falloff arithmetic, live '(1)' display, and projectile object representation remain honest gaps. The strict execution boundary is retained across rule and summary, with a source_conflict for Korean <=.
- **Caitlyn.P**: Exact per-mark opportunity lifetime, crit formula, and a typed attack-range modifier are absent. Both Headshot activation routes and known recurring counter behavior are retained without claiming unspecified lifetime or interpolation.
- **Caitlyn.Q**: The trap full-damage override is retained as replaces_base text without duplicating the base formula. Exact widened-shot geometry is not inferred.
- **Caitlyn.R**: Crit scaling formula and exact channel/interception timings remain gaps; sourced dependency, channel state, and interception are retained.

Re-read the frozen WRITER_GUIDE.md and contract.ts; compared full source texts and resolved candidate rules. Canonical candidateHash uses sources.digest(parsed candidate), guarded by stable before/after hashes around each view. Honest text/gaps are allowed for genuinely unspecified formulas or schema limits; typed/text conflicts and missing definite scope block acceptance. The final Darius P/R versions were subsequently reread against their full English/Korean sources; all three remaining final-review blockers are resolved in preserved history. Other 13 candidate hashes were reverified unchanged.
