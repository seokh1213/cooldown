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

