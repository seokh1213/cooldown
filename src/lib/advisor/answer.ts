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
import type { ChampionCard, SpellFact, StatName } from "@/lib/knowledge/facts";
import { ruleLines, ruleName, type RuleNotes } from "@/lib/knowledge/rules";
import { removalNotice } from "@/lib/knowledge/noteVersion";
import type { Ability } from "./mechanics/types";
import { renderRules } from "./mechanics/render";
import type { Language } from "@/i18n";
import { translations } from "@/i18n/translations";
import type { SelectedNotes } from "./noteSelect";
import { detectSpellFocus, type SpellFocus } from "./spellFocus";
import type { ChampionStatQuery } from "./statQuery";
import { ratioText, spellFocusValue } from "./spellAnswer";
import { splitSentences } from "./answerText";
export { splitSentences } from "./answerText";
export { buildSpellAnswer, cooldownFact, rangeFact, spellFocusValue } from "./spellAnswer";
import { buildStatComparison } from "./statComparison";
export { detectStat, detectLevel } from "./statQuery";
import {
  cardLabels,
  translateTag,
} from "./promptLocale";

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

/** 카드에 한 줄로 놓을 사실. */
export interface Fact {
  label: string;
  value: string;
}

export type AdvisorAnswer =
  | {
      kind: "spell";
      championId: string;
      championName: string;
      /** 채팅은 해당 스킬만 답하고, 자료 카드는 챔피언 전체 스킬을 보여준다. 저장은 id만 한다. */
      card?: ChampionCard;
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
      statQuery?: ChampionStatQuery;
      headline?: Fact;
      /** "말파이트 스킬 쿨타임" 처럼 슬롯 없이 사실 하나를 물으면 스킬 다섯 개의 그 사실만 */
      focus?: SpellFocus;
      /** "스킬 설명해줘": 능력치 대신 스킬 다섯 개의 요약 */
      view?: "skills" | "overview";
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
      statQuery?: ChampionStatQuery;
      /** 능력치 비교면 어느 레벨 값인지 */
      level?: 1 | 6 | 11 | 18;
      /** 스킬 비교면 슬롯 */
      slot?: string;
      focus?: SpellFocus;
      rows: CompareRow[];
      /** 질문이 가리킨 행의 결론. "체력 (1레벨)" → "말파이트 665 > 럼블 640" */
      headline?: Fact;
      /** 여러 능력치를 요청한 순서대로 보여준다. */
      headlines?: Fact[];
      /** 상성 질문. cards[0] 이 내 챔피언, cards[1] 이 상대다. 해설이 그 시점으로 쓴다. */
      matchup?: boolean;
      /** 상성 대화 중의 수치 조회 표(쿨타임 등). 상성 답은 아니지만 상성 맥락을 끊지 않는다 — 표 다음의 "그럼 템은?" 은 그 상성의 이어 묻기다. */
      inMatchup?: boolean;
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
      /** 가격을 물었는가. 대화 글이 가격부터 답한다. */
      askedPrice?: boolean;
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
/**
 * 규칙 답. 질문에 함께 나온 **다른 이름**을 담은 문장을 앞에 놓는다.
 *
 * "정복자에 점화 들어가?" 는 점화 규칙 9문장 중 "정복자" 가 든 한 문장이 답이다.
 * 이름을 담은 문장이 없으면 전부 rest 로 두고 카드가 원문을 보인다.
 */
export function buildRuleAnswer(rule: RuleNotes, mentionedNames: string[], lang = "ko_KR", mentioned: RuleNotes[] = [], cooldownSeconds?: number | string): AdvisorAnswer {
  // "점멸 쿨타임" 은 판정 규칙이 아니라 수치를 묻는 것이다. 규칙 문장만 보였더니 300초가 어디에도 없었다(2026-09-30 브라우저 시험).
  const cooldownLine =
    cooldownSeconds === undefined ? undefined : `${cardLabels(lang as Language).cooldown} ${cooldownSeconds}${translations[lang as Language].comparison.seconds}`;
  const removed = removalNotice(ruleName(rule, lang), rule.version, lang);
  const lines = [...(cooldownLine ? [cooldownLine] : []), ...ruleLines(rule, lang)];
  // 함께 물은 다른 규칙을 그 화면 언어 이름으로 찾는다("정복자에 점화" → 점화 규칙에서 정복자가 든 줄)
  const others = [...new Set([...mentionedNames.filter((name) => name !== rule.name), ...mentioned.filter((r) => r !== rule).map((r) => ruleName(r, lang))])];
  const highlighted = [
    ...(removed ? [removed, ...lines] : []),
    ...(cooldownLine ? [cooldownLine] : []),
    ...(others.length ? lines.filter((line) => line !== cooldownLine && others.some((name) => line.toLowerCase().includes(name.toLowerCase()))) : []),
  ];
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
export { answerLinks, answerKey, answerChampionIds, type AnswerLink } from "./answerIdentity";

export function focusLabel(focus: SpellFocus, lang: Language = "ko_KR"): string {
  const w = cardLabels(lang);
  return { cooldown: w.cooldown, cost: w.cost, ratio: w.ratios, range: w.range, damage: w.damageType, effect: w.effects }[focus];
}

// ── 비교 ──────────────────────────────────────────────────────────────

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
  options: { matchup?: boolean; notes?: MatchupNotes; lang?: Language; statQuery?: ChampionStatQuery; abilityRules?: Map<string, Ability> } = {},
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
    if (!focus || focus === "effect") {
      const values = spells.map((spell, i) => {
        const approved = lang === "ko_KR" && slot === "P" ? options.abilityRules?.get(`${cards[i].id}.${slot}`) : undefined;
        return approved ? renderRules(approved.job, approved.draft.rules, question) : spell?.text ?? "";
      });
      rows.push({ label: lang === "en_US" ? "Description" : lang === "zh_CN" ? "说明" : "설명", values });
    }
    push(
      spells.some((spell) => spell?.recharge) ? w.recharge : w.cooldown,
      (spell) => spellFocusValue(spell, "cooldown", lang),
      focus === "cooldown",
    );
    push(w.cost, (spell) => spellFocusValue(spell, "cost", lang), focus === "cost");
    push(w.range, (spell) => spellFocusValue(spell, "range", lang), focus === "range");
    push(w.damageType, (spell) => spellFocusValue(spell, "damage", lang), focus === "damage");
    push(w.effects, (spell) => spellFocusValue(spell, "effect", lang), focus === "effect");
    push(
      w.ratios,
      (spell) => spellFocusValue(spell, "ratio", lang),
      focus === "ratio",
    );
    const hit = rows.find((row) => row.hit);
    const headline = hit
      ? { label: `${slot} ${hit.label}`, value: cards.map((card, i) => `${card.name} ${hit.values[i] || "—"}`).join(" · ") }
      : undefined;
    return { kind: "compare", cards, slot, focus, rows, headline };
  }
  if (detectSpellFocus(question)?.focus === "cooldown") {
    // 슬롯 없이 "두 챔피언 스킬 쿨타임" 이면 네 스킬의 쿨타임을 한 줄씩. 능력치 표를 내면 물은 것이 없다.
    const rows: CompareRow[] = ["Q", "W", "E", "R"].flatMap((each) => {
      const spells = cards.map((card) => card.spells.find((spell) => spell.slot === each));
      const values = spells.map((spell) => (spell ? spellFocusValue(spell, "cooldown", lang) : ""));
      const label = `${each} ${spells.some((spell) => spell?.recharge) ? w.recharge : w.cooldown}`;
      return values.some(Boolean) ? [{ label, values, hit: false }] : [];
    });
    if (rows.length) return { kind: "compare", cards, rows };
  }

  return buildStatComparison(cards, question, { lang, query: options.statQuery, defaultFields: CARD_STATS });
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
