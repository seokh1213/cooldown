/** 대화 기억. 사용자가 말한 조건과 조회 대상을 보관하며 게임의 실시간 상태로 취급하지 않는다. */
import type { AdvisorAnswer } from "./answer";
import type { AdvisorData } from "./context";
import { detectSlot } from "./context";
import { detectSpellFocus, type SpellFocus } from "./spellFocus";

export interface SpellReference { champion: string; slot: string; focus?: SpellFocus; relation?: "penetration" }
export interface ScenarioCondition {
  owner: "mine" | "enemy";
  slot: string;
  status: "ready" | "down";
  hypothetical: boolean;
  turn: number;
}
export interface DialogueMemory {
  patch: string;
  active?: "matchup" | "spell" | "item" | "rule";
  matchup?: { mine: string; enemy: string; focus?: string };
  spell?: SpellReference;
  compared?: string[];
  item?: string;
  rule?: { title: string; text: string };
  numeric?: { haste?: number; rank?: number };
  conditions: ScenarioCondition[];
  pending?: { slot: string; focus?: SpellFocus; candidates: string[] };
  lastReply?: { question: string; text: string; focus?: string };
}
export interface DialogueHistoryTurn {
  role: "user" | "assistant" | "system";
  content?: string;
  answer?: AdvisorAnswer;
  memory?: DialogueMemory;
}

export function emptyDialogue(patch: string): DialogueMemory {
  return { patch, conditions: [] };
}

function validMemory(memory: DialogueMemory, data: AdvisorData): boolean {
  if (memory.patch !== data.patch || !Array.isArray(memory.conditions)) return false;
  if (memory.matchup && (!data.cardById.has(memory.matchup.mine) || !data.cardById.has(memory.matchup.enemy))) return false;
  if (memory.spell && !data.cardById.get(memory.spell.champion)?.spells.some(s => s.slot === memory.spell!.slot)) return false;
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
    if (turn.content) memory.lastReply = { question, text: turn.content, focus: memory.matchup?.focus };
  }
  return memory;
}

export function rememberAnswer(previous: DialogueMemory, answer: AdvisorAnswer): DialogueMemory {
  const memory = structuredClone(previous);
  if (answer.kind === "compare" && answer.matchup) {
    const [mine, enemy] = answer.cards;
    const changed = memory.matchup?.mine !== mine.id || memory.matchup.enemy !== enemy.id;
    memory.matchup = { mine: mine.id, enemy: enemy.id, focus: answer.notes?.plan?.focus };
    memory.active = "matchup";
    if (changed) { memory.conditions = []; memory.pending = undefined; }
  } else if (answer.kind === "spell") {
    memory.spell = { champion: answer.championId, slot: answer.spell.slot, focus: answer.focus };
    memory.active = "spell";
    memory.pending = undefined;
    memory.compared = undefined;
  } else if (answer.kind === "compare" && answer.slot) {
    memory.compared = answer.cards.map(card => card.id);
    memory.spell = { champion: answer.cards[0].id, slot: answer.slot, focus: "cooldown" };
    memory.active = "spell";
  } else if (answer.kind === "item") {
    memory.item = answer.itemId;
    memory.active = "item";
  } else if (answer.kind === "rule") {
    memory.rule = { title: answer.rule.name, text: [...answer.highlighted, ...answer.rest].join("\n") };
    memory.active = "rule";
  }
  return memory;
}

/** 조건은 사용자 정정을 반영한다. 다른 상성으로 바뀌면 rememberAnswer가 비운다. */
export function scenarioConditions(question: string, previous: ScenarioCondition[], turn: number, ownerHint?: ScenarioCondition["owner"]): ScenarioCondition[] {
  if (/(?:조건|가정).*(?:초기화|잊어|지워|취소|없던)/.test(question)) return [];
  const correction = /정정|아니|잘못|correction|actually|更正|不是/i.test(question);
  const conditions = correction ? [] : [...previous];
  let owner = ownerHint;
  for (const clause of question.split(/[,.;]|고\s+|면\s+/)) {
    if (/상대|enemy|对面/.test(clause)) owner = "enemy";
    else if (/내\s*[QWER]|\bmy\b|我的/.test(clause)) owner = "mine";
    const slot = detectSlot(clause);
    if (!slot || !owner) continue;
    const down = /빠졌|빠진|빠지면|없으면|없고|없어|is down|on cooldown|没了|冷却中/i.test(clause);
    const ready = /살아|남아|는\s*있|가\s*있|준비|사용\s*가능|is up|available|还在|有技能/i.test(clause);
    if (!down && !ready) continue;
    const entry = { owner, slot, status: down ? "down" as const : "ready" as const, hypothetical: /면|if\b|假如|如果/i.test(question), turn };
    const at = conditions.findIndex(c => c.owner === owner && c.slot === slot);
    if (at < 0) conditions.push(entry);
    else conditions[at] = entry;
  }
  return conditions.length || !correction ? conditions : [...previous];
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
  return memory.active === "spell" || memory.pending ? (memory.pending?.focus ?? memory.spell?.focus) : undefined;
}
