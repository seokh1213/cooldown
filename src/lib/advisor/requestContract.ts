/** 원문에서 요청을 고정하고, 뒷단의 계획이 다른 질문으로 바뀌는 것을 검사한다. */
import { asksComparison, asksGenericAdvice, asksGuide, asksMatchup, asksScenarioAdvice } from "./askWords";
import { resolveStatQuery } from "./dialogueStats";
import { matchupParticipants } from "./matchupSides";
import { sideOfNewName } from "./conversation";
import { topicFromWords } from "./topicJudge";
import { statQueryFromAnswer, type ChampionStatQuery } from "./statQuery";
import { answerChampionIds } from "./answer";
import { asksSpellNumbers } from "./spellFocus";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { DialogueMemory } from "./dialogueState";
import { inferredSpellFocus } from "./dialogueState";
import type { AnswerPlan, PlanContext, JudgeTier } from "./planTypes";
import type { GuidanceReason } from "./requestGuidance";

export interface RequestContract {
  operation: "lookup" | "advice" | "explain" | "unknown";
  targets: string[];
  pair?: { mine: string; enemy: string };
  stat?: ChampionStatQuery;
}
export interface DialogueTrace {
  judge: JudgeTier;
  parts: Array<{ question: string; request: RequestContract; plan: AnswerPlan["type"]; topics?: string[]; rejected?: GuidanceReason }>;
  rejected?: GuidanceReason;
}

/** 현재 자료는 기본 쿨 계산만 보장한다. 진행 중 타이머 변경과 승리 보장은 답을 만들어 내지 않는다. */
export function unsupportedCondition(question: string): GuidanceReason | undefined {
  if (/가속|haste|急速/i.test(question) && /이미|남은|돌고|중에|during|remaining|already|冷却中/i.test(question)
    && /사면|얻|늘|올|gain|buy|change|增加/i.test(question)) return "evidence";
  if (/100\s*(?:%|퍼)|무조건|guarantee|保证/i.test(question) && /이겨|이기|이길|승리|승률|\bwin\b|赢/i.test(question)) return "unsupported";
  if (/은신|장막|stealth|shroud/i.test(question) && /중|도트|마다|while|tick|during/i.test(question)
    && /점화|리안드리|ignite|liandry/i.test(question)) return "evidence";
  if (/딜로스|damage loss|dps loss|伤害损失|시너지|synergy|协同/i.test(question)) return "evidence";
  return undefined;
}

export function describeRequest(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): RequestContract {
  const query = resolveStatQuery(resolved, memory, ctx);
  const question = resolved.text;
  const stat = query?.kind === "championStat" ? query : undefined;
  const advice = Boolean(resolved.matchup) || asksMatchup(question) || asksGuide(question) || asksScenarioAdvice(question)
    || asksGenericAdvice(question) || Boolean(topicFromWords(question));
  const explain = /뜻|원리|적용|차이|메커니즘|mechanic|meaning|difference|原理|区别/i.test(question);
  const numeric = asksSpellNumbers(question) || Boolean((resolved.slot || asksComparison(question, 2))
    && (memory.active === "spell" || memory.active === "compare") && inferredSpellFocus(question, memory));
  const operation = query || numeric ? "lookup" : advice ? "advice" : explain ? "explain"
    : asksComparison(question, resolved.champions.length) || /스탯|능력치|\bstats?\b|属性/i.test(question) ? "lookup" : "unknown";
  return { operation, targets: resolved.matchup ? [resolved.matchup.mine.id, resolved.matchup.enemy.id] : stat?.champions ?? resolved.champions.map(c => c.id), stat,
    pair: resolved.matchup ? { mine: resolved.matchup.mine.id, enemy: resolved.matchup.enemy.id } : undefined };
}

/** 정적 조회와 상성 조언은 서로 다른 처리 범위를 갖는다. 수치 100(가속·방어력)은 인원수가 아니다. */
export function requestScope(questions: ResolvedQuestion[], memory: DialogueMemory, ctx: PlanContext): GuidanceReason | undefined {
  let pairs = 0;
  for (const resolved of questions) {
    const question = resolved.text;
    const number = /(?:챔피언|챔프|champions?|英雄)\s*(\d+)\s*(?:명|개)?|(\d+)\s*(?:명|개|champions?|个英雄)/i.exec(question);
    const count = Number(number?.slice(1).find(Boolean));
    if (count > 10 || /(?:전체|모든|전\s*챔|all|every|全部|所有)\s*(?:챔피언|챔프|champions?|英雄)/i.test(question)) return "scope";
    const request = describeRequest(resolved, memory, ctx);
    if (request.operation !== "advice") {
      if (request.targets.length > 10) return "scope";
      continue;
    }
    if (resolved.matchup) { pairs++; continue; }
    const participants = matchupParticipants(question, resolved.mentions, m => [question.slice(m.index, m.index + m.length)]);
    if (participants.length <= 2) { if (participants.length === 2) pairs++; continue; }
    const mine = participants.filter(m => sideOfNewName(question, [question.slice(m.index, m.index + m.length)]) === "mine");
    if (mine.length !== 1) return "perspective";
    return "scope";
  }
  return pairs > 2 ? "scope" : undefined;
}

export function planMismatch(request: RequestContract, plan: AnswerPlan): GuidanceReason | undefined {
  if (plan.type === "retry" || plan.type === "respond") return undefined;
  if (request.pair && (plan.type !== "matchup" || plan.mine.id !== request.pair.mine || plan.enemy.id !== request.pair.enemy)) return "answerMismatch";
  if (plan.type === "matchup") return request.stat ? "answerMismatch" : undefined;
  if (typeof plan.answer === "string" || plan.answer.kind === "text" || plan.answer.kind === "suggestion") return undefined;
  const answer = plan.answer;
  if (request.operation === "advice" && answer.kind === "compare" && !answer.matchup) return "answerMismatch";
  if ((request.operation === "explain" || request.operation === "unknown") && answer.kind === "compare" && !answer.matchup) return "answerMismatch";
  if (request.stat) {
    const actual = statQueryFromAnswer(answer);
    if (!actual || actual.field !== request.stat.field || actual.level !== request.stat.level
      || JSON.stringify(actual.champions) !== JSON.stringify(request.stat.champions)) return "answerMismatch";
  }
  if (request.operation === "lookup" && request.targets.length > 1) {
    const actual = answerChampionIds(answer);
    if (actual.length && request.targets.some(id => !actual.includes(id))) return "answerMismatch";
  }
  return undefined;
}
