/**
 * 두 낱말이 몇 글자 다른지. 한글 음절 하나가 한 글자다.
 * 짧은 이름끼리 쓰는 것이라 단순 동적 계획법으로 충분하다.
 */
const HANGUL_BASE = 0xac00;
const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNGSEONG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONGSEONG = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

/**
 * 한글을 자모로 푼다. "럼블" → "ㄹㅓㅁㅂㅡㄹ"
 *
 * 한글 한 글자는 자모 두세 개가 합쳐진 것이라, 자음 하나만 틀려도 음절로는 통째로
 * 다른 글자가 된다. 자모로 풀면 그 차이가 1 로 보인다. "제이스 → 재이스" 가
 * 음절로는 첫 글자부터 어긋나지만 자모로는 ㅔ↔ㅐ 하나다.
 */
export function toJamo(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < HANGUL_BASE || code > 0xd7a3) {
      out += ch;
      continue;
    }
    const offset = code - HANGUL_BASE;
    out += CHOSEONG[Math.floor(offset / 588)];
    out += JUNGSEONG[Math.floor((offset % 588) / 28)];
    const jong = JONGSEONG[offset % 28];
    if (jong !== " ") out += jong;
  }
  return out;
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i += 1) {
    let previous = dp[0];
    dp[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = temp;
    }
  }
  return dp[cols - 1];
}
