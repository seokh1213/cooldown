import type { Language } from "@/i18n/translations";

/**
 * 게임 안에서 수치가 실제로 어떻게 계산되는지 적어 두는 표.
 *
 * 스킬 툴팁은 "방어구 관통력 40" 까지만 알려 주고, 그게 피해량에 어떻게
 * 반영되는지는 말해 주지 않는다. 순서와 식이 헷갈리는 것들만 모았다.
 *
 * 계산식 자체는 언어와 무관하므로 번역 파일이 아니라 여기 둔다.
 * (i18n 쪽에 넣으면 영어·중국어 문자열이 같아져 번역 누락 검사에 걸린다)
 *
 * 근거는 LoL Fandom 위키 문서다. 수치가 바뀌는 항목에는 패치를 적어 둔다.
 */

type Localized = Record<Language, string>;

export interface FormulaEntry {
  id: string;
  /** 이 값에 해당하는 스탯 아이콘 (statIcons 의 이름) */
  icon?: string;
  title: Localized;
  /** 언어와 무관한 계산식 */
  formula: string;
  description: Localized;
  /** 숫자를 넣어 본 예시 */
  example?: Localized;
}

export interface FormulaGroup {
  id: string;
  title: Localized;
  entries: FormulaEntry[];
}

export const FORMULA_GROUPS: FormulaGroup[] = [
  {
    id: "mitigation",
    title: {
      ko_KR: "피해 감소",
      en_US: "Damage mitigation",
      zh_CN: "伤害减免",
    },
    entries: [
      {
        id: "armor-mitigation",
        icon: "scalearmor",
        title: {
          ko_KR: "방어력 → 물리 피해 감소",
          en_US: "Armor → physical damage taken",
          zh_CN: "护甲 → 物理伤害减免",
        },
        formula: "받는 피해 = 원래 피해 × 100 / (100 + 방어력)",
        description: {
          ko_KR:
            "방어력은 피해를 몇 % 깎는 게 아니라 나누는 값이다. 그래서 아무리 쌓아도 100%가 되지 않고, 대신 한 점당 실질 체력이 일정하게 1%씩 늘어난다.",
          en_US:
            "Armor divides incoming damage rather than subtracting a percentage. It never reaches 100% reduction, but each point adds a flat 1% to effective health.",
          zh_CN:
            "护甲是对伤害做除法，而不是按百分比扣减。因此无论堆多少都无法达到 100% 减免，但每一点都会稳定地为有效生命值增加 1%。",
        },
        example: {
          ko_KR: "방어력 100 → 받는 피해 50%, 실질 체력 2배",
          en_US: "100 armor → 50% damage taken, double effective health",
          zh_CN: "100 护甲 → 承受 50% 伤害，有效生命值翻倍",
        },
      },
      {
        id: "negative-armor",
        icon: "scalearmor",
        title: {
          ko_KR: "방어력이 음수일 때",
          en_US: "Negative armor",
          zh_CN: "护甲为负时",
        },
        formula: "받는 피해 = 원래 피해 × (2 − 100 / (100 − 방어력))",
        description: {
          ko_KR:
            "방어력 감소 효과로 방어력이 0 밑으로 내려가면 다른 식을 쓴다. 추가 피해도 무한히 늘지 않고 최대 2배에서 멈춘다. 관통은 방어력을 음수로 만들지 못하므로 방어력 감소(reduction)로만 도달한다.",
          en_US:
            "Armor reduction can push armor below zero, which switches to a different curve. Bonus damage is capped at 2x. Penetration cannot create negative armor — only reduction can.",
          zh_CN:
            "护甲削减可以把护甲压到 0 以下，此时改用另一条曲线。额外伤害最多为 2 倍。穿透无法造成负护甲，只有削减可以。",
        },
      },
      {
        id: "magic-resist",
        icon: "scalemr",
        title: {
          ko_KR: "마법 저항력 → 마법 피해 감소",
          en_US: "Magic resist → magic damage taken",
          zh_CN: "魔法抗性 → 魔法伤害减免",
        },
        formula: "받는 피해 = 원래 피해 × 100 / (100 + 마법 저항력)",
        description: {
          ko_KR:
            "방어력과 완전히 같은 식이다. 고정 피해(true damage)만 이 계산을 건너뛴다.",
          en_US:
            "Identical to the armor formula. Only true damage bypasses it.",
          zh_CN: "与护甲公式完全相同。只有真实伤害会跳过该计算。",
        },
      },
      {
        id: "reduction-stacking",
        title: {
          ko_KR: "피해 감소 효과의 중첩",
          en_US: "Stacking damage reduction",
          zh_CN: "减伤效果的叠加",
        },
        formula: "총 배율 = (1 − 감소A) × (1 − 감소B) × …",
        description: {
          ko_KR:
            "피해 감소는 더해지지 않고 곱해진다. 그래서 여러 개를 겹쳐도 100%가 되지 않는다.",
          en_US:
            "Damage reduction stacks multiplicatively, not additively, so it never reaches 100% no matter how many sources you combine.",
          zh_CN:
            "减伤是相乘叠加而非相加，因此叠再多也无法达到 100%。",
        },
        example: {
          ko_KR: "50% + 50% → 75% 감소 (100%가 아니다)",
          en_US: "50% + 50% → 75% total (not 100%)",
          zh_CN: "50% + 50% → 共 75%（而非 100%）",
        },
      },
    ],
  },
  {
    id: "penetration",
    title: {
      ko_KR: "관통과 감소",
      en_US: "Penetration and reduction",
      zh_CN: "穿透与削减",
    },
    entries: [
      {
        id: "penetration-order",
        icon: "scaleapen",
        title: {
          ko_KR: "적용 순서",
          en_US: "Order of operations",
          zh_CN: "计算顺序",
        },
        formula:
          "① 방어력 감소(고정) → ② 방어력 감소(%) → ③ 관통(%) → ④ 관통(고정)",
        description: {
          ko_KR:
            "순서가 결과를 바꾼다. 감소(reduction)는 대상의 방어력 자체를 깎아 모두에게 영향을 주고, 관통(penetration)은 내 피해를 계산할 때만 무시한다. 기본 방어력과 추가 방어력은 따로 계산한다.",
          en_US:
            "Order changes the result. Reduction lowers the target's actual armor for everyone; penetration only ignores it for your own damage. Base and bonus armor are computed separately.",
          zh_CN:
            "顺序会改变结果。削减会真正降低目标护甲、对所有人生效；穿透只在计算自己伤害时忽略护甲。基础护甲与额外护甲分开计算。",
        },
      },
      {
        id: "lethality",
        icon: "scaleapen",
        title: {
          ko_KR: "물리 관통력(치명적 일격)",
          en_US: "Lethality (flat armor penetration)",
          zh_CN: "穿甲（固定护甲穿透）",
        },
        formula: "무시하는 방어력 = 치명적 일격 수치 (1 : 1)",
        description: {
          ko_KR:
            "예전에는 레벨에 비례해 62~100%만 적용됐지만 V14.1부터 레벨과 무관하게 전부 적용된다. 대상 방어력이 0 이하면 아무 효과가 없고, 관통으로 방어력이 음수가 되지도 않는다.",
          en_US:
            "It used to scale with level (62–100% of the value); since V14.1 the full amount applies at every level. It does nothing against targets at 0 or less armor, and never pushes armor negative.",
          zh_CN:
            "过去会随等级只生效 62–100%，自 V14.1 起在任何等级都全额生效。对护甲 0 或以下的目标无效，也不会把护甲压成负数。",
        },
      },
      {
        id: "percent-penetration",
        icon: "scaleapen",
        title: {
          ko_KR: "방어구 관통력 (%)",
          en_US: "Percent armor penetration",
          zh_CN: "百分比护甲穿透",
        },
        formula: "적용 방어력 = 방어력 × (1 − 관통%)",
        description: {
          ko_KR:
            "고정 관통보다 먼저 적용된다. 그래서 방어력이 높은 대상에게 유리하고, 낮은 대상에게는 치명적 일격이 유리하다.",
          en_US:
            "Applied before flat penetration, so it is stronger against high-armor targets while lethality is stronger against low-armor ones.",
          zh_CN:
            "在固定穿透之前结算，因此对高护甲目标更有效，而穿甲对低护甲目标更有效。",
        },
      },
      {
        id: "magic-penetration",
        icon: "scalempen",
        title: {
          ko_KR: "마법 관통력",
          en_US: "Magic penetration",
          zh_CN: "法术穿透",
        },
        formula: "적용 마저 = 마법 저항력 × (1 − 관통%) − 고정 관통",
        description: {
          ko_KR:
            "물리 쪽과 같은 순서(% 먼저, 고정 나중)를 따른다. 마법 저항력을 0 밑으로 내리지 않는다.",
          en_US:
            "Follows the same order as the physical side (percent first, flat second) and never reduces magic resist below zero.",
          zh_CN:
            "与物理侧顺序相同（先百分比、后固定），且不会把魔抗降到 0 以下。",
        },
      },
    ],
  },
  {
    id: "offense",
    title: {
      ko_KR: "공격",
      en_US: "Offense",
      zh_CN: "攻击",
    },
    entries: [
      {
        id: "attack-speed",
        icon: "scaleas",
        title: {
          ko_KR: "공격 속도",
          en_US: "Attack speed",
          zh_CN: "攻击速度",
        },
        formula:
          "공격 속도 = 기본 공격 속도 + 공격 속도 계수 × 추가 공격 속도%",
        description: {
          ko_KR:
            "추가 공격 속도는 기본값에 곱해지는 게 아니라 챔피언마다 다른 '공격 속도 계수'에 곱해져 더해진다. 상한은 초당 2.5회다.",
          en_US:
            "Bonus attack speed is multiplied by the champion's own attack speed ratio and added to the base value — it is not a multiplier on the base. The cap is 2.5 attacks per second.",
          zh_CN:
            "额外攻速并非直接乘以基础值，而是乘以每个英雄各自的“攻速系数”后相加。上限为每秒 2.5 次。",
        },
      },
      {
        id: "critical-strike",
        icon: "scalecrit",
        title: {
          ko_KR: "치명타",
          en_US: "Critical strike",
          zh_CN: "暴击",
        },
        formula: "치명타 피해 = 원래 피해 × 175% (기본값)",
        description: {
          ko_KR:
            "기본 치명타 피해량은 175%다. 아이템이나 룬으로 이 수치를 더 올릴 수 있다. 툴팁에 '치명타 피해량' 계수가 붙은 스킬은 이 값을 그대로 참조한다.",
          en_US:
            "Base critical strike damage is 175%. Items and runes can raise it, and abilities that scale with critical strike damage read this same value.",
          zh_CN:
            "基础暴击伤害为 175%。装备与符文可以提高该数值，带有“暴击伤害”加成的技能也直接引用它。",
        },
      },
    ],
  },
  {
    id: "utility",
    title: {
      ko_KR: "유틸리티",
      en_US: "Utility",
      zh_CN: "功能性",
    },
    entries: [
      {
        id: "ability-haste",
        icon: "scalecooldown",
        title: {
          ko_KR: "스킬 가속 → 재사용 대기시간",
          en_US: "Ability haste → cooldown",
          zh_CN: "技能急速 → 冷却时间",
        },
        formula: "재사용 대기시간 = 기본 대기시간 × 100 / (100 + 스킬 가속)",
        description: {
          ko_KR:
            "방어력과 같은 모양의 식이라 상한이 없고 수익이 일정하다. 스킬 가속 100이면 대기시간이 절반이 된다. 예전의 '재사용 대기시간 감소(%)'와 달리 더할수록 손해 보지 않는다.",
          en_US:
            "Same shape as the armor formula: no cap and constant returns. 100 ability haste halves the cooldown. Unlike the old percent CDR stat, stacking it never suffers diminishing returns.",
          zh_CN:
            "与护甲公式形状相同：没有上限且收益恒定。100 点技能急速可让冷却减半。与旧的百分比冷却缩减不同，叠加不会出现收益递减。",
        },
        example: {
          ko_KR: "스킬 가속 100 → 50% 감소 / 200 → 66.7% 감소",
          en_US: "100 haste → 50% shorter / 200 → 66.7% shorter",
          zh_CN: "100 急速 → 缩短 50% / 200 → 缩短 66.7%",
        },
      },
      {
        id: "tenacity",
        title: {
          ko_KR: "강인함",
          en_US: "Tenacity",
          zh_CN: "坚韧",
        },
        formula: "군중 제어 지속시간 = 원래 지속시간 × (1 − 강인함)",
        description: {
          ko_KR:
            "지속시간은 효과가 걸리는 순간에 정해진다. 걸린 뒤에 강인함을 올려도 이미 걸린 효과는 짧아지지 않는다. 출처에 따라 더해지기도 하고 곱해지기도 한다.",
          en_US:
            "Duration is locked in when the crowd control lands; raising tenacity afterwards does not shorten an effect already applied. Sources stack additively or multiplicatively depending on the combination.",
          zh_CN:
            "持续时间在控制生效的瞬间确定；之后再提高坚韧不会缩短已经生效的效果。不同来源可能相加也可能相乘。",
        },
      },
    ],
  },
  {
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
        formula:
          "표시값 = 보정계수 × 변환율 × (내 스탯 − 반대쪽 변환율 × 상대 스탯)",
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
  },
];
