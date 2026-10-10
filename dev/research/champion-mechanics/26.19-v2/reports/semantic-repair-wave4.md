# Semantic repair wave 4

Reviewed 15 candidates against the 30 source-backed findings in semantic-review-wave4.json and the final repair additions.
Resolved 30/30; declined 0.

Validation: all 15 candidates passed the frozen checker with 0 errors. Warnings remain for retained text conditions, unresolved source/formula gaps, and generic effects used where the schema cannot represent a mechanic precisely.

| Finding | Status | Candidate SHA-256 | Resolution |
|---|---|---|---|
| Aurora.P:max-health-and-per-hundred | resolved | `8ee0edda48e5ce675c9df67dc60fd77fdd91e9323a3636cc8e10c0ac86c2db0b` | 제령 피해에 대상 최대 체력 stat owner를 명시하고, 주문력 비례는 2.7% per 100 AP를 구성하는 두 number ref와 관계 설명으로 보존했습니다. 추정 보간은 하지 않고 수식 gap을 남겼습니다. |
| Aurora.Q:replacement-multipliers | resolved | `654c8c9c41c4db3e32d6a9354f0f148132f3b19be5014bae9c37d0b0b886033a` | 20% 첫 적중 이후 피해와 미니언/몬스터 대상 40% 재사용 피해를 각각 replaces_base로 표시해 별도 추가 타격으로 합산되지 않게 했습니다. |
| Aurora.Q:first-hit-scope-invented | resolved | `654c8c9c41c4db3e32d6a9354f0f148132f3b19be5014bae9c37d0b0b886033a` | secondary_targets 및 hit_order 대상 순서를 제거하고 “damage beyond the first hit”를 text condition으로 보존했습니다. 서로 다른 대상인지 동일 대상의 후속 적중인지는 scope_ambiguous gap으로 기록했습니다. |
| Aurora.R:boundary-trigger-and-fired | resolved | `aa9282810a57862e3141b0a9d497aaededeaadeea956485f133c18bb616c3c0b` | enter_area와 activation=fired 조건을 제거했습니다. 영역 진입 또는 이탈 시도는 other event 및 정확한 텍스트 조건으로 보존하고, gap을 스키마에 leave_area 이벤트가 없다는 한계로 수정했습니다. |
| Hwei.P:explosion-delay-omitted | resolved | `c60401a47c06521fad77391f1554e9d2879d0dcf84658e651271ba903217eff7` | 두 번째 피해 스킬 조건을 hit_count가 아닌 other 텍스트 조건으로 바꾸고, 표식 대상 아래의 서명 생성 및 summary의 짧은 지연 후 폭발을 effect text/evidence에 보존했습니다. 지연 수치는 만들지 않았습니다. |
| Hwei.Q:qw-duplicate-and-unconditional-cap | resolved | `28f1cce8eed9b8ac1e33ef2a46bba4c67f067e07d1aee0f925f849a58bdf49ff` | 중복 무조건 QW 피해와 무조건부 최대 피해가 섞인 규칙을 제거했습니다. 기본 QW 피해는 한 규칙에, 증가 피해는 조건부 replacement 규칙에만 두고, variant:QW number refs와 변동 AP rank values를 연결했습니다. |
| Hwei.Q:qw-or-overlap | resolved | `28f1cce8eed9b8ac1e33ef2a46bba4c67f067e07d1aee0f925f849a58bdf49ff` | isolated와 immobilized의 겹치는 두 replacement 규칙을 하나의 “isolated or immobilized” 텍스트 조건 규칙으로 합쳐 중복 적용을 제거했습니다. |
| Hwei.Q:qe-upfront-and-ticks-mixed | resolved | `28f1cce8eed9b8ac1e33ef2a46bba4c67f067e07d1aee0f925f849a58bdf49ff` | QE 첫 적중 피해와 용암 웅덩이 지속 피해/둔화를 분리했습니다. 지속 피해 및 웅덩이 기간에만 2.5초를 연결하고 변형 전용 숫자는 variant:QE refs로 인용했습니다. |
| Hwei.W:allies-as-casters | resolved | `58605e73d9c1de0e91342a77d920ae7e19ab465acd0866ad887152e2085a697c` | WQ/WW 시전 trigger subject를 ally에서 caster로 변경했습니다. buff/shield recipients는 각 effect의 ally/caster subject로 보존했습니다. |
| Hwei.W:wq-per-hundred-missing | resolved | `58605e73d9c1de0e91342a77d920ae7e19ab465acd0866ad887152e2085a697c` | 3% AP scalar를 제거하고 variant:WQ 3%와 100의 refs를 formula_components로 보존했습니다. 본문에 per-100 AP 관계를 써 두고 정확한 비율 수식은 gap으로 기록했습니다. |
| Hwei.W:ww-recipient-and-reduction | resolved | `58605e73d9c1de0e91342a77d920ae7e19ab465acd0866ad887152e2085a697c` | WW 시전자를 caster로 바로잡고 Hwei 본인과 웅덩이 안 아군 보호막을 별도 effect로 표현했습니다. 15%는 추가 보호막 양이 아닌 ally shield reduction으로 text 및 other parameter에 보존하고 wording 범위 gap을 추가했습니다. |
| Hwei.W:we-mana-on-later-use | resolved | `58605e73d9c1de0e91342a77d920ae7e19ab465acd0866ad887152e2085a697c` | WE 시전 규칙은 세 빛의 생성/강화만 나타내도록 분리했습니다. 다음 세 번의 강화 스킬/공격 사용에 추가 피해와 마나 회복이 일어나도록 별도 rule을 만들고, 사용/적중 소모 시점은 gap으로 보존했습니다. |
| Hwei.E:entry-order-as-hit-order | resolved | `59944cb8a57c202e96bd23d12d7cfe499c6340cbda352e332bd0777c11b66848` | EW eye entry의 hit_order 조건을 first-entry 텍스트 조건으로 바꿨습니다. 미사일 충돌의 hit_order 조건은 그대로 유지했습니다. |
| Hwei.R:ongoing-effects-on-expiry | resolved | `d67f76e097fbc7a91b639c37ebe8e80df6ab4cc756092408317c29605ec34bcb` | 10% slow stack과 per-second 피해를 활성/확장 중 발생하는 ongoing rule로 옮겼습니다. 0.25초를 slow duration이 아닌 other interval parameter로 보존하고 expiry는 완료 폭발에만 썼습니다. |
| Hwei.R:total-cap-as-extra-hit | resolved | `d67f76e097fbc7a91b639c37ebe8e80df6ab4cc756092408317c29605ec34bcb` | 별도 expiry 피해 rule이던 최대 총 피해를 제거했습니다. 최대 총 피해 수치는 gap evidence로 보존해 세 번째 damage application으로 계산되지 않게 했습니다. |
| Hwei.R:death-completion-omitted | resolved | `d67f76e097fbc7a91b639c37ebe8e80df6ab4cc756092408317c29605ec34bcb` | 완료/만료 폭발 rule과 부착된 적 챔피언 사망 폭발 rule을 분리해 같은 실제 폭발 피해를 두 종료 원인에 연결했습니다. 조기 사망 시 미실현 주기 피해는 최대치로 더하지 않았습니다. |
| Hwei.R:first-champion-selection | resolved | `d67f76e097fbc7a91b639c37ebe8e80df6ab4cc756092408317c29605ec34bcb` | 부착 rule에 first hit enemy champion 조건을 추가하고, 해당 챔피언이 그림의 중심이라는 요약 근거를 effect text와 evidence에 넣었습니다. |
| Aphelios.P:ammo-use-not-hit | resolved | `5a6b6b3ab7bed2d81b385b20d8c106821a768ee0c36904a16335bda7dd9be889` | 성공 적중을 요구하는 attack_or_ability_hit trigger를 기본 공격 사용과 스킬 cast trigger로 분리했습니다. 주/보조 무기별 소모 여부는 임의로 정하지 않고 gap 처리했습니다. |
| Aphelios.P:unlock-levels-omitted | resolved | `5a6b6b3ab7bed2d81b385b20d8c106821a768ee0c36904a16335bda7dd9be889` | Q 및 궁극기 해금과 스킬 랭크 대신 영구 stat을 얻는 사실을 base UI-information rule로 보존하고, level number refs를 연결했습니다. |
| Aphelios.P:permanent-stat-rankups-omitted | resolved | `5a6b6b3ab7bed2d81b385b20d8c106821a768ee0c36904a16335bda7dd9be889` | 스킬 rank-up을 대체하는 영구 능력치 rank-up 사실을 base UI-information effect로 보존했습니다. 공급되지 않은 stat 양은 만들지 않았습니다. |
| Aphelios.P:arsenal-mechanics-omitted | resolved | `5a6b6b3ab7bed2d81b385b20d8c106821a768ee0c36904a16335bda7dd9be889` | 다섯 무기, 주/보조 무기, 각 무기의 고유 공격/Q, 제공된 다섯 무기의 질적 특징을 중복 roster를 제거해 base UI-information effect에 추가했습니다. |
| Aphelios.Q:calibrum-followup-omitted | resolved | `b9adb075e6c1e51c518d31c51e9dca9850093cab40ddea81ddc816c142e6c0bc` | Calibrum 첫 적중 표식 effect와 함께 표식 소모 시 가능한 장거리 follow-up 공격 permission을 추가했습니다. range나 별도 피해 수치는 만들지 않았습니다. |
| Aphelios.Q:crescendum-two-clocks | resolved | `b9adb075e6c1e51c518d31c51e9dca9850093cab40ddea81ddc816c142e6c0bc` | Crescendum 효과를 분리했습니다. 시전 시 보조 무기를 장착한 달빛 파수꾼을 20초 동안 배치하고, 적 접근 시 활성화되어 4초간 사격 피해를 줍니다. 설치 지속시간과 활성화 후 사격 지속시간을 각각 보존했습니다. |
| Aphelios.Q:infernum-cone-omitted | resolved | `b9adb075e6c1e51c518d31c51e9dca9850093cab40ddea81ddc816c142e6c0bc` | Infernum 첫 화염 파도 text에 cone targeting을 추가하고 이후 각 hit enemy에 대한 off-hand attack effect를 유지했습니다. 각도/사거리는 만들지 않았습니다. |
| Aphelios.R:flat-amounts-labelled-as-stats | resolved | `82539f170c8ecadc1bcec946350008af0f84221b5a77525e161c7618447c9513` | 일반 물리 피해 125/175/225 및 Infernum flat bonus 50/100/150의 amount stat/statSubject를 null로 바꿨습니다. bonus AD/AP coefficient의 caster ownership은 별도로 유지했습니다. |
| Aphelios.R:infernum-blast-and-splash-mixed | resolved | `82539f170c8ecadc1bcec946350008af0f84221b5a77525e161c7618447c9513` | Infernum 추가 달빛 폭발 피해와 이후 main-hand follow-up attack의 주변 splash를 분리했습니다. 90% multiplier는 각 후속 공격 피해를 기준으로 secondary_targets에 적용합니다. |
| Aphelios.R:generic-attack-tail-weapon-scope | resolved | `82539f170c8ecadc1bcec946350008af0f84221b5a77525e161c7618447c9513` | on-hit 및 100% normal crit modifier를 Gravitum variant effect에서 공통 base follow-up attack modifier로 옮겼습니다. scope ambiguity는 common body evidence로 gap 기록했습니다. |
| Hwei.W:ww-self-shield-value-conflict | resolved | `58605e73d9c1de0e91342a77d920ae7e19ab465acd0866ad887152e2085a697c` | 흐웨이 본인의 WW 보호막 효과는 남기고 caster effect에서 100/140/180/220/260 및 60% AP 수치를 제거했습니다. 아군 보호막의 확인 가능한 수치와 15% 감소는 유지하고, 본인 수치 및 감소 적용 여부는 기존 gap에 근거와 함께 명시했습니다. |
| Aphelios.R:champion-hit-gate-and-followups | resolved | `82539f170c8ecadc1bcec946350008af0f84221b5a77525e161c7618447c9513` | 기본 달빛 폭발과 Infernum 추가 폭발에 target_type=champion 조건을 추가했습니다. 기본 R 폭발 피해와 적중 챔피언에 대한 주 무기 후속 공격을 분리했고, Infernum 후속 공격의 주변 피해는 별도 follow-up_attack 규칙으로 유지했습니다. |
| Aphelios.R:gravitum-root-duration-is-q-effect | resolved | `82539f170c8ecadc1bcec946350008af0f84221b5a77525e161c7618447c9513` | Gravitum R의 99% slow만 crowd_control effect로 남겼습니다. 1.35초는 별도 Q 적중 조건에 연결한 `other` 속박 지속시간 변경 정보로 분리해 R 자체 속박으로 표시되지 않게 했습니다. |
