import type { FormulaGroup } from "./formulaGroup";

export const PENETRATION_FORMULAS: FormulaGroup = {
  id: "penetration",
  title: {
    ko_KR: "저항력 감소와 관통",
    en_US: "Resistance reduction and penetration",
    zh_CN: "抗性削减与穿透",
  },
  entries: [
    {
      id: "penetration-combined",
      icon: "scaleapen",
      wide: true,
      title: {
        ko_KR: "한 줄로 합친 식",
        en_US: "The whole chain in one formula",
        zh_CN: "合并为一个公式",
      },
      formula: {
        ko_KR: "적용 저항력 = (저항력 − 고정 감소) × (1 − 감소%) × (1 − 관통%) − 고정 관통\n받는 피해   = 원래 피해 × 100 / (100 + 적용 저항력)",
        en_US: "Applied resistance = (Resistance − Flat reduction) × (1 − Reduction%) × (1 − Penetration%) − Flat penetration\nDamage taken       = Raw damage × 100 / (100 + Applied resistance)",
        zh_CN: "生效抗性 = (抗性 − 固定削减) × (1 − 削减%) × (1 − 穿透%) − 固定穿透\n承受伤害 = 原始伤害 × 100 / (100 + 生效抗性)",
      },
      description: {
        ko_KR:
          "아래 네 단계는 결국 이 한 줄이다. 물리든 마법이든 같다. 한 가지만 다른데, 비율 관통은 빼는 게 아니라 곱한다. 방어력 100에 관통 30%면 100 − 30 = 70 이 아니라 100 × 0.7 = 70 이라 같아 보이지만, 앞에 비율 감소가 걸려 있으면 결과가 달라진다. 세부 규칙도 있다. 비율 감소와 비율 관통은 저항력이 0 이하이면 건너뛰고, 고정 관통은 저항력을 0 밑으로 내리지 못한다. 저항력을 음수로 만들 수 있는 건 고정 감소뿐이다.",
        en_US:
          "The four steps below collapse into this one line, and it is the same on the physical and magic sides. One detail differs from the common shorthand: percent penetration multiplies rather than subtracts. With 100 armor and 30% penetration, 100 − 30 and 100 × 0.7 both give 70, but they diverge once a percent reduction is applied first. Two more rules: percent reduction and percent penetration are skipped when resistance is 0 or less, and flat penetration cannot push resistance below zero. Only flat reduction can make it negative.",
        zh_CN:
          "下面四个步骤最终就是这一行，物理与魔法完全相同。与常见简写有一处不同：百分比穿透是相乘而非相减。100 护甲搭配 30% 穿透时，100 − 30 与 100 × 0.7 都得 70，但一旦先经过百分比削减，结果就会不同。还有两条规则：抗性为 0 或更低时会跳过百分比削减与百分比穿透；固定穿透不能把抗性压到 0 以下。只有固定削减能使其为负。",
      },
      example: {
        ko_KR:
          "대상 방어력 100, 방어구 관통력 30%, 물리 관통력 18\n→ 적용 방어력 = 100 × 0.7 − 18 = 52\n→ 받는 피해 = 100 / (100 + 52) = 65.8%",
        en_US:
          "Target with 100 armor, 30% armor penetration, 18 lethality\n→ effective armor = 100 × 0.7 − 18 = 52\n→ damage taken = 100 / (100 + 52) = 65.8%",
        zh_CN:
          "目标 100 护甲，30% 护甲穿透，18 穿甲\n→ 生效护甲 = 100 × 0.7 − 18 = 52\n→ 承受伤害 = 100 / (100 + 52) = 65.8%",
      },
    },
    {
      id: "reduction-vs-penetration",
      title: {
        ko_KR: "감소와 관통의 차이",
        en_US: "Reduction vs. penetration",
        zh_CN: "削减与穿透的区别",
      },
      formula: {
        ko_KR: "감소 = 대상의 저항력 자체를 깎음\n관통 = 내 피해 계산에서만 무시",
        en_US: "Reduction  = lowers the target's own resistance\nPenetration = ignored only when my damage is computed",
        zh_CN: "削减 = 直接降低目标自身的抗性\n穿透 = 仅在计算我方伤害时无视",
      },
      description: {
        ko_KR:
          "감소는 대상 스탯을 실제로 낮춰 아군 전체가 이득을 본다. 관통은 내 피해를 계산할 때만 적용되고 대상의 표시 스탯은 그대로다. 기본 저항력과 추가 저항력은 따로 계산한다.",
        en_US:
          "Reduction actually lowers the target's stat, so the whole team benefits. Penetration only applies while computing your own damage and leaves the target's displayed stat unchanged. Base and bonus resistances are computed separately.",
        zh_CN:
          "削减会真正降低目标属性，全队都能受益。穿透只在计算自身伤害时生效，目标显示的属性不变。基础抗性与额外抗性分开计算。",
      },
    },
    {
      id: "penetration-order",
      icon: "scaleapen",
      title: {
        ko_KR: "적용 순서 (물리·마법 공통)",
        en_US: "Order of operations (physical and magic)",
        zh_CN: "计算顺序（物理与魔法通用）",
      },
      formula: {
        ko_KR: "① 저항력 감소 (고정)\n② 저항력 감소 (%)\n③ 관통 (%)\n④ 관통 (고정)",
        en_US: "① Flat resistance reduction\n② Percent resistance reduction\n③ Percent penetration\n④ Flat penetration",
        zh_CN: "① 固定抗性削减\n② 百分比抗性削减\n③ 百分比穿透\n④ 固定穿透",
      },
      description: {
        ko_KR:
          "순서가 결과를 바꾼다. 방어력 쪽이든 마법 저항력 쪽이든 네 단계가 똑같이 적용된다.",
        en_US:
          "The order changes the result, and the same four steps apply on the armor side and the magic resist side alike.",
        zh_CN:
          "顺序会改变结果，护甲侧与魔抗侧都遵循相同的四个步骤。",
      },
    },
    {
      id: "flat-reduction",
      title: {
        ko_KR: "저항력 감소 (고정)",
        en_US: "Flat resistance reduction",
        zh_CN: "固定抗性削减",
      },
      formula: {
        ko_KR: "저항력 = 저항력 − 감소량   (합연산, 음수 가능)",
        en_US: "Resistance = Resistance − Reduction   (additive, can go below 0)",
        zh_CN: "抗性 = 抗性 − 削减量（加算，可为负）",
      },
      description: {
        ko_KR:
          "여러 효과가 더해지고, 기본 저항력과 추가 저항력에 비례해 나뉘어 적용된다. 저항력을 0 밑으로 내릴 수 있는 유일한 수단이다.",
        en_US:
          "Sources add together and the amount is split proportionally between base and bonus resistance. This is the only effect that can push resistance below zero.",
        zh_CN:
          "多个来源相加，并按基础抗性与额外抗性的比例分摊。这是唯一能把抗性压到 0 以下的手段。",
      },
      example: {
        ko_KR: "기본 20 + 추가 40 인 대상에 15 감소 → 15 + 30 = 45",
        en_US: "15 reduction on 20 base + 40 bonus → 15 + 30 = 45",
        zh_CN: "对 20 基础 + 40 额外的目标削减 15 → 15 + 30 = 45",
      },
    },
    {
      id: "percent-reduction",
      title: {
        ko_KR: "저항력 감소 (%)",
        en_US: "Percent resistance reduction",
        zh_CN: "百分比抗性削减",
      },
      formula: {
        ko_KR: "저항력 = 저항력 × (1 − 감소%)   (곱연산)",
        en_US: "Resistance = Resistance × (1 − Reduction%)   (multiplicative)",
        zh_CN: "抗性 = 抗性 × (1 − 削减%)（乘算）",
      },
      description: {
        ko_KR:
          "여러 개가 겹치면 곱해진다. 대상 저항력이 0 이하면 아무 일도 일어나지 않는다.",
        en_US:
          "Multiple sources multiply together, and it does nothing if the target is already at 0 or less.",
        zh_CN: "多个来源相乘叠加；若目标抗性已为 0 或更低则完全无效。",
      },
    },
    {
      id: "percent-penetration",
      icon: "scaleapen",
      title: {
        ko_KR: "방어구 관통력 · 마법 관통력 (%)",
        en_US: "Percent armor / magic penetration",
        zh_CN: "百分比护甲穿透 · 法术穿透",
      },
      formula: {
        ko_KR: "적용 저항력 = 저항력 × (1 − 관통%)   (곱연산)",
        en_US: "Applied resistance = Resistance × (1 − Penetration%)   (multiplicative)",
        zh_CN: "生效抗性 = 抗性 × (1 − 穿透%)（乘算）",
      },
      description: {
        ko_KR:
          "물리 쪽은 '방어구 관통력', 마법 쪽은 '마법 관통력'으로 표기되며 둘 다 비율이다. 서로 다른 출처끼리는 곱해진다. 고정 관통보다 먼저 적용되므로 저항력이 높은 대상일수록 이득이 크다.",
        en_US:
          "Called armor penetration on the physical side and magic penetration on the magic side; both are percentages. Different sources multiply together. It resolves before flat penetration, so its value grows with the target's resistance.",
        zh_CN:
          "物理侧称为“护甲穿透”，魔法侧称为“法术穿透”，两者都是百分比。不同来源相乘叠加。它在固定穿透之前结算，因此目标抗性越高收益越大。",
      },
    },
    {
      id: "flat-penetration",
      icon: "scalempen",
      title: {
        ko_KR: "물리 관통력 · 마법 관통력 (고정)",
        en_US: "Flat armor (lethality) / magic penetration",
        zh_CN: "穿甲 · 固定法术穿透",
      },
      formula: {
        ko_KR: "적용 저항력 = 저항력 − 고정 관통   (합연산, 0 미만 불가)",
        en_US: "Applied resistance = Resistance − Flat penetration   (additive, never below 0)",
        zh_CN: "生效抗性 = 抗性 − 固定穿透（加算，不低于 0）",
      },
      description: {
        ko_KR:
          "물리 쪽 고정 관통이 '물리 관통력(Lethality)', 마법 쪽이 '마법 관통력(고정)'이다. 비율 관통과 달리 서로 다른 출처끼리 더해진다. 물리 관통력은 예전에 레벨에 비례해 62~100%만 적용됐지만 V14.1부터 레벨과 무관하게 전부 적용된다. 대상 저항력이 0 이하면 효과가 없고, 저항력을 음수로 만들지도 않는다.",
        en_US:
          "Flat penetration is called lethality on the physical side and flat magic penetration on the magic side. Unlike percent penetration, different sources add together. Lethality used to scale with level (62–100% of the value); since V14.1 the full amount applies at every level. It does nothing against a target at 0 or less resistance and never pushes resistance negative.",
        zh_CN:
          "物理侧的固定穿透称为“穿甲（Lethality）”，魔法侧称为“固定法术穿透”。与百分比穿透不同，不同来源相加。穿甲过去会随等级只生效 62–100%，自 V14.1 起在任何等级都全额生效。对抗性 0 或以下的目标无效，也不会造成负抗性。",
      },
    },
  ],
};
