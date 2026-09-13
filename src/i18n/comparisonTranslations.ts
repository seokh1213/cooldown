export interface ComparisonLabels {
  title: string;
  description: string;
  mine: string;
  opponent: string;
  select: string;
  swap: string;
  open: string;
  empty: string;
  rank: string;
  baseCooldowns: string;
  skill: string;
  champion: string;
  tableNote: string;
  cooldownNote: string;
  baseStats: string;
  statBase: string;
  statGrowth: string;
  details: string;
  skillDetails: string;
  seconds: string;
  baseGrowth: string;
  growthNote: string;
  shorter: string;
  formRankNote: string;
}

export interface ItemDetailLabels {
  stats: string;
  effects: string;
  passive: string;
  active: string;
  aura: string;
  formula: string;
  damage: string;
  physical: string;
  magical: string;
  true: string;
  baseAttackDamage: string;
  targetMaxHealth: string;
  targetCurrentHealth: string;
  melee: string;
  ranged: string;
  duration: string;
  totalDamage: string;
  cooldown: string;
  original: string;
  formulaNote: string;
  missingFormula: string;
}

export const koComparison: ComparisonLabels = {
  title: "VS 라인전 비교",
  description: "두 챔피언의 스킬 쿨타임과 능력치를 나란히 비교해 보세요.",
  mine: "내 챔피언",
  opponent: "상대 챔피언",
  select: "챔피언 선택",
  swap: "내 챔피언과 상대 바꾸기",
  open: "VS 화면에서 비교",
  empty: "챔피언을 선택하면 스킬과 쿨타임이 표시됩니다.",
  rank: "스킬 랭크",
  baseCooldowns: "스킬 쿨타임",
  skill: "스킬",
  champion: "챔피언",
  tableNote:
    "Q·W·E·R마다 내 챔피언과 상대를 나란히 비교합니다. 행은 챔피언 레벨이 아닌 스킬 랭크입니다.",
  shorter: "같은 스킬·랭크에서 더 짧은 쿨타임",
  formRankNote: "스킬 효과 수치: R 랭크 기준",
  baseGrowth: "기본 + 성장",
  growthNote: "성장값은 레벨에 따른 증가 기준값이며, 매 레벨 고정 증가량은 아닙니다. 공격 속도 성장은 %입니다.",
  details: "스킬 상세",
  skillDetails: "스킬 설명",
  seconds: "초",
  cooldownNote:
    "기본 쿨타임 · 스킬 가속 미적용",
  baseStats: "레벨별 능력치",
  statBase: "1레벨",
  statGrowth: "레벨당",
};
export const enComparison: ComparisonLabels = {
  title: "VS lane comparison",
  description:
    "Compare two champions’ ability cooldowns and stats side by side.",
  mine: "Your champion",
  opponent: "Opponent",
  select: "Select champion",
  swap: "Swap champions",
  open: "Compare in VS",
  empty: "Select a champion to see abilities and cooldowns.",
  rank: "Ability rank",
  baseCooldowns: "Ability cooldowns",
  skill: "Skill",
  champion: "Champion",
  tableNote:
    "Each Q/W/E/R group pairs your champion with the opponent. Rows are ability ranks, not champion levels.",
  shorter: "Shorter cooldown at the same ability rank",
  formRankNote: "Effect values scale with R rank",
  baseGrowth: "Base + growth",
  growthNote: "Growth is the stat’s level-scaling value, not a fixed increase each level. Attack speed growth is a percentage.",
  details: "Ability details",
  skillDetails: "Ability descriptions",
  seconds: "sec",
  cooldownNote:
    "Base cooldowns · Before ability haste",
  baseStats: "Stats by level",
  statBase: "Level 1",
  statGrowth: "Per level",
};
export const zhComparison: ComparisonLabels = {
  title: "VS 对线比较",
  description: "并排比较两位英雄的技能冷却时间与属性。",
  mine: "己方英雄",
  opponent: "对手英雄",
  select: "选择英雄",
  swap: "交换双方英雄",
  open: "前往 VS 比较",
  empty: "选择英雄后即可查看技能与冷却时间。",
  rank: "技能等级",
  baseCooldowns: "技能冷却时间",
  skill: "技能",
  champion: "英雄",
  tableNote: "Q/W/E/R 各组并排比较双方英雄。行表示技能等级，而非英雄等级。",
  shorter: "同一技能、同一等级下更短的冷却时间",
  formRankNote: "技能效果数值随 R 等级变化",
  baseGrowth: "基础 + 成长",
  growthNote: "成长值是随英雄等级变化的计算基准，并非每级固定增量。攻击速度成长以百分比表示。",
  details: "技能详情",
  skillDetails: "技能说明",
  seconds: "秒",
  cooldownNote:
    "基础冷却时间 · 未计算技能急速",
  baseStats: "各等级属性",
  statBase: "1级",
  statGrowth: "每级",
};

export const koItemDetail: ItemDetailLabels = {
  stats: "능력치",
  effects: "아이템 효과",
  passive: "기본 지속 효과",
  active: "사용 효과",
  aura: "오오라",
  formula: "피해 공식",
  damage: "추가 피해",
  physical: "물리 피해",
  magical: "마법 피해",
  true: "고정 피해",
  baseAttackDamage: "기본 공격력",
  targetMaxHealth: "대상 최대 체력",
  targetCurrentHealth: "대상 현재 체력",
  melee: "근접",
  ranged: "원거리",
  duration: "지속시간",
  totalDamage: "전체 지속 피해",
  cooldown: "재사용 대기시간",
  original: "원본 설명",
  formulaNote: "대상 방어 능력치 적용 전 · 표시된 발동 조건 기준",
  missingFormula: "이 효과의 추가 수치·공식은 아직 제공되지 않습니다.",
};
export const enItemDetail: ItemDetailLabels = {
  stats: "Stats",
  effects: "Item effects",
  passive: "Passive effect",
  active: "Active effect",
  aura: "Aura effect",
  formula: "Damage formula",
  damage: "Bonus damage",
  physical: "Physical damage",
  magical: "Magic damage",
  true: "True damage",
  baseAttackDamage: "Base attack damage",
  targetMaxHealth: "Target maximum health",
  targetCurrentHealth: "Target current health",
  melee: "Melee",
  ranged: "Ranged",
  duration: "Duration",
  totalDamage: "Full damage over time",
  cooldown: "Cooldown",
  original: "Original description",
  formulaNote: "Before target defenses · assumes the listed trigger conditions",
  missingFormula:
    "Additional values and formulas for this effect are not yet available.",
};
export const zhItemDetail: ItemDetailLabels = {
  stats: "属性",
  effects: "装备效果",
  passive: "被动效果",
  active: "主动效果",
  aura: "光环效果",
  formula: "伤害公式",
  damage: "额外伤害",
  physical: "物理伤害",
  magical: "魔法伤害",
  true: "真实伤害",
  baseAttackDamage: "基础攻击力",
  targetMaxHealth: "目标最大生命值",
  targetCurrentHealth: "目标当前生命值",
  melee: "近战",
  ranged: "远程",
  duration: "持续时间",
  totalDamage: "完整持续伤害",
  cooldown: "冷却时间",
  original: "原始说明",
  formulaNote: "未计算目标防御属性 · 须满足所列触发条件",
  missingFormula: "此效果的额外数值与公式暂未提供。",
};
