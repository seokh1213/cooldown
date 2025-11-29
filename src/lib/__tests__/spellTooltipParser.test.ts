/**
 * 스킬 툴팁 파서 테스트
 * 실제 API 데이터를 사용하여 테스트
 */

import { parseSpellTooltip } from "../spellTooltipParser";
import { ChampionSpell } from "@/types";

// 오공 Q 스킬 테스트 데이터 (Data Dragon API 응답 기반)
const monkeyKingQSpell: ChampionSpell = {
  id: "MonkeyKingDoubleAttack",
  name: "파쇄격",
  maxrank: 5,
  cooldown: [8, 7.5, 7, 6.5, 6],
  cooldownBurn: "8/7.5/7/6.5/6",
  description: "오공의 다음 공격 사거리가 증가하고 추가 피해를 입히며 맞은 대상의 방어력이 몇 초 동안 낮아집니다.",
  tooltip: "오공과 <keywordMajor>분신</keywordMajor>이 다음 공격 시 사거리가 {{ attackrangebonus }} 증가하고 <physicalDamage>{{ bonusdamagett }}의 물리 피해</physicalDamage>를 추가로 입히며 {{ shredduration }}초 동안 대상의 <scaleArmor>방어력이 {{ armorshredpercent*100 }}%</scaleArmor> 감소합니다.<br /><br />오공이나 오공의 <keywordMajor>분신</keywordMajor>이 기본 공격 및 스킬로 적을 공격할 때마다 이 스킬의 재사용 대기시간이 {{ cooldowndecrease }}초 감소합니다.<br /><br /><rules>이 스킬은 피해를 입힐 때 효과가 발동합니다.</rules>{{ spellmodifierdescriptionappend }}",
  leveltip: {
    label: ["피해량", "방어 감소 %", "사거리", "재사용 대기시간"],
    effect: [
      "{{ basedamage }} -> {{ basedamageNL }}",
      "{{ armorshredpercent*100.000000 }}% -> {{ armorshredpercentnl*100.000000 }}%",
      "{{ attackrangebonus }} -> {{ attackrangebonusNL }}",
      "{{ cooldown }} -> {{ cooldownNL }}"
    ]
  },
  effectBurn: [null, "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"],
  vars: [],
  range: [250, 275, 300, 325, 350],
  rangeBurn: "250/275/300/325/350",
  cost: [20, 20, 20, 20, 20],
  costBurn: "20"
};

// Community Dragon에서 가져온 실제 데이터 (예상 구조)
const mockCommunityDragonData: Record<string, (number | string)[]> = {
  // 실제 키 이름은 확인 필요
  "ArmorShredPercent": [0.1, 0.15, 0.2, 0.25, 0.3], // 10%, 15%, 20%, 25%, 30%
  "AttackRangeBonus": [250, 275, 300, 325, 350],
  "ShredDuration": [3, 3, 3, 3, 3],
  "BonusDamageTT": [20, 40, 60, 80, 100],
  "CooldownDecrease": [8, 8, 8, 8, 8],
};

describe("스킬 툴팁 파서 테스트", () => {
  test("XML 태그가 올바르게 변환되는지 확인", () => {
    const tooltip = "<keywordMajor>분신</keywordMajor>과 <physicalDamage>100의 물리 피해</physicalDamage>";
    const result = parseSpellTooltip(tooltip, monkeyKingQSpell, 1, true);
    
    // keywordMajor가 span으로 변환되었는지 확인
    expect(result).toContain("<span");
    expect(result).toContain("keywordMajor");
    // physicalDamage도 변환되었는지 확인
    expect(result).toContain("physicalDamage");
  });

  test("변수 치환이 올바르게 되는지 확인 (Community Dragon 데이터 없음)", () => {
    const tooltip = "사거리가 {{ attackrangebonus }} 증가합니다.";
    const result = parseSpellTooltip(tooltip, monkeyKingQSpell, 1, true);
    
    // rangeBurn 값이 치환되어야 함
    expect(result).toContain("250/275/300/325/350");
  });

  test("변수 치환이 올바르게 되는지 확인 (Community Dragon 데이터 있음)", () => {
    const tooltip = "방어력이 {{ armorshredpercent*100 }}% 감소합니다.";
    const result = parseSpellTooltip(
      tooltip,
      monkeyKingQSpell,
      1,
      true,
      mockCommunityDragonData
    );
    
    console.log("변수 치환 결과:", result);
    
    // 수식이 계산되어야 함 (0.1 * 100 = 10)
    // 레벨별 값이 표시되어야 함 (10/15/20/25/30)
    expect(result).toMatch(/\d+(\/\d+)*/); // 숫자 또는 숫자/숫자 형식
  });

  test("XML 태그 범위가 올바르게 유지되는지 확인", () => {
    const tooltip = "<keywordMajor>분신</keywordMajor>을 생성합니다.<br /><br /><keywordMajor>분신</keywordMajor>은 공격합니다.";
    const result = parseSpellTooltip(tooltip, monkeyKingQSpell, 1, true);
    
    console.log("XML 태그 범위 테스트 결과:", result);
    
    // 첫 번째 분신만 색이 적용되어야 함
    // 두 번째 분신도 색이 적용되어야 함
    // 하지만 그 사이의 텍스트는 색이 적용되지 않아야 함
    const matches = result.match(/<span[^>]*>분신<\/span>/g);
    expect(matches?.length).toBe(2); // 두 개의 분신 태그가 있어야 함
  });

  test("오공 Q 스킬 전체 툴팁 파싱 테스트", () => {
    const result = parseSpellTooltip(
      monkeyKingQSpell.tooltip,
      monkeyKingQSpell,
      1,
      true,
      mockCommunityDragonData
    );
    
    console.log("오공 Q 스킬 파싱 결과:");
    console.log(result);
    
    // 방어력 감소 % 값이 있어야 함
    expect(result).toMatch(/방어력이.*%.*감소/);
    
    // XML 태그가 제대로 변환되었는지 확인
    expect(result).not.toContain("<keywordMajor>");
    expect(result).not.toContain("<scaleArmor>");
    expect(result).not.toContain("<physicalDamage>");
    
    // 변수가 제거되었는지 확인
    expect(result).not.toContain("{{");
    expect(result).not.toContain("}}");
  });

  test("레벨별 값 표시 테스트", () => {
    const tooltip = "쿨타임: {{ cooldown }}초";
    const result = parseSpellTooltip(tooltip, monkeyKingQSpell, 1, true);
    
    // 레벨별 값이 "/" 형식으로 표시되어야 함
    expect(result).toContain("8/7.5/7/6.5/6");
  });
});

