/** 답 카드의 이동 링크·중복 비교·조회 대상. */
import type { AdvisorAnswer } from "./answer";
import { statFields } from "../understanding/stats/statQuery";

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
      return `spell:${answer.championId}:${answer.spell.slot}:${answer.focus ?? ""}`;
    case "champion":
      return `champion:${answer.card.id}:${answer.view ?? ""}:${answer.focus ?? ""}:${answer.statQuery ? statFields(answer.statQuery).join(",") : ""}:${answer.statQuery?.level ?? ""}`;
    case "compare":
      return `compare:${answer.cards.map((card) => card.id).join(",")}:${answer.slot ?? ""}:${answer.focus ?? ""}:${answer.matchup ? "m" : ""}:${answer.statQuery ? statFields(answer.statQuery).join(",") : ""}:${answer.level ?? ""}`;
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

