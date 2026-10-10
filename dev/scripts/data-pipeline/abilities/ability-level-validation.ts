import type { AbilityLevelValues } from "../../../../src/domain/game/contracts/championData";
import { formatLevelRangeLabel } from "../../../../src/domain/game/tooltip/formatting/calculationResultFormatter";
import { LEVEL_ICON } from "../../../../src/domain/game/tooltip/formatting/statIcons";

export interface AbilityLevelIssue {
  reason: "missing-level-values" | "unreferenced-level-values" | "unmatched-level-marker";
  range: string;
}

/** 실제 표시하는 본문의 레벨 범위마다 상세 표 데이터가 있는지 확인한다. */
export function findAbilityLevelIssues(ability: {
  bodyHtml: string;
  levelValues?: AbilityLevelValues[];
}): AbilityLevelIssue[] {
  const text = ability.bodyHtml.replace(/<[^>]*>/g, "");
  const matches = [...text.matchAll(/\((-?[\d.]+%? ~ -?[\d.]+%?)\[\[si:scalelevel]]\)/g)];
  const ranges = new Set(matches.map((match) => `(${match[1]})`));
  const labels = new Set((ability.levelValues ?? []).map(formatLevelRangeLabel));
  const issues: AbilityLevelIssue[] = [];
  for (const range of ranges) {
    if (!labels.has(range)) issues.push({ reason: "missing-level-values", range });
  }
  for (const range of labels) {
    if (!ranges.has(range)) issues.push({ reason: "unreferenced-level-values", range });
  }
  const markers = text.split(LEVEL_ICON).length - 1;
  if (markers !== matches.length) {
    issues.push({ reason: "unmatched-level-marker", range: `${markers} markers / ${matches.length} ranges` });
  }
  return issues;
}
