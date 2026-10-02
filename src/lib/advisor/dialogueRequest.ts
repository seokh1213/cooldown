/** 대화 기억을 복원하고 이번 요청을 준비한다. 분리·확인의 비교 실험 설정도 이곳에서 정한다. */
import type { PlanContext } from "./planTypes";
import { resolveQuestion, type QuestionInput } from "./resolvedQuestion";
import { dialogueMemoryOf, emptyDialogue, type DialogueMemory } from "./dialogueState";
import { matchupQuestions } from "./matchupRequests";

export type DialogueVariant = "memory" | "decompose" | "clarify" | "combined";
export interface DialogueRequest { questions: string[]; memory: DialogueMemory; variant: DialogueVariant; groupedMatchups?: string }

/** 별개 요청이 연결된 문장만 나눈다. 스킬 목록과 챔피언 이름을 나열한 비교는 유지한다. */
export function splitDialogueQuestions(question: string): string[] {
  const pieces = question.split(/(?:알려주고|설명해주고)\s*[,，]?\s*|[,;]\s*(?:그리고|추가로)?\s*|\n+(?:그리고\s*)?|\s+그리고\s+|\s+and also\s+|另外|还有/i).map(q => q.trim()).filter(Boolean);
  if (pieces.length < 2 || pieces.length > 3) return [question];
  const asks = /(?<![A-Za-z])[QWER](?![A-Za-z])|궁|쿨|정복자|점화|템|효과|가격|한타|라인전|어떻게|알려|ability|cooldown|rune|item|技能|冷却|团战/i;
  const stateOnly = (text: string) => /(?<![A-Za-z])[QWER](?![A-Za-z])/i.test(text)
    && /없|빠졌|빠진|돌아왔|사용\s*가능|재사용\s*대기\s*중|is down|available|冷却中|可用/i.test(text)
    && !/\?|？|알려|설명|어떻게|언제|how|what|when|怎么|多少/i.test(text);
  if (pieces.some(stateOnly)) return [question];
  return pieces.every(q => asks.test(q)) ? pieces : [question];
}

export function conditionOwner(input: QuestionInput, memory: DialogueMemory, ctx: PlanContext): "mine" | "enemy" | undefined {
  if (!memory.matchup || !ctx.data) return undefined;
  const resolved = resolveQuestion(input, ctx.data);
  const slot = resolved.slotIndex;
  if (slot === undefined) return undefined;
  const named = resolved.mentions.filter(mention => mention.index < slot);
  const last = named[named.length - 1]?.card;
  if (last?.id === memory.matchup.mine) return "mine";
  if (last?.id === memory.matchup.enemy) return "enemy";
  const prior = memory.conditions.filter(c => c.slot === resolved.slot);
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
  const matchups = split ? matchupQuestions(question, memory, ctx) : undefined;
  if (matchups) return { questions: matchups, memory, variant, groupedMatchups: question };
  return { questions: split ? splitDialogueQuestions(question) : [question], memory, variant };
}
