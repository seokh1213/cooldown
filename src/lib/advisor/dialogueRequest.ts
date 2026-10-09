/** 대화 기억을 복원하고 이번 요청을 준비한다. 분리·확인의 비교 실험 설정도 이곳에서 정한다. */
import type { PlanContext } from "./planTypes";
import { resolveQuestion, type QuestionInput } from "./resolvedQuestion";
import { dialogueMemoryOf, emptyDialogue, type DialogueMemory } from "./dialogueState";
import { matchupQuestions } from "./matchupRequests";
import { requestScope, unsupportedCondition } from "./requestContract";
import type { GuidanceReason } from "./requestGuidance";
import { detectStats } from "./statQuery";
import { championTypoPlan } from "./championTypoPlan";
import { asksSpellNumbers, detectSpellFocus } from "./spellFocus";

export type DialogueVariant = "memory" | "decompose" | "clarify" | "combined";
export interface DialogueRequest { questions: QuestionInput[]; memory: DialogueMemory; variant: DialogueVariant; groupedMatchups?: boolean; rejected?: GuidanceReason }

/** 별개 요청이 연결된 문장만 나눈다. 스킬 목록과 챔피언 이름을 나열한 비교는 유지한다. */
export function splitDialogueQuestions(question: string, data?: PlanContext["data"]): string[] {
  const asks = /(?<![A-Za-z])[QWER](?![A-Za-z])|궁|쿨|정복자|점화|템|효과|가격|한타|라인전|상대|공략|어떻게|알려|ability|cooldown|rune|item|matchup|\bvs\b|\bhow\b|\btips?\b|技能|冷却|团战/i;
  // 독립 요청을 먼저 나누면 첫 요청의 부재 조건·쉼표가 뒤의 조회까지 삼키지 않는다.
  const independent = question.split(/(?:(?:알려|설명해|비교해|정리해|보여)주고)\s*[,，]?\s*|\s+그리고\s+|\s+and also\s+|\s+and\s+(?=\w+\s+(?:vs\.?|versus)\s)|另外|还有/i).map(q => q.trim()).filter(Boolean);
  if (independent.length > 1 && independent.every(q => asks.test(q) || detectStats(q).length)) return independent.flatMap(piece => splitDialogueQuestions(piece, data));
  const pieces = question.split(/(?:(?:알려|설명해|비교해|정리해|보여)주고)\s*[,，]?\s*|[,;]\s*(?:그리고|추가로)?\s*|\n+(?:그리고\s*)?|\s+그리고\s+|\s+and also\s+|\s+and\s+(?=\w+\s+(?:vs\.?|versus)\s)|另外|还有/i).map(q => q.trim()).filter(Boolean);
  const stateOnly = (text: string) => /(?<![A-Za-z])[QWER](?![A-Za-z])/i.test(text)
    && /없|빠졌|빠진|돌아왔|사용\s*가능|재사용\s*대기\s*중|있어|있고|is down|available|冷却中|可用/i.test(text)
    && !/\?|？|알려|설명|어떻게|언제|how|what|when|怎么|多少/i.test(text);
  if (pieces.some(stateOnly)) return [question];
  const slotList = /((?<![A-Za-z])[PQWER](?![A-Za-z])(?:\s*(?:[,，/·]|및|와|과|하고|and|和)\s*[PQWER](?![A-Za-z]))+)(.*)$/i.exec(question);
  if (slotList && asksSpellNumbers(question) && detectSpellFocus(slotList[2]) && (!data || resolveQuestion(question, data).champions.length <= 1)) {
    const prefix = question.slice(0, slotList.index);
    return [...new Set(slotList[1].match(/[PQWER]/gi))].map(slot => `${prefix}${slot} ${slotList[2].trim()}`);
  }
  if (pieces.length < 2) return [question];
  // 쉼표로 나열한 능력치는 한 조회다. 명시한 여러 요청만 분리한다.
  const scopedStats = data && pieces.every(q => resolveQuestion(q, data).champions.length);
  if (!/주고|그리고|and also|另外|还有/i.test(question) && pieces.every(q => detectStats(q).length)
    && !pieces.every(q => /알려|비교|조회|보여|what|compare|多少/i.test(q)) && !scopedStats) return [question];
  return pieces.every(q => asks.test(q) || detectStats(q).length) ? pieces : [question];
}

export function conditionOwner(input: QuestionInput, memory: DialogueMemory, ctx: PlanContext): "mine" | "enemy" | undefined {
  if (!memory.matchup || !ctx.data) return undefined;
  const resolved = resolveQuestion(input, ctx.data);
  const slot = resolved.slotIndex;
  if (slot === undefined) return undefined;
  const referenceSlot = resolved.text[slot].toUpperCase();
  const named = resolved.mentions.filter(mention => mention.index < slot);
  const last = named[named.length - 1]?.card;
  if (last?.id === memory.matchup.mine) return "mine";
  if (last?.id === memory.matchup.enemy) return "enemy";
  if (memory.spell && memory.spell.slot === referenceSlot && memory.spell.champion === memory.matchup.mine) return "mine";
  const prior = memory.conditions.filter(c => c.slot === referenceSlot);
  return prior.length === 1 ? prior[0].owner : undefined;
}

/** 스킬 이름과 슬롯 문자가 섞인 조건에서 현재 상성의 스킬 주인을 연결한다. */
export function conditionHint(input: QuestionInput, memory: DialogueMemory, ctx: PlanContext) {
  const owner = conditionOwner(input, memory, ctx);
  if (!memory.matchup || !ctx.data) return { owner, spells: [] };
  const pair = [["mine", memory.matchup.mine], ["enemy", memory.matchup.enemy]] as const;
  const spells = pair.flatMap(([side, id]) => ctx.data!.cardById.get(id)?.spells
    .filter(spell => spell.name.length > 1)
    .map(spell => ({ owner: side, slot: spell.slot, name: spell.name })) ?? []);
  return { owner, spells };
}

export function prepareDialogueRequest(question: string, ctx: PlanContext, variant: DialogueVariant): DialogueRequest {
  const memory = ctx.data ? dialogueMemoryOf(ctx.turns, ctx.data) : emptyDialogue("");
  const split = ctx.data && (variant === "decompose" || variant === "combined");
  if (!ctx.data) return { questions: [question], memory, variant };
  const pieces = (split ? splitDialogueQuestions(question, ctx.data) : [question]).map(q => {
    const input = resolveQuestion(q, ctx.data!);
    const resolved = ctx.resumedSpell && !input.champions.length && !input.slot
      ? { ...input, slot: ctx.resumedSpell.slot } : input;
    // 이름이 있는 스킬 질문을 '누구의 스킬?' 확인 단계가 먼저 가로채지 않게 한다.
    const partialComparison = resolved.champions.length === 1 && /비교|둘\s*중|중\s*\d+\s*레벨|\bcompare\b|比较/i.test(q);
    if (!partialComparison && (resolved.champions.length || !resolved.slot && !detectStats(q).length)) return resolved;
    const typo = championTypoPlan(q, ctx.data!, { champions: resolved.champions, inMatchup: Boolean(memory.matchup) });
    return typo?.type === "retry" ? resolveQuestion(typo.question, ctx.data!) : resolved;
  });
  const questions = pieces.flatMap(resolved => split ? matchupQuestions(resolved, memory, ctx) ?? [resolved] : [resolved]);
  const rejected = requestScope(questions, memory, ctx) ?? (questions.length === 1 ? unsupportedCondition(question) : undefined);
  return { questions, memory, variant, groupedMatchups: questions.some(q => Boolean(q.matchup)), rejected };
}
