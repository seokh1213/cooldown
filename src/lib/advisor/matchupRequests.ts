/** 명시한 내 챔피언과 나열한 상대를 각각의 상성 요청으로 나눈다. */
import { asksGenericAdvice, asksGuide, asksMatchup, asksMatchupHelp, asksReason, asksScenarioAdvice } from "./askWords";
import { sideOfNewName } from "./conversation";
import { matchupParticipants } from "./matchupSides";
import { directFactPlan } from "./directFactPlan";
import { resolveStatQuery } from "./dialogueStats";
import { buildItemCard } from "./context";
import { askedRules } from "./questionDocs";
import { findGameMeta } from "./gameMeta";
import { resolveQuestion, type ResolvedQuestion } from "./resolvedQuestion";
import { topicFromWords } from "./topicJudge";
import type { DialogueMemory } from "./dialogueState";
import type { PlanContext } from "./planTypes";

const CONNECTOR = /^(?:\s|[,，、/·]|이랑|랑|과|와|하고|및|그리고|또는|and|or|和|跟|或者)*$/i;

export function matchupQuestions(input: string | ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): ResolvedQuestion[] | undefined {
  if (!ctx.data) return undefined;
  const resolved = resolveQuestion(input, ctx.data);
  const question = resolved.text;
  if (resolveStatQuery(resolved, memory, ctx) || directFactPlan(resolved, ctx)) return undefined;
  const advice = asksScenarioAdvice(question) || asksGuide(question) || asksMatchup(question) || asksMatchupHelp(question)
    || asksGenericAdvice(question) || asksReason(question) || Boolean(topicFromWords(question));
  if (!advice) return undefined;
  const candidates = resolved.mentions.filter(m => sideOfNewName(question, [question.slice(m.index, m.index + m.length)]) === "mine");
  if (candidates.length === 1) {
    const mine = candidates[0];
    const participants = matchupParticipants(question, resolved.mentions, m => [question.slice(m.index, m.index + m.length)]);
    const enemies = participants.filter(m => m.card.id !== mine.card.id);
    if (enemies.length < 2 || enemies.some((m, i) => i > 0 && !CONNECTOR.test(question.slice(enemies[i - 1].index + enemies[i - 1].length, m.index)))) return undefined;
    return enemies.map(enemy => ({ ...resolved, matchup: { mine: mine.card, enemy: enemy.card } }));
  }
  const group = memory.matchups;
  if (!group?.length || group.length < 2 || memory.active !== "matchup") return undefined;
  if (resolved.champions.some(c => c.id !== group[0].mine)) return undefined;
  if (buildItemCard(ctx.data, question) || askedRules(ctx.data, question).length || findGameMeta(question)) return undefined;
  return group.map(pair => ({ ...resolved, matchup: { mine: ctx.data!.cardById.get(pair.mine)!, enemy: ctx.data!.cardById.get(pair.enemy)! } }));
}
