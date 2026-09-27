import type { FormulaGroup } from "./formulaGroup";

export const MITIGATION_FORMULAS: FormulaGroup = {
  id: "mitigation",
  title: {
    ko_KR: "피해 감쇄",
    en_US: "Damage mitigation",
    zh_CN: "伤害减免",
  },
  entries: [
    {
      id: "resistance-mitigation",
      icon: "scalearmor",
      title: {
        ko_KR: "방어력·마법 저항력 → 받는 피해",
        en_US: "Armor / magic resist → damage taken",
        zh_CN: "护甲·魔抗 → 承受伤害",
      },
      formula: {
        ko_KR: "받는 피해 = 원래 피해 × 100 / (100 + 저항력)",
        en_US: "Damage taken = Raw damage × 100 / (100 + Resistance)",
        zh_CN: "承受伤害 = 原始伤害 × 100 / (100 + 抗性)",
      },
      description: {
        ko_KR:
          "방어력은 물리 피해에, 마법 저항력은 마법 피해에 같은 식으로 쓰인다. 피해를 몇 % 깎는 게 아니라 나누는 값이라 아무리 쌓아도 100%가 되지 않는다.",
        en_US:
          "Armor applies to physical damage and magic resist to magic damage through the same formula. It divides incoming damage rather than subtracting a percentage, so it never reaches 100% reduction.",
        zh_CN:
          "护甲用于物理伤害、魔抗用于魔法伤害，公式完全相同。它是对伤害做除法而非按百分比扣减，因此无论堆多少都无法达到 100% 减免。",
      },
      example: {
        ko_KR: "저항력 100 → 받는 피해 50% / 200 → 33.3%",
        en_US: "100 resist → 50% damage taken / 200 → 33.3%",
        zh_CN: "100 抗性 → 承受 50% 伤害 / 200 → 33.3%",
      },
    },
    {
      id: "effective-health",
      icon: "scalehealth",
      title: {
        ko_KR: "실질 체력 (위 식을 뒤집어 읽기)",
        en_US: "Effective health (the same formula, inverted)",
        zh_CN: "有效生命值（同一公式的逆向读法）",
      },
      formula: {
        ko_KR: "실질 체력 = 체력 × (1 + 저항력 / 100)",
        en_US: "Effective health = Health × (1 + Resistance / 100)",
        zh_CN: "有效生命值 = 生命值 × (1 + 抗性 / 100)",
      },
      description: {
        ko_KR:
          "새로운 규칙이 아니라 위 감쇄식을 체력 쪽에서 다시 쓴 것이다. 받는 피해가 100/(100+저항력) 배가 되니, 버틸 수 있는 양은 그 역수만큼 늘어난다. 이렇게 보면 저항력 1점이 체력을 정확히 1%씩 늘려 준다는 게 드러나서, 방어 아이템과 체력 아이템 중 어느 쪽이 이득인지 비교할 때 쓴다.",
        en_US:
          "Not a separate rule — it is the mitigation formula rewritten from the health side. Damage taken is multiplied by 100/(100+resist), so the amount you can absorb grows by its reciprocal. Read this way it becomes clear that one point of resistance adds exactly 1% health, which is how you compare a resistance item against a health item.",
        zh_CN:
          "并非另一条规则，而是把上面的减免公式从生命值一侧改写。承受伤害变为 100/(100+抗性) 倍，因此能承受的量按其倒数增长。这样看就能明白 1 点抗性正好等于 1% 生命值，用于比较抗性装备与生命值装备的收益。",
      },
      example: {
        ko_KR: "체력 2000 + 저항력 100 → 실질 4000",
        en_US: "2000 health + 100 resist → 4000 effective",
        zh_CN: "2000 生命值 + 100 抗性 → 有效 4000",
      },
    },
    {
      id: "negative-resistance",
      icon: "scalemr",
      title: {
        ko_KR: "저항력이 음수일 때",
        en_US: "Negative resistance",
        zh_CN: "抗性为负时",
      },
      formula: {
        ko_KR: "받는 피해 = 원래 피해 × (2 − 100 / (100 − 저항력))",
        en_US: "Damage taken = Raw damage × (2 − 100 / (100 − Resistance))",
        zh_CN: "承受伤害 = 原始伤害 × (2 − 100 / (100 − 抗性))",
      },
      description: {
        ko_KR:
          "저항력이 0 밑으로 내려가면 다른 곡선을 쓰고, 추가 피해는 최대 2배에서 멈춘다. 관통으로는 음수가 되지 않으므로 고정 저항력 감소로만 도달한다.",
        en_US:
          "Below zero the curve changes and bonus damage caps at 2x. Penetration cannot create negative resistance — only flat reduction can.",
        zh_CN:
          "抗性降到 0 以下会改用另一条曲线，额外伤害最多为 2 倍。穿透无法造成负抗性，只有固定削减可以。",
      },
    },
    {
      id: "true-damage",
      title: {
        ko_KR: "고정 피해",
        en_US: "True damage",
        zh_CN: "真实伤害",
      },
      formula: {
        ko_KR: "받는 피해 = 원래 피해 (저항력 무시)",
        en_US: "Damage taken = Raw damage (resistance ignored)",
        zh_CN: "承受伤害 = 原始伤害（无视抗性）",
      },
      description: {
        ko_KR:
          "저항력 계산을 통째로 건너뛴다. 다만 '받는 피해 감소' 효과는 고정 피해에도 적용된다.",
        en_US:
          "Skips the resistance step entirely. Flat damage reduction effects still apply to it.",
        zh_CN: "完全跳过抗性计算。但“受到伤害降低”类效果依然对其生效。",
      },
    },
    {
      id: "reduction-stacking",
      icon: "scaledr",
      title: {
        ko_KR: "받는 피해 감소의 중첩",
        en_US: "Stacking damage reduction",
        zh_CN: "减伤效果的叠加",
      },
      formula: {
        ko_KR: "총 배율 = (1 − 감소A) × (1 − 감소B) × …",
        en_US: "Total multiplier = (1 − Reduction A) × (1 − Reduction B) × …",
        zh_CN: "总系数 = (1 − 减伤A) × (1 − 减伤B) × …",
      },
      description: {
        ko_KR:
          "받는 피해 감소는 더해지지 않고 곱해진다. 그래서 여러 개를 겹쳐도 100%에 닿지 않는다.",
        en_US:
          "Damage reduction stacks multiplicatively, not additively, so combining sources never reaches 100%.",
        zh_CN: "减伤是相乘叠加而非相加，因此叠再多也无法达到 100%。",
      },
      example: {
        ko_KR: "50% + 50% → 75% 감소 (100%가 아니다)",
        en_US: "50% + 50% → 75% total (not 100%)",
        zh_CN: "50% + 50% → 共 75%（而非 100%）",
      },
    },
  ],
};
