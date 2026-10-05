# Wave 4 최종 원문 대조 검수

검수 시각: 2026-10-04T05:20:10.263Z

Aurora, Hwei, Aphelios의 P/Q/W/E/R 총 15개를 수정 완료 통보 후 다시 읽고, 영어·한국어 원문 및 하위 variant와 대조했습니다. 15개 입력 파일의 해시는 초기 검수와 같습니다. 후보·코드·스키마·ledger는 수정하지 않았습니다.

기존 27건과 재검수 중 발견한 추가 3건은 최신 파일에서 해결됐습니다. 현재 공급 원문 범위에서 남은 구체적 오류는 0건입니다. 최종 승인은 root가 별도로 결정하며 이 보고서는 승인 상태를 변경하지 않습니다.

## 추가 3건 수정 확인

### Hwei.W:rereview-self-shield-certainty-gap-conflict — medium, resolved

발견 당시 경로: `rules[1].effects[0].parameters`, `gaps[1].detail`

The first repaired candidate assigned definite self shield amounts and a 60% AP coefficient while its gap said self numeric application was not established.

- en:body: “provide utility for himself and allied champions.”
- variant:WW:en: “Shields over time to allied champions inside reduced by 15% for allies.”

최신 원문 대조 결과: Latest caster shield parameters are empty. Effect text and scope gap consistently preserve the self recipient without claiming its numeric amount or allied-reduction applicability.

### Aphelios.R:rereview-binding-eclipse-root-applied-as-r-effect — medium, resolved

발견 당시 경로: `rules[6].trigger`, `rules[6].conditions`, `rules[6].effects[1].kind`, `rules[6].effects[1].crowdControl`

The first repaired R candidate used a direct crowd_control/root effect of 1.35 seconds without a Binding Eclipse use condition, although source changes the named Q root duration.

- variant:Gravitum:en: “Binding Eclipse's Root effect is increased to 1.35 seconds against these targets.”

최신 원문 대조 결과: Latest rules[8] uses an other modifier with null crowdControl and an explicit Binding Eclipse root-on-Gravitum-bonus-target condition. R slow is independent; no immediate R root is asserted.

### Aphelios.R:rereview-champion-explosion-gate — high, resolved

발견 당시 경로: `rules[0].conditions`, `rules[3].conditions`

The first repaired generic and Infernum initial blast rules had unqualified ability_hit with empty conditions despite a champion-only explosion trigger.

- en:body: “explodes when it hits a champion”
- variant:Infernum:en: “The moonlight blast deals an additional (50/100/150 + (25% bonus Attack Damage)) physical damage”

최신 원문 대조 결과: Latest initial blast rules[0] and [4] both require target_type=champion. Nearby-enemy damage recipients remain distinct. The all-hit-champions main-hand attack is separately represented as a followup_attack rule.

## 15개 검수 범위

| 슬롯 | 결정 | 대조한 주요 메커니즘 |
| --- | --- | --- |
| Aurora.P | 공급 원문 범위에서 추가 오류 발견 없음 | three damaging attack/ability exorcism threshold; target maximum-health and per-100 AP relation; champion-only spirit release; four-second follower and caster healing per second |
| Aurora.Q | 공급 원문 범위에서 추가 오류 발견 없음 | initial magic hit and 3.5-second curse; optional and automatic recast; missing-health upper bound with unresolved interpolation; 20% beyond-first-hit and 40% minion/monster replacement multipliers with counting-scope gap |
| Aurora.W | 공급 원문 범위에서 추가 오류 발견 없음 | directional hop; landing invisibility and Realm Hopper speed; enemy-champion takedown cooldown reset |
| Aurora.E | 공급 원문 범위에서 추가 오류 발견 없음 | area magic damage; 80% one-second decaying slow; short backward hop after casting |
| Aurora.R | 공급 원문 범위에서 추가 오류 발견 없음 | hop and landing pulse/30%-two-second slow; distinct source area and buff timers retained with scope gap; edge-to-opposite-edge jump permission; entry-or-exit attempt slow; optional early recast |
| Hwei.P | 공급 원문 범위에서 추가 오류 발견 없음 | four-second enemy-champion mark; second damaging ability on marked enemy; signature beneath target and short unspecified delay; area magic explosion and AP owner |
| Hwei.Q | 공급 원문 범위에서 추가 오류 발견 없음 | QQ first-enemy explosion and target maximum-health component; one ordinary QW plus isolated-or-immobilized replacement bound; initial QE damage separate from recurring in-pool lava damage/slow; QQ/QW/QE separate; base selection preserved in summary |
| Hwei.W | 공급 원문 범위에서 추가 오류 발견 없음 | WQ caster actor and allied per-100 AP movement relation; WW self recipient without numeric certainty and allied 15% reduction; WE three-light creation separate from next-three-use damage/mana; unresolved empowered-use consumption timing |
| Hwei.E | 공급 원문 범위에서 추가 오류 발견 없음 | EQ first-hit flee and damage; EW lingering vision, first-champion entry acquisition and first-enemy projectile collision; EE center pull/damage and decaying slow; EQ/EW/EE separate |
| Hwei.R | 공급 원문 범위에서 추가 오류 발견 없음 | first enemy-champion attachment and painting center; ongoing quarter-second slow stacking and per-second damage; completion or attached-champion-death explosion; aggregate maximum without extra damage event |
| Aphelios.P | 공급 원문 범위에서 추가 오류 발견 없음 | five weapons/main-off-hand access and unique attack/Q; supplied qualitative weapon traits; ammo on attacks/abilities and depletion replacement; Q level 2/ultimate level 6 and permanent-stat rank-ups |
| Aphelios.Q | 공급 원문 범위에서 추가 오류 발견 없음 | Calibrum first victim/mark and optional mark-consuming long-range follow-up; Severum movement, closest-enemy/champion priority and source shot-count components; Infernum cone followed by off-hand attacks on every hit enemy; Crescendum off-hand-equipped 20-second summon and separate approach-activated four-second firing; Gravitum previously Gravitum-slowed enemies root/damage |
| Aphelios.W | 공급 원문 범위에서 추가 오류 발견 없음 | main/off-hand swap; basic attack and active ability replacement; merged roster not treated as equipping all five weapons |
| Aphelios.E | 공급 원문 범위에서 추가 오류 발견 없음 | interface_only/no third castable ability; next-weapon UI and depletion-to-end queue statement; merged combat body scope gap |
| Aphelios.R | 공급 원문 범위에서 추가 오류 발견 없음 | champion-gated initial surrounding-enemy blast; all-hit-champion main-hand follow-up with common on-hit/critical-damage tail; Calibrum consumption bonus and Severum healing; separate Infernum initial bonus and per-attack splash; five extra Crescendum chakrams; Gravitum slow separate from conditional Binding Eclipse duration modification |

## 기존 27건 해결 확인

| 지적 ID | 수정본 대조 결과 |
| --- | --- |
| Aurora.P:max-health-and-per-hundred | Target maxHealth ownership, the AP-per-100 components, explicit relation text and a formula gap now preserve the source formula without inventing intermediate values. |
| Aurora.Q:replacement-multipliers | All 20% beyond-first-hit and 40% minion/monster damage rules now carry replaces_base. |
| Aurora.Q:first-hit-scope-invented | The reduction uses a source-worded other condition, no secondary_targets subject, and an explicit counting-scope gap. |
| Aurora.R:boundary-trigger-and-fired | The invented fired condition is removed; the explicit attempt-to-enter-or-leave condition covers both branches. The gap names the missing event enum, rather than claiming missing source. |
| Hwei.P:explosion-delay-omitted | Effect text preserves signature creation beneath the marked enemy and a short, unspecified delay. |
| Hwei.Q:qw-duplicate-and-unconditional-cap | One ordinary QW rule remains; increased upper bounds and stronger rank AP coefficients are confined to one conditional replacement rule. |
| Hwei.Q:qw-or-overlap | One isolated-or-immobilized text condition avoids duplicate damage for targets satisfying both. |
| Hwei.Q:qe-upfront-and-ticks-mixed | Initial QE damage is separate from ongoing in-pool 24% AP damage per second and slow, with 2.5 seconds on recurring lava damage. |
| Hwei.W:allies-as-casters | WQ and WW cast subjects are caster; allies are recipients. |
| Hwei.W:wq-per-hundred-missing | Both 3% and 100 refs are retained as formula components with exact relation text and a matching gap. |
| Hwei.W:ww-recipient-and-reduction | Self and allied recipients are separately preserved, 15% is an explicitly described reduction, and final self shield numeric scope is unconfirmed with empty parameters. |
| Hwei.W:we-mana-on-later-use | Light creation is separate from subsequent empowered-use damage and mana restoration; use-versus-hit uncertainty is retained. |
| Hwei.E:entry-order-as-hit-order | Eye acquisition uses first-champion-entry text on enter_area; hit_order=first remains on the projectile collision. |
| Hwei.R:ongoing-effects-on-expiry | Recurring slow and per-second damage require active expansion; 0.25 seconds is a stack interval, not duration. |
| Hwei.R:total-cap-as-extra-hit | The aggregate maximum is only gap/evidence information; no separate third damage application remains. |
| Hwei.R:death-completion-omitted | The attached champion death completion explosion is present, without guaranteed full periodic maximum. |
| Hwei.R:first-champion-selection | Attachment preserves the first enemy champion struck and identifies it as the painting center. |
| Aphelios.P:ammo-use-not-hit | Attack and cast use events replace successful-hit gating, with unprovided main/off-hand details left unresolved. |
| Aphelios.P:unlock-levels-omitted | State/UI text and refs retain Q level 2 and ultimate level 6. |
| Aphelios.P:permanent-stat-rankups-omitted | Permanent stat rank-ups replacing ability powering-up are retained without invented quantities. |
| Aphelios.P:arsenal-mechanics-omitted | The five named weapons, main/off-hand access, unique attack/Q and qualitative traits are retained once. |
| Aphelios.Q:calibrum-followup-omitted | Mark-granted long-range attack permission and mark consumption are retained without fabricated range or damage. |
| Aphelios.Q:crescendum-two-clocks | The final file actually contains the off-hand-equipped 20-second sentry summon and separate approach activation/per-shot damage over four seconds. |
| Aphelios.Q:infernum-cone-omitted | Initial flame damage explicitly retains the cone, followed by off-hand attacks on each hit enemy. |
| Aphelios.R:flat-amounts-labelled-as-stats | Generic and Infernum flat amounts now have null stat/owner; actual AD/AP coefficients remain separate. |
| Aphelios.R:infernum-blast-and-splash-mixed | Initial additional blast and per-follow-up-attack 90%-of-own-damage splash are separate rules. |
| Aphelios.R:generic-attack-tail-weapon-scope | Shared main-hand follow-up text carries on-hit and 100%-normal-damage critical strikes; common-source scope uncertainty is explicit. |

## 해석 범위

- **all / full_rereview**: All 15 candidates were re-read after the completion notice. Three additional errors were sent to root; latest Hwei.W and Aphelios.R files were then re-read in full against unchanged source frames. Completion and schema-validity claims were not used as semantic evidence. All parsed-candidate digests were checked before this write.
- **all / source_only_decision**: No concrete failure found is a decision only within supplied extraction sources. It is not final approval or proof of runtime game behavior. Exact source conditions, actors, recipients, owners, timers and component relationships were checked without external facts.
- **Aurora.P / honest_formula_components**: The maximum-health/per-100 AP relation is preserved in explicit text and gap with both components retained. Source does not supply a counter-reset algorithm or hidden proc cooldown; none is imposed by this review.
- **Aurora.Q / honest_representation_limitation**: Missing-health interpolation and the counting scope of beyond-first-hit reduction remain unresolved. Both reductions are retained without an invented interaction/stacking formula.
- **Aurora.R / honest_representation_limitation**: The separate area and Realm Hopper source timers are retained with a scope gap. Other plus explicit boundary-attempt text preserves enter/leave despite no leave_area enum.
- **Hwei.Q / mode_selection_text**: Empty base has selector meaning in summary, while all supplied subforms have rules. It is not treated as no effect or simultaneous firing. QW intermediate damage, QQ radius and exact delay length are not invented.
- **Hwei.W / honest_representation_limitation**: The malformed self/ally WW wording is preserved as an explicit numeric-scope uncertainty with no definite self parameters. WQ retains the denominator 100. WE separates creation from later empowered effects and leaves use-versus-hit consumption unresolved.
- **Hwei.E / honest_representation_limitation**: EW vision radius/lifetime are unknown. First-champion entry acquisition is independent from first-enemy projectile collision; no champion-only projectile-victim restriction is invented.
- **Hwei.R / source_asymmetry_preserved**: The summary supplements first champion and death-triggered explosion. Early death is not guaranteed the full periodic maximum. The aggregate maximum is informational.
- **Aphelios.P / source_limit**: Duplicate rosters are deduplicated. Stat rank-up quantities, exact ammo costs and exhaustive main/off-hand consumption are unprovided; only the stated mechanics are extracted.
- **Aphelios.Q / final_two_clock_verification**: The actual final file restores the 20-second sentry summon and off-hand equipment, separate from approach-activated four-second firing. Severum source shot-count components remain, with no invented cadence or intermediate level damage.
- **Aphelios.E / interface_only_preserved**: Merged weapon combat prose is not converted into a castable E. The source next-weapon UI and queue statements are retained.
- **Aphelios.R / honest_trigger_limitation**: Severum healing and Crescendum creation timing stay other plus source gap instead of guessed hit requirements. The final typed representation now preserves the explicit champion explosion gate and Q-specific root duration modifier.

## 최종 후보 해시

`candidateHash = sha256(JSON.stringify(parsedCandidate))`이며 `sources.ts` digest와 같습니다. 파일 바이트 SHA와 구분했습니다. 아래는 실제 검토한 최신 후보의 값입니다. 이후 수정은 재검수가 필요합니다.

| 슬롯 | canonical candidateHash |
| --- | --- |
| Aurora.P | `8ee0edda48e5ce675c9df67dc60fd77fdd91e9323a3636cc8e10c0ac86c2db0b` |
| Aurora.Q | `654c8c9c41c4db3e32d6a9354f0f148132f3b19be5014bae9c37d0b0b886033a` |
| Aurora.W | `6efac8bcdcf9528ac83fd9e4a1340cc6a0102c45736f352d7340e2601ced27bc` |
| Aurora.E | `66b981d2293a163c1fc85c1e22f57e046da57e18174e40a2bcadfc90597c3591` |
| Aurora.R | `aa9282810a57862e3141b0a9d497aaededeaadeea956485f133c18bb616c3c0b` |
| Hwei.P | `c60401a47c06521fad77391f1554e9d2879d0dcf84658e651271ba903217eff7` |
| Hwei.Q | `28f1cce8eed9b8ac1e33ef2a46bba4c67f067e07d1aee0f925f849a58bdf49ff` |
| Hwei.W | `58605e73d9c1de0e91342a77d920ae7e19ab465acd0866ad887152e2085a697c` |
| Hwei.E | `59944cb8a57c202e96bd23d12d7cfe499c6340cbda352e332bd0777c11b66848` |
| Hwei.R | `d67f76e097fbc7a91b639c37ebe8e80df6ab4cc756092408317c29605ec34bcb` |
| Aphelios.P | `5a6b6b3ab7bed2d81b385b20d8c106821a768ee0c36904a16335bda7dd9be889` |
| Aphelios.Q | `b9adb075e6c1e51c518d31c51e9dca9850093cab40ddea81ddc816c142e6c0bc` |
| Aphelios.W | `90af8d6164275b08bac024117b8072efbcda299f04b085b551c53d55a5c9db63` |
| Aphelios.E | `92867943a77f0a274a69df8d60a838c4f155119e5c8ef537de3cce15f4c01ead` |
| Aphelios.R | `82539f170c8ecadc1bcec946350008af0f84221b5a77525e161c7618447c9513` |

구체적 경로·근거·입력/후보 파일 SHA·variant별 규칙 수는 `semantic-final-wave4.json`에 있습니다. 오류 발견 없음은 공급 원문 추출 범위의 검수 결정이며 런타임 판정이나 최종 승인을 뜻하지 않습니다.
