/** 대화 기억을 복원하고 이번 요청을 준비한다. 분리·확인의 비교 실험 설정도 이곳에서 정한다. */
import type { PlanContext } from "./planTypes";
import { resolveQuestion, type QuestionInput } from "./resolvedQuestion";
import { dialogueMemoryOf, emptyDialogue, type DialogueMemory } from "./dialogueState";

export type DialogueVariant = "memory" | "decompose" | "clarify" | "combined";
export interface DialogueRequest { questions: string[]; memory: DialogueMemory; variant: DialogueVariant }

/** 별개 요청이 연결된 문장만 나눈다. 스킬 목록과 챔피언 이름을 나열한 비교는 유지한다. */
export function splitDialogueQuestions(question: string): string[] {
  const pieces = question.split(/(?:알려주고|설명해주고)\s*[,，]?\s*|[,;]\s*(?:그리고|추가로)?\s*|\n+(?:그리고\s*)?|\s+그리고\s+|\s+and also\s+|另外|还有/i).map(q => q.trim()).filter(Boolean);
  if (pieces.length < 2 || pieces.length > 3) return [question];
  const asks = /[QWER]|궁|쿨|정복자|점화|템|효과|가격|한타|라인전|어떻게|알려|ability|cooldown|rune|item|技能|冷却|团战/i;
  return pieces.every(q => asks.test(q)) ? pieces : [question];
}

export function conditionOwner(input: QuestionInput, memory: DialogueMemory, ctx: PlanContext): "mine" | "enemy" | undefined {
  if (!memory.matchup || !ctx.data) return undefined;
  const resolved = resolveQuestion(input, ctx.data);
  const question = resolved.text;
  const slot = /[QWER]/.exec(question)?.index;
  if (slot === undefined) return undefined;
  const named = resolved.mentions.filter(mention => mention.index < slot);
  const last = named[named.length - 1]?.card;
  return last?.id === memory.matchup.mine ? "mine" : last?.id === memory.matchup.enemy ? "enemy" : undefined;
}

export function prepareDialogueRequest(question: string, ctx: PlanContext, variant: DialogueVariant): DialogueRequest {
  const memory = ctx.data ? dialogueMemoryOf(ctx.turns, ctx.data) : emptyDialogue("");
  const split = ctx.data && (variant === "decompose" || variant === "combined");
  return { questions: split ? splitDialogueQuestions(question) : [question], memory, variant };
}
