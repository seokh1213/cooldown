import type { Language } from "@/i18n/translations";

/**
 * 게임 안에서 수치가 실제로 어떻게 계산되는지 적어 두는 표.
 *
 * 스킬 툴팁은 "방어구 관통력 40" 까지만 알려 주고, 그게 피해량에 어떻게
 * 반영되는지는 말해 주지 않는다. 순서·중첩 방식·상한처럼 툴팁 어디에도
 * 안 적혀 있는 시스템 규칙을 모았다.
 *
 * 계산식 자체는 언어와 무관하므로 번역 파일이 아니라 여기 둔다.
 * (i18n 쪽에 넣으면 영어·중국어 문자열이 같아져 번역 누락 검사에 걸린다)
 *
 * 근거는 LoL Fandom 위키 문서다. 패치로 바뀐 항목에는 패치를 적어 둔다.
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
        formula: "받는 피해 = 원래 피해 × 100 / (100 + 저항력)",
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
          ko_KR: "실질 체력",
          en_US: "Effective health",
          zh_CN: "有效生命值",
        },
        formula: "실질 체력 = 체력 × (1 + 저항력 / 100)",
        description: {
          ko_KR:
            "저항력 1점마다 실질 체력이 정확히 1%씩 는다. 그래서 저항력은 쌓을수록 손해 보는 스탯이 아니다. 다만 체력이 낮으면 늘어나는 절대량도 작다.",
          en_US:
            "Each point of resistance adds exactly 1% to effective health, so resistances never suffer diminishing returns. The absolute gain is small when your health pool is small.",
          zh_CN:
            "每 1 点抗性正好为有效生命值增加 1%，因此抗性不会出现收益递减。但生命值本身较低时，绝对收益也小。",
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
        formula: "받는 피해 = 원래 피해 × (2 − 100 / (100 − 저항력))",
        description: {
          ko_KR:
            "저항력이 0 밑으로 내려가면 다른 곡선을 쓰고, 추가 피해는 최대 2배에서 멈춘다. 관통으로는 음수가 되지 않으므로 저항력 감소(reduction)로만 도달한다.",
          en_US:
            "Below zero the curve changes and bonus damage caps at 2x. Penetration cannot create negative resistance — only reduction can.",
          zh_CN:
            "抗性降到 0 以下会改用另一条曲线，额外伤害最多为 2 倍。穿透无法造成负抗性，只有削减可以。",
        },
      },
      {
        id: "true-damage",
        title: {
          ko_KR: "고정 피해",
          en_US: "True damage",
          zh_CN: "真实伤害",
        },
        formula: "받는 피해 = 원래 피해 (저항력 무시)",
        description: {
          ko_KR:
            "저항력 계산을 통째로 건너뛴다. 다만 '받는 피해 감소' 효과는 고정 피해에도 적용된다.",
          en_US:
            "Skips the resistance step entirely. Flat damage reduction effects still apply to it.",
          zh_CN:
            "完全跳过抗性计算。但“受到伤害降低”类效果依然对其生效。",
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
        formula: "총 배율 = (1 − 감소A) × (1 − 감소B) × …",
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
  },
  {
    id: "penetration",
    title: {
      ko_KR: "저항력 감소와 관통",
      en_US: "Resistance reduction and penetration",
      zh_CN: "抗性削减与穿透",
    },
    entries: [
      {
        id: "reduction-vs-penetration",
        title: {
          ko_KR: "감소와 관통의 차이",
          en_US: "Reduction vs. penetration",
          zh_CN: "削减与穿透的区别",
        },
        formula: "감소 = 대상의 저항력 자체를 깎음\n관통 = 내 피해 계산에서만 무시",
        description: {
          ko_KR:
            "감소(reduction)는 대상 스탯을 실제로 낮춰 아군 전체가 이득을 본다. 관통(penetration)은 내 피해를 계산할 때만 적용되고 대상의 표시 스탯은 그대로다. 기본 저항력과 추가 저항력은 따로 계산한다.",
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
        formula:
          "① 저항력 감소(고정)\n② 저항력 감소(%)\n③ 관통(%)\n④ 관통(고정)",
        description: {
          ko_KR:
            "순서가 결과를 바꾼다. 방어력·물리 관통력이든 마법 저항력·마법 관통력이든 같은 순서를 따른다.",
          en_US:
            "The order changes the result. It is the same on both sides — armor with armor penetration, magic resist with magic penetration.",
          zh_CN:
            "顺序会改变结果。护甲与护甲穿透、魔抗与法术穿透两侧遵循相同顺序。",
        },
      },
      {
        id: "flat-reduction",
        title: {
          ko_KR: "저항력 감소 (고정)",
          en_US: "Flat resistance reduction",
          zh_CN: "固定抗性削减",
        },
        formula: "저항력 = 저항력 − 감소량   (음수 가능)",
        description: {
          ko_KR:
            "여러 효과가 더해지고, 기본 저항력과 추가 저항력에 비례해 나뉘어 적용된다. 유일하게 저항력을 0 밑으로 내릴 수 있는 수단이다.",
          en_US:
            "Sources stack additively and the amount is split proportionally between base and bonus resistance. This is the only effect that can push resistance below zero.",
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
        formula: "저항력 = 저항력 × (1 − 감소%)",
        description: {
          ko_KR:
            "여러 개가 겹치면 곱해진다. 대상 저항력이 0 이하면 아무 일도 일어나지 않는다.",
          en_US:
            "Multiple sources stack multiplicatively, and it does nothing if the target is already at 0 or less.",
          zh_CN: "多个来源相乘叠加；若目标抗性已为 0 或更低则完全无效。",
        },
      },
      {
        id: "percent-penetration",
        icon: "scaleapen",
        title: {
          ko_KR: "관통 (%)",
          en_US: "Percent penetration",
          zh_CN: "百分比穿透",
        },
        formula: "적용 저항력 = 저항력 × (1 − 관통%)",
        description: {
          ko_KR:
            "고정 관통보다 먼저 적용된다. 그래서 저항력이 높은 대상일수록 이득이 크다.",
          en_US:
            "Applied before flat penetration, so its value grows with the target's resistance.",
          zh_CN: "在固定穿透之前结算，因此目标抗性越高收益越大。",
        },
      },
      {
        id: "lethality",
        icon: "scaleapen",
        title: {
          ko_KR: "물리 관통력 (치명적 일격)",
          en_US: "Lethality (flat armor penetration)",
          zh_CN: "穿甲（固定护甲穿透）",
        },
        formula: "무시하는 방어력 = 치명적 일격 수치 (1 : 1)",
        description: {
          ko_KR:
            "예전에는 레벨에 비례해 62~100%만 적용됐지만 V14.1부터 레벨과 무관하게 전부 적용된다. 방어력이 0 이하인 대상에게는 효과가 없다.",
          en_US:
            "It used to scale with level (62–100% of the value); since V14.1 the full amount applies at every level. It does nothing against targets at 0 or less armor.",
          zh_CN:
            "过去会随等级只生效 62–100%，自 V14.1 起在任何等级都全额生效。对护甲 0 或以下的目标无效。",
        },
      },
      {
        id: "magic-penetration",
        icon: "scalempen",
        title: {
          ko_KR: "마법 관통력 (고정)",
          en_US: "Flat magic penetration",
          zh_CN: "固定法术穿透",
        },
        formula: "적용 마저 = 마법 저항력 × (1 − 관통%) − 고정 관통",
        description: {
          ko_KR:
            "물리 쪽 치명적 일격과 같은 자리에 들어간다. 마법 저항력을 0 밑으로 내리지는 않는다.",
          en_US:
            "Occupies the same slot as lethality on the physical side and never pushes magic resist below zero.",
          zh_CN: "与物理侧的穿甲处于同一环节，且不会把魔抗降到 0 以下。",
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
        icon: "scalecritmult",
        title: {
          ko_KR: "치명타",
          en_US: "Critical strike",
          zh_CN: "暴击",
        },
        formula: "치명타 피해 = 원래 피해 × 175% (기본값)",
        description: {
          ko_KR:
            "기본 치명타 피해량은 175%다. 아이템·룬으로 더 올릴 수 있고, 툴팁에 '치명타 피해량' 계수가 붙은 스킬은 이 값을 그대로 참조한다.",
          en_US:
            "Base critical strike damage is 175%. Items and runes can raise it, and abilities that scale with critical strike damage read the same value.",
          zh_CN:
            "基础暴击伤害为 175%。装备与符文可提高该数值，带“暴击伤害”加成的技能也直接引用它。",
        },
      },
      {
        id: "adaptive-force",
        icon: "scaleadaptiveforce",
        title: {
          ko_KR: "적응형 능력치",
          en_US: "Adaptive force",
          zh_CN: "适应之力",
        },
        formula: "1 적응형 = 추가 공격력 0.6  또는  주문력 1",
        description: {
          ko_KR:
            "추가 공격력이 주문력보다 많으면 공격력으로, 아니면 주문력으로 바뀐다. 지속 효과로 얻은 공격력·주문력은 판정에 넣지 않는다.",
          en_US:
            "Converts to attack damage when bonus AD exceeds ability power, otherwise to ability power. AD and AP granted by passives do not count toward the comparison.",
          zh_CN:
            "额外攻击力高于法术强度时转为攻击力，否则转为法术强度。被动效果提供的攻击力与法强不计入判定。",
        },
      },
    ],
  },
  {
    id: "sustain",
    title: {
      ko_KR: "회복과 보호막",
      en_US: "Healing and shields",
      zh_CN: "治疗与护盾",
    },
    entries: [
      {
        id: "heal-shield-power",
        icon: "scalehealshield",
        title: {
          ko_KR: "회복·보호막 강화",
          en_US: "Heal and shield power",
          zh_CN: "治疗与护盾强度",
        },
        formula: "회복량 = 기본 회복량 × (1 + 회복·보호막 강화)",
        description: {
          ko_KR:
            "자기 자신끼리는 더해지고, 다른 회복 배율과는 곱해진다. 내가 주는 회복과 보호막에만 붙고 남에게서 받는 회복에는 붙지 않는다.",
          en_US:
            "Sources of this stat add together, but it multiplies with other healing modifiers. It only affects heals and shields you provide, not ones you receive from others.",
          zh_CN:
            "同类来源相加，但与其他治疗系数相乘。只影响自己给出的治疗与护盾，不影响他人给予自己的治疗。",
        },
      },
      {
        id: "grievous-wounds",
        title: {
          ko_KR: "고통스러운 상처 (치유 감소)",
          en_US: "Grievous Wounds (healing reduction)",
          zh_CN: "重伤（治疗削减）",
        },
        formula: "받는 회복량 = 원래 회복량 × 60%",
        description: {
          ko_KR:
            "받는 모든 회복과 체력 재생을 40% 줄인다. 여러 개를 걸어도 중첩되지 않고 지속시간만 갱신된다. 보호막에는 적용되지 않는다.",
          en_US:
            "Cuts all incoming healing and health regeneration by 40%. Multiple sources do not stack — they only refresh the duration. Shields are unaffected.",
          zh_CN:
            "将受到的所有治疗与生命回复降低 40%。多个来源不叠加，只刷新持续时间。护盾不受影响。",
        },
      },
      {
        id: "vamp",
        icon: "scalels",
        title: {
          ko_KR: "생명력 흡수와 흡혈",
          en_US: "Life steal and omnivamp",
          zh_CN: "生命偷取与全能吸血",
        },
        formula: "회복량 = 감쇄 후 피해 × 흡혈%",
        description: {
          ko_KR:
            "저항력으로 감쇄된 뒤의 피해를 기준으로 계산한다. 생명력 흡수는 기본 공격에만, 흡혈(옴니뱀프)은 모든 피해에 붙는다. 미니언과 몬스터에게는 흡혈이 20%만 적용되고, 회복·보호막 강화의 영향을 받지 않는다.",
          en_US:
            "Computed from post-mitigation damage. Life steal applies to basic attacks; omnivamp applies to all damage. Against minions and monsters omnivamp works at 20% effectiveness, and it does not benefit from heal and shield power.",
          zh_CN:
            "以减免后的伤害为基准计算。生命偷取只作用于普通攻击，全能吸血作用于所有伤害。对小兵与野怪，全能吸血只有 20% 效果，且不受治疗与护盾强度加成。",
        },
      },
    ],
  },
  {
    id: "movement",
    title: {
      ko_KR: "이동과 군중 제어",
      en_US: "Movement and crowd control",
      zh_CN: "移动与控制",
    },
    entries: [
      {
        id: "movement-speed",
        icon: "scalems",
        title: {
          ko_KR: "이동 속도 계산 순서",
          en_US: "Movement speed order",
          zh_CN: "移动速度计算顺序",
        },
        formula:
          "(기본 + 고정 증가)\n× (1 + 합연산 % 증가의 합)\n× (1 − 가장 강한 둔화)\n× 곱연산 증가들",
        description: {
          ko_KR:
            "둔화는 여러 개가 걸려도 가장 강한 것 하나만 적용된다. 대부분의 이동 속도 증가는 합연산이고, 일부만 따로 곱해진다.",
          en_US:
            "Only the strongest slow applies, no matter how many are active. Most speed boosts add together; only a few multiply separately.",
          zh_CN:
            "无论叠加多少减速，只有最强的一个生效。多数移速加成为相加，只有少数单独相乘。",
        },
      },
      {
        id: "movement-soft-cap",
        icon: "scalems",
        title: {
          ko_KR: "이동 속도 소프트 캡",
          en_US: "Movement speed soft caps",
          zh_CN: "移动速度软上限",
        },
        formula:
          "415 초과 490 이하 : 실제 = 계산값 × 0.8 + 83\n490 초과       : 실제 = 계산값 × 0.5 + 230\n220 미만       : 실제 = 계산값 × 0.5 + 110",
        description: {
          ko_KR:
            "415를 넘는 구간부터 효율이 깎이고, 반대로 220 밑으로는 잘 안 떨어진다. 그래서 이동 속도는 어느 선을 넘으면 더 쌓아도 이득이 급격히 줄어든다.",
          en_US:
            "Efficiency drops past 415 and is propped up below 220, so stacking movement speed loses value sharply beyond a certain point.",
          zh_CN:
            "超过 415 后效率下降，低于 220 时则被抬高。因此移速堆到一定程度后收益会急剧减少。",
        },
        example: {
          ko_KR: "계산값 600 → 실제 530 (11.7% 손실)",
          en_US: "Raw 600 → actual 530 (11.7% lost)",
          zh_CN: "计算值 600 → 实际 530（损失 11.7%）",
        },
      },
      {
        id: "tenacity",
        icon: "scaletenacity",
        title: {
          ko_KR: "강인함",
          en_US: "Tenacity",
          zh_CN: "坚韧",
        },
        formula: "군중 제어 지속시간 = 원래 지속시간 × (1 − 강인함)",
        description: {
          ko_KR:
            "지속시간은 효과가 걸리는 순간에 확정된다. 걸린 뒤에 강인함을 올려도 이미 걸린 효과는 짧아지지 않는다. 이동 불가 계열에만 적용되고 둔화에는 적용되지 않는다.",
          en_US:
            "Duration is locked in when the crowd control lands; raising tenacity afterwards does not shorten an effect already applied. It affects disables, not slows.",
          zh_CN:
            "持续时间在控制生效的瞬间确定；之后再提高坚韧不会缩短已生效的效果。它作用于控制类效果，不作用于减速。",
        },
      },
      {
        id: "slow-resist",
        title: {
          ko_KR: "둔화 저항",
          en_US: "Slow resist",
          zh_CN: "减速抗性",
        },
        formula: "적용 둔화 = 둔화 × (1 − 둔화 저항)",
        description: {
          ko_KR:
            "강인함과는 별개의 스탯이다. 강인함은 둔화에 듣지 않고, 둔화 저항은 이동 불가 계열에 듣지 않는다.",
          en_US:
            "A separate stat from tenacity. Tenacity does not affect slows, and slow resist does not affect disables.",
          zh_CN:
            "与坚韧是彼此独立的属性。坚韧对减速无效，减速抗性对控制类效果无效。",
        },
      },
    ],
  },
  {
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
        formula:
          "스탯 = 기본값 + 성장치 × (레벨 − 1) × (0.7025 + 0.0175 × (레벨 − 1))",
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
        formula: "재사용 대기시간 = 기본 대기시간 × 100 / (100 + 스킬 가속)",
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
        formula:
          "합연산 : 총합 = A + B + C\n곱연산 : 총합 = 1 − (1 − A) × (1 − B)",
        description: {
          ko_KR:
            "고정 수치와 대부분의 % 증가는 더해진다. 받는 피해 감소, 저항력 % 감소처럼 '깎는' 쪽 효과는 곱해져서 절대 100%가 되지 않는다.",
          en_US:
            "Flat values and most percent bonuses add together. Effects that cut something — damage reduction, percent resistance reduction — multiply instead, so they never reach 100%.",
          zh_CN:
            "固定数值与多数百分比加成相加。而“削减”类效果（减伤、百分比抗性削减）则相乘，因此永远无法达到 100%。",
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
