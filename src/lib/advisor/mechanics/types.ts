/** 승인 계약은 타입으로만 공유한다. 브라우저 번들에는 작성 도구가 들어가지 않는다. */
import type { Draft, Job, Slot, SourceNumber } from "../../../../scripts/llm/champion-mechanics/contract";
export type { Condition, Effect, Rule, Slot, Parameter } from "../../../../scripts/llm/champion-mechanics/contract";

export type AbilityJob = Pick<Job, "id" | "champion" | "slot" | "patch" | "sourceHash" | "slotRole" | "variants" | "facts"> & { numbers: Array<Pick<SourceNumber, "id" | "value" | "percent">> };
export interface Ability { job: AbilityJob; draft: Draft }
export interface AbilityBundle { schemaVersion: 2; patch: string; abilities: Ability[] }
export type Topic = "control_resistance" | "conversion" | "shield" | "movement" | "control" | "heal" | "stats" | "stack" | "summon";
export interface MechanicMemory {
  abilityId: string;
  sourceHash: string;
  topic?: Topic;
  ruleIndices: number[];
  amount?: { value: number; stat: "bonusHealth" | "abilityPower"; count: number };
  targetType?: "champion" | "minion" | "monster" | "structure";
  followupStatus?: "cancelled" | "fired";
  shieldReady?: "ready" | "down";
  hitCount?: number;
}
export function abilityIndex(bundle: AbilityBundle | undefined, patch: string): Map<string, Ability> {
  if (!bundle || bundle.schemaVersion !== 2 || bundle.patch !== patch) return new Map();
  return new Map(bundle.abilities.filter(a => a.job.patch === patch && a.job.sourceHash && a.job.id === `${a.job.champion}.${a.job.slot}`)
    .map(a => [a.job.id, a]));
}
export function validMechanicMemory(memory: MechanicMemory, index?: Map<string, Ability>): boolean {
  const ability = index?.get(memory.abilityId);
  return Boolean(ability && ability.job.sourceHash === memory.sourceHash && Array.isArray(memory.ruleIndices)
    && memory.ruleIndices.every(i => Number.isInteger(i) && i >= 0 && i < ability.draft.rules.length)
    && (!memory.amount || ["bonusHealth", "abilityPower"].includes(memory.amount.stat)
      && Number.isFinite(memory.amount.value) && memory.amount.value >= 0 && Number.isInteger(memory.amount.count) && memory.amount.count > 0)
    && (memory.hitCount === undefined || Number.isInteger(memory.hitCount) && memory.hitCount >= 0));
}
export function abilitySlot(id: string): Slot { return id.slice(-1) as Slot; }
