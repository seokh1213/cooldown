/** 툴팁과 규칙 본문의 문장 경계와 키워드 선택. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.다]\.)\s+|(?<=습니다\.)|(?<=입니다\.)|(?<=됩니다\.)|(?<=합니다\.)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 문장 중 낱말이 들어 있는 것만. 순서는 원문대로. */
export function sentencesWith(text: string, keywords: string[]): string[] {
  if (keywords.length === 0) return [];
  return splitSentences(text).filter((sentence) => keywords.some((word) => sentence.includes(word)));
}


/** 받침 유무로 조사를 고른다. "보호막는" 처럼 나가면 답이 어설퍼 보인다. */
export function withParticle(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.charCodeAt(word.length - 1);
  const hasFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${word}${hasFinal ? withFinal : withoutFinal}`;
}

/**
 * 설명문에서 그 낱말이 나온 문장을 찾는다. 판정의 근거로 함께 보여 준다.
 * 근거 없이 "네/아니오" 만 내면 사용자가 확인할 방법이 없다.
 */
export function sentenceWith(body: string, term: string): string | undefined {
  return body
    .split(/\n|(?<=니다\.)\s*/)
    .map((line) => line.trim())
    .find((line) => line.includes(term));
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
