/** 대화에서 새 상성·관점 전환·이전 상성으로 돌아오기와 주제를 해석한다. */
import type { ChampionCard } from "@/lib/knowledge/facts";
import { asksMatchup } from "./askWords";
import { actFromWords, sideOfNewName } from "./conversation";
import { detectChampions } from "./intent";
import { matchupSidesDetailed } from "./matchupSides";
import type { AnswerPlan, PlanContext, PlanDeps } from "./planTypes";
import { TOPIC_HEAD } from "./judgeHeads";
import { judgeRouteState } from "./routeAsk";
import { topicFromJudge, topicFromWords, topicQuestions } from "./topicJudge";
import type { DialogueMemory } from "./dialogueState";

function dialogueAct(question: string) {
  return actFromWords(question) ?? (/(?:^|\s)왜(?=\s|[?？]|$)|어째서|이유|\bwhy\b|为什么/i.test(question) ? "more" as const : undefined);
}

function pairForQuestion(question: string, memory: DialogueMemory, ctx: PlanContext): [ChampionCard, ChampionCard] | undefined {
  const data = ctx.data!;
  const named = detectChampions(data, question);
  const current = memory.matchup;
  const prior = current ? [data.cardById.get(current.mine)!, data.cardById.get(current.enemy)!] as [ChampionCard, ChampionCard] : undefined;
  const act = dialogueAct(question);
  const focus = topicFromWords(question);
  if (named.length === 2 && (asksMatchup(question) || /타워\s*밑|포탑\s*밑/.test(question))) {
    const parsed = matchupSidesDetailed(question, named);
    if (parsed.confident) return parsed.sides;
    if (prior && named.every(c => prior.some(p => p.id === c.id))) return prior;
    return parsed.sides;
  }
  if (!prior) return undefined;
  if (act === "flip") return [prior[1], prior[0]];
  if (named.length === 1) {
    const card = named[0];
    const side = sideOfNewName(question, [card.name, ...(data.aliases.get(card.id) ?? [])]);
    if (side === "mine" && /바꾸|내가|\bas\b|play|换|我是/i.test(question)) return [card, prior[1]];
    if (side === "enemy" || /상대가|상대로|만나면|against|对面/i.test(question)) return [prior[0], card];
    if (prior.some(p => p.id === card.id) && (focus || /언제\s*(써|쓰)|어떻게|상대|한타|라인전/i.test(question))) return prior;
    return undefined;
  }
  const returns = /아까|돌아|다시.*상성|earlier|back to|之前|回到/i.test(question);
  const advice = /빠졌|빠진|정정.*[QWER]|교환|진입|버텨|어떻게|언제.*(써|쓰|들어)/i.test(question);
  if (returns || (memory.active === "matchup" && (focus || act === "more" || advice))) return prior;
  return undefined;
}

export async function matchupPlan(question: string, memory: DialogueMemory, ctx: PlanContext, deps: PlanDeps): Promise<AnswerPlan | undefined> {
  if (!ctx.data) return undefined;
  const pair = pairForQuestion(question, memory, ctx);
  if (!pair) return undefined;
  const names = pair.map(c => c.name);
  const same = memory.matchup?.mine === pair[0].id && memory.matchup.enemy === pair[1].id;
  const reason = dialogueAct(question) === "more";
  let focus = topicFromWords(question, names);
  if (/타워\s*밑|포탑\s*밑|막타|미니언|\bCS\b|wave|tower|补刀/i.test(question) && !/한타|teamfight|团战/i.test(question)) focus = "laning";
  if (!focus && /빠졌|빠진|정정.*[QWER]/i.test(question)) focus = "escape-window";
  if (reason && same) focus = memory.matchup?.focus as typeof focus;
  if (!focus && /바꾸|입장|상대가|면\s*\?$/i.test(question)) focus = same ? memory.matchup?.focus as typeof focus : "general";
  if (!focus && ctx.judge !== "none") {
    focus = await deps.judge(TOPIC_HEAD, judgeRouteState(question, names), topicQuestions(2)).then(([probs]) => topicFromJudge(probs).topic).catch(() => undefined);
  }
  return { type: "matchup", mine: pair[0], enemy: pair[1], focus: focus ?? "general", more: reason };
}
