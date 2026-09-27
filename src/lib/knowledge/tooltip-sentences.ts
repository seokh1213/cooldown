/**
 * 수치 표기를 지운다.
 *
 * 한국어 툴팁은 "A와 B를 얻습니다" 처럼 동사가 절 끝에 온다. 그 사이에 괄호 계수와
 * 등급별 수치가 끼면 낱말 거리가 수십 자로 벌어진다.
 *
 *   람머스 W  "방어력을 (35.1/44/… + (30/…% 방어력)), 마법 저항력을 (…) 얻고"
 *   브라이어 Q "방어력 및 마법 저항력을 10/12.5/15/17.5/20% 감소시킵니다"
 *
 * 창을 넓히면 상관없는 뒷절까지 들어온다. 재기 전에 수치를 지워 낱말만 남긴다.
 */
export function withoutNumbers(sentence: string): string {
  return sentence.replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, " ").replace(/[\d.,/~%\s]{2,}/g, " ");
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=니다\.?)\s+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isMinionOnly(sentence: string): boolean {
  const mentionsMinion = /미니언|몬스터/.test(sentence);
  // 복수형을 빠뜨리면 안 된다. 클레드 E 의 "경로 상에 있는 적들에게 … 물리 피해를
  // 입히고, 미니언과 작은 몬스터를 …" 가 통째로 미니언 전용으로 걸러져 피해 유형이
  // 사라졌다. 이 판정은 회복·체력 비례·은신·피해 면역이 모두 함께 쓴다.
  const mentionsChampion = /챔피언|적들|적에게|적을|적이|대상/.test(sentence);
  return mentionsMinion && !mentionsChampion;
}
