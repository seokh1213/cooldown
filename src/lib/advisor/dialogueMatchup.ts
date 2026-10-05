/** 대화에서 새 상성·관점 전환·이전 상성으로 돌아오기와 주제를 해석한다. */
import type { ChampionCard } from "@/lib/knowledge/facts";
import { asksMatchup, asksGenericAdvice, asksMatchupHelp, asksReason, asksSkillHandling, asksScenarioAdvice } from "./askWords";
import { actFromWords, sideOfNewName } from "./conversation";
import { resolveQuestion, type QuestionInput, type ResolvedQuestion } from "./resolvedQuestion";
import { matchupSidesDetailed } from "./matchupSides";
import type { AnswerPlan, PlanContext, PlanDeps } from "./planTypes";
import { TOPIC_HEAD } from "./judgeHeads";
import { judgeRouteState } from "./routeAsk";
import { topicFromJudge, topicFromWords, topicQuestions } from "./topicJudge";
import type { DialogueMemory } from "./dialogueState";

const RETURN_TO_MATCHUP = /^(?:아까|이전|방금)\s*(?:그\s*)?상성(?:에서|으로\s*돌아가서)?\s*[,，:：]?\s*|^(?:back to|returning to)\s+(?:that|the|earlier|previous)\s+matchup\s*[:,]?\s*|^(?:回到|继续)(?:之前|刚才|这个)(?:的)?对局\s*[，,:：]?\s*/i;

/** 이전 상성을 가리키는 앞말을 빼고 남은 요청으로 일반 조언 여부를 정한다. */
function asksMoreMatchupAdvice(question: string): boolean {
  return asksGenericAdvice(question.replace(RETURN_TO_MATCHUP, ""));
}

function dialogueAct(question: string) {
  return actFromWords(question) ?? (asksReason(question) ? "more" as const : undefined);
}

function pairForQuestion(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): [ChampionCard, ChampionCard] | undefined {
  if (resolved.matchup) return [resolved.matchup.mine, resolved.matchup.enemy];
  const data = ctx.data!;
  const { text: question, champions: named } = resolved;
  const current = memory.matchup;
  const prior = current ? [data.cardById.get(current.mine)!, data.cardById.get(current.enemy)!] as [ChampionCard, ChampionCard] : undefined;
  const act = dialogueAct(question);
  const focus = resolved.requestIntent ? resolved.requestIntent.topic : topicFromWords(question);
  // “피오라 대 다리우스로 돌아가자”의 마지막 -로는 내 챔피언을 바꾸는 표지가 아니다.
  const versus = resolved.mentions.find((m, i, mentions) => mentions[i + 1]
    && /\s+(?:대|vs\.?|versus)\s*$/i.test(question.slice(m.index, mentions[i + 1].index)))?.card;
  const explicitMine = named.find(card => sideOfNewName(question, [card.name, ...(data.aliases.get(card.id) ?? [])]) === "mine");
  if (named.length === 2 && explicitMine && /내가|내\s*챔피언|\bi (?:am|play)\b|我/i.test(question)) return [explicitMine, named.find(card => card.id !== explicitMine.id)!];
  if (named.length === 2 && versus) return [versus, named.find(card => card.id !== versus.id)!];
  if (named.length === 2 && explicitMine && (prior || asksMatchup(question) || asksSkillHandling(question) || asksScenarioAdvice(question))) return [explicitMine, named.find(card => card.id !== explicitMine.id)!];
  if (named.length === 2 && (asksMatchup(question) || /타워\s*밑|포탑\s*밑/.test(question))) {
    const parsed = matchupSidesDetailed(question, named);
    if (parsed.confident) return parsed.sides;
    if (prior && named.every(c => prior.some(p => p.id === c.id))) return prior;
    return parsed.sides;
  }
  if (!prior) {
    const mine = memory.active === "spell" && memory.spell ? data.cardById.get(memory.spell.champion) : undefined;
    return named.length === 1 && mine && mine.id !== named[0].id && asksScenarioAdvice(question)
      && /상대|대응|against|respond|对面|应对/i.test(question) ? [mine, named[0]] : undefined;
  }
  if (act === "flip") return [prior[1], prior[0]];
  if (named.length === 1) {
    const card = named[0];
    const side = sideOfNewName(question, [card.name, ...(data.aliases.get(card.id) ?? [])]);
    if (side === "mine" && /바꾸|바꿔|바꿨|바꿨어|내가|내\s*챔피언|\bas\b|play|换|我是/i.test(question)) return [card, prior[1]];
    if (side === "enemy" || /상대가|상대로|만나면|against|对面/i.test(question)) return [prior[0], card];
    if (prior.some(p => p.id === card.id) && (focus || asksScenarioAdvice(question) || asksGenericAdvice(question)
      || /언제\s*(써|쓰)|어떻게|상대|한타|라인전/i.test(question))) return prior;
    return undefined;
  }
  const returns = RETURN_TO_MATCHUP.test(question) || /아까|돌아|다시.*상성|earlier|back to|之前|回到/i.test(question);
  const advice = asksScenarioAdvice(question) || asksMatchupHelp(question) || /정정.*[QWER]|사실.*[QWER]|버텨|어떻게/i.test(question);
  if (returns || advice || (memory.active === "matchup" && (focus || act === "more" || asksGenericAdvice(question)))) return prior;
  return undefined;
}

export async function matchupPlan(input: QuestionInput, memory: DialogueMemory, ctx: PlanContext, deps: PlanDeps): Promise<AnswerPlan | undefined> {
  if (!ctx.data) return undefined;
  const resolved = resolveQuestion(input, ctx.data);
  if (resolved.requestIntent && !["advice", "counterplay"].includes(resolved.requestIntent.scope)) return undefined;
  const question = resolved.text;
  const pair = pairForQuestion(resolved, memory, ctx);
  if (!pair) return undefined;
  const names = pair.map(c => c.name);
  const same = memory.matchup?.mine === pair[0].id && memory.matchup.enemy === pair[1].id;
  const reason = dialogueAct(question) === "more" || same && asksMoreMatchupAdvice(question);
  let focus = resolved.requestIntent ? resolved.requestIntent.topic ?? "general" : topicFromWords(question, names);
  if (!resolved.requestIntent && /타워\s*밑|포탑\s*밑|막타|미니언|\bCS\b|wave|tower|补刀/i.test(question) && !/한타|teamfight|团战/i.test(question)) focus = "laning";
  if (!focus && /빠졌|빠진|정정.*[QWER]/i.test(question)) focus = "escape-window";
  if (reason && same) focus = memory.matchup?.focus as typeof focus;
  if (!focus && /바꾸|입장|상대가|면\s*\?$/i.test(question)) focus = same ? memory.matchup?.focus as typeof focus : "general";
  if (!focus && ctx.judge !== "none") {
    focus = await deps.judge(TOPIC_HEAD, judgeRouteState(question, names), topicQuestions(2)).then(([probs]) => topicFromJudge(probs).topic).catch(() => undefined);
  }
  return { type: "matchup", mine: pair[0], enemy: pair[1], focus: focus ?? "general", more: reason, continuation: reason ? (asksReason(question) ? "explain" : "advance") : undefined };
}
