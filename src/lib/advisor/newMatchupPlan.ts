/** 새 상성의 대상 선택. 이름 수에 따른 차이를 풀고 같은 계획으로 조립한다. */
import type { ChampionCard } from "@/lib/knowledge/facts";
import { detectStat } from "./answer";
import { asksComparison, asksGuide, asksMatchup } from "./askWords";
import { matchupPair, matchupSidesByPhrase, matchupSidesDetailed } from "./matchupSides";
import type { AnswerPlan, Intent } from "./planTypes";
import type { AskRoute } from "./routeAsk";

interface MatchupTarget { mine: ChampionCard; enemy: ChampionCard; notice?: string }

/** 조사로 관점이 정해지면 우선하고, 모호한 두 이름에서만 판정기의 관점을 사용한다. */
export function pickMatchupSides(question: string, champions: ChampionCard[], route: AskRoute | undefined): [ChampionCard, ChampionCard] {
  const byJosa = matchupSidesDetailed(question, champions);
  const picked = !byJosa.confident && route?.mine && champions.includes(route.mine) ? route.mine : undefined;
  return picked ? [picked, champions.find(card => card.id !== picked.id) ?? champions[1]] : byJosa.sides;
}

function resolveTarget(intent: Intent): MatchupTarget | undefined {
  const { question, ctx, champions, ask, recent, data, route } = intent;
  if (champions.length === 1) {
    // 한 명의 일반 상대법에는 최근 챔피언을 붙이지 않는다. "제이스를 만나면"처럼 상황을 말할 때만 연결한다.
    const paired = ask === "matchup" || ask === "guide" && asksMatchup(question) && !asksGuide(question);
    if (!paired) return undefined;
    const mine = recent.find(card => card.id !== champions[0].id);
    return mine ? { mine, enemy: champions[0], notice: ctx.notice } : undefined;
  }
  if (champions.length < 2) return undefined;
  if (champions.length === 2) {
    if (ask !== "matchup") return undefined;
    if (asksComparison(question, 2) && detectStat(question)) return undefined;
    const [mine, enemy] = pickMatchupSides(question, champions, route);
    return { mine, enemy, notice: ctx.notice };
  }
  // 이름 셋 이상을 비교하는 질문은 비교 카드로 넘기고, 상성에서는 정글·서폿 등 곁들인 이름을 뺀다.
  if (asksComparison(question, champions.length)) return undefined;
  const aliasesOf = (card: ChampionCard) => [card.name, ...(data.aliases.get(card.id) ?? [])];
  const pair = matchupPair(question, champions, aliasesOf);
  if (!pair) return undefined;
  const phrased = matchupSidesByPhrase(question, pair, aliasesOf);
  const byJosa = matchupSidesDetailed(question, pair);
  // 두 이름으로 학습한 판정기는 곁들인 세 번째 이름 때문에 item/guide를 고르기도 한다.
  // 상성 문구와 명확한 관점이 함께 있을 때만 그 판정을 보완한다.
  const canCorrect = (ask === "item" || ask === "guide") && asksMatchup(question) && (phrased || byJosa.confident);
  if (ask !== "matchup" && !canCorrect) return undefined;
  const [mine, enemy] = phrased ? [phrased, pair.find(card => card.id !== phrased.id) ?? pair[1]] : byJosa.sides;
  return { mine, enemy, notice: ctx.notice };
}

/** 대상이 확정된 새 상성에서만 주제를 판정한다. 이어 묻기는 저장 상태를 사용하는 별도 처리기다. */
export async function answerNewMatchup(intent: Intent): Promise<AnswerPlan | undefined> {
  const target = resolveTarget(intent);
  return target ? { type: "matchup", ...target, focus: (await intent.topic())?.topic } : undefined;
}
