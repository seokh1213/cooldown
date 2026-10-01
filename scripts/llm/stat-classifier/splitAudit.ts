import type { Example } from "./contracts";

/** 표현 계열과 띄어쓰기를 지운 실제 입력이 split을 넘지 않는지 검사한다. */
export function auditSplits(rows: Example[]) {
  const families = new Map<string, Set<string>>();
  const inputs = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const [map, key] of [
      [families, row.family],
      [inputs, `${row.question.toLowerCase().replace(/\s/g, "")}|${row.memory.active ?? "none"}`],
    ] as const) {
      const splits = map.get(key) ?? new Set<string>();
      splits.add(row.split);
      map.set(key, splits);
    }
  }
  const familyOverlap = [...families.values()].filter(splits => splits.size > 1).length;
  const inputOverlap = [...inputs.values()].filter(splits => splits.size > 1).length;
  if (familyOverlap || inputOverlap) throw Error(`split 중복: 계열 ${familyOverlap}, 입력 ${inputOverlap}`);
  return { families: families.size, familyOverlap, compactInputOverlap: inputOverlap };
}
