/**
 * LLM 컨텍스트용 텍스트 유틸리티
 * - 툴팁 HTML 을 평문으로 변환하고 레벨별 수치를 압축 표기한다.
 */

export function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|mainText|stats)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    // 스탯 아이콘 자리 표시 (statIcons.ts) 는 평문에서 의미가 없다
    .replace(/\[\[si:[a-z]+]]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** [8,7.5,7] → "8/7.5/7", 전부 같으면 단일 값 */
export function formatLevels(values: number[] | undefined): string | undefined {
  if (!values || values.length === 0) return undefined;
  const rounded = values.map((v) => round(v));
  if (new Set(rounded).size === 1) return String(rounded[0]);
  return rounded.join("/");
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
