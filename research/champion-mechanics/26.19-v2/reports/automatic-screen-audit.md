# Automatic screen audit — limited purpose sample

This evaluates individual automatic allegations against frozen source extraction, not live game mechanics or complete candidate approval. It is a purposive sample and cannot estimate population accuracy, precision or the number of remaining errors.

The five specified reports contained no high findings. Following root's explicit revision, this audit selected 2 substantive medium findings per champion: **10 findings in 8 slots**. Within this selected sample, **7 are confirmed**, **3 are false positives**, and **0 are source ambiguous**. One confirmed finding has an incorrect screen pointer. These are sample counts, not an accuracy estimate.

## Decisions

| Audit | Slot | Automatic severity | Verdict | Actual candidate path |
| --- | --- | --- | --- | --- |
| screen-audit-1 | Graves.P | medium | confirmed | `/rules/4/effects/0/parameters/0` |
| screen-audit-2 | Graves.Q | medium | confirmed | `/rules/1/conditions` |
| screen-audit-3 | Kayn.P | medium | false_positive | `/rules/0/trigger` |
| screen-audit-4 | Kayn.R | medium | false_positive | `/rules/8/trigger` |
| screen-audit-5 | Morgana.P | medium | false_positive | `/rules/0/trigger/subject` |
| screen-audit-6 | Morgana.W | medium | confirmed | `/rules/1/trigger/event` |
| screen-audit-7 | Malzahar.W | medium | confirmed | `/rules/1/effects/0/parameters/0` |
| screen-audit-8 | Malzahar.W | medium | confirmed | `/rules/5/conditions/0` |
| screen-audit-9 | Nami.E | medium | confirmed | `/rules/2/conditions/0` |
| screen-audit-10 | Nami.E | medium | confirmed | `/rules/1/effects/0/parameters/2` |

## Evidence

### screen-audit-1 — Graves.P: confirmed

Automatic report finding 4 (zero based), severity **medium**, original normalized path `/rules/4/effects/0/parameters/0`.

Automatic allegation: 감소량 25%를 `damage_multiplier`로 기록해 피해가 25%만큼 적용되는 값처럼 읽힙니다. 원문은 피해가 25% 감소한다고 합니다.

Exact en:body quote: “Structures take 25% reduced damage.”

The scalar damage_multiplier is the source 25% reduction, so the typed record applies 0.25 rather than retaining the source's remaining portion (0.75). The effect text only says reduced damage and no alternate rule repairs this number meaning.

Actual path: `/rules/4/effects/0/parameters/0`. Related paths: `/rules/4/effects/0/text`.

Direction: Keep 25% as a named reduction in text/other or formula components; do not use it as the remaining damage multiplier or invent a new number ref.

Candidate hash: `be998fac4af31b679a4c37c3d936f69f8fb6ac4342ed107206c6818f686b342d`.
Source hash: `feefb7483056a9489a0b43cf3085066571548b6b0837fa77c085b756cc183389`.

### screen-audit-2 — Graves.Q: confirmed

Automatic report finding 6 (zero based), severity **medium**, original normalized path `/rules/1/conditions`.

Automatic allegation: 폭발 조건에 `time = 1`과 `activation = 지형 충돌`을 함께 넣어 두 조건이 모두 충족되어야 하는 것처럼 구조화했습니다. 원문은 둘 중 하나가 발생하면 폭발한다고 명시하고 gap도 OR 관계를 설명합니다.

Exact en:body quote: “After 1 second or after colliding with terrain, it detonates”

The only explosion rule requires time=1 AND terrain-collision activation. Both tooltips give alternatives, and even the candidate gap describes OR. No separate time-only or collision-only explosion rule preserves the missing alternatives.

Actual path: `/rules/1/conditions`. Related paths: `/gaps/0`, `/summary`.

Direction: Represent alternative explosion routes separately or with an explicit text disjunction; remove the contradictory conjunction.

Candidate hash: `3ec35759180c0a6c4040176dd87a5d97795e2102cad9e9278b1b5c4c7e1a6430`.
Source hash: `08e5d88dc2f6298af922c6d481b6a96017a860bbdf4a5d83b675b70920f359f2`.

### screen-audit-3 — Kayn.P: false_positive

Automatic report finding 0 (zero based), severity **medium**, original normalized path `/rules/0/trigger/event`.

Automatic allegation: 피해를 입히는 주체가 케인이라고 원문은 한정하지 않는데, 규칙은 `damage_taken`으로 케인이 피해를 받는 사건을 조건으로 합니다. 이는 충전 획득 사건을 잘못 나타냅니다.

Exact en:body quote: “Damaging ranged champions charges the Shadow Assassin”

The report says damage_taken makes Kayn take damage, but trigger.subject is target, not caster; the ranged enemy is the damage recipient and caster receives charge. Thus the alleged actor reversal is absent. The source's omitted detailed damage-origin qualification is separate from this inspected claim and is not silently promoted into a confirmed defect.

Actual path: `/rules/0/trigger`. Related paths: `/rules/0/conditions`, `/rules/0/effects/0/subject`.

Direction: Reject this actor-reversal finding; inspect both event and subject before proposing a trigger change.

Candidate hash: `3fb8be958101b640d38d32f2a2ba2b411355dcf1cb6daf0262b0ef5f23c9d251`.
Source hash: `0cb64b258e6a7f605ce5fab719b9841414f0d9714e626e1cc336663b1fe77335`.

### screen-audit-4 — Kayn.R: false_positive

Automatic report finding 16 (zero based), severity **medium**, original normalized path `/rules/8/trigger/event`.

Automatic allegation: 다르킨 회복은 케인이 빠져나올 때 발생하지만, 2.5초 경과에만 연결해 재사용 후 빠져나오는 경우를 놓칩니다.

Exact en:body quote: “After 2.5 seconds or after Recasting, Kayn bursts out”

Rule 8 is the timed Darkin heal branch. Rule 9 explicitly has recast, Darkin Slayer condition, and the same caster heal formula/effect. The alleged omitted recast heal is already preserved elsewhere in this candidate.

Actual path: `/rules/8/trigger`. Related paths: `/rules/8/effects/0`, `/rules/9/trigger`, `/rules/9/conditions`, `/rules/9/effects/0`.

Direction: Reject the missing-recast finding after reviewing both timed and recast branches.

Candidate hash: `3776791e74c17c864d39a3d1029e784041061ce89d973df2a93ff9353762117a`.
Source hash: `20936130fc07cd4d22443473e852e640ccd89f1da5c077e2fa7436798b07c61c`.

### screen-audit-5 — Morgana.P: false_positive

Automatic report finding 0 (zero based), severity **medium**, original normalized path `/rules/0/trigger/subject`.

Automatic allegation: 발동 주체를 `target`으로 지정했지만, 원문에서 회복하는 주체는 모르가나입니다.

Exact en:body quote: “Morgana Heals for 18% of the damage dealt by her Abilities to champions, large minions, and medium and larger jungle monsters.”

The event is ability_hit on target, the damaged champion. The heal effect is independently and correctly on caster, and its text says Morgana heals from her ability damage. The automated finding conflates the hit recipient with the heal recipient.

Actual path: `/rules/0/trigger/subject`. Related paths: `/rules/0/trigger/event`, `/rules/0/effects/0/subject`, `/rules/0/effects/0/text`.

Direction: Reject this ownership finding; keep the effect recipient distinct from the trigger event recipient.

Candidate hash: `1cc99e767b233d8dcd588427d842c284f05ecfc03ca33d5d4ec6bcfa57630947`.
Source hash: `b417a9da265294a7cb96f3d4d1f45bc3248273f7e9fa0501ac3c0907eda89109`.

### screen-audit-6 — Morgana.W: confirmed

Automatic report finding 9 (zero based), severity **medium**, original normalized path `/rules/1/trigger`.

Automatic allegation: 재사용 대기시간 감소 이벤트를 `damage_taken`으로 지정했지만, 원문 사건은 영혼 흡수로 모르가나가 회복될 때입니다.

Exact en:body quote: “This Ability's Cooldown is reduced by 5% every time Morgana is healed by Soul Siphon.”

The source reduces cooldown on Soul Siphon healing, but the sole cooldown rule requires damage_taken by caster plus a healed-by-Soul-Siphon predicate. The predicate does not replace the wrong event; incoming damage is an extra unsupported requirement.

Actual path: `/rules/1/trigger/event`. Related paths: `/rules/1/conditions/0`, `/rules/1/effects/0`.

Direction: Use an explicit Soul Siphon heal event, or other plus a named healing predicate if the contract lacks a healing trigger; keep the 5% cooldown reduction.

Candidate hash: `a128462e0d6a3d26979007178801fd8726692caa3c9c7ee8f138b12190fa792f`.
Source hash: `5bdaf02e656234f52179921cad1cc4b87847100a3f15f0cce9d7d41032eae32a`.

### screen-audit-7 — Malzahar.W: confirmed

Automatic report finding 2 (zero based), severity **medium**, original normalized path `/rules/1/effects/0/parameters/0`.

Automatic allegation: ‘count’에 2를 넣었지만 인용 출처의 숫자 2는 패시브 중첩 최대치이며, 소환 수는 기본 한 마리와 중첩당 한 마리 추가입니다. 이 값은 소환 수가 아닙니다.

Exact en:body quote: “Active: Malzahar summons a Voidling plus an additional Voidling per stack.”

Additional exact en:body quote: “Passive: Malzahar's other Abilities give him a stack when cast (max 2).”

The summon effect's count ref is en:body:n0=2, which comes from max stack cap. The source and effect text instead give one base Voidling plus one per stack, hence a variable summon count. Correct text does not repair a constant count=2.

Actual path: `/rules/1/effects/0/parameters/0`. Related paths: `/rules/1/effects/0/text`, `/rules/0/effects/0/parameters/1`.

Direction: Remove the cap ref from summoned count; preserve base one plus per-held-stack one in text/formula annotations and keep 2 only as the stack cap.

Candidate hash: `98acdd983752e0e21667146d7927b8a545b7fd38db90a27dbce9d5622d16065f`.
Source hash: `0f76c6b8fc8890b7d3f0f3acfbd4324cb84bb1f58c72d44e001c6b54859f60c8`.

### screen-audit-8 — Malzahar.W: confirmed

Automatic report finding 3 (zero based), severity **medium**, original normalized path `/rules/5/conditions/0`.

Automatic allegation: 조건을 모든 monster 대상으로 설정했지만 본문은 epic monsters로 한정합니다.

Exact en:body quote: “Voidlings deal 50% damage to epic monsters.”

The only typed condition is target_type=monster, so the replacement 50% multiplier applies to ordinary monsters too. Epic is present in effect text, but no epic-only predicate or separate rule restricts the typed scope. The source explicitly limits this modifier to epic monsters.

Actual path: `/rules/5/conditions/0`. Related paths: `/rules/5/effects/0/text`, `/rules/5/effects/0/parameters/0`.

Direction: Add a named epic-monster condition alongside monster type; keep the 50% multiplier restricted to that category.

Candidate hash: `98acdd983752e0e21667146d7927b8a545b7fd38db90a27dbce9d5622d16065f`.
Source hash: `0f76c6b8fc8890b7d3f0f3acfbd4324cb84bb1f58c72d44e001c6b54859f60c8`.

### screen-audit-9 — Nami.E: confirmed

Automatic report finding 0 (zero based), severity **medium**, original normalized path `/rules/2/conditions/0`.

Automatic allegation: 강화 표식의 소유자를 시전자(`caster`)로 검사하지만, 원문상 표식을 받는 쪽은 아군 챔피언입니다. 이 조건은 표식 소유자를 잘못 지정합니다.

Exact en:body quote: “Nami empowers an allied champion's next 3 Attacks and Abilities for 6 seconds”

The cast creates the mark on ally and the attack/ability trigger is ally, but proc conditions test caster.mark=empowered. This checks Nami's mark instead of the empowered ally's mark, contradicting the source and mark creation. The same ownership error also appears in the slow and area branches.

Actual path: `/rules/2/conditions/0`. Related paths: `/rules/0/effects/0/subject`, `/rules/2/trigger/subject`, `/rules/1/conditions/0`, `/rules/3/conditions/0`.

Direction: Require the empowered mark on the receiving ally for these proc rules; preserve caster AP ownership separately.

Candidate hash: `515bdadd993a8aa7eb4b04ea23dfbdad34385467ecadd28135bd726c4ec2d7ad`.
Source hash: `e1e5ee83d9980502d088b299bd92a80c25f129b606b2f751669485570bdfbdf9`.

### screen-audit-10 — Nami.E: confirmed

Automatic report finding 1 (zero based), severity **medium**, original normalized path `/rules/2/effects/0/parameters/1`.

Automatic allegation: 둔화량의 주문력 계수인 `5% per 100 Ability Power`에서 100은 비율의 분모인데, 별도의 고정 둔화량(`amount`)으로 분류되어 있습니다.

Exact en:body quote: “(5% per 100 Ability Power)”

The slow effect's en:body:n8=100 is role amount, not the denominator of its 5%-per-100-AP coefficient. The substantive error exists, but the automated pointer rules.2.effects.0.parameters.1 actually targets the damage effect's 20% AP coefficient. This finding has a valid issue and an incorrect localization.

Actual path: `/rules/1/effects/0/parameters/2`. Related paths: `/rules/1/effects/0/parameters/1`, `/rules/2/effects/0/parameters/1`.

Direction: Relocate the finding to rule 1's slow parameter 2 and encode 100 as the coefficient's ratio input, not an extra flat slow amount.

Candidate hash: `515bdadd993a8aa7eb4b04ea23dfbdad34385467ecadd28135bd726c4ec2d7ad`.
Source hash: `e1e5ee83d9980502d088b299bd92a80c25f129b606b2f751669485570bdfbdf9`.

## Scope and verification

All 25 screen snapshot slots in the five reports matched current candidate and source hashes. This check validates snapshot currency; only the ten allegations above received source-semantic review. Canonical hashes use `sources.digest`, SHA-256 of `JSON.stringify(parsed object)`.

All selected automated severity labels are medium. Verdict assesses substantive source correctness independently; no error-rate extrapolation or full slot acceptance is claimed.

No candidate, code, source or ledger was edited.
