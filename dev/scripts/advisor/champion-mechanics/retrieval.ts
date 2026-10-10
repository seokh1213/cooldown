/** 연구용 검색: 승인·해시·현재 원문을 확인한 스킬 규칙만 반환한다. */
import type { Draft, Job } from "../../../../src/domain/knowledge/notes/mechanicsContract";
import { baselineDirectory, loadBaseline } from "./drift";
import { acceptedReview } from "./export";
import { buildInventory } from "./sources";
import { ROOT } from "./prepare";

export interface ReviewedAbility { job: Job; draft: Draft }
export async function reviewedAbilities(root = ROOT): Promise<Map<string, ReviewedAbility>> {
  const [baseline, current] = await Promise.all([loadBaseline(await baselineDirectory(root)), buildInventory(root)]);
  const currentById = new Map(current.jobs.map(job => [job.id, job]));
  const index = new Map<string, ReviewedAbility>();
  for (const job of baseline.jobs) {
    const draft = baseline.drafts.get(job.id), decision = baseline.decisions.find(item => item.id === job.id);
    const fresh = currentById.get(job.id);
    if (draft && job.patch === current.patch && fresh?.sourceHash === job.sourceHash && fresh.promptHash === job.promptHash
      && acceptedReview(job, draft, decision)) {
      index.set(job.id, { job, draft });
    }
  }
  return index;
}
export { TOPICS, questionTopic, selectRules } from "../../../../src/features/advisor/mechanics/retrieval";
export type { Topic } from "../../../../src/features/advisor/mechanics/types";
