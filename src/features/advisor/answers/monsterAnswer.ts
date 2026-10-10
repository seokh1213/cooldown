import { MONSTER_NOTES, MONSTER_REVIEW_PATCH, monsterLanguage, monsterValue, type MonsterNote, type MonsterStat, type MonsterText } from "@/domain/knowledge/monsterNotes";
import { aliasAt } from "@/domain/knowledge/searchAliases";
import { monsterBuffDetails } from "./monsterBuffAnswer";

const DETAILS = /스킬|능력치|스탯|체력|피통|공격력|공격\s*속도|공속|방어력|마법\s*저항|마저|사거리|피해|데미지|기믹|형태|종류|\b(?:stats?|hp|health|ad|as|mr|attack\s*(?:damage|speed)|armor|magic\s*resist(?:ance)?|range|damage|abilities|ability|skills?|forms?)\b|技能|属性|生命|攻击力|攻击速度|护甲|魔抗|魔法抗性|射程|伤害|形态/i;
const ABILITIES = /스킬|기믹|형태|종류|부패|끌어|균열|번개|촉수|시선|눈|진드기|회복|피해|데미지|\b(?:abilities|ability|skills?|forms?|corruption|pull|rift|lightning|tentacle|gaze|eye|mites?|damage)\b|技能|形态|腐蚀|拉拽|裂隙|闪电|眼睛|虚空螨|伤害/i;
const STAT_WORDS: Array<[MonsterStat, RegExp, MonsterText]> = [
  ["healthRegen", /체력\s*(?:재생|회복)|체젠|health\s*regen|生命回复/i, { ko: "체력 재생", en: "Health regeneration", zh: "生命回复" }],
  ["attackSpeed", /공격\s*속도|공속|\bas\b|attack\s*speed|攻击速度|攻速/i, { ko: "공격 속도(초당 공격 횟수)", en: "Attack speed (attacks/s)", zh: "攻击速度（每秒次数）" }],
  ["attackDamage", /공격력|\bad\b|attack\s*damage|攻击力/i, { ko: "공격력", en: "Attack damage", zh: "攻击力" }],
  ["magicResist", /마법\s*저항|마저|\bmr\b|magic\s*resist|魔抗|魔法抗性/i, { ko: "마법 저항력", en: "Magic resist", zh: "魔法抗性" }],
  ["armor", /방어력|\barmor\b|\barmour\b|护甲/i, { ko: "방어력", en: "Armor", zh: "护甲" }],
  ["moveSpeed", /이동\s*속도|이속|move(?:ment)?\s*speed|移速|移动速度/i, { ko: "이동 속도", en: "Movement speed", zh: "移动速度" }],
  ["range", /사거리|\brange\b|射程|攻击范围/i, { ko: "공격 사거리", en: "Attack range", zh: "攻击范围" }],
  ["health", /체력|피통|\bhp\b|\bhealth\b|生命/i, { ko: "체력", en: "Health", zh: "生命值" }],
];

const SKILL_WORDS: Record<string, RegExp> = {
  "forms": /형태|종류|form|形态/i,
  "gaze": /시선|gaze|凝视/i,
  "corrosion": /부패|부식|corruption|corrosion|腐蚀/i,
  "acid-pool": /웅덩이|acid pool|酸液池/i,
  "acid-shot": /산성 발사|acid shot|酸液喷射/i,
  "tentacle": /촉수|tentacle|触手/i,
  "hunting-lightning": /번개|사냥형|lightning|hunting|闪电|猎杀/i,
  "territorial-pull": /끌어|영역형|territorial|pull|拉拽|领地/i,
  "all-seeing-rift": /균열|천리안형|all-seeing|rift damage|裂隙|全视/i,
  "ambient-shred": /오라|초당.*저항|ambient|光环/i,
  "horde": /진드기|voidmite|虚空螨/i,
  "defensive-measures": /회복|heal|回复|恢复/i,
  "eye": /눈|eye|眼睛|弱点/i,
  "charge": /돌진|charge|冲锋/i,
};

export function namedMonsters(question: string): MonsterNote[] {
  const matches = MONSTER_NOTES.flatMap(note => Object.values(note.aliases).flat().flatMap(alias => {
    const at = aliasAt(question, alias);
    return at < 0 ? [] : [{ note, at, end: at + alias.length }];
  }));
  return [...new Set(matches.filter(match => !matches.some(other => other.note !== match.note
    && other.at <= match.at && other.end >= match.end && other.end - other.at > match.end - match.at)).map(match => match.note))];
}

function requestedStats(question: string): MonsterStat[] {
  const fields = STAT_WORDS.filter(([, words]) => words.test(question)).map(([field]) => field);
  return fields.includes("healthRegen") ? fields.filter(field => field !== "health") : fields;
}

function renderStat(note: MonsterNote, field: MonsterStat, question: string, lang: string): string | undefined {
  const fact = note.stats[field], l = monsterLanguage(lang);
  const label = STAT_WORDS.find(([key]) => key === field)![2][l];
  if (!fact) return undefined;
  if (fact.reviewStatus === "conflict") return fact.text?.[l];
  if (!fact.model) return undefined;
  const explicit = /(?:level|lv\.?)\s*(\d+)|(\d+)\s*(?:레벨|렙|级|level)/i.exec(question);
  const level = explicit ? Number(explicit[1] ?? explicit[2]) : undefined;
  if (level !== undefined && (level < note.level.minimum || level > note.level.maximum || monsterValue(fact.model, level) === undefined)) {
    return l === "ko" ? `${level}레벨 ${label}은 검수 범위에 없습니다.` : l === "en" ? `Level ${level} ${label} is outside the reviewed range.` : `${level}级${label}不在已核实范围内。`;
  }
  const firstSpawn = note.id === "scuttle" && /첫|first|首次/i.test(question);
  const multiplier = firstSpawn && field === "health" ? .65 : 1;
  const amount = (at: number) => Number((monsterValue(fact.model!, at)! * multiplier).toFixed(2)).toLocaleString("en-US");
  const value = level !== undefined ? amount(level) : fact.model.kind === "constant" ? amount(note.level.minimum)
    : `${amount(note.level.minimum)}–${amount(note.level.maximum)}`;
  return `${label}: ${value}${level === undefined ? "" : ` (${level})`}`;
}

function renderAbilities(note: MonsterNote, question: string, lang: string): string[] {
  const l = monsterLanguage(lang);
  const selected = note.abilities.filter(fact => SKILL_WORDS[fact.id]?.test(question));
  return (selected.length ? selected : note.abilities).flatMap(fact => fact.text?.[l] ? [fact.text[l]] : []);
}

export function monsterDetails(question: string, lang: string, group?: string): string | undefined {
  const l = monsterLanguage(lang);
  const named = namedMonsters(question);
  const candidates = named.length ? named : group ? MONSTER_NOTES.filter(note => note.group === group && note.id !== "pit-voidmite") : [];
  if (!candidates.length) return undefined;
  const buff = monsterBuffDetails(question, candidates, lang);
  if (buff) return buff;
  if (!DETAILS.test(question)) return undefined;
  if (/버프|\bbuff\b|增益/i.test(question) && !/몬스터|monster|野怪/i.test(question)) {
    return l === "ko" ? "아군에게 주는 버프 수치와 몬스터 자체 능력치는 다릅니다. 이 조회의 수치는 몬스터 기준이므로 버프 수치로 대신 답하지 않습니다."
      : l === "en" ? "The allied buff and the monster’s own stats are different. These monster stats cannot answer a buff-value question."
        : "友方增益数值与野怪自身属性不同，不能用野怪属性代替增益数值。";
  }
  const fields = requestedStats(question);
  const sections = candidates.map(note => {
    const stats = fields.length ? fields : ABILITIES.test(question) ? [] : Object.keys(note.stats) as MonsterStat[];
    const lines = stats.flatMap(field => renderStat(note, field, question, lang) ?? []);
    if (ABILITIES.test(question)) lines.push(...renderAbilities(note, question, lang));
    if (note.id === "scuttle" && fields.includes("attackDamage")) lines.push(note.abilities.find(fact => fact.id === "non-hostile")!.text![l]);
    if (!lines.length) lines.push(l === "ko" ? "이 항목은 아직 검수한 자료가 없습니다." : l === "en" ? "This field has not been reviewed yet." : "此项资料尚未核实。");
    const range = l === "ko" ? `몬스터 레벨 ${note.level.minimum}–${note.level.maximum} 기준이며 공격하는 챔피언의 레벨과 다릅니다.`
      : l === "en" ? `Uses monster levels ${note.level.minimum}–${note.level.maximum}, not the attacking champion’s level.`
        : `使用野怪等级${note.level.minimum}–${note.level.maximum}，不是攻击者的英雄等级。`;
    return [`### ${note.title[l]}`, range, ...lines].join("\n");
  });
  const scope = l === "ko" ? `${MONSTER_REVIEW_PATCH} 검수 · PC 소환사의 협곡 일반 규칙` : l === "en" ? `Reviewed through ${MONSTER_REVIEW_PATCH} · standard PC Summoner’s Rift` : `核实至${MONSTER_REVIEW_PATCH} · PC标准召唤师峡谷`;
  return `${sections.join("\n\n")}\n\n${scope}`;
}

export function monsterDocs(lang: string) {
  const l = monsterLanguage(lang);
  return MONSTER_NOTES.map(note => ({ id: `monster-${note.id}`, page: note.sources[0].slice(5).replace(/ /g, "_"),
    version: note.version, keywords: note.aliases, text: {
      ko: [monsterDetails(`${note.aliases.ko[0]} 스탯`, "ko")!, ...renderAbilities(note, "", "ko"), monsterBuffDetails("버프", [note], "ko")].filter(Boolean).join("\n"),
      en: [monsterDetails(`${note.aliases.en[0]} stats`, "en")!, ...renderAbilities(note, "", "en"), monsterBuffDetails("buff", [note], "en")].filter(Boolean).join("\n"),
      zh: [monsterDetails(`${note.aliases.zh[0]} 属性`, "zh")!, ...renderAbilities(note, "", "zh"), monsterBuffDetails("增益", [note], "zh")].filter(Boolean).join("\n"),
    }, title: note.title[l] }));
}
