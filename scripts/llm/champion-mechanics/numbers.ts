import type { SourceDoc, SourceNumber } from "./contract";
const CARDINAL: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
/** 모델이 수치를 새로 쓰지 않고 출처의 숫자를 참조하도록 번호를 붙인다. */
export function sourceNumbers(sources: SourceDoc[]): SourceNumber[] {
  return sources.flatMap(source => {
    const values: SourceNumber[] = [];
    const groups = source.text.matchAll(/-?\b\d+(?:,\d{3})*(?:\.\d+)?(?:\/-?\d+(?:\.\d+)?)*%?|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/gi);
    for (const group of groups) {
      const percent = group[0].endsWith("%");
      for (const token of group[0].matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?%?|[a-z]+/gi)) {
        const start = group.index! + token.index!;
        values.push({ id: `${source.id}:n${values.length}`, sourceId: source.id, raw: token[0],
          value: CARDINAL[token[0].toLowerCase()] ?? Number(token[0].replace(/[,%]/g, "")), percent, start, end: start + token[0].length });
      }
    }
    return values;
  });
}
export function numericValue(number: SourceNumber): number { return number.percent ? number.value / 100 : number.value; }
