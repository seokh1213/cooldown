import type { AbilityJob, Condition } from "./types";

export function matchesNumericCondition(condition: Condition, job: AbilityJob, actual: number): boolean | undefined {
  if (condition.value.kind !== "number_ref") return undefined;
  const ref = condition.value.ref;
  const required = job.numbers.find(number => number.id === ref)?.value;
  if (required === undefined) return undefined;
  return {
    eq: actual === required, neq: actual !== required,
    gte: actual >= required, gt: actual > required,
    lte: actual <= required, lt: actual < required,
    present: true, absent: false,
  }[condition.operator];
}
