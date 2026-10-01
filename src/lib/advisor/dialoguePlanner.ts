/** 코드 기억을 이용한 대화 계획. 실제 답을 찾는 판정·검색은 기존 계획기를 재사용한다. */
import type { ChampionCard } from "@/lib/knowledge/facts";
import { asksMatchup } from "./askWords";
import { actFromWords, sideOfNewName } from "./conversation";
import { detectChampions } from "./intent";
import { matchupSidesDetailed } from "./matchupSides";
import { GENERIC_ADVICE, planAnswer, TOPIC_HEAD, type AnswerPlan, type PlanContext, type PlanDeps } from "./plan";
import { judgeRouteState } from "./routeAsk";
import { topicFromJudge, topicFromWords, topicQuestions } from "./topicJudge";
import { resolveDialogueFact, type FactResolution } from "./dialogueFacts";
import { dialogueMemoryOf, rememberAnswer, scenarioConditions, type DialogueMemory } from "./dialogueState";

export type DialogueVariant = "memory" | "decompose" | "clarify" | "combined";
export interface DialoguePlan {
  parts: Array<{ question: string; plan: AnswerPlan }>;
  memory: DialogueMemory;
  clarification?: string;
}

function dialogueAct(question: string) {
  return actFromWords(question) ?? (/(?:^|\s)왜(?=\s|[?？]|$)|어째서|이유|\bwhy\b|为什么/i.test(question) ? "more" as const : undefined);
}

/** 별개 요청이 연결된 문장만 나눈다. 스킬 목록과 챔피언 이름을 나열한 비교는 유지한다. */
export function splitDialogueQuestions(question: string): string[] {
  const pieces = question.split(/(?:알려주고|설명해주고)\s*[,，]?\s*|[,;]\s*(?:그리고|추가로)?\s*|\n+(?:그리고\s*)?|\s+그리고\s+|\s+and also\s+|另外|还有/i).map(q => q.trim()).filter(Boolean);
  if (pieces.length < 2 || pieces.length > 3) return [question];
  const asks = /[QWER]|궁|쿨|정복자|점화|템|효과|가격|한타|라인전|어떻게|알려|ability|cooldown|rune|item|技能|冷却|团战/i;
  return pieces.every(q => asks.test(q)) ? pieces : [question];
}

function clarificationText(pending: NonNullable<DialogueMemory["pending"]>, ctx: PlanContext): string {
  const names = pending.candidates.map(id => ctx.data!.cardById.get(id)?.name).filter(Boolean).join(" / ");
  if (ctx.lang === "en_US") return names ? `Whose ${pending.slot} do you mean: ${names}?` : "Which champion and ability do you mean?";
  if (ctx.lang === "zh_CN") return names ? `你指的是谁的 ${pending.slot}：${names}？` : "你指的是哪个英雄的哪个技能？";
  return names ? `${pending.slot}는 누구의 스킬인가요? ${names} 중에서 알려주세요.` : "어느 챔피언의 어떤 스킬을 말하나요?";
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

async function matchupPlan(question: string, memory: DialogueMemory, ctx: PlanContext, deps: PlanDeps): Promise<AnswerPlan | undefined> {
  if (!ctx.data) return undefined;
  const pair = pairForQuestion(question, memory, ctx);
  if (!pair) return undefined;
  const names = pair.map(c => c.name);
  const same = memory.matchup?.mine === pair[0].id && memory.matchup.enemy === pair[1].id;
  // 주제 없는 조언 요청("팁 좀 줘", "tips")은 같은 쌍의 남은 칸이다. "팁" 이 주제 낱말(general)로 잡혀 첫 답을 되풀이했다(2026-10-01 브라우저 시험).
  const reason = dialogueAct(question) === "more" || (same && GENERIC_ADVICE.test(question));
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

function ruleEllipsis(question: string, memory: DialogueMemory, ctx: PlanContext): AnswerPlan | undefined {
  if (ctx.lang !== "ko_KR" || memory.active !== "rule" || !memory.rule?.title.includes("관통")) return undefined;
  if (!/그거|그럼|관통/.test(question) || !/평타|기본\s*공격/.test(question)) return undefined;
  const source = ctx.data!.mechanics.find(m => m.id === "저항과-피해-감소");
  if (!source?.text.includes("방어력은 물리 피해")) return undefined;
  return { type: "code", answer: { kind: "text", text: "물리 피해인 기본 공격에는 적용됩니다. 물리 관통력과 방어구 관통력은 방어력을 계산할 때 쓰므로, 같은 공격에 섞인 마법 피해나 고정 피해에는 적용되지 않습니다." } };
}

function rememberPlan(memory: DialogueMemory, plan: AnswerPlan): DialogueMemory {
  if (plan.type === "matchup") {
    const changed = memory.matchup?.mine !== plan.mine.id || memory.matchup.enemy !== plan.enemy.id;
    return { ...memory, active: "matchup", matchup: { mine: plan.mine.id, enemy: plan.enemy.id, focus: plan.focus }, conditions: changed ? [] : memory.conditions, pending: undefined };
  }
  if (plan.type === "card" || (plan.type === "code" && typeof plan.answer !== "string")) return rememberAnswer(memory, plan.answer as Exclude<typeof plan.answer, string>);
  if (plan.type === "code" && typeof plan.answer === "string") {
    const title = /^###\s+([^\n]+)/.exec(plan.answer)?.[1];
    if (title) return { ...memory, active: "rule", rule: { title, text: plan.answer } };
  }
  return memory;
}

function applyFactMemory(memory: DialogueMemory, resolution: FactResolution, plan: AnswerPlan): DialogueMemory {
  const next = rememberPlan(memory, plan);
  if (resolution.numeric !== undefined) next.numeric = resolution.numeric;
  if (resolution.relation && next.spell) next.spell.relation = resolution.relation;
  if (plan.type === "code" && typeof plan.answer !== "string" && plan.answer.kind === "text" && /^스킬 가속|^기본 .*스킬 가속/.test(plan.answer.text)) {
    next.active = "rule";
    next.rule = { title: "스킬 가속", text: plan.answer.text };
  }
  return next;
}

function conditionOwner(question: string, memory: DialogueMemory, ctx: PlanContext): "mine" | "enemy" | undefined {
  if (!memory.matchup) return undefined;
  const slot = /[QWER]/.exec(question)?.index;
  if (slot === undefined) return undefined;
  const before = question.slice(0, slot);
  const named = detectChampions(ctx.data!, before).sort((a, b) => before.lastIndexOf(a.name) - before.lastIndexOf(b.name));
  const last = named[named.length - 1];
  return last?.id === memory.matchup.mine ? "mine" : last?.id === memory.matchup.enemy ? "enemy" : undefined;
}

export async function planDialogue(question: string, ctx: PlanContext, deps: PlanDeps, variant: DialogueVariant = "memory"): Promise<DialoguePlan> {
  if (!ctx.data) return { parts: [{ question, plan: await planAnswer(question, ctx, deps) }], memory: { patch: "", conditions: [] } };
  let memory = dialogueMemoryOf(ctx.turns, ctx.data);
  const parts: DialoguePlan["parts"] = [];
  const questions = variant === "decompose" || variant === "combined" ? splitDialogueQuestions(question) : [question];
  for (const part of questions) {
    const fact = resolveDialogueFact(part, memory, ctx);
    const asksCompare = /비교|둘\s*중|둘|both|compare|比较|两个/i.test(part);
    const shouldAsk = fact?.pending && (!fact.pending.candidates.length || fact.pending.candidates.length > 1 && !asksCompare);
    if (shouldAsk && (variant === "clarify" || variant === "combined")) {
      memory.pending = fact.pending;
      return { parts, memory, clarification: clarificationText(fact.pending!, ctx) };
    }
    let plan = fact?.plan ?? ruleEllipsis(part, memory, ctx) ?? await matchupPlan(part, memory, ctx, deps);
    plan ??= await planAnswer(part, ctx, deps);
    if (plan.type === "retry") plan = await planAnswer(plan.question, ctx, deps);
    memory = fact ? applyFactMemory(memory, fact, plan) : rememberPlan(memory, plan);
    if (memory.active === "matchup") memory.conditions = scenarioConditions(part, memory.conditions, ctx.turns.length, conditionOwner(part, memory, ctx));
    parts.push({ question: part, plan });
  }
  return { parts, memory };
}
