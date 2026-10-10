import type { PatchMetric, PatchText } from "../../../src/domain/game/contracts/patchNotes";

export const text = (ko: string, en: string, zh: string): PatchText => ({ ko_KR: ko, en_US: en, zh_CN: zh });

export interface MetricDefinition {
  label: PatchText;
  factor?: number;
  favorable?: PatchMetric["favorable"];
  unit?: PatchMetric["unit"];
  start?: number;
  count?: number;
  format?: "range";
  section?: string;
  sectionName?: PatchText;
  defaultValue?: number;
}

export const STAT_LABELS: Record<string, PatchText> = {
  hp: text("체력", "Health", "生命值"), hpperlevel: text("체력 증가량", "Health growth", "生命值成长"),
  armor: text("방어력", "Armor", "护甲"), armorperlevel: text("방어력 증가량", "Armor growth", "护甲成长"),
  attackdamage: text("공격력", "Attack damage", "攻击力"),
  attackdamageperlevel: text("공격력 증가량", "Attack damage growth", "攻击力成长"),
  spellblock: text("마법 저항력", "Magic resist", "魔法抗性"),
  spellblockperlevel: text("마법 저항력 증가량", "Magic resist growth", "魔法抗性成长"),
  movespeed: text("이동 속도", "Move speed", "移动速度"), attackrange: text("공격 사거리", "Attack range", "攻击距离"),
  attackspeed: text("공격 속도", "Attack speed", "攻击速度"),
  attackspeedperlevel: text("공격 속도 증가량", "Attack speed growth", "攻击速度成长"),
  hpregen: text("체력 재생", "Health regeneration", "生命回复"),
  hpregenperlevel: text("체력 재생 증가량", "Health regeneration growth", "生命回复成长"),
  mp: text("마나", "Mana", "法力值"), mpperlevel: text("마나 증가량", "Mana growth", "法力值成长"),
  mpregen: text("마나 재생", "Mana regeneration", "法力回复"),
  mpregenperlevel: text("마나 재생 증가량", "Mana regeneration growth", "法力回复成长"),
};

export const VALUE_DEFINITIONS: Record<string, MetricDefinition> = {
  BaseDamage: { label: text("기본 피해량", "Base damage", "基础伤害") },
  BonusDamage: { label: text("추가 피해량", "Bonus damage", "额外伤害") },
  PassiveDamageBase: { label: text("강화 공격 기본 피해량", "Empowered attack base damage", "强化攻击基础伤害") },
  AreaDuration: { label: text("영역 지속시간", "Area duration", "区域持续时间"), unit: "seconds" },
  SleepDuration: { label: text("수면 지속시간", "Sleep duration", "昏睡持续时间"), unit: "seconds" },
  SlowDuration: { label: text("둔화 지속시간", "Slow duration", "减速持续时间"), unit: "seconds" },
  IsolatedSlowDuration: { label: text("고립 대상 둔화 지속시간", "Isolated target slow duration", "孤立目标减速持续时间"), unit: "seconds" },
  HealPerSecond: { label: text("초당 기본 체력 회복량", "Base healing per second", "每秒基础治疗") },
  HealRingRadius: { label: text("체력 회복 범위", "Healing radius", "治疗范围") },
  EvolvedLeapRange: { label: text("진화 후 도약 사거리", "Evolved leap range", "进化后跃击距离") },
  MaxHealthDamageToNonHeroes: { label: text("몬스터 대상 최대 피해량", "Maximum damage to monsters", "对野怪最大伤害") },
  ActiveAttackSpeed: { label: text("추가 공격 속도", "Bonus attack speed", "额外攻击速度"), factor: 100, unit: "percent" },
  EVampHPRatio: { label: text("추가 체력 100당 회복 계수", "Healing ratio per 100 bonus health", "每100额外生命治疗系数"), factor: 100, unit: "percent" },
  OverloadDamageBonus: {
    label: text("전이 추가 피해량 (R 0~3레벨)", "Flux damage bonus (R rank 0–3)", "涌动额外伤害（R 0–3级）"),
    unit: "percent", start: 0, count: 4, section: "Q",
  },
  PassiveBonusDamage: {
    label: text("기본 지속 효과 적중 시 피해량", "Passive on-hit damage", "被动命中伤害"),
    count: 4, section: "P",
  },
};

interface SpecificDefinition extends MetricDefinition {
  championId: string;
  spellName: string;
  group: "values" | "calculations";
  keys: string[];
}

export const SPECIFIC_DEFINITIONS: SpecificDefinition[] = [
  { championId: "Fiora", spellName: "FioraR", group: "values", keys: ["Ratio"],
    label: text("체력 회복 추가 공격력 계수", "Bonus AD healing ratio", "额外攻击力治疗系数"), factor: 100, unit: "percent" },
  { championId: "Lucian", spellName: "LucianPassive", group: "calculations", keys: ["/PassiveTotalDamage/mFormulaParts/1/mCoefficient"],
    label: text("강화 공격 총 공격력 계수", "Empowered attack total AD ratio", "强化攻击总攻击力系数"), factor: 100, unit: "percent", section: "P" },
  { championId: "Vi", spellName: "ViPassive", group: "calculations", keys: ["/TotalShield/mFormulaParts/0/mCoefficient"],
    label: text("최대 체력 대비 보호막", "Shield as a share of max health", "最大生命值护盾比例"), factor: 100, unit: "percent", section: "P" },
  { championId: "Volibear", spellName: "VolibearP", group: "calculations", keys: ["/AttackSpeedCalc/mFormulaParts/1/mCoefficient"],
    label: text("주문력 100당 중첩별 공격 속도", "Attack speed per stack per 100 AP", "每层每100法强攻击速度"), factor: 10000, unit: "percent", section: "P" },
  { championId: "Volibear", spellName: "VolibearP", group: "calculations", keys: ["/ChainLightningDamage/mFormulaParts/2/mCoefficient"],
    label: text("번개 피해 추가 공격력 계수", "Lightning bonus AD ratio", "闪电额外攻击力系数"), factor: 100, unit: "percent", section: "P", defaultValue: 0 },
  { championId: "Khazix", spellName: "KhazixPassive", group: "calculations", keys: ["/TotalDamage/mFormulaParts/0/values"],
    label: text("기본 피해량 (1~18레벨)", "Base damage (level 1–18)", "基础伤害（1–18级）"), start: 1, count: 18, format: "range", section: "P" },
  { championId: "Rumble", spellName: "RumbleHeatSystem", group: "calculations",
    keys: ["/OverheatAS/mFormulaParts/0/mStartValue", "/OverheatAS/mFormulaParts/0/mEndValue"],
    label: text("과열 공격 속도 (1~18레벨)", "Overheat attack speed (level 1–18)", "过热攻击速度（1–18级）"), factor: 100, unit: "percent", format: "range", section: "P" },
  { championId: "Rumble", spellName: "RumbleHeatSystem", group: "calculations",
    keys: ["/MonsterCapScaling/mFormulaParts/0/mStartValue", "/MonsterCapScaling/mFormulaParts/0/mEndValue"],
    label: text("몬스터 대상 최대 피해량 (1~18레벨)", "Monster damage cap (level 1–18)", "对野怪伤害上限（1–18级）"), format: "range", section: "P" },
  { championId: "Aphelios", spellName: "{9501e989}", group: "calculations", keys: ["/SpellDamage/mFormulaParts/0/mLevel1Value"],
    label: text("기본 피해량 (1레벨)", "Base damage (level 1)", "基础伤害（1级）"), section: "Q", sectionName: text("만월총 · 달빛탄", "Calibrum · Moonshot", "通碧 · 碧月闪光") },
  { championId: "Aphelios", spellName: "{c872c72d}", group: "calculations", keys: ["/HealAmount/mFormulaParts/0/mEndValue"],
    label: text("기본 공격 회복량 (18레벨)", "Basic attack healing (level 18)", "普攻治疗（18级）"), factor: 100, unit: "percent", section: "Q", sectionName: text("절단검", "Severum", "断魄") },
  { championId: "Aphelios", spellName: "{b3ce4169}", group: "calculations", keys: ["/{dec81e53}/mFormulaParts/0/mNumber"],
    label: text("감소 후 둔화율", "Slow after decay", "衰减后减速"), factor: 100, unit: "percent", section: "Q", sectionName: text("중력포", "Gravitum", "坠明") },
  { championId: "Aphelios", spellName: "{d29e7023}", group: "calculations", keys: ["/InfernumQCD/mFormulaParts/0/mLevel1Value"],
    label: text("재사용 대기시간 (1레벨)", "Cooldown (level 1)", "冷却时间（1级）"), favorable: "lower", unit: "seconds", section: "Q", sectionName: text("화염포 · 황혼파", "Infernum · Duskwave", "荧焰 · 暝涌") },
  { championId: "Aphelios", spellName: "{ad4cfba9}", group: "values", keys: ["MiniDamageRatioMax"],
    label: text("첫 반월검 환영 공격력 계수", "First mirror chakram AD ratio", "首个飞轮攻击力系数"), factor: 100, unit: "percent", section: "Q", sectionName: text("반월검", "Crescendum", "折镜") },
];

export const ITEM_DEFINITIONS: Record<string, MetricDefinition> = {
  mFlatHPPoolMod: { label: STAT_LABELS.hp },
  mFlatPhysicalDamageMod: { label: STAT_LABELS.attackdamage },
  mFlatMagicDamageMod: { label: text("주문력", "Ability power", "法术强度") },
  mFlatArmorMod: { label: STAT_LABELS.armor },
  mFlatSpellBlockMod: { label: STAT_LABELS.spellblock },
  mPercentBaseHPRegenMod: { label: text("기본 체력 재생", "Base health regeneration", "基础生命回复"), factor: 100, unit: "percent" },
  percentBaseMPRegenMod: { label: text("기본 마나 재생", "Base mana regeneration", "基础法力回复"), factor: 100, unit: "percent" },
  mAbilityHasteMod: { label: text("스킬 가속", "Ability haste", "技能急速") },
  mFlatMovementSpeedMod: { label: STAT_LABELS.movespeed },
  mPercentAttackSpeedMod: { label: STAT_LABELS.attackspeed, factor: 100, unit: "percent" },
};
