/** 카드로 반증할 수 있는 스킬 주장과 저항 전체를 무용하다고 하는 단정을 검사한다. 의미 전체의 증명은 아니다. */
import type { ChampionCard } from "@/lib/knowledge/facts";
import type { PrecomputedPair } from "./precomputed";

export interface MatchupFactIssue { sentence: string; reason: "resistance-blanket" | "spell-owner" | "damage-type" | "flat-reduction-penetration" }
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const evidenceSentences = (text: string): string[] => text.split(/(?<=[.!?。！？])\s+|\n+/).map(s => s.trim()).filter(Boolean);

export function checkMatchupFacts(text: string, cards: readonly ChampionCard[]): MatchupFactIssue[] {
  const issues: MatchupFactIssue[] = [];
  for (const sentence of evidenceSentences(text)) {
    if (/(?:방어력|마법\s*저항력)(?:은|는|이|가)?\s*(?:한\s*푼|아무|전혀|쓸모|무의미|필요\s*없)/.test(sentence)) issues.push({ sentence, reason: "resistance-blanket" });
    const amumu = cards.find(card => card.id === "Amumu");
    const tantrum = amumu?.spells.find(spell => spell.slot === "E" && /받는 물리 피해가.*감소/.test(spell.text));
    if (tantrum && !/관통.*(?:없앨 수 없|없애지 못|무시하지 못|우회하지 못)/.test(sentence) && new RegExp(`E\\s+${escape(tantrum.name)}.*물리 피해.*(?:감소|줄이).*방어구 관통`).test(sentence)) issues.push({ sentence, reason: "flat-reduction-penetration" });
    for (const card of cards) {
      for (const spell of card.spells) {
        const label = `${escape(spell.slot)}\\s+${escape(spell.name)}(?=\\s|[,.]|$|(?:은|는|이|가|의|을|를|으로|로)(?:\\s|[,.]|$))`;
        const wrongOwner = cards.some(other => other.id !== card.id && new RegExp(`${escape(other.name)}\\s+${label}`).test(sentence) && !other.spells.some(s => s.slot === spell.slot && s.name === spell.name));
        if (wrongOwner) issues.push({ sentence, reason: "spell-owner" });
        const claim = new RegExp(`${label}\\s*(?:은|는|이|가|의)?\\s*(물리|마법|고정)\\s*피해(?:를\\s*(?:입히|가하|주|줍)|입니다|이다|이므로)`).exec(sentence);
        if (claim && spell.damageTypes.length && !spell.damageTypes.includes(claim[1] as typeof spell.damageTypes[number])) issues.push({ sentence, reason: "damage-type" });
      }
    }
  }
  return issues;
}

/** 문제가 있는 문장을 제거하되 원래 주제의 나머지 문장을 보존한다. 빈 칸은 노트 조립으로 넘어간다. */
export function checkedMatchupPair(pair: PrecomputedPair, cards: readonly ChampionCard[]): PrecomputedPair {
  return Object.fromEntries(Object.entries(pair).map(([key, text]) => {
    if (typeof text !== "string") return [key, undefined];
    return [key, checkedMatchupText(text, cards) || undefined];
  }));
}

export function checkedMatchupText(text: string, cards: readonly ChampionCard[]): string {
  const bad = new Set(checkMatchupFacts(text, cards).map(issue => issue.sentence));
  return evidenceSentences(text).filter(sentence => !bad.has(sentence)).join(" ");
}
