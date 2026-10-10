import type { FormulaGroup } from "./formulaGroup";

export const SUSTAIN_FORMULAS: FormulaGroup = {
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
      formula: {
        ko_KR: "회복량 = 기본 회복량 × (1 + 회복·보호막 강화)",
        en_US: "Healing = Base healing × (1 + Heal and shield power)",
        zh_CN: "治疗量 = 基础治疗量 × (1 + 治疗与护盾强度)",
      },
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
      formula: {
        ko_KR: "받는 회복량 = 원래 회복량 × 60%",
        en_US: "Healing received = Raw healing × 60%",
        zh_CN: "受到的治疗 = 原始治疗量 × 60%",
      },
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
      formula: {
        ko_KR: "회복량 = 감쇄 후 피해 × 흡혈%",
        en_US: "Healing = Post-mitigation damage × Vamp%",
        zh_CN: "治疗量 = 减伤后伤害 × 吸血%",
      },
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
};
