import { monsterLanguage, type MonsterNote } from "@/domain/knowledge/notes/monsterNotes";

const FIELDS: Array<[RegExp, string[]]> = [
  [/스킬\s*가속|ability\s*haste|技能急速/i, ["ability-haste"]],
  [/마나|mana|法力|回蓝/i, ["mana-regeneration"]],
  [/기력|energy|能量/i, ["energy-regeneration"]],
  [/체력|재생|회복|health|regen|生命|回复/i, ["health-regeneration"]],
  [/공격력|\bad\b|attack\s*damage|攻击力/i, ["bonus-attack-damage", "infernal-might"]],
  [/주문력|\bap\b|ability\s*power|法强|法术强度/i, ["ability-power", "infernal-might"]],
  [/화상|고정\s*피해|burn|true\s*damage|灼烧|真实伤害/i, ["burn"]],
  [/둔화|slow|减速/i, ["slow"]],
  [/지속|몇\s*초|duration|last|持续/i, ["buff-duration"]],
  [/귀환|recall|回城/i, ["empowered-recall"]],
];

/** 아군 보상은 챔피언 레벨·처치 시점으로 해석하고 몬스터 성장치를 섞지 않는다. */
export function monsterBuffDetails(question: string, notes: MonsterNote[], lang: string): string | undefined {
  const asksBuff = /버프|\bbuff\b|증가|올려|중첩|\bstacks?\b|增益|增加|叠层/i.test(question)
    || notes.some(note => note.id === "blue") && /기력|마나.*회복|스킬\s*가속|energy|mana.*regen|ability\s*haste|回蓝|能量|技能急速/i.test(question);
  if (!asksBuff || /첫.*(?:나와|등장)|처음.*(?:나와|등장)|first.*spawn|首次.*刷新/i.test(question)) return undefined;
  const l = monsterLanguage(lang), requested = FIELDS.filter(([pattern]) => pattern.test(question)).flatMap(([, ids]) => ids);
  const sections = notes.flatMap(note => {
    const facts = note.buffs?.filter(fact => !requested.length || requested.includes(fact.id)) ?? [];
    if (!facts.length) return [];
    return [`### ${note.title[l]} ${l === "ko" ? "아군 버프" : l === "en" ? "allied buff" : "友方增益"}\n${facts.map(fact => fact.text?.[l]).filter(Boolean).join("\n")}`];
  });
  return sections.length ? sections.join("\n\n") : undefined;
}
