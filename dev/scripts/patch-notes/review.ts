import { SPECIFIC_DEFINITIONS, VALUE_DEFINITIONS } from "./metricLabels";
import type { NumericChampion } from "./sourceTypes";
import { sameNumbers } from "./diff";

export interface UnmappedPatchChange {
  championId: string;
  sourceKey: string;
  before: number[];
  after: number[];
}

function mapped(championId: string, spellPath: string, group: "values" | "calculations", key: string): boolean {
  if (group === "values" && VALUE_DEFINITIONS[key]) return true;
  // 이 계산식은 이미 비교하는 FioraR의 Ratio 값을 같은 계수로 한 번 더 보관한다.
  if (championId === "Fiora" && group === "calculations" && key === "/HealPerSecondCalc/mFormulaParts/1/mCoefficient") return true;
  return SPECIFIC_DEFINITIONS.some(definition => definition.championId === championId &&
    spellPath.split("/").at(-1) === definition.spellName && definition.group === group && definition.keys.includes(key));
}

export function findUnmappedChanges(before: Record<string, NumericChampion>, after: Record<string, NumericChampion>): UnmappedPatchChange[] {
  const changes: UnmappedPatchChange[] = [];
  for (const [championId, champion] of Object.entries(after)) {
    for (const [spellPath, spell] of Object.entries(champion.spells)) {
      const previous = before[championId]?.spells[spellPath];
      if (!previous) continue;
      for (const group of ["values", "calculations"] as const) {
        for (const [key, values] of Object.entries(spell[group])) {
          const old = previous[group][key];
          if (!old || sameNumbers(old, values) || mapped(championId, spellPath, group, key)) continue;
          if (group === "calculations" && !/\/(mCoefficient|mNumber|mStartValue|mEndValue|mLevel1Value|values)$/.test(key)) continue;
          changes.push({ championId, sourceKey: `${spellPath}/${group}/${key.replace(/^\//, "")}`, before: old, after: values });
        }
      }
    }
  }
  return changes;
}
