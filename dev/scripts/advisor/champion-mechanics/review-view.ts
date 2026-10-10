import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Draft, Job } from "../../../../src/domain/knowledge/notes/mechanicsContract";
import { readJson } from "./sources";

/** 검수 화면에는 기존 큰 계산 트리를 빼고, 숫자 참조를 원문값으로 함께 풀어 보여 준다. */
export async function reviewView(out: string, id: string) {
  const [job, draft] = await Promise.all([
    readJson<Job>(path.join(out, "inputs", `${id}.json`)), readJson<Draft>(path.join(out, "candidates", `${id}.json`)),
  ]);
  return buildReviewView(job, draft);
}
export function buildReviewView(job: Job, draft: Draft) {
  const resolve = (ref: string) => job.numbers.find(number => number.id === ref) ?? { missing: ref };
  return { id: job.id, sources: job.sources.map(source => ({ id: source.id, text: source.text, variant: source.variant })),
    summary: draft.summary, gaps: draft.gaps,
    rules: draft.rules.map((rule, index) => ({ ...rule, index,
      conditions: rule.conditions.map(condition => ({ ...condition, number: condition.value.kind === "number_ref" ? resolve(condition.value.ref) : null })),
      effects: rule.effects.map(effect => ({ ...effect, parameters: effect.parameters.map(parameter => ({ ...parameter, numbers: parameter.numberRefs.map(resolve) })) })),
    })) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2]);
  for (const id of process.argv.slice(3)) console.log(JSON.stringify(await reviewView(out, id)));
}
