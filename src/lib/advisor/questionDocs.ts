/**
 * 질문이 가리키는 자료 문서 — 룬·주문 규칙, 게임 메타, 게임 원리.
 *
 * 이름 없는 질문을 검색 벡터로 찾을지, 낱말이 어느 문서를 가리키는지, 고른 문서를 어떤 답으로 보일지를 한곳에서 정한다.
 * 앱의 답 고르기(`plan.ts`)와 평가 하네스가 같이 쓴다.
 */
import type { Language } from "@/i18n";
import { buildItemCard, buildMechanicsAnswerById, type AdvisorData } from "./context";
import { buildRuleAnswer as buildRuleCard, type AdvisorAnswer } from "./answer";
import { suggestChampions } from "./championTypo";
import { asksAboutHelper, detectChampions, nicknames } from "./intent";
import { asksPriceTiers, findGameMeta, gameMetaById } from "./gameMeta";
import type { LexicalHit } from "./searchFallback";
import { findMentionedRules } from "../../../scripts/llm/lib/rules";
import { findMechanics } from "../../../scripts/llm/lib/mechanics";

/** 검색 벡터로 찾을 질문인가(모델·동의 조건은 뺀 것). 평가 하네스도 이 조건으로 가른다. */
export function searchesByVector(data: AdvisorData, question: string, recentItem: string | undefined, inMatchup: boolean): boolean {
  return (
    detectChampions(data, question).length === 0 &&
    !suggestChampions(question, data.cards, nicknames(data.cards), new Set(), 1, (token) => isGameWord(data, token))?.candidates.length &&
    !buildItemCard(data, question, recentItem) &&
    !inMatchup &&
    !asksAboutHelper(question) &&
    !asksPriceTiers(question)
  );
}

/** 게임 낱말(게임 메타·룬·주문 이름·은어). 챔피언 이름 오타로 보지 않는다(`suggestChampions`). */
export function isGameWord(data: AdvisorData, token: string): boolean {
  return Boolean(
    findGameMeta(token) ||
      findMentionedRules(data.ruleIndex, token).length > 0 ||
      // 아이템 이름·줄임말("리안드리" 가 리산드라 오타로 잡혔다)
      (token.length >= 3 && data.items.some((item) => item.name?.includes(token))) ||
      Boolean(buildItemCard(data, token)),
  );
}

/** 낱말이 가리키는 문서: 룬·주문 이름 → 게임 메타 → 게임 원리 */
export function lexicalHit(data: AdvisorData, question: string): LexicalHit | undefined {
  const [rule] = askedRules(data, question);
  if (rule) return { id: `rule:${rule.name}`, step: "rule" };
  const fact = findGameMeta(question);
  if (fact) return { id: `meta:${fact.id}`, step: "meta" };
  const [section] = findMechanics(data.mechanics, question);
  return section ? { id: `mech:${section.id}`, step: "mech" } : undefined;
}

/**
 * 질문에 적힌 룬·주문·게임 요소 규칙.
 * 걸린 것이 게임 요소(미니언·포탑 …)뿐이고 게임 메타 항목이 따로 잡히면 메타가 답이라 비운다.
 * "미니언 웨이브 생성 주기" 가 미니언 규칙으로, "억제기 … 슈퍼 미니언" 이 미니언으로 갔다.
 */
export function askedRules(data: AdvisorData, question: string) {
  const named = findMentionedRules(data.ruleIndex, question);
  const metaFirst = named.length > 0 && named.every((rule) => rule.subject === "gameplay") && Boolean(findGameMeta(question));
  return metaFirst ? [] : named;
}

/** 검색이 고른 문서(`rule:점화` · `meta:surrender` · `mech:스킬-가속`)를 답으로. 규칙은 함께 부른 다른 규칙 이름이 든 문장을 밝힌다. */
export function docAnswer(data: AdvisorData, lang: Language, id: string, question: string): AdvisorAnswer | string | undefined {
  if (id.startsWith("rule:")) {
    const rule = data.ruleIndex.get(id.slice(5));
    if (!rule) return undefined;
    /*
     * 룬·주문 단계와 같다: 함께 부른 규칙마다 카드를 만들고, 다른 규칙 이름이 든 문장이 있는 카드를 보인다.
     * "정복자에 점화 들어가?" 의 답은 정복자 카드가 아니라 점화 규칙의 "정복자" 가 든 문장이다.
     */
    const named = findMentionedRules(data.ruleIndex, question);
    const all = named.some((entry) => entry.name === rule.name) ? named : [rule, ...named];
    const names = all.map((entry) => entry.name);
    const cards = all.map((entry) => buildRuleCard(entry, names, lang, all));
    return cards.find((card) => card.kind === "rule" && card.highlighted.length > 0) ?? cards[all.indexOf(rule)];
  }
  if (id.startsWith("meta:")) return gameMetaById(id, lang);
  if (id.startsWith("mech:")) return buildMechanicsAnswerById(data, id);
  return undefined;
}
