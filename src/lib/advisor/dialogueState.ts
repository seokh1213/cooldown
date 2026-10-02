/** 대화 기억. 사용자가 말한 조건과 조회 대상을 보관하며 게임의 실시간 상태로 취급하지 않는다. */
import type { AdvisorAnswer } from "./answer";
import type { AdvisorData } from "./context";
import { detectSpellFocus, type SpellFocus } from "./spellFocus";
import type { AnswerPlan } from "./planTypes";
import type { FactResolution } from "./dialogueFacts";
import { statQueryFromAnswer, isStatLevel, type ChampionStatQuery } from "./statQuery";
export { scenarioConditions } from "./scenarioConditions";

export interface SpellReference { champion: string; slot: string; focus?: SpellFocus; relation?: "penetration" }
export interface ScenarioCondition {
  owner: "mine" | "enemy";
  slot: string;
  status: "ready" | "down";
  hypothetical: boolean;
  turn: number;
}
export interface MatchupContext {
  mine: string;
  enemy: string;
  focus?: string;
  shownTopics?: string[];
  conditions: ScenarioCondition[];
}
export interface DialogueMemory {
  patch: string;
  active?: "matchup" | "champion" | "spell" | "compare" | "stat" | "item" | "rule";
  champion?: string;
  matchup?: { mine: string; enemy: string; focus?: string; shownTopics?: string[] };
  matchups?: MatchupContext[];
  spell?: SpellReference;
  compared?: string[];
  stat?: ChampionStatQuery;
  item?: string;
  rule?: { id?: string; title: string; text: string };
  numeric?: { haste?: number; rank?: number };
  conditions: ScenarioCondition[];
  pending?: { slot: string; focus?: SpellFocus; candidates: string[] };
  lastReply?: { question: string; text: string; focus?: string };
}
export interface DialogueHistoryTurn {
  role: "user" | "assistant" | "system";
  content?: string;
  answer?: AdvisorAnswer;
  answers?: AdvisorAnswer[];
  memory?: DialogueMemory;
}

export function emptyDialogue(patch: string): DialogueMemory {
  return { patch, conditions: [] };
}

function validMemory(memory: DialogueMemory, data: AdvisorData): boolean {
  if (memory.patch !== data.patch || !Array.isArray(memory.conditions)) return false;
  if (memory.matchup && (!data.cardById.has(memory.matchup.mine) || !data.cardById.has(memory.matchup.enemy))) return false;
  if (memory.matchups && (!Array.isArray(memory.matchups) || memory.matchups.some(pair => !data.cardById.has(pair.mine) || !data.cardById.has(pair.enemy) || !Array.isArray(pair.conditions)))) return false;
  if (memory.champion && !data.cardById.has(memory.champion)) return false;
  if (memory.spell && !data.cardById.get(memory.spell.champion)?.spells.some(s => s.slot === memory.spell!.slot)) return false;
  if (memory.stat && (!isStatLevel(memory.stat.level) || !memory.stat.champions.length || memory.stat.champions.some(id => !data.cardById.has(id)))) return false;
  return true;
}

/** 저장된 기억을 복원하고, 이전 버전의 대화는 구조화된 카드에서 읽는다. */
export function dialogueMemoryOf(turns: readonly DialogueHistoryTurn[], data: AdvisorData): DialogueMemory {
  let memory = emptyDialogue(data.patch);
  let question = "";
  for (const turn of turns) {
    if (turn.role === "user") { question = turn.content ?? ""; continue; }
    if (turn.role !== "assistant") continue;
    if (turn.memory && validMemory(turn.memory, data)) memory = structuredClone(turn.memory);
    else if (turn.answer) memory = rememberAnswer(memory, turn.answer);
    if (memory.active === "compare" && !memory.stat && turn.answer) {
      const stat = statQueryFromAnswer(turn.answer);
      if (stat) memory = rememberAnswer(memory, turn.answer);
    }
    if (turn.content) memory.lastReply = { question, text: turn.content, focus: memory.matchup?.focus };
  }
  return memory;
}

export function rememberAnswer(previous: DialogueMemory, answer: AdvisorAnswer): DialogueMemory {
  const memory = structuredClone(previous);
  const stat = statQueryFromAnswer(answer);
  if (stat) {
    memory.stat = structuredClone(stat);
    memory.compared = stat.champions.length > 1 ? [...stat.champions] : undefined;
    memory.spell = undefined;
    memory.pending = undefined;
    memory.active = "stat";
    return memory;
  }
  if (answer.kind === "compare" && answer.matchup) {
    const [mine, enemy] = answer.cards;
    const changed = memory.matchup?.mine !== mine.id || memory.matchup.enemy !== enemy.id;
    memory.matchup = { mine: mine.id, enemy: enemy.id, focus: answer.notes?.plan?.focus, shownTopics: changed ? [] : memory.matchup?.shownTopics };
    memory.active = "matchup";
    if (changed) { memory.conditions = []; memory.pending = undefined; }
  } else if (answer.kind === "spell") {
    memory.spell = { champion: answer.championId, slot: answer.spell.slot, focus: answer.focus };
    memory.active = "spell";
    memory.pending = undefined;
    memory.compared = undefined;
  } else if (answer.kind === "compare") {
    memory.compared = answer.cards.map(card => card.id);
    memory.spell = answer.slot ? { champion: answer.cards[0].id, slot: answer.slot, focus: answer.focus } : undefined;
    memory.active = answer.slot ? "spell" : "compare";
    memory.pending = undefined;
  } else if (answer.kind === "champion") {
    memory.champion = answer.card.id;
    memory.active = "champion";
    memory.compared = undefined;
    memory.spell = undefined;
    memory.pending = undefined;
  } else if (answer.kind === "item") {
    memory.item = answer.itemId;
    memory.active = "item";
  } else if (answer.kind === "rule") {
    memory.rule = { title: answer.rule.name, text: [...answer.highlighted, ...answer.rest].join("\n") };
    memory.active = "rule";
  }
  return memory;
}

export function numericConditions(question: string, previous: DialogueMemory["numeric"]): DialogueMemory["numeric"] {
  const numeric = { ...previous };
  const haste = /(?:스킬\s*)?가속\s*(\d+(?:\.\d+)?)|(?:ability\s*)?haste\s*(\d+(?:\.\d+)?)|技能急速\s*(\d+)/i.exec(question);
  const rank = /([1-5])\s*(?:레벨|랭크)\s*(?:궁|스킬)|(?:궁|스킬)\s*([1-5])\s*(?:레벨|랭크)|rank\s*([1-5])/i.exec(question);
  if (haste) numeric.haste = Number(haste.slice(1).find(Boolean));
  if (rank) numeric.rank = Number(rank.slice(1).find(Boolean));
  if (!haste && numeric.haste !== undefined && /정정|아니|correction|actually|更正/i.test(question)) {
    const correction = /\b(\d+(?:\.\d+)?)\s*(?:으로|로|instead|改)/i.exec(question);
    if (correction) numeric.haste = Number(correction[1]);
  }
  return Object.keys(numeric).length ? numeric : undefined;
}

export function inferredSpellFocus(question: string, memory: DialogueMemory): SpellFocus | undefined {
  if (/가속|haste|急速/i.test(question) && /얼마|줄|초|how|几秒/i.test(question)) return "cooldown";
  const direct = detectSpellFocus(question)?.focus;
  if (direct) return direct;
  if (/몇\s*초|얼마나\s*줄|더\s*빨리\s*돌|how long|几秒/i.test(question)) return "cooldown";
  if (memory.active === "compare") return detectSpellFocus(memory.lastReply?.question ?? "")?.focus;
  return memory.active === "spell" || memory.pending ? (memory.pending?.focus ?? memory.spell?.focus) : undefined;
}

function rememberPlan(memory: DialogueMemory, plan: AnswerPlan): DialogueMemory {
  if (plan.type === "matchup") {
    const changed = memory.matchup?.mine !== plan.mine.id || memory.matchup.enemy !== plan.enemy.id;
    return { ...memory, active: "matchup", matchup: { mine: plan.mine.id, enemy: plan.enemy.id, focus: plan.focus, shownTopics: changed ? [] : memory.matchup?.shownTopics }, conditions: changed ? [] : memory.conditions, pending: undefined };
  }
  if (plan.type === "card" || (plan.type === "code" && typeof plan.answer !== "string")) return rememberAnswer(memory, plan.answer as Exclude<typeof plan.answer, string>);
  if (plan.type === "code" && typeof plan.answer === "string") {
    const title = plan.knowledge?.title ?? /^###\s+([^\n]+)/.exec(plan.answer)?.[1];
    if (title) return { ...memory, active: "rule", rule: { id: plan.knowledge?.id, title, text: plan.answer } };
  }
  return memory;
}

export function rememberDialoguePlan(memory: DialogueMemory, plan: AnswerPlan, resolution?: Pick<FactResolution, "numeric" | "relation">): DialogueMemory {
  const next = rememberPlan(memory, plan);
  if (!resolution) return next;
  if (resolution.numeric !== undefined) next.numeric = resolution.numeric;
  if (resolution.relation && next.spell) next.spell.relation = resolution.relation;
  if (plan.type === "code" && typeof plan.answer !== "string" && plan.answer.kind === "text" && /^스킬 가속|^기본 .*스킬 가속/.test(plan.answer.text)) {
    next.active = "rule";
    next.rule = { title: "스킬 가속", text: plan.answer.text };
  }
  return next;
}
