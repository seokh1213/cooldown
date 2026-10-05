# Wave 2 최종 의미 검수

**결과: 15개 슬롯 approved, needs_revision 0개.** 기존 21건과 재검수에서 발견한 조건·범위 충돌은 모두 해결됐다. 후보·코드·schema·ledger는 수정하지 않았다.

52개 규칙, 15개 요약, 12개 gap을 모두 대조했다. 스키마가 표현하지 못하는 사실을 텍스트/gap으로 보존한 경우는 허용했고, typed 값과 설명이 충돌하는 경우는 수정 후 재검수했다. 규칙 번호는 0부터 시작한다.

## 슬롯별 결정과 최종 해시

`candidateHash`는 `sources.digest(candidate)`다. 모든 후보 해시와 입력 sourceHash가 검수 스냅샷과 일치했고, 입력 sourceHash도 canonical source content로 재계산해 확인했다.

| 슬롯 | 결정 | candidateHash | sourceHash |
| --- | --- | --- | --- |
| Chogath.P | approved | `c6ee891fbf66bc2d443e9952b0d10b4de30701b74ae6588045d361aa9e2ecc2a` | `ce501aedd1d66f9a4d37a16dc024780a610cefc36e72fca79b68b1de97d9d741` |
| Chogath.Q | approved | `51186a9aac167e285d31313ca3de0f12f61516ce74d33f8c4303441be32e38ad` | `6f4ca20e6d297bf55c9f5e3376afe0a961319193b66a6374ff772a495ca8e991` |
| Chogath.W | approved | `a0e35ba1f606aa6783a17ac7df08fe3bc62be9f9c7f89719bf9b79996b213e43` | `d326f30525d7870220bd92bf3a613d1c9f70bedd9ce7dbdad093d0def155e323` |
| Chogath.E | approved | `29b6a618d49022162c37628dd722a68cbba2ff2096cf7cfe09b5ef44783bb8f8` | `eb8a15e0c692f65ff3b4a3132a703fd91af988bfbfaffc49676002f23b1d4abf` |
| Chogath.R | approved | `9491c79f981f582f99f901281088dd6ec0e5c2eefe4aa7e66a7c5032495796ee` | `4db9d54dbe4093ff373ee88dc468278bc59d1d1003be254522b82d80f5d06bc0` |
| DrMundo.P | approved | `2e68f8782acd3b9539c092622afce92fe01b4e4191b431c4422ccf73544a5af1` | `5db45e518ff20afbeab9743f4860ce54403904992fb59502eebcb7e2c12d73d9` |
| DrMundo.Q | approved | `34a362784fe13c453e0f291247bdf57be2740655ac3c7a84ed4d1f1dbba0003b` | `0c1045facc3a0571243037716dc71df607629380423feba7847e9810fc629dc1` |
| DrMundo.W | approved | `0a0ea585a5a5f71051eb72c29ec1de682330e67c54b10187bbc554ec99ace76b` | `1fd162095cddb1f57d4dfdf05404f2b1eb9157dabb7ba371f16d2da1e39d0c80` |
| DrMundo.E | approved | `ed5b5b391da30f3f140c76016dc9f2eb2e1db0423d2ff99c9b5d628d21bfb0ec` | `7d33156af4ca0efec5a9b9a2d7126b997da9baf49933878d41af5cd68083579f` |
| DrMundo.R | approved | `ed1b17587628901b9e7b51ca9d72ace29fb491dc92c36c2843d0637713f229d7` | `bbc2bd72a2278b93e4d3c02f00e9993e03591cff48184b26e77ac3b21178257e` |
| Brand.P | approved | `81ff12f770f39b1ed3c2ea3140caefeda115f4694b1640900214c2a6c8998caf` | `93cafad7fbb35dc32f0890090f9c6d862a34a9b886b23153cdc7204d5eee2abb` |
| Brand.Q | approved | `d5fd497a35abe47b09bdd2d4f8a9f359928b3b628ff14951132154527539eba4` | `5fe39ba0106bc890fa8ab074efe04ff9b6293d001c734f428a312acb4eacee35` |
| Brand.W | approved | `2067199fda51e5fca2849965848c278e310ccd35864e655955607b07c12569f0` | `c600a64cd5f3959986abef808463c97e1c1f5852713a4dcec6b5c4c15694006e` |
| Brand.E | approved | `fecd7c1f587bd450f123ca6abfb99dd9e9188e4277d8e79f362199e322f2ab46` | `5d305e5bc33ee35b9bd35d8725218b5c9a50509101255d72f8bf570856d5e5f8` |
| Brand.R | approved | `66c3f5f0e55ca17a8f0882518fa5f3e3230fa2a4daa4bdc938ee76540275cdb6` | `dc7e655c88d62fee6add9fc99ce32fca96d8698f08683d764dafb6a279bb2330` |

## 전체 규칙·요약·gap 검수

### Chogath.P — approved

적 유닛 처치, 두 자원 회복과 레벨 의존성이 원문과 일치한다.

- **rules[0]:** 처치자의 체력 18~52와 마나 4.7~9.5 회복을 각각 level_range로 보존하며 레벨 사이 값을 추측하지 않았다.

### Chogath.Q — approved

대상 지역의 적에게 적용되는 피해와 CC를 보존한다.

- **rules[0]:** 1초 공중에 띄움, 80/135/190/245/300+시전자 주문력 100%의 마법 피해, 60% 둔화와 1.5초 지속시간이 각각 올바른 수치 역할로 분리됐다.

### Chogath.W — approved

침묵과 마법 피해를 올바르게 설명한다.

- **rules[0]:** 1.6/1.7/1.8/1.9/2초 침묵과 80/130/180/230/280+시전자 주문력 70%의 마법 피해가 원문과 일치한다.

### Chogath.E — approved

다음 세 번의 공격, 포식 중첩 효과와 몬스터 피해 대체를 정확히 보존한다.

- **rules[0]:** 시전이 다음 3회 기본 공격을 강화한다. count=3이며 적중 횟수 hit_count를 사용하지 않는다.
- **rules[1]:** 강화 공격 조건 아래 기본 피해 30/50/70/90/110+시전자 주문력 30%, 대상 최대 체력 3/3.35/3.7/4.05/4.4% 피해, 30/35/40/45/50% 둔화와 1.5초 감소가 분리된다. 포식 중첩당 0.5% 증가는 other 텍스트로 보존된다.
- **rules[2]:** 강화 공격과 몬스터 대상 조건 아래 체력 비례 피해 성분만 80/110/140/170/200으로 대체한다는 설명을 보존한다. 무관한 resource>0.5% 조건이 없다.
- **gap 1개:** 원문 근거와 설명을 대조했으며 정직하게 보존된 불확실성으로 허용했다.
- **보존된 한계:** 포식 중첩 수와 폭 증가의 완전한 계산식은 추측하지 않고 원문 문구 및 gap으로 보존한다.

### Chogath.R — approved

피해 대상 종류, 처치 시 성장, 사거리 효과와 제한되는 중첩 하위 범위가 원문과 일치한다.

- **rules[0]:** 챔피언 피해 300/475/650+시전자 주문력 50%+시전자 추가 체력 10%의 고정 피해가 맞다.
- **rules[1]:** 미니언 피해 1200+시전자 주문력 50%+시전자 추가 체력 10%의 고정 피해가 맞다.
- **rules[2]:** 정글 몬스터 피해가 미니언과 동일한 원문 공식으로 보존된다.
- **rules[3]:** 이 시전으로 대상을 처치한 경우 중첩, 몸집 증가 및 최대 체력 80/120/160 증가를 보존한다. 사거리 중첩 증가량 4.7/6.2/7.7 및 상한 75, 포식 사거리 증가량 2.5 및 상한 25도 other 참조로 남는다.
- **rules[4]:** 6중첩 제한은 미니언 및 비에픽 정글 몬스터에서 얻는 중첩에만 적용되는 별도 조건 규칙이다. 일반 포식 중첩이나 챔피언 중첩의 전체 상한으로 적용하지 않는다.
- **gap 1개:** 원문 근거와 설명을 대조했으며 정직하게 보존된 불확실성으로 허용했다.
- **보존된 한계:** 스키마에 공격/포식 사거리 통계가 없다는 gap은 수치와 원문을 보존하면서 계산 가능하다고 주장하지 않는다.

### DrMundo.P — approved

이동 불가 저항, 통 획득/파괴 및 체력 재생을 정확히 설명한다.

- **rules[0]:** other 이벤트와 처음 적중하는 이동 불가 효과 조건을 사용한다. 피해를 입어야 한다는 전제가 없다. 현재 체력 4% 손실과 7초 통 수명은 텍스트/수치로 보존한다.
- **rules[1]:** 통 획득 시 15초 쿨다운 감소와 시전자 최대 체력 4% 회복이 별도 효과다. visible 조건이 제거됐다.
- **rules[2]:** 통을 밟는 enemy가 챔피언인지 검사하며 파괴되는 target은 통이다.
- **rules[3]:** 시전자 최대 체력 0.40~2.30%를 5초마다 회복한다는 간격과 레벨 범위를 보존한다.
- **gap 1개:** 원문 근거와 설명을 대조했으며 정직하게 보존된 불확실성으로 허용했다.
- **보존된 한계:** 현재 체력은 허용된 stat에 없어 손실 기준을 텍스트와 unsupported_formula gap으로 보존하고 최대 체력으로 바꾸지 않았다.

### DrMundo.Q — approved

첫 적중, 현재 체력 기준, 대상 종류별 회복 및 피해 하한/상한을 올바르게 설명한다.

- **rules[0]:** 첫 적중 대상 현재 체력의 20/22.5/25/27.5/30% 피해를 stat=null, shape=rank_values로 보존한다. 40% 둔화 2초는 별도 효과다.
- **rules[1]:** 첫 대상이 챔피언이면 시전자 체력 50/60/70/80/90 회복이다.
- **rules[2]:** 첫 대상이 몬스터이면 동일한 50/60/70/80/90 회복이다.
- **rules[3]:** 첫 대상이 챔피언도 몬스터도 아니면 25/30/35/40/45 회복이다.
- **rules[4]:** 일반 피해 하한 80/130/180/230/280은 min_amount로 보존된다.
- **rules[5]:** 정글 몬스터 피해 상한 250/325/400/475/550은 해당 대상 조건과 max_amount로 보존된다.
- **gap 1개:** 원문 근거와 설명을 대조했으며 정직하게 보존된 불확실성으로 허용했다.
- **보존된 한계:** currentHealth 입력은 스키마에 없어 gap으로 남으며 typed 최대 체력 계수를 주장하지 않는다.

### DrMundo.W — approved

충전 저장, 폭발 및 적중 대상별 회복 설명이 원문과 일치한다. 만료 발동은 개별 규칙에서 보충된다.

- **rules[0]:** 충전 중 초당 20/35/50/65/80 마법 피해와 최대 3초의 충전 원문을 보존한다.
- **rules[1]:** 현재 W 충전 시작 기준 첫 0.75초에 받은 피해의 80~95%를 저장하며 활성 충전/종료 조건이 있다.
- **rules[2]:** 0.75초 이후부터 충전 종료까지 25% 저장이며 최대 3초 및 재사용/종료 경계가 보존된다.
- **rules[3]:** 재사용 폭발은 20/35/50/65/80+시전자 추가 체력 7% 마법 피해다.
- **rules[4]:** 재사용 폭발에 적어도 한 챔피언이 적중한 경우 회색 체력 100% 회복이다.
- **rules[5]:** 재사용 폭발에 챔피언이 적중하지 않은 경우 회색 체력 50% 회복이다.
- **rules[6]:** 지속시간 만료에도 동일 폭발 피해가 발생한다. 만료 트리거는 summary, 수치는 body를 인용한다.
- **rules[7]:** 만료 폭발이 챔피언에게 적중한 경우 100% 회복을 보존한다.
- **rules[8]:** 만료 폭발이 챔피언에게 적중하지 않은 경우 50% 회복을 보존한다.
- **보존된 한계:** 받은 피해/회색 체력은 허용된 일반 stat이 아니므로 텍스트가 수치의 기준을 지정한다. 존재하지 않는 stat으로 바꾸지 않았다.

### DrMundo.E — approved

기본 지속 효과, 강화된 다음 공격, 처치된 대상의 경로 피해 및 대상 종류별 수치를 정확히 설명한다.

- **rules[0]:** 시전자 최대 체력의 2/2.3/2.6/2.9/3.2%를 추가 공격력으로 얻는다. en:summary가 최대 체력과 추가 공격력을 명시하며 replace_input이 없다.
- **rules[1]:** 다음 공격 추가 물리 피해 5/15/25/35/45+시전자 추가 체력 5%를 보존한다. 잃은 체력에 따른 최대 40% 증가를 other/unknown 및 gap으로 남겨 고정 배율로 확정하지 않는다.
- **rules[2]:** 강화된 공격에 의해 처치된 주 대상이 날아가는 효과를 보존한다.
- **rules[3]:** 처치되어 날아간 주 대상이 통과하는 secondary_targets에 5/15/25/35/45+시전자 추가 체력 5% 피해가 적용된다. 경로 조건은 secondary_targets에 붙는다.
- **rules[4]:** 미니언 대상 140% 문구는 other 효과 및 unknown-shaped other 참조로 보존한다. 피해를 받는 대상의 empowered 상태를 요구하지 않으며 어느 피해 성분에 적용되는지 확정하지 않는다.
- **rules[5]:** 정글 몬스터 대상 140% 문구도 동일하게 불확실한 적용 성분을 명시해 보존한다.
- **gap 3개:** 원문 근거와 설명을 대조했으며 정직하게 보존된 불확실성으로 허용했다.
- **보존된 한계:** 70% 잃은 체력에서의 기본 지속 효과 최대치 계산식, 140%의 적용 성분, 잃은 체력에 따른 40% 증가 공식은 원문 이상으로 추측하지 않는다.

### DrMundo.R — approved

최대 체력 증가, 이동 속도, 지속 회복 및 3랭크 조건이 원문과 일치한다.

- **rules[0]:** 잃은 체력 15/20/25%를 최대 체력으로 얻는 효과다. 출력 statTo=maxHealth를 유지하면서 존재하지 않는 missingHealth 입력은 null/텍스트/gap으로 남긴다.
- **rules[1]:** 이동 속도 15/25/35% 증가가 맞다.
- **rules[2]:** 시전자 최대 체력 20/40/60%를 10초에 걸쳐 회복한다.
- **rules[3]:** 3랭크에 근처 적 챔피언 한 명당 두 회복 효과가 추가로 5% 증가한다는 원문을 other 수치와 텍스트로 보존한다. 인원수 곱셈을 임의 수식으로 만들지 않는다.
- **gap 3개:** 원문 근거와 설명을 대조했으며 정직하게 보존된 불확실성으로 허용했다.
- **보존된 한계:** 첫 효과가 최대 체력 증가로 서술되는 반면 뒤 문장은 두 회복 효과라고 부른다는 불확실성을 gap으로 보존한다.

### Brand.P — approved

불길, 처치 시 마나 및 챔피언/대형 정글 몬스터의 지연 폭발을 원문에 맞게 설명한다.

- **rules[0]:** 대상 최대 체력 2%의 마법 피해를 4초에 걸쳐 주는 불길 효과가 맞다.
- **rules[1]:** 불타는 유닛 처치 시 20~40 마나 회복을 보존한다.
- **rules[2]:** 챔피언 또는 대형 정글 몬스터의 Ablaze 3중첩 조건을 텍스트와 mark 임계값으로 보존한다. 2초 후 폭발은 other의 지연 설명이며 피해 지속시간이 아니다. 폭발 최대 체력의 소유자는 unknown이며 6~12% 범위와 주문력 100당 2% 성분을 원문 참조로 보존한다.
- **gap 2개:** 원문 근거와 설명을 대조했으며 정직하게 보존된 불확실성으로 허용했다.
- **보존된 한계:** 폭발 피해의 최대 체력 소유자 unknown 설명과 typed statSubject=unknown이 일치한다. 대상 하위 분류와 합집합은 정직한 text condition으로 보존된다.

### Brand.Q — approved

첫 적중 피해와 조건부 기절을 정확히 설명한다.

- **rules[0]:** 첫 적중 대상에게 70/100/130/160/190+시전자 주문력 65% 마법 피해다.
- **rules[1]:** 같은 첫 대상이 Ablaze일 때 1.75초 기절이며 일반 피해까지 불길 조건으로 제한하지 않는다.

### Brand.W — approved

일반 피해와 불타는 대상의 대체 피해를 정확히 설명한다.

- **rules[0]:** Ablaze가 없으면 75/120/165/210/255+시전자 주문력 70%의 마법 피해다.
- **rules[1]:** Ablaze가 있으면 93.75/150/206.25/262.5/318.75+시전자 주문력 87.5%로 대체한다. 일반 피해에 이 값을 더하지 않는다.

### Brand.E — approved

주변 피해와 주 대상 조건에 따른 전파 범위를 정확히 설명한다.

- **rules[0]:** 주 대상 주변 유닛에 55/80/105/130/155+시전자 주문력 60% 마법 피해다.
- **rules[1]:** 주 대상의 Ablaze 조건에 따라 전파 범위가 두 배가 되는 other 효과다. 주변 적을 이동시키는 효과로 분류하지 않는다.
- **보존된 한계:** 두 배라는 원문을 텍스트로 보존하며 없는 수치 참조를 만들지 않는다.

### Brand.R — approved

최대 튕김 횟수, 자기 자신을 포함한 경로, 적 피해와 조건부 둔화가 원문과 일치한다.

- **rules[0]:** 브랜드 자신이나 적에게 최대 5회 튕길 수 있다는 제한과, 실제 적중한 적당 100/175/250+시전자 주문력 30% 마법 피해를 구분한다. 5회의 적 피해를 보장한다고 주장하지 않는다.
- **rules[1]:** Ablaze 대상의 둔화 30/45/60% 세 랭크가 모두 amount/rank_values로 보존된다.
- **rules[2]:** 챔피언에게 불길을 최대 중첩까지 쌓는 튕김 우선순위는 UI 정보가 아닌 other 게임 효과다. 영어 원문 이상으로 선택 알고리즘을 추측하지 않는다.
- **보존된 한계:** briefly의 정확한 지속시간이 없으므로 다른 효과의 시간 수치를 빌리지 않는다.

## 기존 21건 해결

- **1. Chogath.E, 기존 rules[0] → 현재 rules[0], rules[1], rules[2]:** 시전의 count=3 허용과 공격의 activation=empowered 조건으로 구분됐고 hit_count가 제거됐다.
- **2. Chogath.E, 기존 rules[1] → 현재 rules[2]:** 0.5%를 resource 임계값으로 사용하지 않으며 몬스터 피해 대체에는 실제 대상/강화 조건만 남았다.
- **3. Chogath.R, 기존 rules[0] → 현재 rules[3], rules[4]:** 포식 처치 시 중첩, 몸집 및 최대 체력 증가 수치가 추가됐다. 하위 중첩 cap은 별도 규칙으로 분리됐다.
- **4. DrMundo.P, 기존 rules[0] → 현재 rules[0]:** 처음 이동 불가 효과라는 조건이 추가됐고 최종 other 트리거로 피해 수신 전제를 제거했다.
- **5. DrMundo.P, 기존 rules[1] → 현재 rules[1]:** visible 조건이 삭제됐고 쿨다운 감소와 체력 회복이 각각 분리됐다.
- **6. DrMundo.P, 기존 rules[2] → 현재 rules[2]:** 챔피언 유형 검사는 enemy에, 통의 정체/파괴는 target에 붙는다.
- **7. DrMundo.Q, 기존 rules[0] → 현재 rules[0]:** 현재 체력 입력을 최대 체력으로 대체하지 않는다. 다섯 비율 값이 null stat의 rank_values와 gap으로 보존된다.
- **8. DrMundo.W, 기존 rules[2] → 현재 rules[1], rules[2]:** 저장 시계의 기준, 활성 충전과 재사용/종료 조건, 3초 상한이 보존된다.
- **9. DrMundo.W, 기존 rules[3] → 현재 rules[3], rules[4], rules[5], rules[6], rules[7], rules[8]:** 만료 시 폭발 및 적중 종류별 회복 규칙이 추가됐다.
- **10. DrMundo.E, 기존 rules[0] → 현재 rules[0]:** 추가 공격력 stat_modifier로 바뀌었고 최대 체력 근거를 summary로 인용하며 replace_input을 제거했다.
- **11. DrMundo.E, 기존 rules[1] → 현재 rules[1]:** 40%는 고정 배율 대신 최대 증가 문구/other unknown 참조로 보존된다.
- **12. DrMundo.E, 기존 rules[3] → 현재 rules[3]:** 지나치는 적의 조건이 secondary_targets에 붙고 추가 체력 계수는 caster 소유로 유지된다.
- **13. DrMundo.R, 기존 rules[0] → 현재 rules[0]:** missingHealth 입력이 텍스트/gap으로 보존되고 maxHealth 대체 참조는 제거됐다.
- **14. Brand.P, 기존 rules[2] → 현재 rules[2]:** Ablaze 표시와 mark 임계값을 사용하며 hit_count 조건이 없다.
- **15. Brand.P, 기존 rules[2] → 현재 rules[2]:** 폭발의 체력 소유자는 statSubject=unknown이고 gap 설명도 unknown과 일치한다.
- **16. Brand.P, 기존 rules[2] → 현재 rules[2]:** 2초는 delayed-detonation other 효과의 설명/참조이며 damage 지속시간 매개변수에서 제거됐다.
- **17. Brand.Q, 기존 rules[1] → 현재 rules[1]:** 기절에도 첫 적중 대상 조건이 추가됐다.
- **18. Brand.E, 기존 rules[1] → 현재 rules[1]:** 전파 범위 변경은 caster의 other 효과로 바뀌었다.
- **19. Brand.R, 기존 rules[0] → 현재 rules[0]:** 최대 5회와 자기 자신에 대한 튕김을 명시하고 5회의 적 피해를 보장하지 않는다고 설명한다.
- **20. Brand.R, 기존 rules[1] → 현재 rules[1]:** 30/45/60% 전체 순서가 amount/rank_values로 복구됐다.
- **21. Brand.R, 기존 rules[2] → 현재 rules[2]:** 실제 튕김 우선순위가 other 게임 효과로 바뀌었다.

## 재검수 중 추가 수정

- **DrMundo.P, rules[0].trigger:** other 이벤트와 처음 적중하는 이동 불가 효과 조건으로 바뀌어 피해가 없는 이동 불가에도 원문 범위가 유지된다. 근거 (en:body): “Dr. Mundo resists the first Immobilizing effect that hits him”
- **DrMundo.E, rules[4].conditions / rules[5].conditions:** 대상의 empowered 조건을 삭제했다. 140%의 불확실한 적용 성분은 최종 other/unknown 표현으로 보존한다. 근거 (en:body): “Deals 140% damage to minions. Deals 140% damage to jungle monsters.”
- **Chogath.R, rules[3].effects / rules[4]:** 일반 중첩/체력 증가와 cap을 분리하고 cap에 미니언 또는 비에픽 정글 몬스터 조건을 붙였다. 근거 (en:body): “Only 6 stacks can be gained from minions and non-epic jungle monsters.”
- **DrMundo.E, rules[4].effects[0] / rules[5].effects[0]:** 두 효과가 other, 수치 역할 other, shape unknown으로 바뀌었고 텍스트와 gap 모두 피해 성분 미확정을 명시한다. 근거 (en:body): “Deals 140% damage to minions. Deals 140% damage to jungle monsters.”

## 최종 확인

검증 시각: 2026-10-04T05:10:44.307Z. 원문 인용 86개와 숫자 참조 212개를 검증했다. 15개 후보와 입력 스냅샷이 모두 동일하며, 남은 수정 지적은 없다. 개별 규칙과 gap의 정확한 sourceId/quote는 JSON의 slot audit에 포함했다.
