/** 카드로 반증할 수 있는 스킬 주장과 저항 전체를 무용하다고 하는 단정을 검사한다. 의미 전체의 증명은 아니다. */
import type { ChampionCard } from "@/domain/knowledge/cards/contracts";
import type { PrecomputedPair } from "../../retrieval/precomputed";

export interface MatchupFactIssue { sentence: string; reason: "resistance-blanket" | "spell-owner" | "damage-type" | "flat-reduction-penetration" | "unsupported-guarantee" | "effect-target" }
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const evidenceSentences = (text: string): string[] => text.split(/(?<=[.!?])\s+|(?<=[。！？])\s*|\n+/).map(s => s.trim()).filter(Boolean);

export function checkMatchupFacts(text: string, cards: readonly ChampionCard[]): MatchupFactIssue[] {
  const issues: MatchupFactIssue[] = [];
  for (const sentence of evidenceSentences(text)) {
    // 전투 선택의 보편적 보장으로 쓰인 단정이다. 스킬 자체의 확정 효과와 구분한다.
    if (/모든\s*콤보.{0,25}(?:시작|출발)|그\s*뒤\s*스킬.{0,15}전부\s*확정|평타와\s*W,\s*Q가\s*확정|딜\s*교환.{0,20}유일한\s*창|방어\s*수단이\s*전혀\s*없|아무것도\s*못\s*하는\s*챔피언|all combos (?:start|begin)|(?:every|all|the) follow.up (?:abilities|skills).*guaranteed|(?:ensures?|guarantees?).{0,20}(?:all|every|the) follow.up (?:abilities|skills).{0,12}(?:land|hit)|(?:ensures?|guarantees?).{0,30}follow.up.{0,20}\band\b.{0,20}\b(?:land|hit)\b|所有连招.*(?:开始|起手)|后续技能.{0,12}(?:确保|保证|必定|必然).{0,4}命中/i.test(sentence)) issues.push({ sentence, reason: "unsupported-guarantee" });
    if (/(?:방어력|마법\s*저항력)(?:은|는|이|가)?\s*(?:한\s*푼|아무|전혀|쓸모|무의미|필요\s*없)/.test(sentence)) issues.push({ sentence, reason: "resistance-blanket" });
    const amumu = cards.find(card => card.id === "Amumu");
    const tantrum = amumu?.spells.find(spell => spell.slot === "E" && /받는 물리 피해가.*감소/.test(spell.text));
    if (tantrum && !/관통.*(?:없앨 수 없|없애지 못|무시하지 못|우회하지 못)/.test(sentence) && new RegExp(`E\\s+${escape(tantrum.name)}.*물리 피해.*(?:감소|줄이).*방어구 관통`).test(sentence)) issues.push({ sentence, reason: "flat-reduction-penetration" });
    for (const card of cards) {
      for (const spell of card.spells) {
        // 카드가 적 챔피언의 통과로만 허물어지는 벽이라고 명시하면 아군이 깨고 탈출한다는 조언은 반증된다.
        if (/장벽을 통과하는 적 챔피언/.test(spell.text) && /벽은 허물어/.test(spell.text)
          && /아군.{0,20}벽.{0,15}(?:부수|깨|허물)/.test(sentence)) issues.push({ sentence, reason: "effect-target" });
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
