/** 정정 뒤의 요청 범위만 판정한다. 원문과 챔피언 언급 위치는 그대로 유지한다. */
export function requestedContent(question: string): string {
  const corrections = [...question.matchAll(/말고|아니라(?!면)|\b(?:instead|rather)\b|而是|改问|只想/g)];
  const correction = corrections[corrections.length - 1];
  if (correction) return question.slice(correction.index! + correction[0].length).trim();
  return question.replace(/\bnot\s+asking\s+for[^,;]+[,;]\s*(?:just\s*)?/i, "")
    .replace(/[,，]\s*不用列[^。？?]+[。？?]?/g, "");
}
