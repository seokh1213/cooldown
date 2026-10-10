/** 두 문장이 사실상 같은 말인가. 어절이 얼마나 겹치는지로 본다. 문장 a 의 낱말 중 b 에도 있는 비율. */
export function overlap(a: string, b: string): number {
  const words = a.split(/\s+/).filter((word) => word.length > 1);
  const other = new Set(b.split(/\s+/).filter((word) => word.length > 1));
  if (words.length === 0) return 0;
  return words.filter((word) => other.has(word)).length / words.length;
}

/** 노트를 거의 그대로 옮긴 문장으로 보는 겹침(`overlap`) 문턱. 근거 검사의 "note" 판정과 평가의 노트 베끼기 셈이 함께 쓴다. */
export const NOTE_COPY_OVERLAP = 0.7;
