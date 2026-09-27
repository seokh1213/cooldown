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
import type { ChampionCard, SpellFact, StatName } from "../../../scripts/llm/lib/facts";
import { ruleLines, ruleName, type RuleNotes } from "../../../scripts/llm/lib/rules";
import type { Language } from "@/i18n";
import type { SelectedNotes } from "./noteSelect";
import { detectSpellFocus, type SpellFocus } from "./spellFocus";
import {
  cardLabels,
  promptWords,
  translateDamage,
  translateGrade,
  translateRatioStat,
  translateStat,
  translateTag,
} from "./promptLocale";

/** 카드에 한 줄로 놓을 사실. */
/** 상성 노트. `derived` 는 mine 앞쪽의 도출 문장 수다. */
export interface MatchupNotes {
  mine: string[];
  enemy: string[];
  derived?: number;
  /** 요약을 짓는 재료. 도출 문장의 종류와 노트의 갈래가 붙어 있다. */
  plan?: MatchupPlan;
}

export interface MatchupPlan {
  /** 판정기가 가른 주제. 요약이 어느 칸을 앞에 두고 무엇을 더 실을지 정한다. 없으면 "general". */
  focus?: string;
  /** 사용자가 쓴 질문. 물은 칸에서 질문 낱말("후반")이 든 문장을 앞에 둔다. */
  question?: string;
  claims: Array<{ kind: "offense" | "defense" | "pinned" | "scaling"; text: string }>;
  /** 내 플레이북(playing) — 조건이 맞는 것만, 조건이 구체적인 것부터 */
  mine: Array<{ category: string; text: string }>;
  /** 상대 플레이북(against) — 이 챔피언을 상대하는 법 */
  enemy: Array<{ category: string; text: string }>;
}

export interface Fact {
  label: string;
  value: string;
}

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
  | {
      kind: "champion";
      card: ChampionCard;
      /** "말파이트 스킬 쿨타임" 처럼 슬롯 없이 사실 하나를 물으면 스킬 다섯 개의 그 사실만 */
      focus?: SpellFocus;
      /** "스킬 설명해줘": 능력치 대신 스킬 다섯 개의 요약 */
      view?: "skills";
      /**
       * 사람이 검증한 운용 노트. 플레이할 때 / 상대할 때.
       * `perspective` 는 질문이 어느 쪽을 물었는지로, 카드가 그쪽을 먼저 보인다.
       */
      notes?: SelectedNotes;
    }
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
      /** typo: 이름을 잘못 썼다 / ambiguous: 화면에 둘이 있는데 누구 것인지 모른다 */
      reason?: "typo" | "ambiguous";
    }
  | {
      /**
       * 둘 이상을 견주는 답. 열이 챔피언, 행이 사실이다.
       * 예전에는 모델이 도구로 수치를 두 번 꺼내 글로 견줬는데, 30초 걸리고 8토큰에서
       * 끊기기도 했다. 견주는 일은 코드가 0초에 한다.
       */
      kind: "compare";
      cards: ChampionCard[];
      /** 능력치 비교면 어느 레벨 값인지 */
      level?: 1 | 6 | 11 | 18;
      /** 스킬 비교면 슬롯 */
      slot?: string;
      rows: CompareRow[];
      /** 질문이 가리킨 행의 결론. "체력 (1레벨)" → "말파이트 665 > 럼블 640" */
      headline?: Fact;
      /** 상성 질문. cards[0] 이 내 챔피언, cards[1] 이 상대다. 해설이 그 시점으로 쓴다. */
      matchup?: boolean;
      /** 상성 노트. 내 챔피언을 플레이할 때(이 상대 한정 우선) / 상대를 상대할 때. 사람이 검증. */
      /** `derived` 는 mine 앞쪽의 코드가 도출한 문장 수. 뒤는 사람이 쓴 플레이북 노트다. */
      notes?: MatchupNotes;
      /** 빌드할 때 미리 써 둔 상성 답(`precomputed.ts`). 있으면 노트 조립 대신 이것을 보인다. */
      precomputed?: string;
      /** "더 자세히" 에 답한 것. 노트 조립이면 물은 칸의 노트를 전문으로 펼친다. */
      more?: boolean;
    }
  | {
      /**
       * 아이템. 설명문을 통째로 던지지 않고 능력치·효과로 갈라 둔다.
       * 카드는 자료 패널이 그리고, 대화에는 효과 이름과 설명만 나간다.
       */
      kind: "item";
      itemId: string;
      itemName: string;
      /** 총 가격 */
      price?: number;
      /** 공격력 45, 체력 450 … */
      stats: Fact[];
      effects: ItemEffect[];
      /** "둔화 있어?" 처럼 효과 낱말을 물었을 때의 예/아니오. 있으면 이것이 곧 답이다. */
      verdicts: ItemVerdict[];
    }
  | { kind: "text"; text: string };

export interface ItemEffect {
  name: string;
  /** 사용 시 효과인가. 기본 지속과 운용이 다르므로 갈라 보인다. */
  active: boolean;
  text: string;
}

export interface ItemVerdict {
  tag: string;
  yes: boolean;
  /** 설명문에서 그 낱말이 나온 문장. 근거 없이 예/아니오만 내지 않는다. */
  evidence?: string;
}

export interface CompareRow {
  label: string;
  /** cards 와 같은 순서. 없는 값은 빈 문자열. */
  values: string[];
  /** 질문이 가리킨 행 */
  hit?: boolean;
  /** 굵게 그릴 열. 동률이거나 크기 비교가 뜻이 없는 행이면 비운다. */
  winner?: number;
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
 * 계수 목록을 글로. "주문력 105%" 의 능력치 이름은 툴팁에서 읽어 낸 한국어라 옮긴다.
 *
 * 한 줄 요약·표·헤드라인이 저마다 같은 식을 적고 있었다. 옮길 자리가 늘자 한 곳을
 * 빠뜨려 영어 카드에 "Ratios 주문력 50%" 가 나왔다. 식을 한 곳에 모은다.
 */
function ratioText(ratios: Array<[string, number]>, lang: Language): string {
  return ratios.map(([stat, value]) => `${translateRatioStat(stat, lang)} ${value}%`).join(", ");
}

/**
 * 쿨타임 행. 충전형 스킬(럼블 E, 아칼리 R…)은 쿨타임 필드가 연속 시전 간격 0.5초여서
 * 그대로 내면 틀린 답이 된다. 쿨타임 표와 같은 관례로 재충전 시간을 앞세운다.
 */
export function cooldownFact(spell: SpellFact, lang: Language = "ko_KR"): Fact | undefined {
  const w = cardLabels(lang);
  if (spell.recharge) {
    const charges = spell.maxCharges ? ` · ${w.charges(spell.maxCharges)}` : "";
    const gap = spell.cooldown ? ` · ${w.recast(spell.cooldown)}` : "";
    return { label: w.recharge, value: `${w.seconds(spell.recharge)}${charges}${gap}` };
  }
  if (spell.cooldown) return { label: w.cooldown, value: w.seconds(spell.cooldown) };
  return undefined;
}

/**
 * 스킬 답. 질문이 가리키는 사실을 앞에 놓는다.
 *
 * 구조 필드(쿨·소모·계수)는 값이 바로 있으니 headline 으로 올린다.
 * 효과 수치는 본문 문장에만 있으니 그 문장을 골라 highlighted 로 올린다.
 */
export function buildSpellAnswer(
  card: ChampionCard,
  spell: SpellFact,
  question: string,
  lang: Language = "ko_KR",
): AdvisorAnswer {
  const w = cardLabels(lang);
  const detected = detectSpellFocus(question);
  const facts: Fact[] = [];
  const cooldown = cooldownFact(spell, lang);
  if (cooldown) facts.push(cooldown);
  if (spell.cost) facts.push({ label: w.cost, value: spell.cost });
  if (spell.damageTypes.length) {
    facts.push({ label: w.damageType, value: spell.damageTypes.map((type) => translateDamage(type, lang)).join("·") });
  }
  if (spell.effects.length) {
    facts.push({ label: w.effects, value: spell.effects.map((tag) => translateTag(tag, lang)).join(", ") });
  }
  const ratios = Object.entries(spell.ratios ?? {});
  if (ratios.length) facts.push({ label: w.ratios, value: ratioText(ratios, lang) });

  let headline: Fact | undefined;
  let highlighted: string[] = [];
  if (detected?.focus === "cooldown" && cooldown) {
    headline = cooldown;
  } else if (detected?.focus === "cost" && spell.cost) {
    headline = { label: w.cost, value: spell.cost };
  } else if (detected?.focus === "ratio" && ratios.length) {
    headline = { label: w.ratios, value: ratioText(ratios, lang) };
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
export function buildRuleAnswer(rule: RuleNotes, mentionedNames: string[], lang = "ko_KR", mentioned: RuleNotes[] = []): AdvisorAnswer {
  const lines = ruleLines(rule, lang);
  // 함께 물은 다른 규칙을 그 화면 언어 이름으로 찾는다("정복자에 점화" → 점화 규칙에서 정복자가 든 줄)
  const others = [...new Set([...mentionedNames.filter((name) => name !== rule.name), ...mentioned.filter((r) => r !== rule).map((r) => ruleName(r, lang))])];
  const highlighted = others.length ? lines.filter((line) => others.some((name) => line.toLowerCase().includes(name.toLowerCase()))) : [];
  const rest = lines.filter((line) => !highlighted.includes(line));
  return { kind: "rule", rule, highlighted, rest };
}

/** 카드에 쓰는 능력치 이름. 순서가 곧 표의 행 순서다. */
export const CARD_STATS: StatName[] = ["health", "armor", "magicResist", "attackDamage", "moveSpeed"];

/** 스킬 한 줄 요약. 요약이 없으면 본문 첫 문장. */
export function spellSummary(spell: SpellFact): string {
  return spell.summary ?? splitSentences(spell.text)[0] ?? "";
}

/**
 * 아이템 답의 머리글. 효과 이름을 잇고, 없으면 능력치를 잇는다.
 * "쇼진의 창 효과" 에 대화가 먼저 내놓는 한 줄이다.
 */
export function itemHeadline(answer: Extract<AdvisorAnswer, { kind: "item" }>): string {
  if (answer.effects.length) return answer.effects.map((effect) => effect.name).join(" · ");
  return answer.stats.map((stat) => `${stat.label} ${stat.value}`).join(" · ");
}

/**
 * 답에서 바로 갈 수 있는 화면.
 *
 * 링크는 모델이 아니라 코드가 만든다. 코드는 답의 개체(챔피언 id·규칙 종류)를 이미 알고
 * 있고, 모델에게 맡기면 없는 id 를 지어낸다. 상성·비교 답은 VS 화면, 룬·소환사 주문 규칙과
 * 아이템은 백과사전의 그 탭이다. 챔피언·스킬 답은 자료 카드 꼬리의 링크만 쓴다.
 */
export type AnswerLink =
  | { kind: "vs"; to: string; names: [string, string] }
  | { kind: "runes" | "summoner"; to: string }
  | { kind: "item"; to: string; name: string };

export function answerLinks(answer: AdvisorAnswer): AnswerLink[] {
  switch (answer.kind) {
    case "compare": {
      const [a, b] = answer.cards;
      if (!b) return [];
      return [{ kind: "vs", to: `/vs?a=${a.id}&t=${b.id}`, names: [a.name, b.name] }];
    }
    // 챔피언 하나·스킬 하나의 답에는 대화 안에 링크를 붙이지 않는다. "오공 Q 쿨", "W는?" 마다
    // "오공 VS 화면으로 이동" 이 따라붙어 대화가 버튼으로 어지러웠다. 그 챔피언의 VS 화면은
    // 자료 카드 꼬리("VS 화면에서 보기") 한 곳에서 간다. 대화 링크는 답이 곧 다음 행동인 것만 —
    // 상성·비교(둘을 VS 에서 보기), 규칙·아이템(백과사전에서 보기).
    case "champion":
    case "spell":
      return [];
    case "rule":
      if (answer.rule.subject === "rune") return [{ kind: "runes", to: "/encyclopedia?tab=runes" }];
      if (answer.rule.subject === "summoner") return [{ kind: "summoner", to: "/encyclopedia?tab=summoner" }];
      return [];
    case "item":
      return [{ kind: "item", to: `/encyclopedia?tab=items&item=${encodeURIComponent(answer.itemId)}`, name: answer.itemName }];
    default:
      return [];
  }
}

/**
 * 답의 자료가 같은지 가리는 열쇠. 같은 열쇠의 카드가 직전 답에 있으면 다시 그리지 않는다.
 * "오공 Q 쿨, W 쿨, E 쿨" 은 카드 세 장이 아니라 헤드라인 세 줄이어야 한다.
 */
export function answerKey(answer: AdvisorAnswer): string {
  switch (answer.kind) {
    case "spell":
      return `spell:${answer.championId}:${answer.spell.slot}`;
    case "champion":
      return `champion:${answer.card.id}:${answer.view ?? ""}:${answer.focus ?? ""}`;
    case "compare":
      return `compare:${answer.cards.map((card) => card.id).join(",")}:${answer.slot ?? ""}:${answer.matchup ? "m" : ""}`;
    case "rule":
      return `rule:${answer.rule.name}`;
    case "item":
      return `item:${answer.itemId}`;
    default:
      return answer.kind;
  }
}

/** 답이 다룬 챔피언. 다음 질문이 이름을 생략하면 이들이 맥락이다. */
export function answerChampionIds(answer: AdvisorAnswer): string[] {
  if (answer.kind === "spell") return [answer.championId];
  if (answer.kind === "champion") return [answer.card.id];
  if (answer.kind === "compare") return answer.cards.map((card) => card.id);
  return [];
}

export function focusLabel(focus: SpellFocus, lang: Language = "ko_KR"): string {
  const w = cardLabels(lang);
  return { cooldown: w.cooldown, cost: w.cost, ratio: w.ratios, damage: w.damageType, effect: w.effects }[focus];
}

/** 스킬 하나에서 사실 하나를 글로. 스킬 표(챔피언 카드의 focus)와 비교 표가 같이 쓴다. */
export function spellFocusValue(spell: SpellFact, focus: SpellFocus, lang: Language = "ko_KR"): string {
  switch (focus) {
    case "cooldown":
      return cooldownFact(spell, lang)?.value ?? "";
    case "cost":
      return spell.cost ?? "";
    case "ratio":
      return ratioText(Object.entries(spell.ratios ?? {}), lang);
    case "damage":
      return spell.damageTypes.map((type) => translateDamage(type, lang)).join("·");
    case "effect":
      return spell.effects.map((tag) => translateTag(tag, lang)).join(", ");
  }
}

// ── 비교 ──────────────────────────────────────────────────────────────

/** 능력치를 가리키는 말. FOCUS_LEXICON 과 같은 성격의 의도 어휘고, 역시 세 언어를 담는다. */
const STAT_LEXICON: Array<[StatName, RegExp]> = [
  ["healthRegen", /체력\s*재생|체젠|health\s*regen|生命(值)?回复/i],
  ["magicResist", /마법\s*저항|마저|마방|magic\s*resist|\bmr\b|魔抗|魔法抗性/i],
  ["attackSpeed", /공격\s*속도|공속|attack\s*speed|\bas\b|攻(击)?速(度)?/i],
  ["moveSpeed", /이동\s*속도|이속|무빙|move(ment)?\s*speed|\bms\b|移动速度|移速/i],
  ["attackDamage", /공격력|깡뎀|\bad\b|attack\s*damage|攻击力/i],
  ["armor", /방어력|방어|아머|\barmor\b|护甲/i],
  ["health", /체력|피통|\bhp\b|\bhealth\b|生命值/i],
];

export function detectStat(question: string): StatName | undefined {
  // 긴 것이 먼저 걸려야 한다. "체력 재생" 은 "체력" 을, "magic resist" 는 "resist" 를 품는다.
  return STAT_LEXICON.find(([, pattern]) => pattern.test(question))?.[0];
}

/**
 * 질문이 가리킨 레벨. 없으면 1레벨. 자료가 1·6·11·18 만 있다.
 *
 * 숫자는 언어를 안 타지만 그 옆에 붙는 말은 탄다. 한국어만 적어 두었더니
 * "at level 18", "18级" 이 모두 1레벨로 떨어졌다.
 */
const LEVEL_WORD = String.raw`\s*(레벨|렙|level|lv\.?|급|级)`;
export function detectLevel(question: string): 1 | 6 | 11 | 18 {
  if (/만렙|풀\s*레벨|후반|max\s*level|full\s*build|满级/i.test(question)) return 18;
  if (new RegExp(`18${LEVEL_WORD}|level\\s*18|lv\\.?\\s*18`, "i").test(question)) return 18;
  if (new RegExp(`11${LEVEL_WORD}|level\\s*11|lv\\.?\\s*11`, "i").test(question)) return 11;
  if (new RegExp(`6${LEVEL_WORD}|level\\s*6|lv\\.?\\s*6`, "i").test(question)) return 6;
  return 1;
}

function levelKey(level: 1 | 6 | 11 | 18): "lv1" | "lv6" | "lv11" | "lv18" {
  return `lv${level}` as "lv1" | "lv6" | "lv11" | "lv18";
}

/** 가장 큰 값의 열. 동률이면 undefined. */
function argmax(values: Array<number | undefined>): number | undefined {
  let best: number | undefined;
  let tie = false;
  values.forEach((value, index) => {
    if (value === undefined) return;
    const current = best === undefined ? undefined : values[best];
    if (current === undefined || value > current) {
      best = index;
      tie = false;
    } else if (value === current) {
      tie = true;
    }
  });
  return tie ? undefined : best;
}

/**
 * 챔피언 둘 이상을 견준다.
 *
 * 슬롯이 있으면 그 스킬의 사실을 나란히 놓고, 없으면 능력치를 놓는다.
 * 능력치는 높을수록 좋다고 보고 큰 쪽을 굵게 한다. 스킬 행은 크기 비교가 뜻이 없어
 * (쿨은 짧을수록, 소모는 적을수록, 계수는 클수록) 굵게 하지 않고 묻은 행만 강조한다.
 */
export function buildCompareAnswer(
  cards: ChampionCard[],
  question: string,
  slot?: string,
  options: { matchup?: boolean; notes?: MatchupNotes; lang?: Language } = {},
): AdvisorAnswer {
  const lang = options.lang ?? "ko_KR";
  const w = cardLabels(lang);
  if (options.matchup) {
    // 상성은 능력치 표 + 상성 노트 위에 해설. 사실 하나를 짚은 헤드라인은 두지 않는다.
    const base = buildCompareAnswer(cards, question, undefined, { lang });
    return base.kind === "compare"
      ? { ...base, headline: undefined, rows: base.rows.map((row) => ({ ...row, hit: false })), matchup: true, notes: options.notes }
      : base;
  }
  if (slot) {
    const spells = cards.map((card) => card.spells.find((spell) => spell.slot === slot));
    const focus = detectSpellFocus(question)?.focus;
    const rows: CompareRow[] = [];
    const push = (label: string, pick: (spell: SpellFact) => string | undefined, hit: boolean) => {
      const values = spells.map((spell) => (spell ? pick(spell) ?? "" : ""));
      if (values.some(Boolean)) rows.push({ label, values, hit });
    };
    push(w.spell, (spell) => spell.name, false);
    push(
      spells.some((spell) => spell?.recharge) ? w.recharge : w.cooldown,
      (spell) => cooldownFact(spell, lang)?.value,
      focus === "cooldown",
    );
    push(w.cost, (spell) => spell.cost, focus === "cost");
    push(w.damageType, (spell) => spell.damageTypes.map((type) => translateDamage(type, lang)).join("·"), focus === "damage");
    push(w.effects, (spell) => spell.effects.map((tag) => translateTag(tag, lang)).join(", "), focus === "effect");
    push(
      w.ratios,
      (spell) => ratioText(Object.entries(spell.ratios ?? {}), lang),
      focus === "ratio",
    );
    const hit = rows.find((row) => row.hit);
    const headline = hit
      ? { label: `${slot} ${hit.label}`, value: cards.map((card, i) => `${card.name} ${hit.values[i] || "—"}`).join(" · ") }
      : undefined;
    return { kind: "compare", cards, slot, rows, headline };
  }

  const level = detectLevel(question);
  const asked = detectStat(question);
  const key = levelKey(level);
  const stats: StatName[] = asked && !CARD_STATS.includes(asked) ? [...CARD_STATS, asked] : CARD_STATS;
  const rows: CompareRow[] = stats.map((stat) => {
    const numbers = cards.map((card) => card.stats[stat]?.[key]);
    return {
      label: translateStat(stat, lang),
      values: numbers.map((n) => (n === undefined ? "" : String(n))),
      hit: stat === asked,
      winner: argmax(numbers),
    };
  });
  const hit = rows.find((row) => row.hit);
  let headline: Fact | undefined;
  if (hit) {
    // 큰 쪽부터. "말파이트 665 > 럼블 640", 동률은 "=".
    const order = cards
      .map((card, i) => ({ name: card.name, value: Number(hit.values[i]) }))
      .filter((entry) => Number.isFinite(entry.value))
      .sort((a, b) => b.value - a.value);
    const value = order
      .map((entry, i) => (i === 0 ? `${entry.name} ${entry.value}` : `${entry.value === order[i - 1].value ? "=" : ">"} ${entry.name} ${entry.value}`))
      .join(" ");
    headline = { label: `${hit.label} (${w.level(level)})`, value };
  }
  return { kind: "compare", cards, level, rows, headline };
}

/**
 * 백분위를 "상위 n%" 나 "하위 n%" 로 바꾼다.
 * 카드의 percentile 은 0(최저)~100(최고) 이다. 69.5 는 위에서 31% 자리다.
 */
export function percentileLabel(percentile: number): { side: "top" | "bottom"; value: number } {
  return percentile >= 50
    ? { side: "top", value: Math.max(1, Math.round(100 - percentile)) }
    : { side: "bottom", value: Math.max(1, Math.round(percentile)) };
}

/** 매우 높음·매우 낮음처럼 눈에 띄어야 하는 등급인지. 표에서 그 행만 굵게 한다. */
export function isExtremeGrade(grade: string): boolean {
  return grade === "매우 높음" || grade === "매우 낮음";
}

/** 극단 능력치를 한 줄로. 없으면 undefined. 한 줄로 모으는 까닭은 `PromptWords.extremes` 에 적었다. */
export function extremeStatsLine(card: ChampionCard, lang: Language = "ko_KR"): string | undefined {
  const high: string[] = [];
  const low: string[] = [];
  for (const stat of CARD_STATS) {
    const snap = card.stats[stat];
    if (!snap || !isExtremeGrade(snap.gradeLv1)) continue;
    (percentileLabel(snap.percentileLv1).side === "top" ? high : low).push(translateStat(stat, lang));
  }
  if (!high.length && !low.length) return undefined;
  return promptWords(lang).extremes(high, low, {
    high: translateGrade("매우 높음", lang),
    low: translateGrade("매우 낮음", lang),
  });
}

/**
 * 스킬 한 줄 요약. 손으로 적지 않고 데이터에서 조립한다.
 *   Q 화염방사기   쿨 10/9/8/7/6 · 최대 체력 비례 피해 · 주문력 105%
 * 챔피언 카드에서 스킬 다섯 개를 한 줄씩 보여 줄 때 쓴다.
 */
export function spellOneLiner(spell: SpellFact, lang: Language = "ko_KR"): string {
  const w = cardLabels(lang);
  const parts: string[] = [];
  if (spell.recharge) parts.push(w.briefRecharge(spell.recharge));
  else if (spell.cooldown) parts.push(w.briefCooldown(spell.cooldown));
  if (spell.effects.length) parts.push(spell.effects.slice(0, 3).map((tag) => translateTag(tag, lang)).join(" · "));
  const [top] = Object.entries(spell.ratios ?? {}).sort((a, b) => b[1] - a[1]);
  if (top) parts.push(ratioText([top], lang));
  if (parts.length) return parts.join(" · ");
  // 구조 필드가 하나도 없는 스킬(순수 패시브 등)은 요약 첫 절을 쓴다.
  return (spell.summary ?? spell.text).split(/[.。]/)[0].slice(0, 60);
}

/** 부정. 이것이 있으면 "아니오" 쪽이다. */
const NEGATION = /않|없|못\s|못합|불가|아니|제외|무시|적용되지|발동하지|주지\s*않/;
/** 조건이 갈리는 문장. 한쪽은 되고 한쪽은 안 되면 배지 하나로 답할 수 없다. */
const CONTRAST = /지만|반면|다만|경우에만|때만|에는\s*[^.]*에는/;
/** 긍정. 무엇이 일어난다는 뜻의 서술. */
const AFFIRM = /줍니다|적용|발동|증가|얻|추가|가능|받|쌓|들어|간주/;

/**
 * 예/아니오 배지를 달 수 있는지.
 *
 * 근거 문장이 **하나**일 때만 부르고, 그 문장의 극성이 분명할 때만 답을 낸다.
 * "…에는 적용되지만 …에는 않습니다" 처럼 조건이 갈리면 undefined 를 돌려주고
 * 카드는 배지 없이 문장만 보인다. 틀린 배지보다 배지 없는 편이 낫다.
 */
export function ruleVerdict(sentence: string): "yes" | "no" | undefined {
  if (CONTRAST.test(sentence)) return undefined;
  if (NEGATION.test(sentence)) return "no";
  if (AFFIRM.test(sentence)) return "yes";
  return undefined;
}
