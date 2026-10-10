import type { Draft, Job } from "../../../../src/domain/knowledge/notes/mechanicsContract";

/** 코드가 이미 인용된 원문에 있는 숫자의 문장만 보충한다. 값·참조 ID·조건·효과는 고치지 않는다. */
export function completeNumberEvidence(job: Job, original: Draft) {
  const draft = structuredClone(original);
  let additions = 0;
  for (const rule of draft.rules) {
    const refs = [...rule.conditions.flatMap(condition => condition.value.kind === "number_ref" ? [condition.value.ref] : []),
      ...rule.effects.flatMap(effect => effect.parameters.flatMap(parameter => parameter.numberRefs))];
    for (const ref of new Set(refs)) {
      const number = job.numbers.find(item => item.id === ref);
      if (!number || !rule.evidence.some(item => item.sourceId === number.sourceId)) continue;
      const source = job.sources.find(item => item.id === number.sourceId)!;
      const boundaries = [...source.text.matchAll(/[.!?](?=\s|$)/g)].map(match => match.index! + 1);
      const start = Math.max(0, ...boundaries.filter(boundary => boundary <= number.start));
      const end = boundaries.find(boundary => boundary >= number.end) ?? source.text.length;
      const quote = source.text.slice(start, end).trim();
      if (!rule.evidence.some(item => item.sourceId === source.id && item.quote.includes(quote))) {
        rule.evidence.push({ sourceId: source.id, quote });
        additions++;
      }
    }
  }
  return { draft, additions };
}
