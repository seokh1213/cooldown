import type { FormulaGroup } from "./formulaGroup";

export const OFFENSE_FORMULAS: FormulaGroup = {
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
      formula: {
        ko_KR: "공격 속도 = 기본 공격 속도 + 공격 속도 계수 × 추가 공격 속도%",
        en_US: "Attack speed = Base attack speed + Attack speed ratio × Bonus attack speed%",
        zh_CN: "攻击速度 = 基础攻速 + 攻速系数 × 额外攻速%",
      },
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
        ko_KR: "치명타 피해량",
        en_US: "Critical strike damage",
        zh_CN: "暴击伤害",
      },
      formula: {
        ko_KR: "치명타 피해 = 원래 피해 × 175% (기본값)",
        en_US: "Critical damage = Raw damage × 175% (default)",
        zh_CN: "暴击伤害 = 原始伤害 × 175%（默认）",
      },
      description: {
        ko_KR:
          "기본 치명타 피해량은 175%다. 오래된 자료에는 200%로 적혀 있는 경우가 있는데 지금 값이 아니다. 치명타 피해량 증가는 서로 더해진다 — 무한의 대검이 치명타 피해량 30%를 주므로 그것만 들면 205%가 된다.",
        en_US:
          "Base critical strike damage is 175%. Older references still say 200%, which is no longer current. Critical strike damage bonuses add together — Infinity Edge grants 30%, bringing it to 205% on its own.",
        zh_CN:
          "基础暴击伤害为 175%。较旧的资料仍写作 200%，那已不是当前数值。暴击伤害加成彼此相加——无尽之刃提供 30%，单独装备时即为 205%。",
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
      formula: {
        ko_KR: "1 적응형 = 추가 공격력 0.6  또는  주문력 1",
        en_US: "1 adaptive force = 0.6 bonus AD  or  1 AP",
        zh_CN: "1 点适应之力 = 0.6 额外攻击力  或  1 法术强度",
      },
      description: {
        ko_KR:
          "추가 공격력이 주문력보다 많으면 공격력으로, 아니면 주문력으로 바뀐다. 지속 효과로 얻은 공격력·주문력은 이 판정에 넣지 않는다.",
        en_US:
          "Converts to attack damage when bonus AD exceeds ability power, otherwise to ability power. AD and AP granted by passive effects do not count toward the comparison.",
        zh_CN:
          "额外攻击力高于法术强度时转为攻击力，否则转为法术强度。被动效果提供的攻击力与法强不计入该判定。",
      },
    },
  ],
};
