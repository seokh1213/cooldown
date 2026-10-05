/** 콤보 노트의 고정 형식. 버튼 순서와 사용 조건을 함께 검수한다. */
export interface ComboPattern {
  id: string;
  title: string;
  keys: string[];
  tip: string;
  origin: "published" | "ability-composition";
  sourceUrl: string;
}

export interface ComboGuide {
  champion: string;
  abilityTextHash: string;
  sources: Array<{ url: string; kind: "combo-guide" | "usage-guide" }>;
  patterns: ComboPattern[];
  laning?: { text: string; sourceUrl: string };
}

export interface ComboGuideFile {
  schemaVersion: 1;
  reviewedAt: string;
  patch: string;
  champions: ComboGuide[];
}

export function comboSlots(keys: string[]): string[] {
  return [...new Set(keys.flatMap(key => [...key.matchAll(/[QWER]/g)].map(match => match[0])))];
}

export function renderComboPattern(pattern: ComboPattern): string {
  return `- **${pattern.title}:** \`${pattern.keys.join(" → ")}\` — ${pattern.tip}`;
}
