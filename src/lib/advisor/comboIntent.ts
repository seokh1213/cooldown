/** 버튼 순서 질문은 스킬 전체 소개와 구분한다. */
export function asksCombo(question: string): boolean {
  return /콤보|연계|\bcombos?\b|连招|스킬\s*(?:사용\s*)?순서|(?:[QWER]\s*[,→+\s]\s*)+[QWER].*순서/i.test(question);
}
