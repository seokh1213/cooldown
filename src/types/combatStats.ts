export type StatCategory = "resource" | "offense" | "defense" | "utility" | "other";

export enum StatKey {
  MAX_HEALTH = "MAX_HEALTH",
  HEALTH_REGEN = "HEALTH_REGEN",
  MAX_MANA = "MAX_MANA",
  MANA_REGEN = "MANA_REGEN",
  MAX_ENERGY = "MAX_ENERGY",
  ENERGY_REGEN = "ENERGY_REGEN",
  ATTACK_DAMAGE = "ATTACK_DAMAGE",
  ABILITY_POWER = "ABILITY_POWER",
  ARMOR = "ARMOR",
  MAGIC_RESIST = "MAGIC_RESIST",
  ATTACK_SPEED = "ATTACK_SPEED",
  CRIT_CHANCE = "CRIT_CHANCE",
  CRIT_DAMAGE = "CRIT_DAMAGE",
  MOVE_SPEED = "MOVE_SPEED",
  ATTACK_RANGE = "ATTACK_RANGE",
  ABILITY_HASTE = "ABILITY_HASTE",
  LIFE_STEAL = "LIFE_STEAL",
  OMNIVAMP = "OMNIVAMP",
  PHYSICAL_VAMP = "PHYSICAL_VAMP",
  SPELL_VAMP = "SPELL_VAMP",
  LETHALITY = "LETHALITY",
  ARMOR_PEN_FLAT = "ARMOR_PEN_FLAT",
  ARMOR_PEN_PERCENT = "ARMOR_PEN_PERCENT",
  MAGIC_PEN_FLAT = "MAGIC_PEN_FLAT",
  MAGIC_PEN_PERCENT = "MAGIC_PEN_PERCENT",
  TENACITY = "TENACITY",
  SLOW_RESIST = "SLOW_RESIST",
  HEAL_POWER = "HEAL_POWER",
  SHIELD_POWER = "SHIELD_POWER",
  GOLD_PER_10 = "GOLD_PER_10",
  XP_GAIN = "XP_GAIN",
  ADAPTIVE_FORCE = "ADAPTIVE_FORCE",
  ATTACK_SPEED_RATIO = "ATTACK_SPEED_RATIO",
}

export type StatValueType =
  | "flat"
  | "percent"
  | "perLevel"
  | "perLevelArray"
  | "perMissing"
  | "perBonus";

export interface StatDefinition {
  key: StatKey;
  category: StatCategory;
  isPercent: boolean;
  isPerLevel: boolean;
  label: { ko: string; en: string };
  riotKeywords: string[];
}

export interface StatContribution {
  stat: StatKey;
  value: number;
  valueType: StatValueType;
  source: "base" | "bonus" | "item" | "rune" | "spell";
  scope?:
    | "champion-base"
    | "spell-scaling"
    | "item-passive"
    | "item-active"
    | "rune";
  conditions?: string[];
}

export type FormulaOp = "add" | "mul" | "max" | "min";

export interface FormulaPart {
  stat: StatKey | null;
  coefficient: number;
  op: FormulaOp;
  rawRef?: string;
}

export const STAT_DEFINITIONS: Record<StatKey, StatDefinition> = {
  [StatKey.MAX_HEALTH]: {
    key: StatKey.MAX_HEALTH,
    category: "resource",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Health", ko: "체력" },
    riotKeywords: ["Health", "max Health", "maximum Health", "hp", "MaxHealth"],
  },
  [StatKey.HEALTH_REGEN]: {
    key: StatKey.HEALTH_REGEN,
    category: "resource",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Health Regen", ko: "체력 재생" },
    riotKeywords: ["Health Regen", "health regeneration", "hp regen"],
  },
  [StatKey.MAX_MANA]: {
    key: StatKey.MAX_MANA,
    category: "resource",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Mana", ko: "마나" },
    riotKeywords: ["Mana", "max Mana", "maximum Mana", "mp"],
  },
  [StatKey.MANA_REGEN]: {
    key: StatKey.MANA_REGEN,
    category: "resource",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Mana Regen", ko: "마나 재생" },
    riotKeywords: ["Mana Regen", "mana regeneration", "mp regen"],
  },
  [StatKey.MAX_ENERGY]: {
    key: StatKey.MAX_ENERGY,
    category: "resource",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Energy", ko: "기력" },
    riotKeywords: ["Energy", "max Energy"],
  },
  [StatKey.ENERGY_REGEN]: {
    key: StatKey.ENERGY_REGEN,
    category: "resource",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Energy Regen", ko: "기력 재생" },
    riotKeywords: ["Energy Regen", "energy regeneration"],
  },
  [StatKey.ATTACK_DAMAGE]: {
    key: StatKey.ATTACK_DAMAGE,
    category: "offense",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Attack Damage", ko: "공격력" },
    riotKeywords: ["Attack Damage", "AD", "attack damage"],
  },
  [StatKey.ABILITY_POWER]: {
    key: StatKey.ABILITY_POWER,
    category: "offense",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Ability Power", ko: "주문력" },
    riotKeywords: ["Ability Power", "AP"],
  },
  [StatKey.ARMOR]: {
    key: StatKey.ARMOR,
    category: "defense",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Armor", ko: "방어력" },
    riotKeywords: ["Armor", "armor"],
  },
  [StatKey.MAGIC_RESIST]: {
    key: StatKey.MAGIC_RESIST,
    category: "defense",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Magic Resist", ko: "마법 저항력" },
    riotKeywords: ["Magic Resist", "MR", "spell block"],
  },
  [StatKey.ATTACK_SPEED]: {
    key: StatKey.ATTACK_SPEED,
    category: "offense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Attack Speed", ko: "공격 속도" },
    riotKeywords: ["Attack Speed", "AS"],
  },
  [StatKey.CRIT_CHANCE]: {
    key: StatKey.CRIT_CHANCE,
    category: "offense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Crit Chance", ko: "치명타 확률" },
    riotKeywords: ["Critical Strike Chance", "Crit Chance"],
  },
  [StatKey.CRIT_DAMAGE]: {
    key: StatKey.CRIT_DAMAGE,
    category: "offense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Crit Damage", ko: "치명타 피해" },
    riotKeywords: ["Critical Strike Damage", "Crit Damage"],
  },
  [StatKey.MOVE_SPEED]: {
    key: StatKey.MOVE_SPEED,
    category: "utility",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Move Speed", ko: "이동 속도" },
    riotKeywords: ["Move Speed", "Movement Speed", "MS"],
  },
  [StatKey.ATTACK_RANGE]: {
    key: StatKey.ATTACK_RANGE,
    category: "offense",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Attack Range", ko: "공격 사거리" },
    riotKeywords: ["Attack Range", "range"],
  },
  [StatKey.ABILITY_HASTE]: {
    key: StatKey.ABILITY_HASTE,
    category: "utility",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Ability Haste", ko: "스킬 가속" },
    riotKeywords: ["Ability Haste", "ability haste"],
  },
  [StatKey.LIFE_STEAL]: {
    key: StatKey.LIFE_STEAL,
    category: "offense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Life Steal", ko: "생명력 흡수" },
    riotKeywords: ["Life Steal", "lifesteal"],
  },
  [StatKey.OMNIVAMP]: {
    key: StatKey.OMNIVAMP,
    category: "offense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Omnivamp", ko: "만능 흡혈" },
    riotKeywords: ["Omnivamp"],
  },
  [StatKey.PHYSICAL_VAMP]: {
    key: StatKey.PHYSICAL_VAMP,
    category: "offense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Physical Vamp", ko: "물리 흡혈" },
    riotKeywords: ["Physical Vamp"],
  },
  [StatKey.SPELL_VAMP]: {
    key: StatKey.SPELL_VAMP,
    category: "offense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Spell Vamp", ko: "주문 흡혈" },
    riotKeywords: ["Spell Vamp"],
  },
  [StatKey.LETHALITY]: {
    key: StatKey.LETHALITY,
    category: "offense",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Lethality", ko: "물리 관통력" },
    riotKeywords: ["Lethality"],
  },
  [StatKey.ARMOR_PEN_FLAT]: {
    key: StatKey.ARMOR_PEN_FLAT,
    category: "offense",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Armor Penetration", ko: "방어구 관통력" },
    riotKeywords: ["Armor Penetration", "Flat Armor Penetration"],
  },
  [StatKey.ARMOR_PEN_PERCENT]: {
    key: StatKey.ARMOR_PEN_PERCENT,
    category: "offense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Armor Penetration %", ko: "방어구 관통 (비율)" },
    riotKeywords: ["% Armor Penetration", "Percent Armor Penetration"],
  },
  [StatKey.MAGIC_PEN_FLAT]: {
    key: StatKey.MAGIC_PEN_FLAT,
    category: "offense",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Magic Penetration", ko: "마법 관통력" },
    riotKeywords: ["Magic Penetration", "Flat Magic Penetration"],
  },
  [StatKey.MAGIC_PEN_PERCENT]: {
    key: StatKey.MAGIC_PEN_PERCENT,
    category: "offense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Magic Penetration %", ko: "마법 관통 (비율)" },
    riotKeywords: ["% Magic Penetration", "Percent Magic Penetration"],
  },
  [StatKey.TENACITY]: {
    key: StatKey.TENACITY,
    category: "defense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Tenacity", ko: "강인함" },
    riotKeywords: ["Tenacity"],
  },
  [StatKey.SLOW_RESIST]: {
    key: StatKey.SLOW_RESIST,
    category: "defense",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Slow Resist", ko: "둔화 저항" },
    riotKeywords: ["Slow Resist", "Slow Resistance"],
  },
  [StatKey.HEAL_POWER]: {
    key: StatKey.HEAL_POWER,
    category: "utility",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Heal Power", ko: "회복량 증가" },
    riotKeywords: ["Heal and Shield Power", "heal power"],
  },
  [StatKey.SHIELD_POWER]: {
    key: StatKey.SHIELD_POWER,
    category: "utility",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Shield Power", ko: "보호막 증가" },
    riotKeywords: ["Shield Power"],
  },
  [StatKey.GOLD_PER_10]: {
    key: StatKey.GOLD_PER_10,
    category: "other",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Gold per 10s", ko: "10초당 골드" },
    riotKeywords: ["Gold per 10", "gold/10"],
  },
  [StatKey.XP_GAIN]: {
    key: StatKey.XP_GAIN,
    category: "other",
    isPercent: true,
    isPerLevel: false,
    label: { en: "Experience Gain", ko: "경험치 획득량" },
    riotKeywords: ["Experience Gain", "XP Gain"],
  },
  [StatKey.ADAPTIVE_FORCE]: {
    key: StatKey.ADAPTIVE_FORCE,
    category: "offense",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Adaptive Force", ko: "적응형 능력치" },
    riotKeywords: ["Adaptive Force"],
  },
  [StatKey.ATTACK_SPEED_RATIO]: {
    key: StatKey.ATTACK_SPEED_RATIO,
    category: "offense",
    isPercent: false,
    isPerLevel: false,
    label: { en: "Attack Speed Ratio", ko: "공격 속도 비율" },
    riotKeywords: ["Attack Speed Ratio"],
  },
};


