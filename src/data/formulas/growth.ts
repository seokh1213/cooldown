import type { FormulaGroup } from "./formulaGroup";

export const GROWTH_FORMULAS: FormulaGroup = {
  id: "growth",
  title: {
    ko_KR: "성장과 스탯 규칙",
    en_US: "Growth and stat rules",
    zh_CN: "成长与属性规则",
  },
  entries: [
    {
      id: "level-growth",
      icon: "scalelevel",
      title: {
        ko_KR: "레벨당 성장",
        en_US: "Per-level growth",
        zh_CN: "每级成长",
      },
      formula: {
        ko_KR: "스탯 = 기본값 + 성장치 × (레벨 − 1) × (0.7025 + 0.0175 × (레벨 − 1))",
        en_US: "Stat = Base + Growth × (Level − 1) × (0.7025 + 0.0175 × (Level − 1))",
        zh_CN: "属性 = 基础值 + 成长值 × (等级 − 1) × (0.7025 + 0.0175 × (等级 − 1))",
      },
      description: {
        ko_KR:
          "레벨업으로 얻는 양이 일정하지 않다. 1→2 레벨에서는 성장치의 72%만 받고, 9→10에서 100%, 17→18에서는 128%를 받는다. 체력·마나·공격력·공격 속도·방어력·마법 저항력·체력 재생·마나 재생 여덟 가지에 적용된다.",
        en_US:
          "Level-ups are not uniform. Going 1→2 grants 72% of the growth value, 9→10 grants 100%, and 17→18 grants 128%. It applies to health, mana, attack damage, attack speed, armor, magic resist, health regen, and mana regen.",
        zh_CN:
          "每级获得的量并不相同。1→2 级只获得成长值的 72%，9→10 级为 100%，17→18 级为 128%。适用于生命值、法力值、攻击力、攻速、护甲、魔抗、生命回复与法力回复八项。",
      },
    },
    {
      id: "ability-haste",
      icon: "scaleah",
      title: {
        ko_KR: "스킬 가속",
        en_US: "Ability haste",
        zh_CN: "技能急速",
      },
      formula: {
        ko_KR: "재사용 대기시간 = 기본 대기시간 × 100 / (100 + 스킬 가속)",
        en_US: "Cooldown = Base cooldown × 100 / (100 + Ability haste)",
        zh_CN: "冷却时间 = 基础冷却 × 100 / (100 + 技能急速)",
      },
      description: {
        ko_KR:
          "저항력과 같은 모양이라 상한이 없고 수익이 일정하다. 예전의 '재사용 대기시간 감소(%)'와 달리 쌓을수록 손해 보지 않는다.",
        en_US:
          "Same shape as the resistance formula: no cap and constant returns. Unlike the old percent CDR stat, stacking it never suffers diminishing returns.",
        zh_CN:
          "与抗性公式形状相同：没有上限且收益恒定。与旧的百分比冷却缩减不同，叠加不会收益递减。",
      },
      example: {
        ko_KR: "스킬 가속 100 → 50% 감소 / 200 → 66.7% 감소",
        en_US: "100 haste → 50% shorter / 200 → 66.7% shorter",
        zh_CN: "100 急速 → 缩短 50% / 200 → 缩短 66.7%",
      },
    },
    {
      id: "stat-stacking",
      title: {
        ko_KR: "합연산과 곱연산",
        en_US: "Additive vs. multiplicative",
        zh_CN: "相加与相乘",
      },
      formula: {
        ko_KR: "합연산 : 총합 = A + B + C\n곱연산 : 총합 = 1 − (1 − A) × (1 − B)",
        en_US: "Additive       : Total = A + B + C\nMultiplicative : Total = 1 − (1 − A) × (1 − B)",
        zh_CN: "加算：总计 = A + B + C\n乘算：总计 = 1 − (1 − A) × (1 − B)",
      },
      description: {
        ko_KR:
          "고정 수치와 대부분의 % 증가는 더해진다. 받는 피해 감소, 비율 저항력 감소, 비율 관통처럼 '깎는' 쪽 효과는 곱해져서 절대 100%가 되지 않는다.",
        en_US:
          "Flat values and most percent bonuses add together. Effects that cut something — damage reduction, percent resistance reduction, percent penetration — multiply instead, so they never reach 100%.",
        zh_CN:
          "固定数值与多数百分比加成相加。而“削减”类效果（减伤、百分比抗性削减、百分比穿透）则相乘，因此永远无法达到 100%。",
      },
    },
  ],
};
