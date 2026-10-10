/** 원문과 후보가 같은 경우에만 이미 통과한 새 답변 기준을 유지한다. */
import type { ReviewedAbility } from "./retrieval";
import { digest } from "./sources";
export interface QualityReference {
  questionHash: string;
  passed: Array<{ id: string; turn: number; abilityId: string; sourceHash: string; candidateHash: string }>;
}
export function qualityFailures(options: { questionHash: string; index: Map<string, ReviewedAbility>; reference: QualityReference;
  rows: Array<{ id: string; turn: number; variant: { pass: boolean } }> }): string[] {
  if (options.questionHash !== options.reference.questionHash) throw new Error("Quality rubric changed; explicitly review and update its reference");
  return options.reference.passed.filter(ref => {
    const current = options.index.get(ref.abilityId);
    return current?.job.sourceHash === ref.sourceHash && digest(current.draft) === ref.candidateHash;
  }).filter(ref => !options.rows.find(row => row.id === ref.id && row.turn === ref.turn)?.variant.pass)
    .map(ref => `${ref.id}:${ref.turn}`);
}
