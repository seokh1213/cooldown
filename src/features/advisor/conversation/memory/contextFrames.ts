import type { DialogueMemory } from "./dialogueState";
import { dialogueMemoryOf } from "./dialogueState";
import type { PlanContext } from "../../contracts/planTypes";
import { validMechanicMemory } from "../../mechanics/types";
import { mechanicsToText } from "@/domain/knowledge/notes/mechanics";
import { CONTEXT_BUCKETS, MAX_CONTEXT_FRAMES, type ContextBucket, type ContextFrame, type FrameState } from "./contextFrameTypes";

function stateOf(memory: DialogueMemory): FrameState {
  const state: FrameState = { active: memory.active, conditions: [] };
  switch (memory.active) {
    case "stat": state.stat = memory.stat; state.compared = memory.compared; break;
    case "spell":
      state.spell = memory.spell; state.mechanic = memory.mechanic; state.numeric = memory.numeric;
      state.compared = memory.compared; state.control = memory.control;
      if (memory.matchup && memory.spell && [memory.matchup.mine, memory.matchup.enemy].includes(memory.spell.champion)) {
        state.matchup = memory.matchup; state.conditions = memory.conditions;
      }
      break;
    case "item": state.item = memory.item; break;
    case "champion": state.champion = memory.champion; state.combo = memory.combo; break;
    case "compare": state.compared = memory.compared; break;
    case "matchup":
      state.matchup = memory.matchup; state.matchups = memory.matchups;
      state.matchupGroup = memory.matchupGroup; state.matchupScope = memory.matchupScope;
      state.conditions = memory.conditions;
      break;
    case "rule":
      if (memory.rule) {
        const { text: _text, ...reference } = memory.rule;
        state.rule = reference;
      }
      state.control = memory.control; state.numeric = memory.numeric;
      break;
  }
  return structuredClone(state);
}

export function frameKey(state: FrameState): string | undefined {
  switch (state.active) {
    case "stat": return state.stat && `stat:${state.stat.champions.join(",")}`;
    case "spell": return state.spell && `spell:${state.compared?.join(",") ?? state.spell.champion}:${state.spell.slot}`;
    case "item": return state.item && `item:${state.item}`;
    case "champion": return state.champion && `champion:${state.champion}`;
    case "compare": return state.compared?.length ? `compare:${state.compared.join(",")}` : undefined;
    case "matchup": return state.matchup && `matchup:${state.matchup.mine}:${state.matchup.enemy}`;
    case "rule": return state.rule && `rule:${state.rule.id ?? state.rule.title}`;
  }
}

export function restoreFrame(frame: ContextFrame, ctx: PlanContext): DialogueMemory {
  const state = structuredClone(frame.state);
  const reference = state.rule;
  const source = reference && ctx.data?.mechanics.find(note => `mech:${note.id}` === reference.id);
  const rule = reference ? { ...reference, text: source ? mechanicsToText([source], ctx.lang) ?? "" : "" } : undefined;
  return { ...state, patch: frame.patch, rule };
}

export function frameTurnIndex(frame: ContextFrame, ctx: PlanContext): number {
  return ctx.turns.findIndex(turn => turn.role === "assistant" && turn.memory && frameKey(turn.memory) === frame.key
    && turn.memory.contextFrames?.some(candidate => candidate.key === frame.key && candidate.turn === frame.turn));
}

export function usableFrames(memory: DialogueMemory, ctx: PlanContext): ContextFrame[] {
  const limit = ctx.contextLimit ?? MAX_CONTEXT_FRAMES;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CONTEXT_FRAMES) throw new Error("Invalid context limit");
  if (!ctx.data) return [];
  return (memory.contextFrames ?? []).filter(frame => {
    if (frame.patch !== ctx.data!.patch || frame.key !== frameKey(frame.state) || frame.kind !== frame.state.active
      || !Number.isSafeInteger(frame.turn) || frame.turn < 0 || frameTurnIndex(frame, ctx) < 0) return false;
    if (frame.state.mechanic && !validMechanicMemory(frame.state.mechanic, ctx.data!.abilityRules)) return false;
    const restored = dialogueMemoryOf([{ role: "assistant", memory: restoreFrame(frame, ctx) }], ctx.data!);
    return restored.active === frame.kind;
  }).slice(-limit);
}

export function recordFrame(memory: DialogueMemory, frames: ContextFrame[], turn: number, limit = MAX_CONTEXT_FRAMES): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CONTEXT_FRAMES) throw new Error("Invalid context limit");
  const state = stateOf(memory), key = frameKey(state);
  const next: ContextFrame[] = key && memory.active
    ? [...frames.filter(frame => frame.key !== key), { key, kind: memory.active, patch: memory.patch, turn, state }]
    : frames;
  const dropped = next.slice(0, Math.max(0, next.length - limit));
  rememberOmittedFrames(memory, dropped);
  memory.contextFrames = next.slice(-limit);
}

export function frameBucket(frame: ContextFrame): ContextBucket {
  const key = frame.kind === "spell" && frame.state.spell?.slot ? `spell:${frame.state.spell.slot}` : frame.kind;
  return CONTEXT_BUCKETS.includes(key as ContextBucket) ? key as ContextBucket : "spell";
}

export function rememberOmittedFrames(memory: DialogueMemory, frames: ContextFrame[]): void {
  const omitted = new Set([...(memory.contextOmissions ?? []), ...frames.map(frameBucket)]);
  memory.contextOmissions = CONTEXT_BUCKETS.filter(bucket => omitted.has(bucket));
}
