import type { ResolvedQuestion } from "./resolvedQuestion";
import type { PlanContext, PlanDeps, AnswerPlan } from "./planTypes";
import type { DialogueMemory } from "./dialogueState";
import { passiveMechanicPlan } from "./passiveMechanicPlan";
import { knowledgeFactPlan } from "./knowledgeFactPlan";
import { comboAdvicePlan } from "./comboPlan";
import { buildItemCard } from "./context";
import { asksScenarioAdvice, asksMatchup, asksWholeKit, asksSkillHandling, asksGenericAdvice } from "./askWords";
import { asksCombo } from "./comboIntent";
import { dialogueStatPlan } from "./dialogueStats";
import { requestIntentPlan } from "./requestIntentPlan";
import { matchupPlan } from "./dialogueMatchup";
import { abilityBoundaryPlan } from "./abilityBoundaryPlan";
import { penetrationCalculation } from "./dialogueRules";
import { answerRuleQuestion } from "./knowledgePlans";
import { askedRules } from "./questionDocs";
import { championNotes } from "./playbookNotes";
import { sideOfNewName } from "./conversation";
import { topicFromWords } from "./topicJudge";
import { asksSpellNumbers } from "./spellFocus";
import { resolveDialogueFact } from "./dialogueFacts";
import { itemKnowledgeGap } from "./itemKnowledgeGap";
import { effectSourcesPlan } from "./mechanics/effectSources";

export async function selectDialogueEvidence(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext, deps: PlanDeps) {
  const question = resolved.text;
  const sources = effectSourcesPlan(resolved, ctx, memory);
  if (memory.pending && resolved.champions.length === 1 && memory.pending.candidates.includes(resolved.champions[0].id)
    && (!resolved.slot || resolved.slot === memory.pending.slot) && !asksScenarioAdvice(question)) {
    const confirmed = resolveDialogueFact(resolved, memory, ctx);
    if (confirmed?.plan) return { preferred: confirmed.plan };
  }
  const mechanic = ctx.data!.abilityRules?.size
    ? (await import("./mechanics/plan")).approvedMechanicPlan(resolved, ctx, memory) : undefined;
  const passive = passiveMechanicPlan(resolved, ctx, memory);
  const gap = itemKnowledgeGap(question, ctx);
  const knowledge = gap ?? knowledgeFactPlan(resolved, ctx, memory);
  const combo = comboAdvicePlan(resolved, ctx, memory);
  const item = !(resolved.champions.length && !/아이템|\bitem\b|장비|\bgear\b|装备|买|出|가격|골드|구매|사도|살까|사야|\b(?:gold|buy|bought|costs?|price)\b/i.test(question))
    && (!resolved.champions.length && memory.active !== "matchup" || !asksScenarioAdvice(question)
      || !memory.matchup && resolved.champions.length < 2 && /사도|구매|\bbuy\b|买/i.test(question) && !asksMatchup(question))
    ? buildItemCard(ctx.data!, question) : undefined;
  const itemPlan: AnswerPlan | undefined = item ? { type: "card", answer: item } : undefined;
  const asksCompleteStats = resolved.requestIntent?.scope === "statsAll"
    && /(?:기본\s*)?(?:능력치|스탯)\s*(?:를|는|도|까지)?\s*(?:전체|전부|모두|싹)|(?:스탯|능력치)들|\ball\s+(?:base\s+)?stats\b|全部属性/i.test(question);
  const numeric = asksCompleteStats ? undefined : dialogueStatPlan(resolved, memory, ctx);
  const learned = numeric ? undefined : requestIntentPlan(resolved, memory, ctx);
  const newChampion = resolved.champions.length === 1 && memory.matchup
    && ![memory.matchup.mine, memory.matchup.enemy].includes(resolved.champions[0].id);
  const standaloneGuide = newChampion && !numeric && !mechanic && !passive && !asksWholeKit(question) && !asksSpellNumbers(question)
    && asksScenarioAdvice(question) && !namedGameplayRequest(question) && !explicitMatchupChange(question)
    ? scenarioChampion(resolved, ctx) : undefined;
  const priorChampion = memory.active === "champion" && memory.champion ? ctx.data!.cardById.get(memory.champion) : undefined;
  const championFollowup: AnswerPlan | undefined = priorChampion && !resolved.champions.length && asksGenericAdvice(question)
    && !asksMatchup(question) && !/아까|다시.*상성|back to|returning to|回到|之前.*对局/i.test(question)
    ? { type: "card", answer: { kind: "champion", card: priorChampion,
      notes: championNotes(ctx.data!, priorChampion, question, "playing", { topic: topicFromWords(question), perspective: "playing" }) } } : undefined;
  const scenario = !standaloneGuide && !championFollowup && (asksScenarioAdvice(question) || asksMatchup(question) || resolved.champions.length > 1) && !numeric && !asksWholeKit(question) && !asksSpellNumbers(question)
    ? await matchupPlan(resolved, memory, ctx, deps) : undefined;
  const soloScenario = !scenario && !numeric && !mechanic && resolved.champions.length === 1 && !memory.matchup
    && asksScenarioAdvice(question) && !asksWholeKit(question) && !asksCombo(question) && !asksSkillHandling(question) && !asksSpellNumbers(question)
    && !namedGameplayRequest(question)
    ? scenarioChampion(resolved, ctx) : undefined;
  const namedRule = askedRules(ctx.data!, question).some(rule => rule.subject !== "gameplay");
  const rule = !numeric && !scenario && !resolved.slot && !mechanic && !passive && !asksWholeKit(question)
    && (!resolved.champions.length || namedRule && !asksScenarioAdvice(question))
    ? answerRuleQuestion({ question, ctx, data: ctx.data!, matchup: undefined }) : undefined;
  // 명확한 챔피언 수치 조회를 일반 규칙 문서의 어휘 겹침보다 먼저 처리한다.
  const itemStat = item && /강인함|tenacity|韧性/i.test(question) && !/CC|기절|제압|에어본|stun|suppress|airborne|眩晕|压制|击飞/i.test(question);
  const control = knowledge?.controlContext && mechanic?.memory.topic !== "control_resistance" ? knowledge : undefined;
  const kit = asksWholeKit(question) && !asksSpellNumbers(question) ? learned : undefined;
  const preferred = gap ?? abilityBoundaryPlan(resolved, ctx) ?? sources ?? penetrationCalculation(question, ctx) ?? kit ?? (itemStat ? itemPlan : undefined) ?? control ?? standaloneGuide ?? championFollowup ?? scenario ?? soloScenario ?? (combo && (asksCombo(question) || memory.active === "champion" && memory.combo) ? combo : undefined) ?? (!numeric && knowledge?.type === "code" && knowledge.knowledge ? knowledge : undefined) ?? itemPlan ?? rule ?? mechanic?.plan ?? passive ?? learned ?? combo
    ?? (knowledge?.controlContext && mechanic?.memory.topic !== "control_resistance" ? knowledge : undefined) ?? mechanic?.plan ?? (numeric ? undefined : knowledge) ?? passive
    ?? (resolved.matchup ? await matchupPlan(resolved, memory, ctx, deps) : undefined);

  return { preferred, numeric, learned, passive, mechanic, combo };
}

function namedGameplayRequest(question: string): boolean {
  return /룬|\brune\b|符文|강타|smite|惩戒|선제공격|grasp|不灭之握|召唤师技能/i.test(question);
}

function scenarioChampion(resolved: ResolvedQuestion, ctx: PlanContext): AnswerPlan {
  const card = resolved.champions[0];
  const side = sideOfNewName(resolved.text, [card.name, card.id, ...(ctx.data!.aliases.get(card.id) ?? [])]);
  const perspective = side === "mine" ? "playing" : "against";
  return { type: "card", answer: { kind: "champion", card,
    notes: championNotes(ctx.data!, card, resolved.text, perspective, { topic: topicFromWords(resolved.text), perspective }) } };
}

function explicitMatchupChange(question: string): boolean {
  const change = question.replace(/거리[^.!?]*어떻게\s*잡아/g, "");
  return /상대가|상대로|만나면|어떻게\s*(?:잡아|상대)|언제.*(?:들어|물|진입)|점멸.*빠지|대신|바꾸|바꿔|바꿨어|내가|내\s*챔피언|하면|골라|픽|\b(?:against|into|vs|as|switch|instead|i (?:am|play)|im|would)\b|deal with|when.*(?:go in|engage|all.in)|flash.*down|对面|换|我是|我玩|怎么打|什么时候.*(?:切|开|进)|闪现.*没|被.*压|怎么抓|团战怎么抓/i.test(change);
}
