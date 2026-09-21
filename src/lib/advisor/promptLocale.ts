/**
 * 해설 프롬프트의 언어
 *
 * 카드 자료(`champion-cards-<locale>.json`)는 챔피언 이름과 스킬 이름만 로케일을
 * 따른다. 효과 태그·피해 유형·능력치 등급은 파이프라인이 한국어 문자열 리터럴로
 * 타입을 잡고 있어 데이터 쪽을 통째로 옮기기 어렵다. 어차피 **닫힌 어휘**라
 * 모델에게 보내기 직전에 여기서 옮긴다.
 *
 * 지시문까지 함께 옮겨야 한다. 지시문만 한국어로 남겨 두면 모델이 그 언어를
 * 따라가 영어로 물어도 한국어로 답한다. 실제로 en_US·zh_CN 에서 8문항 모두
 * 한국어 답이 나왔다.
 */
import type { Language } from "@/i18n";

/** 효과 태그 34개. 자료에 실제로 쓰이는 값만 담는다. */
const TAGS: Record<string, { en: string; zh: string }> = {
  "강인함": { en: "tenacity", zh: "坚韧" },
  "강제 이동(넉백/끌기)": { en: "forced movement (knockback/pull)", zh: "强制位移（击退/拉拽）" },
  "고정 피해": { en: "true damage", zh: "真实伤害" },
  "공격 무효화": { en: "attack negation", zh: "攻击无效化" },
  "공격 속도 증가": { en: "attack speed boost", zh: "攻速提升" },
  "공포": { en: "fear", zh: "恐惧" },
  "관통": { en: "penetration", zh: "穿透" },
  "광역": { en: "area of effect", zh: "范围效果" },
  "기본 공격 강화": { en: "empowered auto-attack", zh: "强化普攻" },
  "기절": { en: "stun", zh: "眩晕" },
  "도발": { en: "taunt", zh: "嘲讽" },
  "돌진": { en: "dash", zh: "突进" },
  "둔화": { en: "slow", zh: "减速" },
  "매혹": { en: "charm", zh: "魅惑" },
  "보호막": { en: "shield", zh: "护盾" },
  "분신": { en: "clone", zh: "分身" },
  "속박": { en: "root", zh: "定身" },
  "에어본": { en: "airborne", zh: "击飞" },
  "은신": { en: "stealth", zh: "隐身" },
  "이동 속도 증가": { en: "move speed boost", zh: "移速提升" },
  "이동기": { en: "mobility", zh: "位移" },
  "잃은 체력 비례": { en: "scales with missing health", zh: "按已损失生命值加成" },
  "자기 마법 저항력 증가": { en: "self magic resist boost", zh: "自身魔抗提升" },
  "자기 방어력 증가": { en: "self armor boost", zh: "自身护甲提升" },
  "적 마법 저항력 감소": { en: "enemy magic resist shred", zh: "削减敌方魔抗" },
  "적 방어력 감소": { en: "enemy armor shred", zh: "削减敌方护甲" },
  "처형": { en: "execute", zh: "处决" },
  "최대 체력 비례 피해": { en: "max health damage", zh: "最大生命值伤害" },
  "치유 감소": { en: "grievous wounds", zh: "治疗削减" },
  "침묵": { en: "silence", zh: "沉默" },
  "쿨타임 초기화": { en: "cooldown reset", zh: "冷却重置" },
  "투사체 차단": { en: "projectile block", zh: "格挡弹道" },
  "피해 면역": { en: "damage immunity", zh: "伤害免疫" },
  "회복": { en: "heal", zh: "回复" },
  "받는 피해 감소": { en: "damage reduction", zh: "承受伤害降低" },
  "변신": { en: "transform", zh: "变身" },
  "생명력 흡수": { en: "lifesteal", zh: "吸血" },
  "소환수": { en: "pet", zh: "召唤物" },
  "자기 공격력 증가": { en: "self attack damage boost", zh: "自身攻击力提升" },
  "치명타": { en: "critical strike", zh: "暴击" },
  "부활": { en: "revive", zh: "复活" },
  "연계 강화": { en: "amplified by a prior hit", zh: "连招强化" },
  "표식 부여": { en: "applies a mark", zh: "施加标记" },
  "성장 스택": { en: "permanent stacking", zh: "永久叠加" },
  "스킬 강화": { en: "next ability empowered", zh: "技能强化" },
  "사거리 증가": { en: "extended range", zh: "射程提升" },
  "자기 주문력 증가": { en: "self ability power boost", zh: "自身法强提升" },
};

const DAMAGE: Record<string, { en: string; zh: string }> = {
  "물리": { en: "physical", zh: "物理" },
  "마법": { en: "magic", zh: "魔法" },
  "혼합": { en: "mixed", zh: "混合" },
  "고정": { en: "true", zh: "真实" },
};

const SCALING: Record<string, { en: string; zh: string }> = {
  AD: { en: "AD", zh: "AD" },
  AP: { en: "AP", zh: "AP" },
  "체력": { en: "health", zh: "生命值" },
  "혼합": { en: "mixed", zh: "混合" },
};

const GRADE: Record<string, { en: string; zh: string }> = {
  "매우 높음": { en: "very high", zh: "极高" },
  "높음": { en: "high", zh: "高" },
  "보통": { en: "average", zh: "中等" },
  "낮음": { en: "low", zh: "低" },
  "매우 낮음": { en: "very low", zh: "极低" },
};

/**
 * 능력치 이름.
 *
 * 다른 표들과 달리 열쇠가 한국어가 아니라 코드 이름(health, armor…)이다. 그래서
 * 한국어 값을 따로 적어야 한다. 빼먹었더니 프롬프트에 "health: 상위권" 이 나갔고
 * 모델이 그것을 "건강" 으로 옮겨 적었다.
 */
const STATS: Record<string, { ko: string; en: string; zh: string }> = {
  health: { ko: "체력", en: "Health", zh: "生命值" },
  armor: { ko: "방어력", en: "Armor", zh: "护甲" },
  magicResist: { ko: "마법 저항력", en: "Magic resist", zh: "魔抗" },
  attackDamage: { ko: "공격력", en: "Attack damage", zh: "攻击力" },
  moveSpeed: { ko: "이동 속도", en: "Move speed", zh: "移动速度" },
  attackSpeed: { ko: "공격 속도", en: "Attack speed", zh: "攻速" },
  healthRegen: { ko: "체력 재생", en: "Health regen", zh: "生命回复" },
};

function pick(table: Record<string, { en: string; zh: string }>, key: string, lang: Language): string {
  const row = table[key];
  if (!row) return key; // 새 태그가 생기면 한국어 그대로. 빈칸보다 낫다.
  if (lang === "en_US") return row.en;
  if (lang === "zh_CN") return row.zh;
  return key;
}

export const translateTag = (tag: string, lang: Language): string => pick(TAGS, tag, lang);
export const translateDamage = (value: string, lang: Language): string => pick(DAMAGE, value, lang);
export const translateScaling = (value: string, lang: Language): string => pick(SCALING, value, lang);
export const translateGrade = (value: string, lang: Language): string => pick(GRADE, value, lang);
export function translateStat(stat: string, lang: Language): string {
  const row = STATS[stat];
  if (!row) return stat;
  if (lang === "en_US") return row.en;
  if (lang === "zh_CN") return row.zh;
  return row.ko;
}

/** 프롬프트의 머리표·꼬리말. 자료 구획을 여는 말들이다. */
export interface PromptWords {
  patch: string;
  champion: string;
  spell: string;
  compare: string;
  skills: string;
  effects: string;
  abilities: string;
  notesHeader: string;
  playing: string;
  against: string;
  /**
   * 극단 능력치 한 줄.
   *
   * **백분위 수치를 넣지 않는다.** 지시문은 "수치를 쓰지 말라" 고 하는데 재료가
   * 숫자를 쥐여 주면 모델이 그대로 베낀다. 중국어에서 8문항 중 6번 "前14%" 처럼
   * 옮겨 적었다. 등급 낱말(매우 낮음/very low/极低)이 뜻을 이미 담고 있다.
   */
  percentile: (stat: string, side: "top" | "bottom", grade: string) => string;
  matchup: (me: string, enemy: string) => string;
  /**
   * 질문이 한쪽만 물었을 때 그 사실을 못 박는 말.
   *
   * "질문이 한쪽만 물으면 그쪽만 쓰십시오" 라고 일러 두었지만 모델이 어느 쪽인지를
   * 스스로 가려야 했다. 11번 물어 5번만 맞혔다. 이제 조사로 가른 값이 코드에 있으므로
   * 판단을 시키지 않고 **알려 준다.**
   */
  perspectiveOnly: (side: string) => string;
  damageLine: (damage: string, scaling: string) => string;
  subclassLine: (subclass: string, position?: string) => string;
  rules: string[];
  closing: {
    champion: string;
    championWithNotes: string;
    skills: string;
    spell: string;
    compare: string;
    matchup: (me: string, enemy: string) => string;
  };
}

const KO: PromptWords = {
  patch: "패치",
  champion: "챔피언",
  spell: "스킬",
  compare: "비교",
  skills: "스킬",
  effects: "효과",
  abilities: "스킬 이름",
  notesHeader: "[운용 노트 — 사람이 검증한 내용입니다. 이 표현을 따르십시오]",
  playing: "플레이할 때",
  against: "상대할 때",
  percentile: (stat, side, grade) =>
    `${stat}: 1레벨 기준 전체 챔피언 중 ${side === "top" ? "상위권" : "하위권"} (${grade})`,
  matchup: (me, enemy) => `[상성] 사용자는 ${me}를 잡고 ${enemy}를 상대합니다. ${me} 시점으로 쓰십시오.`,
  perspectiveOnly: (side) =>
    `[관점] 이 질문은 "${side}" 만 묻습니다. 그 관점만 쓰고, 머리말도 **${side}** 하나만 쓰십시오. 다른 관점은 한 문장도 쓰지 마십시오.`,
  damageLine: (damage, scaling) => `주 피해 유형: ${damage} · 계수 성향: ${scaling}`,
  subclassLine: (subclass, position) => `분류: ${subclass}${position ? ` · 주 포지션 ${position}` : ""}`,
  rules: [
    "[요청] 위 자료만 근거로 설명하십시오. 분량은 자료가 받쳐 주는 만큼 쓰되, 같은 말을 되풀이하지 마십시오.",
    '- 수치를 쓰지 마십시오. 수치는 이미 화면에 표로 있습니다. "매우 낮다", "높은 편이다" 처럼 정도로만 말하십시오.',
    "- 자료에 없는 아이템·룬·스킬 이름을 만들지 마십시오. 스킬을 지목할 때는 위 [스킬 이름] 에 적힌 이름만 쓰십시오.",
    '- 어느 챔피언에나 맞는 말은 쓰지 마십시오("생존력이 뛰어나다", "압박하는 것이 중요하다", "주의해야 한다"). 문장마다 위 자료에 적힌 스킬 이름이나 효과 이름을 하나 이상 넣으십시오.',
    '- 낮은 능력치는 상대가 파고드는 지점으로 쓰십시오("마법 저항력이 낮아 마법 피해가 잘 들어간다"). 상대가 조심할 것으로 쓰지 마십시오.',
    "- 사용자의 질문에 직접 답하십시오. 묻지 않은 것을 덧붙이지 마십시오.",
    // 길이 상한을 걷어내자 모델이 위 자료를 그대로 옮겨 적고 시작했다.
    // "분류: Vanguard · 주 피해 유형: 마법 · 스킬: P 화강암 방패…" 로 세 줄을 버렸다.
    "- 위 자료를 목록으로 다시 적지 마십시오. 분류·피해 유형·능력치·스킬 목록은 이미 화면에 있습니다. 바로 본문부터 쓰십시오.",
    "- 합니다체로, 인사말 없이 바로 본문만 쓰십시오.",
  ],
  closing: {
    champion: "- 이 챔피언이 무엇으로 이기고(어느 스킬) 어디가 약한지(상대가 어떻게 파고드는지) 말하십시오.",
    championWithNotes:
      "- 노트는 화면에 그대로 보입니다. 옮겨 쓰지 마십시오.\n" +
      "- 사용자의 질문이 한쪽만 물으면 그쪽만 쓰십시오. 플레이 방법을 물으면 플레이할 때만, 상대법을 물으면 상대할 때만입니다.\n" +
      "- 양쪽을 다 쓸 때는 반드시 아래 두 머리말로 나누십시오. 한 문단에 섞지 마십시오.\n" +
      "**플레이할 때**\n(내용)\n\n**상대할 때**\n(내용)\n" +
      "- 답은 반드시 머리말로 시작합니다. 그 앞에 분류·포지션·피해 유형을 적지 마십시오. 첫 글자가 ** 여야 합니다.",
    skills:
      "- 스킬 다섯 개가 서로 어떻게 맞물리는지 서너 문장으로 설명하십시오: 무엇으로 붙거나 시작하고, 무엇이 피해를 내고, 무엇이 살리거나 빠지는지. 노트에 콤보 순서가 있으면 그 순서를 근거로 삼으십시오.",
    spell: "- 이 사실이 실전에서 왜 중요한지 한두 문장으로 말하십시오.",
    compare: "- 둘이 맞붙었을 때 무엇이 갈리는지, 각자 무엇을 조심해야 하는지 말하십시오.",
    matchup: (me, enemy) =>
      `- ${enemy}의 피해 유형이 ${me}의 어느 저항과 만나는지, ${enemy}의 보유 효과 중 ${me}가 조심할 것, ${me}가 유리한 국면을 말하십시오.`,
  },
};

const EN: PromptWords = {
  patch: "Patch",
  champion: "Champion",
  spell: "Ability",
  compare: "Comparison",
  skills: "Abilities",
  effects: "Effects",
  abilities: "Ability names",
  notesHeader: "[Playbook notes — human-verified. Follow this wording.]",
  playing: "Playing it",
  against: "Playing against it",
  percentile: (stat, side, grade) =>
    `${stat}: among the ${side === "top" ? "highest" : "lowest"} of all champions at level 1 (${grade})`,
  matchup: (me, enemy) => `[Matchup] The user plays ${me} against ${enemy}. Write from ${me}'s point of view.`,
  perspectiveOnly: (side) =>
    `[Point of view] This question asks only about "${side}". Write that side only, use **${side}** as the single heading, and do not write a sentence about the other side.`,
  damageLine: (damage, scaling) => `Primary damage: ${damage} · Scaling: ${scaling}`,
  subclassLine: (subclass, position) => `Class: ${subclass}${position ? ` · main role ${position}` : ""}`,
  rules: [
    "[Task] Explain using only the material above. Write as much as the material supports, but do not repeat yourself.",
    '- Do not write numbers. The numbers are already on screen in a table. Say only the degree, like "very low" or "on the high side".',
    "- Do not invent item, rune, or ability names that are not in the material. When naming an ability, use only the names listed under [Ability names] above.",
    '- Do not write anything that would fit any champion ("has great survivability", "it is important to apply pressure", "be careful"). Every sentence must name at least one ability or effect from the material above.',
    '- Treat a low stat as the opening the opponent attacks ("low magic resist, so magic damage lands well"). Do not write it as something the opponent should fear.',
    "- Answer the user's question directly. Do not add what was not asked.",
    "- Do not restate the material as a list. The class, damage type, stats, and ability list are already on screen. Start with the body.",
    "- Write in English, no greeting, body text only. The material is in Korean; your answer must still be in English.",
  ],
  closing: {
    champion:
      "- Say what this champion wins with (which ability) and where it is weak (how the opponent gets in).",
    championWithNotes:
      "- The notes are already visible on screen. Do not copy them.\n" +
      "- If the question asks about only one side, write only that side. Playing it, or playing against it.\n" +
      "- When you cover both, split them under these two headings. Never mix them in one paragraph.\n" +
      "**Playing it**\n(content)\n\n**Playing against it**\n(content)\n" +
      "- Begin with a heading. Do not write the class, role, or damage type before it. The first character must be *.",
    skills:
      "- In three or four sentences, explain how the five abilities fit together: what starts the fight or closes the gap, what deals the damage, what saves or disengages. If the notes give a combo order, base it on that order.",
    spell: "- In one or two sentences, say why this fact matters in an actual game.",
    compare: "- Say what decides the fight between the two, and what each has to watch for.",
    matchup: (me, enemy) =>
      `- Say which of ${me}'s resistances ${enemy}'s damage type meets, which of ${enemy}'s effects ${me} must watch for, and where ${me} has the advantage.`,
  },
};

const ZH: PromptWords = {
  patch: "版本",
  champion: "英雄",
  spell: "技能",
  compare: "对比",
  skills: "技能",
  effects: "效果",
  abilities: "技能名称",
  notesHeader: "[操作笔记 — 人工核验，请沿用这些说法]",
  playing: "使用时",
  against: "对线时",
  percentile: (stat, side, grade) =>
    `${stat}：1级时在全英雄中属于${side === "top" ? "偏高" : "偏低"}的一档（${grade}）`,
  matchup: (me, enemy) => `[对位] 用户使用${me}对阵${enemy}。请以${me}的视角撰写。`,
  perspectiveOnly: (side) =>
    `[视角] 该问题只问“${side}”。只写这一侧，小标题也只用 **${side}** 一个，不要写另一侧的任何句子。`,
  damageLine: (damage, scaling) => `主要伤害类型：${damage} · 加成倾向：${scaling}`,
  subclassLine: (subclass, position) => `分类：${subclass}${position ? ` · 主要位置 ${position}` : ""}`,
  rules: [
    "[要求] 仅依据以上资料说明。资料支持多少就写多少，但不要重复。",
    "- 不要写数值。数值已经以表格形式显示在屏幕上。只说程度，例如“极低”“偏高”。",
    "- 不要编造资料中没有的装备名、符文名或技能名。指出技能时，只能使用上面[技能名称]中列出的名称。",
    "- 不要写放在任何英雄身上都成立的话（“生存能力强”“需要施加压力”“要小心”）。每句话都必须至少提到上面资料中的一个技能名或效果名。",
    "- 把偏低的属性写成对手切入的突破口（“魔抗低，魔法伤害打得进去”），不要写成对手需要提防的东西。",
    "- 直接回答用户的问题，不要补充没有问到的内容。",
    "- 不要把上面的资料再列一遍。分类、伤害类型、属性、技能列表都已经显示在屏幕上，直接从正文写起。",
    "- 用中文作答，不加寒暄，只写正文。资料是韩文的，但回答必须是中文。",
  ],
  closing: {
    champion: "- 说明这个英雄靠什么取胜（哪个技能），弱点在哪里（对手如何切入）。",
    championWithNotes:
      "- 笔记已经显示在屏幕上，不要照抄。\n" +
      "- 若问题只问一侧，就只写那一侧：使用时，或对线时。\n" +
      "- 两侧都写时必须用下面两个小标题分开，不要混在同一段。\n" +
      "**使用时**\n（内容）\n\n**对线时**\n（内容）\n" +
      "- 必须以小标题开头，前面不要写分类、位置、伤害类型。第一个字符必须是 *。",
    skills:
      "- 用三到四句话说明五个技能如何衔接：靠什么开团或近身，靠什么造成伤害，靠什么保命或脱身。若笔记给出了连招顺序，请以该顺序为依据。",
    spell: "- 用一到两句话说明这个事实在实战中为什么重要。",
    compare: "- 说明两者交手时胜负取决于什么，各自需要提防什么。",
    matchup: (me, enemy) =>
      `- 说明${enemy}的伤害类型对上${me}的哪项抗性，${enemy}的哪些效果是${me}需要提防的，以及${me}在哪个阶段占优。`,
  },
};

export function promptWords(lang: Language): PromptWords {
  if (lang === "en_US") return EN;
  if (lang === "zh_CN") return ZH;
  return KO;
}
