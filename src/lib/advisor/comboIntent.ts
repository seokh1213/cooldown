import { requestedContent } from "./requestText";

/** 버튼 순서 질문은 스킬 전체 소개와 구분한다. */
export function asksCombo(question: string): boolean {
  return /콤보|연계|\bcombos?\b|连招|回旋踢|\binsec\b|스킬.*(?:순서|이어\s*(?:써|쓰))|버튼.*(?:순서|이어\s*눌)|buttons?.*(?:follow each other|order|sequence)|\bsequence\b.*\b(?:spells?|abilities|skills)\b|(?:어느|무슨)\s*버튼.*(?:먼저|다음)|(?:技能|按键|按钮).*(?:顺序|衔接)|先按.*再按|(?:[QWER]\s*[,→+\s]\s*)+[QWER].*순서/i.test(requestedContent(question));
}
