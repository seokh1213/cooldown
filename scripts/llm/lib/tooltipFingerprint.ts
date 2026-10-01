/** 수치와 수식 표기를 제외하고 사용 조건·효과 문구를 비교한다. */
export function normalizeTooltipText(text: string): string {
  return text
    .replace(/[\d.,/~%()+×÷*−-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
