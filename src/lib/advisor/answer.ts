/**
 * 답변을 글이 아니라 **타입 있는 결과**로 만든다
 *
 * 지금까지 모든 경로가 문서를 통째로 글로 던졌다. "말파 W 쿨타임" 에 툴팁 전체,
 * "정복자에 점화 들어가?" 에 규칙 9문장과 이웃 규칙까지. 묻는 사람은 사실 하나를
 * 원했는데 받은 것은 그 사실이 들어 있는 상자였다.
 *
 * 여기서는 질문이 가리키는 사실을 코드가 골라내고, 결과를 종류별 구조로 돌려준다.
 * 화면은 종류에 맞는 카드를 그리고, 모델은 이 구조를 받아 해설만 쓴다.
 * 모델이 수치를 입에 담을 일이 없어진다.
 */
import type { ChampionCard, SpellFact } from "../../../scripts/llm/lib/facts";
import type { RuleNotes } from "../../../scripts/llm/lib/rules";

/** 카드에 한 줄로 놓을 사실. */
export interface Fact {
  label: string;
  value: string;
}

export type SpellFocus =
  | "cooldown"
  | "cost"
  | "ratio"
  | "damage"
  /** 툴팁 본문에서 찾아야 하는 효과 수치 (마저 감소, 둔화율 …) */
  | "effect";

export type AdvisorAnswer =
  | {
      kind: "spell";
      championId: string;
      championName: string;
      spell: SpellFact;
      focus?: SpellFocus;
      /** 질문이 가리킨 사실. 카드 맨 위에 크게 놓는다. */
      headline?: Fact;
      /** 나머지 구조화된 사실. 접거나 흐리게 놓는다. */
      facts: Fact[];
      /** 본문 중 질문과 닿는 문장. headline 이 없을 때의 근거이기도 하다. */
      highlighted: string[];
    }
  | { kind: "champion"; card: ChampionCard }
  | {
      kind: "rule";
      rule: RuleNotes;
      /** 질문에 답하는 문장. 먼저, 굵게. */
      highlighted: string[];
      /** 그 밖의 문장. 접는다. */
      rest: string[];
    }
  | {
      kind: "suggestion";
      /** 사용자가 쓴, 챔피언으로 보이지만 못 찾은 말 */
      original: string;
      candidates: ChampionCard[];
    }
  | { kind: "text"; text: string };

/**
 * 질문이 스킬의 어느 사실을 묻는지.
 *
 * 사람 말은 다양하지만 겨냥하는 칸은 몇 개 안 된다. 이 표는 **데이터가 아니라 의도 어휘**라
 * `detectSlot` 의 "궁·궁극기" 와 같은 성격이다.
 */
const FOCUS_LEXICON: Array<[SpellFocus, RegExp]> = [
  ["cooldown", /쿨(타임|다운)?|재사용|\bcd\b/i],
  ["cost", /마나|소모|코스트|기력|분노|비용/],
  ["ratio", /계수|주문력\s*계수|공격력\s*계수|\bap\b|\bad\b/i],
  ["damage", /피해|데미지|딜(량)?|대미지/],
];

/**
 * 본문에서 찾을 효과 낱말. 줄임말을 툴팁이 실제로 쓰는 말로 편다.
 * "마저" 라고 물으면 툴팁의 "마법 저항력" 문장을 찾아야 한다.
 */
const EFFECT_ALIASES: Array<[RegExp, string[]]> = [
  [/마저|마법\s*저항/, ["마법 저항력"]],
  [/방깎|방어력\s*감소|방어력/, ["방어력"]],
  [/둔화|슬로우/, ["둔화"]],
  [/기절|스턴/, ["기절"]],
  [/보호막|실드/, ["보호막"]],
  [/회복|힐/, ["회복"]],
  [/사거리|거리|범위/, ["사거리", "범위"]],
  [/지속(시간)?|초\s*동안/, ["초 동안", "초간"]],
  [/침묵/, ["침묵"]],
  [/에어본|띄우|공중/, ["공중", "띄"]],
];

export function detectSpellFocus(question: string): { focus: SpellFocus; keywords: string[] } | undefined {
  for (const [alias, words] of EFFECT_ALIASES) {
    if (alias.test(question)) return { focus: "effect", keywords: words };
  }
  for (const [focus, pattern] of FOCUS_LEXICON) {
    if (pattern.test(question)) return { focus, keywords: [] };
  }
  return undefined;
}

/** 툴팁 평문을 문장으로 가른다. 한국어 종결 "다." 와 마침표를 경계로 본다. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.다]\.)\s+|(?<=습니다\.)|(?<=입니다\.)|(?<=됩니다\.)|(?<=합니다\.)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 문장 중 낱말이 들어 있는 것만. 순서는 원문대로. */
function sentencesWith(text: string, keywords: string[]): string[] {
  if (keywords.length === 0) return [];
  return splitSentences(text).filter((sentence) => keywords.some((word) => sentence.includes(word)));
}

/**
 * 스킬 답. 질문이 가리키는 사실을 앞에 놓는다.
 *
 * 구조 필드(쿨·소모·계수)는 값이 바로 있으니 headline 으로 올린다.
 * 효과 수치는 본문 문장에만 있으니 그 문장을 골라 highlighted 로 올린다.
 */
export function buildSpellAnswer(card: ChampionCard, spell: SpellFact, question: string): AdvisorAnswer {
  const detected = detectSpellFocus(question);
  const facts: Fact[] = [];
  if (spell.cooldown) facts.push({ label: "재사용 대기시간", value: `${spell.cooldown}초` });
  if (spell.cost) facts.push({ label: "소모값", value: spell.cost });
  if (spell.damageTypes.length) facts.push({ label: "피해 유형", value: spell.damageTypes.join("·") });
  if (spell.effects.length) facts.push({ label: "효과", value: spell.effects.join(", ") });
  const ratios = Object.entries(spell.ratios ?? {});
  if (ratios.length) {
    facts.push({ label: "계수", value: ratios.map(([stat, value]) => `${stat} ${value}%`).join(", ") });
  }

  let headline: Fact | undefined;
  let highlighted: string[] = [];
  if (detected?.focus === "cooldown" && spell.cooldown) {
    headline = { label: "재사용 대기시간", value: `${spell.cooldown}초` };
  } else if (detected?.focus === "cost" && spell.cost) {
    headline = { label: "소모값", value: spell.cost };
  } else if (detected?.focus === "ratio" && ratios.length) {
    headline = { label: "계수", value: ratios.map(([stat, value]) => `${stat} ${value}%`).join(", ") };
  } else if (detected?.focus === "effect") {
    highlighted = sentencesWith(spell.text, detected.keywords);
  } else if (detected?.focus === "damage") {
    highlighted = sentencesWith(spell.text, ["피해"]);
  }

  return {
    kind: "spell",
    championId: card.id,
    championName: card.name,
    spell,
    focus: detected?.focus,
    headline,
    // headline 을 이미 올렸으면 같은 사실을 facts 에 되풀이하지 않는다.
    facts: headline ? facts.filter((fact) => fact.label !== headline?.label) : facts,
    highlighted,
  };
}

/**
 * 규칙 답. 질문에 함께 나온 **다른 이름**을 담은 문장을 앞에 놓는다.
 *
 * "정복자에 점화 들어가?" 는 점화 규칙 9문장 중 "정복자" 가 든 한 문장이 답이다.
 * 이름을 담은 문장이 없으면 전부 rest 로 두고 카드가 원문을 보인다.
 */
export function buildRuleAnswer(rule: RuleNotes, mentionedNames: string[]): AdvisorAnswer {
  const lines = rule.notesKo?.length === rule.notes.length ? rule.notesKo : rule.notes;
  const others = mentionedNames.filter((name) => name !== rule.name);
  const highlighted = others.length ? lines.filter((line) => others.some((name) => line.includes(name))) : [];
  const rest = lines.filter((line) => !highlighted.includes(line));
  return { kind: "rule", rule, highlighted, rest };
}

/**
 * 두 낱말이 몇 글자 다른지. 한글 음절 하나가 한 글자다.
 * 짧은 이름끼리 쓰는 것이라 단순 동적 계획법으로 충분하다.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i += 1) {
    let previous = dp[0];
    dp[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = temp;
    }
  }
  return dp[cols - 1];
}

/** 질문에서 챔피언 이름으로 보일 만한 한글 덩어리. */
function hangulTokens(text: string): string[] {
  return [...new Set(text.match(/[가-힣]{2,7}/g) ?? [])];
}

/**
 * 챔피언을 하나도 못 찾았을 때, 한 글자 틀린 이름이 있는지 본다.
 *
 * "럼미 E 마저" 는 럼블이다. 지금은 못 찾으면 검색 폴백으로 흘러가 헛답을 냈다.
 * 거리 1 까지만 본다. 2 부터는 "애쉬" 가 "애니" 도 되고 "아리" 도 되어 못 믿는다.
 *
 * **첫 음절이 어떤 이름의 첫 음절과 같아야 한다.** 이 조건이 없으면 "뭐야" 가 "자야" 로
 * 잡힌다 — 두 음절 일반어와 두 음절 이름은 거리 1 로 자주 부딪힌다. 오타는 첫 글자에서
 * 잘 나지 않으므로 이 하나로 충돌 공간이 크게 준다(뭐·쿨·점·정·쇼·와 로 시작하는
 * 챔피언은 없다).
 *
 * 후보를 돌려주고, 하나만 남을 때 바로 갈지 물을지는 화면이 정한다.
 */
export function suggestChampions(
  question: string,
  cards: ChampionCard[],
  nicknames: Map<string, ChampionCard>,
): { original: string; candidates: ChampionCard[] } | undefined {
  const names: Array<[string, ChampionCard]> = [];
  for (const card of cards) {
    names.push([card.name, card]);
    const compact = card.name.replace(/\s+/g, "");
    if (compact !== card.name) names.push([compact, card]);
  }
  for (const [nick, card] of nicknames) names.push([nick, card]);
  const initials = new Set(names.map(([name]) => name[0]));

  for (const token of hangulTokens(question)) {
    if (!initials.has(token[0])) continue;
    const found = new Map<string, ChampionCard>();
    for (const [name, card] of names) {
      // 길이가 다르면 삽입·삭제인데, 두 글자 낱말에서는 그것이 너무 헐겁다.
      if (token.length <= 2 && name.length !== token.length) continue;
      if (Math.abs(name.length - token.length) > 1) continue;
      if (editDistance(token, name) === 1) found.set(card.id, card);
    }
    if (found.size > 0) return { original: token, candidates: [...found.values()] };
  }
  return undefined;
}
