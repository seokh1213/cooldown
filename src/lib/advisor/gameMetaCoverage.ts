const MONSTERS = new Set(["baron", "voidgrubs", "herald", "dragon", "elder", "scuttle", "buffs"]);
const DETAILS = /스킬|능력치|스탯|체력|공격력|공격\s*속도|공속|방어력|마법\s*저항|마저|사거리|피해량|\b(?:stats?|hp|health|attack\s*(?:damage|speed)|armor|magic\s*resist(?:ance)?|range|damage|abilities|ability|skills?)\b|技能|生命|攻击力|攻击速度|护甲|魔抗|魔法抗性|射程|伤害/i;

export function unreviewedMonsterDetail(id: string, question: string | undefined, lang: string): string | undefined {
  if (!MONSTERS.has(id) || !question || !DETAILS.test(question)) return undefined;
  if (lang.startsWith("en")) return "Reviewed data for this monster's detailed stats and abilities is not available yet, so I cannot answer this question.";
  if (lang.startsWith("zh")) return "目前还没有经过核实的该野怪详细属性和技能资料，因此无法回答这个问题。";
  return "이 오브젝트의 상세 능력치·스킬은 아직 검수된 자료가 없어 답할 수 없습니다.";
}
