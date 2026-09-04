import type { Translations } from "./translations";

export function createZhCNTranslations(english: Translations): Translations {
  return {
    ...english,
    nav: {
      ...english.nav,
      encyclopedia: "百科全书",
      language: {
        korean: "한국어",
        english: "Eng",
        chinese: "简体中文",
        selectTitle: "选择语言",
      },
    },
    sidebar: {
      championCooldown: "英雄冷却时间",
      encyclopedia: "符文与装备百科",
      killAngle: "击杀线计算器",
      simulation: "模拟",
    },
    skillTooltip: {
      ...english.skillTooltip,
      passive: "被动",
      skill: "技能",
      skillInfo: "技能信息",
      skillDescription: "技能的详细信息。",
      warningPassive: "准确数值和说明请以游戏内提示为准。",
      warningSkill: "准确数值和说明请以游戏内提示为准。",
      viewDetail: "查看详情",
    },
    skills: { label: "技能" },
    stats: {
      ...english.stats,
      label: "属性",
      abilityPower: "法术强度",
      attackDamage: "攻击力",
      bonusAttackDamage: "额外攻击力",
      health: "生命值",
      bonusHealth: "额外生命值",
      armor: "护甲",
      bonusArmor: "额外护甲",
      magicResist: "魔法抗性",
      bonusMagicResist: "额外魔法抗性",
      lifesteal: "生命偷取",
      bonusLifesteal: "额外生命偷取",
      mana: "法力值",
    },
    common: {
      ...english.common,
      level: "级",
      seconds: "秒",
      noCost: "无消耗",
      mana: "法力值",
      rechargeTime: "充能时间",
      max: "最大",
      bonus: "额外",
    },
  };
}
