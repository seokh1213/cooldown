# Automatic screen audit — final repair verification

Verify resolution of only the seven source-confirmed findings from automatic-screen-audit.json in five repaired candidate slots.

**7 resolved, 0 needing revision, across 5 repaired candidate slots.** The three original false-positive candidates retain their original hashes; that is a hash check only.

This is a targeted repair verification against frozen source extraction. It does not approve complete candidate slots, reclassify the three false positives, review all 865 slots, validate live-game mechanics, or estimate population accuracy.

## Findings verified

| Audit finding | Slot | Status | Current candidate hash |
| --- | --- | --- | --- |
| screen-audit-1 | Graves.P | resolved | `2de7d345e9a60645f813a7fb4675dc273bf2f5c649ba8b043ec6dc1e363498f6` |
| screen-audit-2 | Graves.Q | resolved | `0f32492cd3441c714527b6d495c63afd4c5a2e42f05b0d9b28b8de1bd529db48` |
| screen-audit-6 | Morgana.W | resolved | `2607d9d27037b0876bcac149f2a7e6e50c05cafd38a0e0c1b505c43ec6698148` |
| screen-audit-7 | Malzahar.W | resolved | `694b051596dc7e2be23602d7c0fa4818a28bbffaf04eeb4d5ddf5fb6f8b4d677` |
| screen-audit-8 | Malzahar.W | resolved | `694b051596dc7e2be23602d7c0fa4818a28bbffaf04eeb4d5ddf5fb6f8b4d677` |
| screen-audit-9 | Nami.E | resolved | `f7f1ea737f5905380259ba558b528dc721a08ce6f7f8e6f02c9ed27a1f05819f` |
| screen-audit-10 | Nami.E | resolved | `f7f1ea737f5905380259ba558b528dc721a08ce6f7f8e6f02c9ed27a1f05819f` |

## Source and candidate evidence

### screen-audit-1 — Graves.P: resolved

Exact en:body quote: “Structures take 25% reduced damage.”

The 25% source reduction is now an other/unknown numeric annotation. The effect text explicitly says damage is reduced by 25%, and there is no false remaining damage_multiplier=25%. Source relationship is retained without inventing a new residual-factor ref.

Current paths: `/rules/4/effects/0/parameters/0`, `/rules/4/effects/0/text`, `/gaps/2`.

- `/rules/4/effects/0/parameters/0/role`: `"other"`
- `/rules/4/effects/0/parameters/0/shape`: `"unknown"`
- `/rules/4/effects/0/parameters/0/numberRefs`: `["en:body:n9"]`

Previous candidate hash: `be998fac4af31b679a4c37c3d936f69f8fb6ac4342ed107206c6818f686b342d`.
Current candidate hash: `2de7d345e9a60645f813a7fb4675dc273bf2f5c649ba8b043ec6dc1e363498f6`.
Source hash: `feefb7483056a9489a0b43cf3085066571548b6b0837fa77c085b756cc183389`.

### screen-audit-2 — Graves.Q: resolved

Exact en:body quote: “After 1 second or after colliding with terrain, it detonates”

The time=1 AND terrain-collision conjunction is removed. One explicit text condition now says 1 second elapsed OR terrain collision, and the gap honestly records the non-executable OR representation. Explosion damage remains linked to that alternative trigger.

Current paths: `/rules/1/conditions`, `/gaps/0`.

- `/rules/1/conditions/0/value/value`: `"1초 경과 또는 지형 충돌"`

Previous candidate hash: `3ec35759180c0a6c4040176dd87a5d97795e2102cad9e9278b1b5c4c7e1a6430`.
Current candidate hash: `0f32492cd3441c714527b6d495c63afd4c5a2e42f05b0d9b28b8de1bd529db48`.
Source hash: `08e5d88dc2f6298af922c6d481b6a96017a860bbdf4a5d83b675b70920f359f2`.

### screen-audit-6 — Morgana.W: resolved

Exact en:body quote: “This Ability's Cooldown is reduced by 5% every time Morgana is healed by Soul Siphon.”

Cooldown reduction no longer requires incoming damage. The caster other event and named Soul Siphon healing predicate preserve every Soul Siphon heal, with source 5% cooldown reduction and matching effect text.

Current paths: `/rules/1/trigger`, `/rules/1/conditions/0`, `/rules/1/effects/0`.

- `/rules/1/trigger/event`: `"other"`
- `/rules/1/conditions/0/value/value`: `"Soul Siphon으로 회복함"`

Previous candidate hash: `a128462e0d6a3d26979007178801fd8726692caa3c9c7ee8f138b12190fa792f`.
Current candidate hash: `2607d9d27037b0876bcac149f2a7e6e50c05cafd38a0e0c1b505c43ec6698148`.
Source hash: `5bdaf02e656234f52179921cad1cc4b87847100a3f15f0cce9d7d41032eae32a`.

### screen-audit-7 — Malzahar.W: resolved

Exact en:body quote: “Active: Malzahar summons a Voidling plus an additional Voidling per stack.”

The erroneous constant summon count=2 is removed. The summon effect now preserves one base Voidling plus one per held stack in text, with a gap for the variable total representation. The original stack-cap source is not reused as total summon count.

Current paths: `/rules/1/effects/0/parameters`, `/rules/1/effects/0/text`, `/gaps/2`.

- `/rules/1/effects/0/parameters`: `[]`
- `/rules/1/effects/0/text`: `"기본 공허충 한 마리와 보유 중첩마다 공허충 한 마리를 추가로 소환합니다."`

Previous candidate hash: `98acdd983752e0e21667146d7927b8a545b7fd38db90a27dbce9d5622d16065f`.
Current candidate hash: `694b051596dc7e2be23602d7c0fa4818a28bbffaf04eeb4d5ddf5fb6f8b4d677`.
Source hash: `0f76c6b8fc8890b7d3f0f3acfbd4324cb84bb1f58c72d44e001c6b54859f60c8`.

### screen-audit-8 — Malzahar.W: resolved

Exact en:body quote: “Voidlings deal 50% damage to epic monsters.”

The target condition now requires monster type AND a named epic-monster predicate. The source 50% replacement multiplier therefore no longer applies to ordinary monsters.

Current paths: `/rules/5/conditions`, `/rules/5/effects/0/parameters/0`, `/rules/5/effects/0/flags`.

- `/rules/5/conditions/1/value/value`: `"에픽 몬스터"`
- `/rules/5/effects/0/parameters/0/numberRefs`: `["en:body:n16"]`

Previous candidate hash: `98acdd983752e0e21667146d7927b8a545b7fd38db90a27dbce9d5622d16065f`.
Current candidate hash: `694b051596dc7e2be23602d7c0fa4818a28bbffaf04eeb4d5ddf5fb6f8b4d677`.
Source hash: `0f76c6b8fc8890b7d3f0f3acfbd4324cb84bb1f58c72d44e001c6b54859f60c8`.

### screen-audit-9 — Nami.E: resolved

Exact en:body quote: “Nami empowers an allied champion's next 3 Attacks and Abilities for 6 seconds”

All three affected proc branches now test ally.mark=empowered, matching the ally mark creation and ally attack/ability triggers. Caster AP ownership remains separate from the empowered ally's mark.

Current paths: `/rules/0/effects/0/subject`, `/rules/1/conditions/0`, `/rules/2/conditions/0`, `/rules/3/conditions/0`.

- `/rules/1/conditions/0/subject`: `"ally"`
- `/rules/2/conditions/0/subject`: `"ally"`
- `/rules/3/conditions/0/subject`: `"ally"`

Previous candidate hash: `515bdadd993a8aa7eb4b04ea23dfbdad34385467ecadd28135bd726c4ec2d7ad`.
Current candidate hash: `f7f1ea737f5905380259ba558b528dc721a08ce6f7f8e6f02c9ed27a1f05819f`.
Source hash: `e1e5ee83d9980502d088b299bd92a80c25f129b606b2f751669485570bdfbdf9`.

### screen-audit-10 — Nami.E: resolved

Exact en:body quote: “(5% per 100 Ability Power)”

At the audit-corrected actual path, the 100-AP denominator is now ratio_input rather than flat amount. The 5% caster AP coefficient and text explicitly preserve its additive per-100 relation with the ranked slow amount.

Current paths: `/rules/1/effects/0/parameters/1`, `/rules/1/effects/0/parameters/2`, `/rules/1/effects/0/text`.

- `/rules/1/effects/0/parameters/2/role`: `"ratio_input"`
- `/rules/1/effects/0/parameters/2/numberRefs`: `["en:body:n8"]`

Previous candidate hash: `515bdadd993a8aa7eb4b04ea23dfbdad34385467ecadd28135bd726c4ec2d7ad`.
Current candidate hash: `f7f1ea737f5905380259ba558b528dc721a08ce6f7f8e6f02c9ed27a1f05819f`.
Source hash: `e1e5ee83d9980502d088b299bd92a80c25f129b606b2f751669485570bdfbdf9`.

## Unchanged false positives

- **Kayn.P**: original/current/repair hash `3fb8be958101b640d38d32f2a2ba2b411355dcf1cb6daf0262b0ef5f23c9d251` matches. No additional semantic verdict.
- **Kayn.R**: original/current/repair hash `3776791e74c17c864d39a3d1029e784041061ce89d973df2a93ff9353762117a` matches. No additional semantic verdict.
- **Morgana.P**: original/current/repair hash `1cc99e767b233d8dcd588427d842c284f05ecfc03ca33d5d4ec6bcfa57630947` matches. No additional semantic verdict.

## Report and snapshot verification

Audit-report canonical hash: `01d17a7d804912041b2428a67d0c57339260434fb9a6946664e0bfec5c19f818`.

Repair-report canonical hash: `2deadeda6d82b35b3b80dc59ec40142a76ee5a9ee6be0caaeef8534249d51062`.

Read both audit and repair reports, reread the five updated candidates and their source text, inspect the seven changed paths and related effects, and compare canonical current hashes to repair-report hashes. Honest text/gaps are allowed when a dedicated executable representation is unavailable.

Hashes use `sources.digest`, SHA-256 of `JSON.stringify(parsed object)`. All five repaired candidates match the repair report; source hashes are unchanged. No candidates, code, source inputs or ledger were edited during this verification.
