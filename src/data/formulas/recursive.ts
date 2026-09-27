import type { FormulaGroup } from "./formulaGroup";

export const RECURSIVE_FORMULAS: FormulaGroup = {
  id: "recursive",
  title: {
    ko_KR: "서로를 참조하는 스탯",
    en_US: "Stats that feed each other",
    zh_CN: "相互引用的属性",
  },
  entries: [
    {
      id: "crimson-pact",
      icon: "scalehealth",
      title: {
        ko_KR: "순환 변환 (블라디미르 핏빛 계약)",
        en_US: "Circular conversion (Vladimir's Crimson Pact)",
        zh_CN: "循环转换（弗拉基米尔·血之契约）",
      },
      formula: {
        ko_KR: "표시값 = 보정계수 × 변환율 × (내 스탯 − 반대쪽 변환율 × 상대 스탯)",
        en_US: "Shown value = Correction × Conversion × (Own stat − Reverse conversion × Other stat)",
        zh_CN: "显示值 = 修正系数 × 转换率 × (自身属性 − 反向转换率 × 对方属性)",
      },
      description: {
        ko_KR:
          "추가 체력 30당 주문력 1을 주고, 다시 주문력 1당 최대 체력 1.6을 준다. 두 값이 서로를 먹여 무한히 불어나므로 게임은 둘을 중첩시키지 않는다. 이미 상대에게서 받은 몫을 빼야 두 번 세지 않기에 식에 음수 항이 나온다. 앞의 보정계수(약 1.06)는 잘라 낸 순환을 되메우는 값으로, 1 / (1 − 1.6 ÷ 30) 에서 온다.",
        en_US:
          "Every 30 bonus health grants 1 ability power, and every 1 ability power grants 1.6 maximum health. Left alone the two would feed each other forever, so the game does not let them stack. The negative term subtracts the share already received from the other stat so it is not counted twice. The leading factor (about 1.06) restores the truncated loop and comes from 1 / (1 − 1.6 ÷ 30).",
        zh_CN:
          "每 30 点额外生命值提供 1 点法术强度，而每 1 点法术强度又提供 1.6 点最大生命值。若放任不管两者会互相无限增长，因此游戏不允许它们叠加。公式中的负项用于扣除已从对方获得的部分，避免重复计算。前面约 1.06 的系数用于补回被截断的循环，来自 1 / (1 − 1.6 ÷ 30)。",
      },
      example: {
        ko_KR:
          "추가 주문력 = 3.533% 추가 체력 − 5.653% 주문력\n추가 체력 = 169.6% 추가 주문력 − 5.653% 추가 체력",
        en_US:
          "Bonus AP = 3.533% bonus health − 5.653% AP\nBonus health = 169.6% bonus AP − 5.653% bonus health",
        zh_CN:
          "额外法强 = 3.533% 额外生命值 − 5.653% 法强\n额外生命值 = 169.6% 额外法强 − 5.653% 额外生命值",
      },
    },
  ],
};
