# Wave 5 최종 의미 검수

Jayce, Nidalee, Gnar의 P/Q/W/E/R 15개를 최신 후보와 입력 원문으로 재검수했다. **15 approved / 0 needs_revision**이며, 최초 27건과 최종 재검수 14건이 모두 해결됐다.

최종 해시 확인: `2026-10-04T05:33:47.858Z`. summary 15개, 규칙 65개, gap 20개, 후보 인용 109개, 숫자 참조 298회를 확인했다. 후보·코드·ledger는 변경하지 않았다.

## 해시와 슬롯별 판정

candidateHash는 `sources.digest(parsed candidate)`이며, sourceHash는 원문 content의 canonical digest다. input 전체 digest도 재대조했다. 각 승인 판정은 아래 해시에만 적용된다.

| ID | 판정 | candidateHash | sourceHash |
| --- | --- | --- | --- |
| Jayce.P | approved | `88599c4dcdab64702b3d4060c559c6b4f1d91df0d79be6c3565f31ed78c74b7c` | `36c6503a7c08f5a8f29c6fd85bb8974635c475db3592763f42bbbc6573735f97` |
| Jayce.Q | approved | `0495bf6b42577a2d49dcee66a67e80b75fc66409df74ffce210a0ba605c5840d` | `54f202ddf6f0e476e91ac7abecd6d887bbf2a6617c466e0456969fa6ab02d5a5` |
| Jayce.W | approved | `c055f96be3adc6843793cc43dba56e840cd7d49261985de54451c0007fc47720` | `04cce2ef6a96b6289596882414828dfb493d6fc265b33ba12711bfa29f484ca3` |
| Jayce.E | approved | `d662897e2c36ab9b58288c19c66c34d5cc0c5f09643064d546a978107554f441` | `f7c775b578ed49d27c213a7c34887a040472bfb193c8ca1a6e7ba5dffa425cf9` |
| Jayce.R | approved | `189f17007711e6b917b3281f74b74fa3af7776197db632c7c5d80252b76f18d0` | `05d8b3a5a0900a3561de856d7ff98dbf8364345a7a3b006b5d49354927c1a44f` |
| Nidalee.P | approved | `7a4e818c002ccd3ab43cbe5a54a1256e1927616cc52ae8d1a1c24e7e5dc2b95d` | `4c10c94fd12d8bd8ddcc4c811f3523d80fcee3555e55da5260e7c42ad1682db0` |
| Nidalee.Q | approved | `25dbd0215bd35fb61b50895ef9fe705da9254307eecdcfa618622b6208b07ef1` | `a71d869d9d0d3e702d5c72a37e9a2bd0194e1d2f499c8797e52d9b3b014f26da` |
| Nidalee.W | approved | `df6124a32b8d45ff19c681f625e527e0d2d526147d4aaedffe7a1713b5a3f88e` | `b7ccac0608f19afb3d3c852e8a675ba8139ac66cbd08e57dc5c85f922034f67d` |
| Nidalee.E | approved | `19c0f42eeaba15ccb2385ff052902adcc8c2b1205e77841cd24478d4faf89999` | `bfbab146b42fc8a9168c90e04aeda262750394bfd7a41ffadfc5fb40764cc30f` |
| Nidalee.R | approved | `7b40fe011c794208f86f3c7ea79e1f74729d6cebecb860e3e05e4796e4af32f3` | `8411fe3fe872ab283a85a0bd686120e0b9eb821d343b01fc73c495c65573ada2` |
| Gnar.P | approved | `8179a565adf08b4a7001549f08d51fd287a05be4b228aaedbc57b6d861875eba` | `20fc6608b21fd437ebcfb05dd6a7032c54becbf433cc65bdcb47f2b05ec51ad1` |
| Gnar.Q | approved | `32406cb77ac2dcb9b4840d28a85ccbab177dad5ce1658ffeb693cb65f1c30e25` | `d2ffa51d9a0b79005aa9b724530f17e49df2b57b6e1a315a8b73d2dbbaac353b` |
| Gnar.W | approved | `c89ffcfbcfff1a7c6cd3a113435afe49a645d8f4813a62cc89b49f3f72e777e8` | `45414e76d629663a551e3f26031b6351a10cecc205bc5ae428ae65e99c21cfdb` |
| Gnar.E | approved | `306ffd8af1e7fe09958e1226c755b1da10f1169065f4a81d5a638d858cb62eea` | `a6563d4370589aaab9230506007b8829c2b7f528991ac5eda265059621c338d3` |
| Gnar.R | approved | `68be25dfa5333d9e8e1848eaa402f25e2bc1a4bd50948e9a7b496a348ac1f430` | `4fa62bd9f5ffa453ecc2978574d8b6b65d6f2862679219b3cc349720b77376b0` |

## 슬롯별 승인 근거

### Jayce.P — approved

근접/원거리 무기 교체와 30 flat Move Speed, 0.75초 효과를 구분했다.

- summary: 무기 교체와 스킬 변경, 잠시 이동 속도 증가가 source의 transform 효과와 일치한다.
- 규칙 1개와 gap 0개를 전부 검수했다.

**rules[0] · base · transform/caster**

무기 교체와 스킬 변경, caster의 flat 30 MS/0.75초 효과를 보존했다.

- 근거 `en:body`: “Jayce can swap between melee and ranged weapons using Mercury Cannon / Mercury Hammer starting from level 1. Swapping weapons also swaps all his Abilities and grants him 30 Move Speed for 0.75 seconds.”

### Jayce.Q — approved

해머 60~310+135% bonus AD, 2초 35~60% slow, 캐논 80~285+130% bonus AD와 112~399+182% bonus AD replacement, 각 대상의 정글 몬스터 +10을 source별로 확인했다.

- summary: 해머 도약·주변 피해/둔화, 캐논 first/surround damage, 관문 강화의 각 형태를 구분한다.
- 규칙 9개와 gap 0개를 전부 검수했다.

**rules[0] · form:A · cast/caster**

Hammer 도약의 주변 physical 피해와 caster bonus AD 계수, 주변 slow/2초를 함께 보존했다.

- 근거 `form:A:en`: “Mercury Hammer: Jayce leaps to an enemy, dealing (60/110/160/210/260/310 + (135% bonus Attack Damage)) physical damage to surrounding enemies and Slowing them by 35/40/45/50/55/60% for 2 seconds. Deals 10 bonus damage to jungle monsters.”

**rules[1] · form:A · ability_hit/secondary_targets**

Hammer 주변 몬스터 검사와 +10 피해 recipient가 모두 secondary_targets다.

- 근거 `form:A:en`: “Mercury Hammer: Jayce leaps to an enemy, dealing (60/110/160/210/260/310 + (135% bonus Attack Damage)) physical damage to surrounding enemies and Slowing them by 35/40/45/50/55/60% for 2 seconds. Deals 10 bonus damage to jungle monsters.”

**rules[2] · form:A · ability_hit/target**

Hammer 적중 target 몬스터의 +10 추가 피해를 일반 대상과 구분했다.

- 근거 `form:A:en`: “Deals 10 bonus damage to jungle monsters.”

**rules[3] · form:B · ability_hit/target**

Cannon 첫 적중 target과 주변 enemies의 일반 physical 피해 및 caster bonus AD 계수를 impact에 연결했다.

- 근거 `form:B:en`: “Mercury Cannon: Jayce fires an orb of electricity, dealing (80/121/162/203/244/285 + (130% bonus Attack Damage)) physical damage to the first enemy hit and all surrounding enemies. Firing this orb through Acceleration Gate increases the range, speed and raises the damage to (112/169.4/226.8/284.2/341.6/399 + (182% bonus Attack Damage)). Deals 10 bonus damage to jungle monsters.”
- 근거 `en:summary`: “Cannon Stance: Fires an orb of electricity that detonates upon hitting an enemy (or reaching the end of its path) dealing physical damage to all enemies hit.”

**rules[4] · form:B · ability_hit/secondary_targets**

Cannon 주변 몬스터 각각의 +10 보너스가 primary 대상의 종류와 독립적이다.

- 근거 `form:B:en`: “Deals 10 bonus damage to jungle monsters.”
- 근거 `en:summary`: “Cannon Stance: Fires an orb of electricity that detonates upon hitting an enemy (or reaching the end of its path) dealing physical damage to all enemies hit.”

**rules[5] · form:B · ability_hit/target**

Cannon first target 몬스터에도 +10 추가 피해가 적용된다.

- 근거 `form:B:en`: “Mercury Cannon: Jayce fires an orb of electricity, dealing (80/121/162/203/244/285 + (130% bonus Attack Damage)) physical damage to the first enemy hit and all surrounding enemies. Firing this orb through Acceleration Gate increases the range, speed and raises the damage to (112/169.4/226.8/284.2/341.6/399 + (182% bonus Attack Damage)). Deals 10 bonus damage to jungle monsters.”
- 근거 `en:summary`: “Cannon Stance: Fires an orb of electricity that detonates upon hitting an enemy (or reaching the end of its path) dealing physical damage to all enemies hit.”

**rules[6] · form:B · ability_hit/secondary_targets**

Gate를 통과한 Cannon orb의 주변 적 피해가 enhanced 수치로 대체되고, range/speed 증가도 보존된다.

- 근거 `form:B:en`: “Firing this orb through Acceleration Gate increases the range, speed and raises the damage to (112/169.4/226.8/284.2/341.6/399 + (182% bonus Attack Damage)).”
- 근거 `en:summary`: “Cannon Stance: Fires an orb of electricity that detonates upon hitting an enemy (or reaching the end of its path) dealing physical damage to all enemies hit.”

**rules[7] · form:B · ability_hit/target**

Gate를 통과한 Cannon orb의 first target 피해도 동일한 enhanced 수치로 대체된다.

- 근거 `form:B:en`: “Firing this orb through Acceleration Gate increases the range, speed and raises the damage to (112/169.4/226.8/284.2/341.6/399 + (182% bonus Attack Damage)).”
- 근거 `en:summary`: “Cannon Stance: Fires an orb of electricity that detonates upon hitting an enemy (or reaching the end of its path) dealing physical damage to all enemies hit.”

**rules[8] · form:B · other/caster**

적 충돌 또는 경로 끝 폭발을 summary와 retained other/text로 보존했다. 미제공 폭발 시점이나 projectile 값을 만들지 않았다.

- 근거 `en:summary`: “Cannon Stance: Fires an orb of electricity that detonates upon hitting an enemy (or reaching the end of its path) dealing physical damage to all enemies hit.”

**미확정으로 보존한 내용**

- 구체 projectile speed/range 증가값은 원문에 없어 수치를 만들지 않는다.
- 경로 끝 detonation은 source에 확정된 사실로 summary와 other/text에 보존했다. first-target damage 규칙을 경로 끝 대상 유무까지 계산하는 일반 식으로 확대하지 않는다.

### Jayce.W — approved

해머 Mana 15~25와 total 140~440+100% AP/4초, 캐논 70/78/86/94/102/110% total AD rank coefficient를 확인했다.

- summary: 해머 공격 Mana 회복, 4초 오라 피해, 캐논 다음 3회 최대 AS 공격 변경을 구분한다.
- 규칙 3개와 gap 0개를 전부 검수했다.

**rules[0] · form:A · attack/caster**

Hammer attack마다 caster Mana 회복이 발생한다. rank별 15/17/19/21/23/25를 확인했다.

- 근거 `form:A:en`: “Mercury Hammer - Passive: Jayce's Hammer Attacks grant 15/17/19/21/23/25 Mana.”

**rules[1] · form:A · cast/caster**

Hammer 주변 오라의 total magic 피해와 caster AP 계수, 4초 duration을 보존했다. 총 피해를 초당 피해로 바꾸지 않았다.

- 근거 `form:A:en`: “Mercury Hammer - Active: Jayce creates an electric aura dealing (140/200/260/320/380/440 + (100% Ability Power)) magic damage over 4 seconds.”

**rules[2] · form:B · cast/caster**

Cannon 다음 3회 공격의 maximum AS와 70/78/86/94/102/110% caster total AD rank 계수가 하나의 attack_modifier에 있다.

- 근거 `form:B:en`: “Mercury Cannon: Jayce overcharges his cannon, gaining maximum Attack Speed for his next 3 Attacks. These Attacks deal (70/78/86/94/102/110% Attack Damage) physical damage.”

**미확정으로 보존한 내용**

- 최대 Attack Speed의 별도 수치와 Cannon 공격 변경 지속 시간은 제공되지 않는다.

### Jayce.E — approved

Hammer 100% bonus AD+8~22% target max Health와 monster max 200~700, Cannon gate 4초와 pass-through ally champion 35~60% MS/3초 decay를 확인했다.

- summary: 해머 knockback/피해와 몬스터 cap, 캐논 관문 설치와 통과한 아군 챔피언 MS를 구분한다.
- 규칙 4개와 gap 0개를 전부 검수했다.

**rules[0] · form:A · cast/caster**

Hammer knockback과 caster bonus AD 및 target max Health magic 피해를 보존했다. target Health 소유자는 ko:body에서도 확인했다.

- 근거 `form:A:en`: “Hammer Form: Jayce swings his hammer, Knocking Back his target and dealing (100% bonus Attack Damage) plus 8/10.8/13.6/16.4/19.2/22% max Health magic damage.”
- 근거 `ko:body`: “해머 형태: 제이스가 해머를 휘둘러 대상을 뒤로 밀어내고 (100% 추가 공격력) + 대상 최대 체력의 8/10.8/13.6/16.4/19.2/22%에 해당하는 마법 피해를 입힙니다. 해머 공격은 정글 몬스터를 상대로 최대 200/300/400/500/600/700의 마법 피해를 입힙니다.”

**rules[1] · form:A · cast/caster**

Hammer 정글 몬스터 대상 max 200/300/400/500/600/700 피해 cap을 구분했다.

- 근거 `form:A:en`: “Hammer swing does a max of 200/300/400/500/600/700 magic damage against jungle monsters.”

**rules[2] · form:B · cast/caster**

Cannon cast는 4초 gate를 설치한다.

- 근거 `form:B:en`: “Mercury Cannon: Jayce deploys an acceleration gate for 4 seconds that grants 35/40/45/50/55/60% Move Speed decaying over 3 seconds to allied champions that pass through it.”

**rules[3] · form:B · enter_area/ally**

실제 gate를 통과한 ally champion에게만 MS 증가와 3초 decay가 적용된다. 일반 amount이므로 stat/statSubject=null은 타당하다.

- 근거 `form:B:en`: “Mercury Cannon: Jayce deploys an acceleration gate for 4 seconds that grants 35/40/45/50/55/60% Move Speed decaying over 3 seconds to allied champions that pass through it.”

### Jayce.R — approved

각 transform 전 형태, new abilities/공격 거리, 20~35% armor/MR shred 5초, hammer armor/MR 5~26+7.5% bonus AD와 next attack 25~130+30% bonus AD 추가 magic을 확인했다.

- summary: 해머→캐논 다음 공격 방어력/MR 감소와 캐논→해머 능력치 및 다음 공격 추가 마법 피해를 구분한다.
- 규칙 2개와 gap 1개를 전부 검수했다.

**rules[0] · form:A · transform/caster**

Hammer→Cannon의 사거리·스킬 변경과 다음 공격의 target armor/MR 20~35% 감소/5초를 보존했다.

- 근거 `form:A:en`: “Mercury Hammer: Jayce transforms his weapon into the Mercury Cannon, gaining Attack Range and new Abilities. Jayce's next Attack removes (20% ~ 35%) Armor and Magic Resist for 5 seconds.”

**rules[1] · form:B · transform/caster**

Cannon→Hammer의 근접 공격·스킬 변경, armor/MR 증가와 다음 공격 추가 magic 피해를 구분했다. 범위 끝값과 caster bonus AD 계수를 확인했다.

- 근거 `form:B:en`: “Mercury Cannon: Jayce transforms his weapon into the Mercury Hammer, becoming melee ranged and gaining new Abilities and ((5 ~ 26) + (7.5% bonus Attack Damage)) Armor and Magic Resist. Jayce's next Attack deals an additional ((25 ~ 130) + (30% bonus Attack Damage)) magic damage.”

**gaps**

- `gaps[0]` (scope_ambiguous): 원문은 능력치와 추가 피해 범위 끝값을 제공한다. 중간 level 값을 계산하지 않아 typed level_range와 일치한다.
  - `form:B:en`: “Mercury Cannon: Jayce transforms his weapon into the Mercury Hammer, becoming melee ranged and gaining new Abilities and ((5 ~ 26) + (7.5% bonus Attack Damage)) Armor and Magic Resist. Jayce's next Attack deals an additional ((25 ~ 130) + (30% bonus Attack Damage)) magic damage.”

**미확정으로 보존한 내용**

- 원문 범위 끝값만 있어 중간 레벨별 값을 계산하지 않는다.

### Nidalee.P — approved

Brush 10%/2초에서 visible enemy champion≤1400 방향 30%로 대체되고, Hunted 4초 동안 기본10%/same Hunted 방향30%와 True Sight가 적용됨을 확인했다.

- summary: 수풀 효과, 명명된 Hunted/True Sight와 각 이동 속도 조건, 시작 Aspect of Cougar rank를 구분한다.
- 규칙 7개와 gap 0개를 전부 검수했다.

**rules[0] · base · enter_area/caster**

Brush 진입 시 caster의 10% MS/2초 효과를 보존했다.

- 근거 `en:body`: “Nidalee gains 10% Move Speed for 2 seconds when entering Brush”

**rules[1] · base · passive/caster**

active brush 상태에서 visible enemy champion≤1400을 향하는 동안만 30% MS가 10%를 대체한다.

- 근거 `en:body`: “Nidalee gains 10% Move Speed for 2 seconds when entering Brush, increased to 30% Move Speed while moving toward enemy champions.”
- 근거 `en:summary`: “Moving through brush increases Nidalee's Move Speed by 10% for 2 seconds, increased to 30% toward visible enemy champions within 1400 range.”

**rules[2] · base · ability_hit/target**

Javelin Toss 또는 Bushwhack을 맞은 champion에게 Hunted/True Sight 4초가 적용된다.

- 근거 `en:body`: “Hitting champions or jungle monsters with Javelin Toss or Bushwhack marks them as Hunted for 4 seconds. While an enemy is Hunted, they are revealed with True Sight”

**rules[3] · base · ability_hit/target**

동일 스킬을 맞은 jungle monster에게 Hunted/True Sight 4초가 적용된다. 정글 범위를 text로 제한했다.

- 근거 `en:body`: “Hitting champions or jungle monsters with Javelin Toss or Bushwhack marks them as Hunted for 4 seconds. While an enemy is Hunted, they are revealed with True Sight”

**rules[4] · base · passive/caster**

Hunted enemy가 있으면 방향과 무관하게 caster가 10% MS를 얻는다.

- 근거 `en:body`: “While an enemy is Hunted, they are revealed with True Sight and Nidalee gains 10% Move Speed, increased to 30% Move Speed toward the Hunted enemy.”

**rules[5] · base · passive/caster**

동일 Hunted enemy를 향할 때 30% MS가 일반 10%를 대체한다.

- 근거 `en:body`: “While an enemy is Hunted, they are revealed with True Sight and Nidalee gains 10% Move Speed, increased to 30% Move Speed toward the Hunted enemy.”

**rules[6] · base · passive/caster**

Aspect of Cougar rank를 보유하고 시작한다는 source 정보를 ui_information으로 보존했다.

- 근거 `en:body`: “Nidalee starts with a rank in Aspect of the Cougar.”

### Nidalee.Q — approved

Human 최소70~150+50% AP와 최대227.5~487.5+162.5% AP 끝점, Cougar 5~80+75% total AD+40% AP 다음 공격 및 per 1% missing Health 증가1~1.75%, Hunted 증가분30%를 확인했다.

- summary: Human 거리에 따른 창 마법 피해와 Cougar 다음 공격/대상 잃은 체력 증가/Hunted 피해 증가를 구분한다.
- 규칙 3개와 gap 3개를 전부 검수했다.

**rules[0] · form:A · cast/caster**

Human 최소 base 피해는 첫 AP 50%, 최대 base 피해는 둘째 AP 162.5%와 대응한다고 text에 명시한다. unknown shape은 두 계수를 동시에 합산하는 확정식으로 사용하지 않는다.

- 근거 `form:A:en`: “Human Form: Nidalee throws her javelin, dealing (70/90/110/130/150 + (50% Ability Power)) magic damage, increased up to (227.5/292.5/357.5/422.5/487.5 + (162.5% Ability Power)) magic damage based on distance flown.”

**rules[1] · form:B · attack/caster**

Cougar Q가 부여한 next empowered Attack의 magic 피해와 caster total AD/AP 계수를 보존했다. 기본 formula를 source에 없는 추가 피해라고 부르지 않는다. missing Health 증가분의 정확한 결합식은 미확정이다.

- 근거 `form:B:en`: “Cougar Form: Nidalee's next Attack deals (5/30/55/80 + (75% Attack Damage) + (40% Ability Power)) plus 1/1.25/1.5/1.75% per 1% missing Health magic damage. If the enemy was Hunted, deals 30% increased damage.”

**rules[2] · form:B · attack/caster**

동일 next Attack의 Hunted enemy 조건에서 30%를 피해 증가분으로 보존한다. 0.3 total multiplier나 미제공 130% ref를 만들지 않았다.

- 근거 `form:B:en`: “If the enemy was Hunted, deals 30% increased damage.”

**gaps**

- `gaps[0]` (unsupported_formula): missing Health 증가량의 단위는 보존하고, base 피해와 결합하는 상세 formula만 미확정으로 남겼다.
  - `form:B:en`: “Cougar Form: Nidalee's next Attack deals (5/30/55/80 + (75% Attack Damage) + (40% Ability Power)) plus 1/1.25/1.5/1.75% per 1% missing Health magic damage.”
- `gaps[1]` (unresolved_condition): Hunted 30% 증가분과 missing Health 증가분의 계산 순서는 source에서 설명하지 않는다.
  - `form:B:en`: “If the enemy was Hunted, deals 30% increased damage.”
- `gaps[2]` (unsupported_formula): Human javelin의 변수는 비행 거리다. 최소/최대 AP 대응은 text로 확정하고 중간 거리 formula만 미확정으로 남겼다.
  - `form:A:en`: “Human Form: Nidalee throws her javelin, dealing (70/90/110/130/150 + (50% Ability Power)) magic damage, increased up to (227.5/292.5/357.5/422.5/487.5 + (162.5% Ability Power)) magic damage based on distance flown.”

**미확정으로 보존한 내용**

- 창 비행거리 중간 구간 공식과 Cougar missing Health 증가분/30% Hunted 증가분의 정확한 결합 순서는 source에 없어 미확정으로 보존한다.
- 확정된 최소/최대 AP 대응은 effect.text의 첫째/둘째 계수 순서로 보존하며, unknown-shape ratio_output 두 값을 함께 합산하지 않는다.

### Nidalee.W — approved

trap2분, 초당10~50+5% AP 4초, 동시 최대수4~10 범위, Cougar55~190+50% bonus AD+30% AP, Cougar unit kill/Hunted pounce cooldown-to3/2.5/2/1.5초를 확인했다.

- summary: Human invisible trap과 적 접촉 damage, Cougar 착지 주변 피해와 kill/Hunted pounce cooldown-to를 구분한다.
- 규칙 6개와 gap 3개를 전부 검수했다.

**rules[0] · form:A · cast/caster**

Human invisible trap의 lifetime 2분을 other/text로 보존했다. 원문 숫자 2를 seconds로 해석하지 않는다.

- 근거 `form:A:en`: “Nidalee places an invisible trap for 2 minutes.”

**rules[1] · form:A · enter_area/enemy**

trap을 밟은 enemy에게 초당 magic 피해와 caster AP 계수를 4초 적용한다. 초당 피해와 총 피해를 구분했다.

- 근거 `form:A:en`: “When an enemy walks over it, they are dealt (10/20/30/40/50 + (5% Ability Power)) magic damage per second for 4 seconds.”

**rules[2] · form:A · cast/caster**

동시에 active일 수 있는 trap 최대 수 4~10을 storage_cap/unknown 범위로 보존했다. 두 랭크 값이나 최소 active 4개로 확정하지 않는다.

- 근거 `form:A:en`: “(4 ~ 10) traps may be active at once.”

**rules[3] · form:B · cast/caster**

일반 Cougar pounce의 landing 주변 enemies magic 피해를 Hunted-only로 좁히지 않았다.

- 근거 `form:B:en`: “Cougar Form: Nidalee pounces, dealing (55/100/145/190 + (50% bonus Attack Damage) + (30% Ability Power)) magic damage to enemies surrounding where she lands.”

**rules[4] · form:B · kill/caster**

Cougar form의 unit kill이면 이 ability cooldown을 지정된 초 값으로 줄인다. W로 처치한 경우나 감소분 by 값으로 오인하지 않는다.

- 근거 `form:B:en`: “Killing a unit in Cougar Form reduces this Ability's Cooldown to 3/2.5/2/1.5 seconds.”

**rules[5] · form:B · cast/caster**

동일 Hunted target을 pounce할 때만 greater-distance allowance와 cooldown-to가 적용된다.

- 근거 `form:B:en`: “Pouncing at a Hunted enemy can be done from a greater distance and reduces this Ability's Cooldown to 3/2.5/2/1.5 seconds.”

**gaps**

- `gaps[0]` (unresolved_number): Hunted pounce의 더 긴 거리 allowance는 확정되지만 증가 거리 수치는 source에 없다.
  - `form:B:en`: “Pouncing at a Hunted enemy can be done from a greater distance”
- `gaps[1]` (unresolved_number): 2분 원문 단위를 text/other로 보존했다. raw2 ref를 seconds로 쓰거나 새로운120 ref를 만들지 않는다.
  - `form:A:en`: “Nidalee places an invisible trap for 2 minutes.”
- `gaps[2]` (unresolved_number): 동시 capacity의4~10 끝값은 보존했다. source에 없는 rank/level 관계와 중간 capacity를 확정하지 않는다.
  - `form:A:en`: “(4 ~ 10) traps may be active at once.”

**미확정으로 보존한 내용**

- 숫자2의 원문 단위는 minutes다. seconds ref를 만들지 않으며 trap lifetime을 other/text로 보존한다.
- 동시 최대 덫 수의 범위와 Hunted 더 긴 pounce 거리는 확정되지만 중간 capacity 산정과 증가 거리 값은 제공되지 않는다.

### Nidalee.E — approved

Human 최소50~150+35% AP와 최대100~300+70% AP heal 끝점, ally AS30~70%/7초, Cougar70~250+70% bonus AD+55% AP magic을 확인했다.

- summary: Human ally heal/AS와 missing Health에 따른 heal 증가, Cougar 앞의 enemies magic 피해를 구분한다.
- 규칙 3개와 gap 2개를 전부 검수했다.

**rules[0] · form:A · cast/caster**

Human ally heal의 최소 endpoint는 첫 AP 35%, 최대 endpoint는 둘째 AP 70%와 대응한다. missing Health 중간 식은 확정하지 않는다.

- 근거 `form:A:en`: “Nidalee restores (50/75/100/125/150 + (35% Ability Power)) Health increased up to (100/150/200/250/300 + (70% Ability Power)) based on missing Health”
- 근거 `en:summary`: “In human form, Nidalee channels the spirit of the cougar to heal her allies and imbue them with Attack Speed for a short duration. As a cougar, she claws in a direction, dealing damage to enemies in front of her.”

**rules[1] · form:A · cast/caster**

동일 ally recipient에게 30/40/50/60/70% AS/7초 효과가 적용된다.

- 근거 `form:A:en`: “grants them 30/40/50/60/70% Attack Speed for 7 seconds.”
- 근거 `en:summary`: “In human form, Nidalee channels the spirit of the cougar to heal her allies and imbue them with Attack Speed for a short duration. As a cougar, she claws in a direction, dealing damage to enemies in front of her.”

**rules[2] · form:B · cast/caster**

Cougar 전방 enemies의 magic 피해와 caster bonus AD/AP 계수를 보존했다.

- 근거 `form:B:en`: “Cougar Form: Nidalee claws at enemies in front of her, dealing (70/130/190/250 + (70% bonus Attack Damage) + (55% Ability Power)) magic damage.”

**gaps**

- `gaps[0]` (scope_ambiguous): ally recipient는 summary와 typed에 보존된다. gap은 더 좁은 유효 subtype의 미제공 세부 사항만 다룬다.
  - `form:A:en`: “Nidalee restores (50/75/100/125/150 + (35% Ability Power)) Health increased up to (100/150/200/250/300 + (70% Ability Power)) based on missing Health and grants them 30/40/50/60/70% Attack Speed for 7 seconds.”
- `gaps[1]` (unsupported_formula): 최소/최대 base 및 대응 AP 관계는 text로 보존된다. missing Health 중간 formula만 미확정으로 남겼다.
  - `form:A:en`: “Nidalee restores (50/75/100/125/150 + (35% Ability Power)) Health increased up to (100/150/200/250/300 + (70% Ability Power)) based on missing Health”
  - `form:A:en`: “Human Form: Nidalee restores (50/75/100/125/150 + (35% Ability Power)) Health increased up to (100/150/200/250/300 + (70% Ability Power)) based on missing Health and grants them 30/40/50/60/70% Attack Speed for 7 seconds.”

**미확정으로 보존한 내용**

- 회복의 missing Health 중간 구간 식과 ally 수혜자의 더 좁은 유효 subtype은 미제공이다.
- 최소/최대 heal AP 대응은 effect.text의 첫째/둘째 계수 순서로 보존하며, unknown-shape ratio_output 두 값을 함께 합산하지 않는다.

### Nidalee.R — approved

임의 hit/existing Hunted 여부가 아니라 신규 Hunted 적용 사건만 refresh에 연결하고, Human→Cougar melee/Cougar→Human ranged attacks 및 active abilities replacement를 확인했다.

- summary: Human에서 새 Hunted 적용 시 R refresh와 human/cougar 변환을 구분한다.
- 규칙 3개와 gap 2개를 전부 검수했다.

**rules[0] · base · cast/caster**

Human cast→Cougar의 melee Attacks와 Active Abilities replacement를 보존했다.

- 근거 `en:body`: “Human Form: Nidalee transforms into Cougar Form, gaining melee Attacks and replacing her Active Abilities.”

**rules[1] · base · cast/caster**

Cougar cast→Human의 ranged Attacks와 Active Abilities replacement를 보존했다.

- 근거 `en:body`: “Cougar Form: Nidalee transforms into Human Form, gaining ranged Attacks and replacing her Active Abilities.”

**rules[2] · base · other/target**

caster가 Human일 때 이번 event에서 새 Hunted를 적용해야 R cooldown이 refresh된다. existing Hunted 상대의 임의 hit로 발동하지 않는다.

- 근거 `en:body`: “Passive: While in Human Form, applying Hunted refreshes this Ability's Cooldown.”

**gaps**

- `gaps[0]` (unresolved_condition): 새 Hunted 적용이라는 trigger는 확정되어 있으나 R tooltip은 그 사건의 구현 세부 형태를 더 설명하지 않는다.
  - `en:body`: “Passive: While in Human Form, applying Hunted refreshes this Ability's Cooldown.”
- `gaps[1]` (unresolved_condition): 고정 event enum의 한계 때문에 other event와 신규 Hunted 적용 text condition을 사용했다. 임의 existing-mark hit로 확대하지 않는다.
  - `en:body`: “Passive: While in Human Form, applying Hunted refreshes this Ability's Cooldown.”

**미확정으로 보존한 내용**

- 스키마에 mark application 전용 event가 없어 other event+이번 Hunted 적용 text 조건으로 보존한다.

### Gnar.P — approved

incoming damage와 actual damage dealt를 별도로 표현하고 maximum Rage의 다음 ability/15초 Mega, Mini0~20 MS/5.5~99% AS/0~100 range, Mega100~831 HP/4~55 armor/4~63 MR/6~49 AD를 확인했다.

- summary: actual damage dealt/received Rage, maximum Rage next Ability Mega transform과 Mini/Mega stat increases를 구분한다.
- 규칙 5개와 gap 2개를 전부 검수했다.

**rules[0] · base · damage_taken/caster**

caster가 damage를 받으면 Rage가 생성된다.

- 근거 `en:body`: “Gnar generates Rage by dealing and receiving damage.”

**rules[1] · base · other/target**

caster의 actual damage-dealt event에서 Rage가 생성된다. 일반 attack을 배제하거나 non-damaging hit에도 부여하지 않는다.

- 근거 `en:body`: “Gnar generates Rage by dealing and receiving damage.”

**rules[2] · base · cast/caster**

maximum Rage에서 다음 Ability cast로 Mega 15초 transform이 발생한다. generic empowered 또는 임의 numeric cap을 쓰지 않는다.

- 근거 `en:body`: “At max Rage his next Ability transforms him into Mega Gnar for 15 seconds.”

**rules[3] · base · passive/caster**

Mini의 MS/AS/attack range 증가 끝값을 보존했다. 중간 level 값을 추측하지 않는다.

- 근거 `en:body`: “Mini Gnar: Gain (0 ~ 20) Move Speed, (5.5% ~ 99.0%) Attack Speed, and (0 ~ 100) Attack Range.”

**rules[4] · base · passive/caster**

Mega의 max HP/armor/MR/AD flat 증가 끝값을 각 stat_modifier로 보존했다.

- 근거 `en:body`: “Mega Gnar: Gain (100 ~ 831) max Health, (4 ~ 55) Armor, (4 ~ 63) Magic Resist, and (6 ~ 49) Attack Damage.”

**gaps**

- `gaps[0]` (unresolved_condition): combat 세부 판정은 source에서 설명하지 않는다. 실제 damage dealt/received라는 확정된 경로는 typed 규칙에 보존된다.
  - `en:summary`: “While in combat Gnar generates Rage.”
  - `en:body`: “Gnar generates Rage by dealing and receiving damage.”
- `gaps[1]` (scope_ambiguous): attack range 증가 끝값은 보존하고 미제공 단위를 만들지 않는다.
  - `en:body`: “Mini Gnar: Gain (0 ~ 20) Move Speed, (5.5% ~ 99.0%) Attack Speed, and (0 ~ 100) Attack Range.”

**미확정으로 보존한 내용**

- 전투 상태의 세부 판정과 range 증가 단위, 범위 중간값은 source에 없다.

### Gnar.Q — approved

Mini5~165+125% total AD, 15~35% slow2초, subsequent50% replacement, Mega45~225+140% total AD와30~50% slow2초, catch/pickup 물리 사건 조건을 확인했다.

- summary: Mini boomerang first/subsequent 피해와 각 적당1회, catch40% CD; Mega boulder first/surround 피해/slow와 pickup70% CD를 구분한다.
- 규칙 6개와 gap 2개를 전부 검수했다.

**rules[0] · form:A · ability_hit/target**

Mini의 해당 boomerang에 아직 안 맞은 target에게 일반 physical 피해와 slow/2초가 적용된다.

- 근거 `form:A:en`: “Mini Gnar: Gnar throws a boomerang that deals (5/45/85/125/165 + (125% Attack Damage)) physical damage and Slows by 15/20/25/30/35% for 2 seconds.”

**rules[1] · form:A · ability_hit/secondary_targets**

동일 boomerang의 아직 안 맞은 subsequent target은 first를 제외한 50% replacement 피해를 받는다. replaces_base/per_target과 once guard를 보존했다.

- 근거 `form:A:en`: “The boomerang returns after hitting an enemy, dealing reduced damage to subsequent targets. Each enemy can only be hit once. Catching the boomerang reduces its Cooldown by 40%. Deals 50% damage to enemies beyond the first.”

**rules[2] · form:A · other/caster**

Mini returning boomerang을 실제 catch한 event에서 40% CD 감소가 적용된다. recast로 오인하지 않는다.

- 근거 `form:A:en`: “Catching the boomerang reduces its Cooldown by 40%.”

**rules[3] · form:B · ability_hit/target**

Mega boulder의 first target에게 physical 피해와 slow/2초가 적용된다.

- 근거 `form:B:en`: “Mega Gnar: Gnar hurls a boulder, dealing (45/90/135/180/225 + (140% Attack Damage)) physical damage and Slowing by 30/35/40/45/50% for 2 seconds to the first enemy hit and surrounding enemies.”

**rules[4] · form:B · ability_hit/nearby_enemies**

Mega boulder의 first target 주변 enemies도 같은 피해/slow를 받는다. primary/secondary recipient를 구분했다.

- 근거 `form:B:en`: “Mega Gnar: Gnar hurls a boulder, dealing (45/90/135/180/225 + (140% Attack Damage)) physical damage and Slowing by 30/35/40/45/50% for 2 seconds to the first enemy hit and surrounding enemies.”

**rules[5] · form:B · enter_area/caster**

Mega thrown boulder를 실제 pickup한 contact/enter_area 조건에서 70% CD 감소가 적용된다. recast로 오인하지 않는다.

- 근거 `form:B:en`: “Picking up the boulder reduces this Ability's Cooldown by 70%.”

**gaps**

- `gaps[0]` (unresolved_condition): first 이후50% 피해와 각 enemy당once는 typed/text에 보존되어 있다. 반환 과정의 더 세부적인 판정만 미제공으로 남겼다.
  - `form:A:en`: “The boomerang returns after hitting an enemy, dealing reduced damage to subsequent targets. Each enemy can only be hit once. Catching the boomerang reduces its Cooldown by 40%. Deals 50% damage to enemies beyond the first.”
- `gaps[1]` (scope_ambiguous): first target와 주변 enemies 모두 피해/slow 범위에 보존된다. 집합 중복의 내부 판정은 source에서 설명하지 않는다.
  - `form:B:en`: “Mega Gnar: Gnar hurls a boulder, dealing (45/90/135/180/225 + (140% Attack Damage)) physical damage and Slowing by 30/35/40/45/50% for 2 seconds to the first enemy hit and surrounding enemies.”

**미확정으로 보존한 내용**

- 첫 대상과 주변 대상 집합의 세부 중복 판정은 source에 없다.

### Gnar.W — approved

동일 적 세 번째 hit, bonus0~40+100% AP+6~14% max Health(ownerunknown),20/40/60/80% MS3초decay 및 leavingMega의 같은 benefit, Mega45~165+100% total AD와1.25초area stun을 확인했다.

- summary: Mini same enemy third Attack/Ability bonus magic/decaying MS와 Mega area damage/stun을 구분한다.
- 규칙 3개와 gap 2개를 전부 검수했다.

**rules[0] · form:A · attack_or_ability_hit/target**

Mini가 same enemy를 세 번째 Attack/Ability로 맞히면 bonus magic 피해와 decaying MS를 얻는다. caster AP 소유자는 확정하고 max Health 소유자는 unknown으로 보존했다.

- 근거 `form:A:en`: “Mini Gnar Passive: Every third Attack or Ability on the same enemy deals an additional (0/10/20/30/40 + (100% Ability Power)) plus 6/8/10/12/14% max Health magic damage and grants 20/40/60/80% Move Speed decaying over 3 seconds.”

**rules[1] · form:A · transform/caster**

leaving Mega transform에서 앞 문장의 같은 MS/3초 decay benefit을 얻는다. antecedent 숫자를 연결해 인용했다.

- 근거 `form:A:en`: “Gnar also gains the Move Speed when he leaves Mega Gnar form.”

**rules[2] · form:B · ability_hit/nearby_enemies**

Mega area의 physical 피해와 1.25초 stun을 보존했다. summary의 area/front 범위도 확인했다.

- 근거 `form:B:en`: “Mega Gnar: Gnar smashes an area, dealing (45/75/105/135/165 + (100% Attack Damage)) physical damage and Stunning for 1.25 seconds.”
- 근거 `en:summary`: “Mega Gnar is too enraged to be hyper and instead can rear up on his hind legs and smash down on the area in front of him, stunning enemies in an area.”

**gaps**

- `gaps[0]` (unresolved_condition): 정글 몬스터 maximum300 사실은 quote로 보존한다. 이 cap의 상세 피해 성분 연결은 미확정으로 남겨 추가 피해로 구조화하지 않는다.
  - `form:A:en`: “Deals a max of 300 magic damage against jungle monsters.”
- `gaps[1]` (scope_ambiguous): source의 max Health 계수 소유자는 명시되지 않아 parameter statSubject=unknown과 gap이 일치한다.
  - `form:A:en`: “Every third Attack or Ability on the same enemy deals an additional (0/10/20/30/40 + (100% Ability Power)) plus 6/8/10/12/14% max Health magic damage and grants 20/40/60/80% Move Speed decaying over 3 seconds.”

**미확정으로 보존한 내용**

- Mini max Health 계수 소유자가 source에서 명시되지 않아 unknown이다.
- 정글 몬스터 maximum300의 구체 피해 성분 범위는 source에서 더 설명하지 않아 gap으로 보존한다.

### Gnar.E — approved

Mini AS40~60%6초, 실제 unit landing contact와 enemy bounce50~190+6% Health/brief80% slow, Mega80~220+6% Health nearby landing damage와 underneath-only80% brief slow를 확인했다.

- summary: Mini leap+AS, any unit landing bounce, enemy bounce damage/slow와 Mega landing area damage/direct-underneath slow를 구분한다.
- 규칙 5개와 gap 2개를 전부 검수했다.

**rules[0] · form:A · cast/caster**

Mini leap cast에서 caster AS/6초를 얻는다. bounce를 무조건 동반하지 않는다.

- 근거 `form:A:en`: “Mini Gnar: Gnar leaps, gaining 40/45/50/55/60% Attack Speed for 6 seconds.”

**rules[1] · form:A · other/target**

이번 E에서 해당 any unit 위에 실제로 착지한 경우에만 caster가 bounce해 더 멀리 이동한다. ally/enemy 모두 허용한다.

- 근거 `form:A:en`: “If Gnar lands on a unit he will bounce off it, traveling further.”

**rules[2] · form:A · ability_hit/target**

Mini landed-on/bounced-from enemy unit에게 physical 피해와 brief 80% slow가 적용된다. bare 6% Health는 stat=null/other/unknown으로 보존했다.

- 근거 `form:A:en`: “If Gnar lands on a unit he will bounce off it, traveling further.”

**rules[3] · form:B · ability_hit/nearby_enemies**

Mega landing 주변 enemies에 physical 피해를 적용한다. Health 범위·소유자는 확정하지 않으며, underneath 조건으로 일반 area damage를 좁히지 않는다.

- 근거 `form:B:en`: “Mega Gnar: Gnar leaps, dealing (80/115/150/185/220 + (6% Health)) physical damage to nearby enemies on landing.”

**rules[4] · form:B · ability_hit/enemy**

Mega landing에서 directly underneath인 enemy에게만 brief 80% slow가 적용된다. area damage와 규칙을 분리했다.

- 근거 `form:B:en`: “Enemies directly underneath are also briefly Slowed by 80%.”

**gaps**

- `gaps[0]` (unresolved_number): source의 bare6% Health를 current/max/base/bonus로 확정하지 않는다. stat=null/other/unknown parameter와 gap이 일치한다.
  - `form:A:en`: “Bouncing off an enemy deals (50/85/120/155/190 + (6% Health)) physical damage”
- `gaps[1]` (unresolved_number): Mega도 bare6% Health의 범위·소유자를 확정하지 않는다. 일반 landing damage 범위는 typed에 보존된다.
  - `form:B:en`: “Mega Gnar: Gnar leaps, dealing (80/115/150/185/220 + (6% Health)) physical damage to nearby enemies on landing.”

**미확정으로 보존한 내용**

- Health 계수 소유자와 scope가 미제공이다. frozen stats enum으로 정확히 표현하지 못하는6% Health를 honest text/unknown parameter로 보존한다.
- brief slow의 숫자 duration과 bounce 추가 거리는 제공되지 않는다.

### Gnar.R — approved

모든 tossed enemies knockback, normal200/300/400+100% AP+50% bonus AD와45% slow1.25/1.5/1.75초, wall300/450/600+150% AP+75% bonus AD replacement/stun, transformMini 후 Rage 금지15초를 확인했다.

- summary: Mega toss/knockback, 일반 non-wall 피해/slow, same-R wall replacement 피해/stun 및 Mini passive/Rage lockout을 구분한다.
- 규칙 5개와 gap 1개를 전부 검수했다.

**rules[0] · base · cast/caster**

Mega cast의 모든 tossed nearby enemies knockback을 wall 여부와 독립적으로 보존했다.

- 근거 `en:body`: “Mega Gnar: Gnar tosses nearby enemies”

**rules[1] · base · other/target**

이번 R에 tossed되어 wall에 부딪히지 않은 동일 target에게 normal physical 피해와 45% slow의 rank duration이 적용된다.

- 근거 `en:body`: “Mega Gnar: Gnar tosses nearby enemies, dealing (200/300/400 + (100% Ability Power) + (50% bonus Attack Damage)) physical damage, Knocking Back, and Slowing them by 45% for 1.25/1.5/1.75 seconds.”

**rules[2] · base · other/target**

이번 Mega R에 tossed되어 wall에 부딪힌 동일 target에게 replacement physical 피해와 stun이 적용된다. 미제공 stun duration은 만들지 않는다.

- 근거 `en:body`: “Enemies that hit a wall instead take (300/450/600 + (150% Ability Power) + (75% bonus Attack Damage)) physical damage and are Stunned.”

**rules[3] · base · transform/caster**

Mini로 transform한 뒤 15초간 Rage gain 금지를 negative resource_change text로 보존했다.

- 근거 `en:body`: “After transforming to Mini Gnar, Gnar cannot gain Rage for 15 seconds.”

**rules[4] · base · passive/caster**

Mini Hyper의 MS 증가를 passive modifier/text로 보존한다. 미제공 amount나 발동 세부 조건을 만들지 않는다.

- 근거 `en:body`: “Mini Gnar Passive: Increase Hyper's Move Speed.”

**gaps**

- `gaps[0]` (unresolved_condition): Mini Hyper MS 증가라는 사실은 modifier/text에 보존되고, source에 없는 증가량·발동 세부 조건은 gap에 남겨 둔다.
  - `en:body`: “Mini Gnar Passive: Increase Hyper's Move Speed.”

**미확정으로 보존한 내용**

- Mini Hyper MS increase 구체 증가량/조건과 wall stun duration은 source에 없다. 일반 slow duration을 stun에 빌려 쓰지 않는다.

## 최초 27건 해결 확인

원래 ruleIndex/path는 최초 보고서 기준이다. 현재 규칙은 새 분리 규칙으로 인덱스가 바뀔 수 있다.

- 1. `Jayce.Q` · `rules[2].trigger` — **resolved**: Cannon hit damage는 ability_hit/first enemy와 주변 recipients로 구조화했고, 경로 끝 detonation을 summary와 rules[8] retained other/text로 보존한다.
- 2. `Jayce.Q` · `rules[4].effects[0].subject` — **resolved**: Cannon 관문 강화 피해가 first target와 주변 적 두 분기에 모두 있고 caster bonus AD 및 replaces_base를 보존한다.
- 3. `Jayce.Q` · `rules[3].conditions[0].subject` — **resolved**: 최신 Jayce.Q에서 Hammer secondary 몬스터 recipient를 secondary_targets로 맞추고 Cannon primary 몬스터 +10 분기도 추가했다.
- 4. `Jayce.W` · `rules[2].effects[0].parameters` — **resolved**: Cannon 다음3공격 modifier에는6랭크 total AD stat_coefficient 하나만 있으며, 잘못된110% scalar/숫자 부재 gap을 제거했다.
- 5. `Jayce.E` · `rules[2].effects[1]` — **resolved**: Cannon gate 4초 summon과 ally champion pass-through enter_area MS/3초 decay 규칙을 분리했다.
- 6. `Nidalee.P` · `rules[1].conditions` — **resolved**: Brush 30% 방향 분기에 active2초, visible champion, distance≤1400가 추가되었다. directional 상태 trigger/대체 flags는 별도 추가 검수 항목으로 남는다.
- 7. `Nidalee.P` · `rules[4].conditions` — **resolved**: Hunted 명명과 기본10%/방향30% 분리를 보존하고, 방향30%는 replaces_base로 ordinary10%를 대체한다.
- 8. `Nidalee.Q` · `rules[0].effects[0].parameters` — **resolved**: Human 최소 기본 피해와 첫AP50%, 최대 기본 피해와 둘째AP162.5%의 관계를 text로 명시하고 중간 거리 formula를 확정하지 않는다.
- 9. `Nidalee.Q` · `rules[2].effects[0].parameters[0]` — **resolved**: Hunted30%를 damage_multiplier=0.3 대신 증가분 other/text로 보존한다.
- 10. `Nidalee.W` · `rules[0].effects[0].parameters[0]` — **resolved**: Trap2분은other numeric parameter+text/gap으로 보존하고 duration_seconds=2를 제거했다.
- 11. `Nidalee.W` · `rules[2].effects[0].parameters` — **resolved**: 최신 Nidalee.W는 storage_cap4~10 shapeunknown과 중간 산정 미확정 gap으로 보존한다.
- 12. `Nidalee.W` · `rules[4].effects[0].parameters[0].role` — **resolved**: Cougar unit kill와 Hunted pounce의3/2.5/2/1.5초 모두 cooldown_seconds이며 to semantics text를 보존한다.
- 13. `Nidalee.W` · `rules[5].conditions[0].value` — **resolved**: Hunted enemy mark를 textHunted로 명시하며 longer distance/cooldown-to에 적용한다.
- 14. `Nidalee.E` · `rules[0].conditions[0]` — **resolved**: Human heal과AS가 ally effect recipient/ally condition으로 보정되었다. obsolete gap의 ally summary 반영은 별도 추가 검수 항목이다.
- 15. `Nidalee.E` · `rules[0].effects[0].parameters` — **resolved**: Human ally heal의 최소/기본 endpoint와 첫AP35%, 최대 endpoint와 둘째AP70%의 관계를 text로 명시하며 중간 missing Health formula를 확정하지 않는다.
- 16. `Nidalee.R` · `rules[2].trigger` — **resolved**: Human 조건과 이번 신규Hunted application 조건의 other event에서만Rrefresh를 기록한다.
- 17. `Gnar.P` · `rules[1].trigger` — **resolved**: actual damage-dealt other event+피해 조건을 사용해 attack/spell 경로를 좁히지 않는다.
- 18. `Gnar.P` · `rules[2].conditions[0].value` — **resolved**: generic empowered resource 대신 maximum Rage textual condition과 next Ability/15초 transform을 기록한다.
- 19. `Gnar.Q` · `rules[1].effects[0].flags` — **resolved**: subsequent50% damage_multiplier에 replaces_base/per_target를 사용하며 일반slow를 유지했다. each enemy once 조건은 별도 추가 검수 항목이다.
- 20. `Gnar.Q` · `rules[2].trigger.event` — **resolved**: Mini returning boomerang caught otherevent/contact text로40% cooldown reduction을 보존한다.
- 21. `Gnar.Q` · `rules[5].trigger.event` — **resolved**: Mega thrown boulder pickup enter_area/text로70% cooldown reduction을 보존한다.
- 22. `Gnar.W` · `rules[0].effects[0].parameters[2].statSubject` — **resolved**: Mini W max Health parameter의statSubject는unknown이며 gap과 일치한다.
- 23. `Gnar.W` · `rules[1].effects[0]` — **resolved**: LeavingMega 이동속도에 antecedent20/40/60/80%와3초 decay refs/flags/evidence를 보존했다.
- 24. `Gnar.E` · `rules[1].conditions[0].subject` — **resolved**: Mini 실제 이번E에서 해당any unit 위에 착지했다는 text condition을 other landing event에 추가했다.
- 25. `Gnar.E` · `rules[2].conditions[0]` — **resolved**: Mini bounce damage/slow의 champion-only 제한을 제거하고 enemy landed-on bounced-from text 조건을 넣었다.
- 26. `Gnar.R` · `rules[0].effects[2]` — **resolved**: 최신 R은 모든 tossed enemy knockback 독립 규칙, non-wall same target의 normal damage/slow, wall same target의 replacement damage/stun으로 분리한다.
- 27. `Gnar.R` · `rules[1].conditions` — **resolved**: wall branch에는Mega form+sameR toss enemy+wallcollision 조건이 있다.

## 최종 재검수 14건 해결 확인

3+11은 수정자 통보의 단계 집계다. 검수는 고유 finding 번호 14개를 모두 원문과 대조했다. 먼저 변경된 3파일에서는 Q 몬스터 recipient와 W capacity가 해결됐고 R은 부분 복구였다. 후속 후보의 R 대상별 분리와 Q 마지막 gap 정정까지 확인한 현재 해시에 승인했다. 동일 finding의 재수정은 별도 새 finding으로 중복 집계하지 않는다.

- 1. `Jayce.Q` · 현재 `rules[1]; rules[4]; rules[5]` — **resolved**: Hammer 주변 몬스터 검사와 피해 recipient가 secondary_targets로 일치하고, Cannon primary 몬스터 +10 분기가 추가되었다.
- 2. `Jayce.Q` · 현재 `summary; rules[8]` — **resolved**: 적 적중 또는 경로 끝 폭발이 summary와 source를 인용한 retained other/text 규칙에 보존된다.
- 3. `Nidalee.P` · 현재 `rules[1]; rules[5]` — **resolved**: 수풀 방향 MS가 active brush 상태의 passive 규칙으로 바뀌었고, 두 방향30% MS에는 replaces_base가 있어 일반10%를 대체한다.
- 4. `Nidalee.Q` · 현재 `rules[0].effects[0].text; gaps[2]` — **resolved**: Human 최소 기본 피해는 첫 AP50%, 최대 기본 피해는 둘째 AP162.5%로 대응한다고 text에 명시하고, 마지막 gap도 비행 거리 조건의 미제공 중간 formula로 고쳤다. Cougar gap에는 Human 창 설명을 섞지 않는다.
- 5. `Nidalee.Q` · 현재 `summary; rules[1].effects[0].text` — **resolved**: source의 Cougar next Attack magic damage를 기본 formula의 추가 피해로 부르지 않도록 summary와 effect text를 고쳤다.
- 6. `Nidalee.W` · 현재 `rules[2].effects[0].parameters[0]; gaps[2]` — **resolved**: 동시 trap capacity4~10을 storage_cap/shapeunknown으로 보존하고 중간 산정과 레벨별 관계를 추측하지 않는 gap을 추가했다.
- 7. `Nidalee.W` · 현재 `gaps; rules[3]` — **resolved**: ordinary Cougar landing damage의 Hunted-only 범위 gap을 제거하고 주변 enemies 범위는 그대로 유지했다.
- 8. `Nidalee.E` · 현재 `rules[0].effects[0].text; gaps[0]` — **resolved**: 최소 heal은 첫 AP35%, 최대 heal은 둘째 AP70%로 명시하고, ally recipient는 확정되며 더 좁은 subtype만 미제공이라고 gap을 좁혔다.
- 9. `Gnar.Q` · 현재 `rules[0].conditions[1]; rules[1].conditions[2]` — **resolved**: Mini 같은 boomerang에 아직 적중하지 않은 enemy 조건을 ordinary 및 subsequent hit 규칙에 넣고 source once 문장을 인용했다.
- 10. `Gnar.E` · 현재 `rules[1].conditions[2]` — **resolved**: 이번 E에서 Gnar가 착지한 그 unit이라는 text condition을 넣어 임의 other event를 bounce로 취급하지 않는다.
- 11. `Gnar.E` · 현재 `rules[2].effects[0].parameters[1]; rules[3].effects[0].parameters[1]; gaps` — **resolved**: bare6% Health는 statnull/other/shapeunknown으로 보존하고 source가 current/max/base/bonus 범위를 확정하지 않는 gap을 적었다.
- 12. `Gnar.W` · 현재 `gaps; rules[2].evidence` — **resolved**: typed area stun과 충돌하던 obsolete gap을 제거하고 source summary의 area stun 문장을 규칙 근거에 추가했다.
- 13. `Gnar.R` · 현재 `rules[0]; rules[1]; rules[2]` — **resolved**: 모든 tossed nearby enemies knockback은 독립 규칙이며, non-wall normal damage/slow와 wall replacement damage/stun은 각각 검사한 동일 target에만 적용한다.
- 14. `Jayce.E` · 현재 `gaps; rules[3]` — **resolved**: ally champion gate-contact amount의 stat/statSubject가null인 typed와 어긋나던 unknown-statSubject gap을 제거했다.

남은 finding은 없다. JSON에는 슬롯별 전체 effect text, 조건, 수치 역할·소유자·percent 및 sourceId/quote 검수 근거를 담았다.
