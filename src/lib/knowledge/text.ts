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

/**
 * 한국어 조사를 앞말의 받침에 맞춰 고른다.
 *
 * "오공가", "레넥톤는" 처럼 어긋나면 사람이 쓴 글로 읽히지 않는다.
 * 한글 음절은 유니코드에서 0xAC00 부터 28개씩 묶여 있고, 그 안에서의 위치가 종성이다.
 */
export function hasFinalConsonant(word: string): boolean {
  const trimmed = word.trim();
  if (!trimmed) return false;
  const code = trimmed.charCodeAt(trimmed.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** 받침 여부에 따라 조사를 붙인다. `josa("오공", "이/가")` → "오공이" */
export function josa(word: string, pair: "은/는" | "이/가" | "을/를" | "와/과" | "로/으로"): string {
  const final = hasFinalConsonant(word);
  // ㄹ 받침은 "으로" 가 아니라 "로" 를 쓴다
  const trimmed = word.trim();
  const lastCode = trimmed ? trimmed.charCodeAt(trimmed.length - 1) : 0;
  const isRieul =
    lastCode >= 0xac00 && lastCode <= 0xd7a3 && (lastCode - 0xac00) % 28 === 8;

  switch (pair) {
    case "은/는":
      return `${word}${final ? "은" : "는"}`;
    case "이/가":
      return `${word}${final ? "이" : "가"}`;
    case "을/를":
      return `${word}${final ? "을" : "를"}`;
    case "와/과":
      return `${word}${final ? "과" : "와"}`;
    case "로/으로":
      return `${word}${final && !isRieul ? "으로" : "로"}`;
  }
}
