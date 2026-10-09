import { aliasAt, aliasesOf } from "@/lib/knowledge/searchAliases";
import { requestedContent } from "./requestText";
import { asksControlDuration, mentionsCrowdControl } from "./crowdControlQuestion";

export type SpellFocus =
  | "cooldown"
  | "cost"
  | "ratio"
  | "damage"
  | "ticks"
  /** 시전 사거리. 카드에 숫자가 있으면 그것을, 없으면 본문의 사거리 문장을 보인다. */
  | "range"
  /** 툴팁 본문에서 찾아야 하는 효과 수치 (마저 감소, 둔화율 …) */
  | "effect";

/**
 * 질문이 스킬의 어느 사실을 묻는지.
 *
 * 사람 말은 다양하지만 겨냥하는 칸은 몇 개 안 된다. 이 표는 **데이터가 아니라 의도 어휘**라
 * `detectSlot` 의 "궁·궁극기" 와 같은 성격이다.
 *
 * **세 언어를 한 표에 담는다.** 한국어만 적어 두었더니 영어·중국어에서는 아무것도
 * 안 걸렸다. 갈래를 가리는 일은 모델이 하지만(`routeAsk`), 어느 **수치**를 묻는지는
 * 라우터가 다루지 않아 이 표가 유일한 길이다. 실제로 재 보니 여섯 갈래 물음에서
 * 영어·중국어는 규칙이 하나도 안 걸렸다.
 *
 * 세 언어를 한 정규식에 섞어도 부딪히지 않는다. 한국어 물음에 "cooldown" 이 들어
 * 있을 까닭이 없고, 그 반대도 마찬가지다.
 */
const FOCUS_LEXICON: Array<[SpellFocus, RegExp]> = [
  ["ticks", /(?<![가-힣])틱|(?:몇|지속|매)\s*틱|도트|몇\s*초마다|피해\s*간격|회복\s*간격|\bticks?\b|\b(?:damage|healing)\s*interval\b|跳数|每跳|伤害间隔|治疗间隔/i],
  ["cooldown", /쿨(타임|다운)?|재사용|\bcd\b|cool\s*down|recharge|冷却|CD/i],
  ["cost", /(?<!얼)마나|소모|코스트|기력|분노|비용|\bmana\b|mana\s*cost|\bcosts?\b|energy|fury|法力|消耗|能量|蓝耗|耗蓝|耗多少蓝/i],
  ["ratio", /계수|주문력\s*계수|공격력\s*계수|\bap\b|\bad\b|\bratios?\b|\bscaling\b|\bcoefficients?\b|加成|系数/i],
  ["damage", /피해|데미지|딜(량)?|대미지|\bdamage\b|\bdmg\b|伤害/i],
];

/**
 * 본문에서 찾을 효과 낱말. 줄임말을 툴팁이 실제로 쓰는 말로 편다.
 * "마저" 라고 물으면 툴팁의 "마법 저항력" 문장을 찾아야 한다.
 *
 * 찾을 낱말도 세 언어를 함께 담는다. 툴팁 본문이 그 나라 말이므로, 영어로 물으면
 * 영어 툴팁에서 영어 낱말을 찾아야 한다. 어느 하나만 맞으면 그 문장이 걸린다.
 */
const EFFECT_ALIASES: Array<[RegExp, string[], SpellFocus?]> = [
  [/마저|마법\s*저항|magic\s*resist|魔抗|魔法抗性/i, ["마법 저항력", "Magic Resist", "魔法抗性"]],
  [/방깎|방어력\s*감소|방어력|\barmor\b|护甲/i, ["방어력", "Armor", "护甲"]],
  [/둔화|슬로우|\bslow\b|减速/i, ["둔화", "Slow", "减速"]],
  [/기절|스턴|\bstun\b|眩晕/i, ["기절", "Stun", "眩晕"]],
  [/보호막|실드|\bshield\b|护盾/i, ["보호막", "Shield", "护盾"]],
  [/이속|이동\s*속도|\b(?:move|movement)\s*speed\b|移速|移动速度/i, ["이동 속도", "Move Speed", "Movement Speed", "移动速度"]],
  [/회복|힐|\bheal\b|治疗|回复/i, ["회복", "Heal", "治疗", "回复"]],
  /*
   * 사거리는 효과가 아니라 카드의 칸이다(SpellFact.range). 효과로 두었더니 "제드 궁 사거리" 에
   * 툴팁 문장만 나오고 625 가 없었다(2026-09-30 브라우저 시험). 숫자가 없는 스킬(자기 시전·전역)은
   * 같은 낱말로 본문 문장을 찾는다. 자리는 그대로 둔다 — 표 순서가 곧 우선순위다.
   */
  [/사거리|거리|범위|\brange\b|射程|范围|飞多远/i, ["사거리", "범위", "Range", "射程", "范围"], "range"],
  [/지속(시간)?|초\s*동안|duration|持续/i, ["초 동안", "초간", "second", "seconds", "秒"]],
  [/침묵|silence|沉默/i, ["침묵", "Silence", "沉默"]],
  [/에어본|띄우|공중|airborne|knock\s*up|击飞/i, ["공중", "띄", "Airborne", "击飞"]],
];

export function detectSpellFocus(question: string): { focus: SpellFocus; keywords: string[] } | undefined {
  question = requestedContent(question);
  // “기절 스킬 쿨타임”의 기절은 수식어다. 명시한 구조 수치를 효과 낱말보다 먼저 읽는다.
  const numeric = FOCUS_LEXICON.find(([focus, pattern]) => focus !== "damage" && pattern.test(question));
  if (numeric) return { focus: numeric[0], keywords: [] };
  if (asksControlDuration(question) && mentionsCrowdControl(question)) {
    return { focus: "effect", keywords: ["초 동안", "초간", "second", "seconds", "秒"] };
  }
  for (const [alias, words, focus] of EFFECT_ALIASES) {
    if (alias.test(question)) return { focus: focus ?? "effect", keywords: words };
  }
  for (const [focus, pattern] of FOCUS_LEXICON) {
    if (pattern.test(question)) return { focus, keywords: [] };
  }
  return undefined;
}

/**
 * 스킬 수치(쿨타임·코스트·계수)를 찾아 달라는 말인가. 상성 대화 중에도 해설이 아니라 표가 답이다.
 * "두 챔피언에 대해 스킬 쿨타임도 알려줘" 가 상성 이어 묻기로 가서 한타·아이템 해설이 나왔다.
 * "궁 쿨 빠지면 들어가도 돼?" 처럼 때를 묻는 말은 공략이라 뺀다.
 */
export function asksSpellNumbers(question: string): boolean {
  question = requestedContent(question);
  const focus = detectSpellFocus(question)?.focus;
  if (focus === "ticks") return true;
  if (!["cooldown", "cost", "ratio", "range"].includes(focus ?? "")) return false;
  // 스킬 가속(쿨감·cdr·冷却缩减)은 능력치이지 스킬 수치가 아니다. 쿨타임 낱말이 그 안에 들어 있어 "쿨감 템 먼저 가는 게 나아?",
  // "should I rush a cdr item?", "先出冷却缩减装备好吗" 가 상성 대화에서 수치 조회로 빠져나가 "스킬 가속" 절 원문을 받았다.
  if (aliasesOf("mech:스킬-가속").some((alias) => aliasAt(question, alias) >= 0)) return false;
  // 코스트·계수 낱말은 스킬 밖에서도 쓴다. 스킬을 가리키는 말이 함께 있어야 한다.
  if (focus !== "cooldown" && !/스킬|기술|궁|패시브|(?<![a-z])[qwer](?![a-z])|[QWER](?=mana|cost)|\b(skill|ability|spell|ult)\b|\brank\s*[1-5]\b|技能|大招|蓝耗|耗蓝|级大/i.test(question)) return false;
  if (/(?:기본|사거리|계수|소모).*(?:몇|얼마)|\b(?:what(?:'s| is)?|how much).*\b(?:base|cooldown|cost|ratio)|\b(?:ap|ad)\s+ratio|冷却.*多少|(?:蓝耗|耗蓝).*多少/i.test(question)) return true;
  return !/빠지|돌아|돌 때|들어가|노려|때[는에]?|이후|동안|(?:쿨(?:타임)?|대기)\s*중|어떻게|언제|\b(when|after|while|how to)\b|之后|的时候|冷却中|怎么/i.test(question);
}

/** 효과·수치를 묻는 낱말인가. 챔피언 이름 오타 후보에서 뺀다(`suggestChampions`). */
export function isSpellFocusWord(token: string): boolean {
  return FOCUS_LEXICON.some(([, pattern]) => pattern.test(token)) || EFFECT_ALIASES.some(([alias]) => alias.test(token));
}
