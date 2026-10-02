/** 대상·항목의 언급 직후에 붙은 편집 지시. 제외한 이름을 조회 대상으로 다시 넣지 않는다. */
export function excludesMention(question: string, end: number): boolean {
  return /^(?:은|는|이|가|을|를|도)?\s*(?:말고|제외|빼(?:고|줘|주세요)|except\b|exclude\b|不要|除外)/i.test(question.slice(end));
}

export function addsSelection(question: string): boolean {
  return /도\s*(?:같이|추가|비교|[?？.!]|$)|추가|\balso\b|as well|也|加上/i.test(question);
}
