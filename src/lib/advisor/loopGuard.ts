/**
 * 생성 중 반복 차단
 *
 * 워커가 조각마다 `feed` 를 부르고 참이 나오면 생성을 멈춘다. 평가 하네스도 같은
 * 함수를 쓴다 — 재는 도구와 실제 장치가 달라서 "고리 5건" 이 부풀었던 적이 있다.
 *
 * **문장이 아니라 구간을 센다.**
 *
 * 처음에는 `다.` 로 끝나는 문장이 세 번 나오면 끊었다. 그런데 0.8B 는 문장을 끝내지
 * 않고 쉼표로 이어 가며 되풀이했다.
 *
 *   …라는 점, 그리고 오공이 1레벨 기준 전체 챔피언 중 하위권이라는 점, 그리고 오공이 …
 *
 * `다.` 가 한 번도 안 나오니 검사가 한 번도 돌지 않았고, 상한(2048토큰)까지 3,800자를
 * 채웠다. 그래서 문장 경계와 무관하게 같은 글자 구간이 세 번 나오면 끊는다.
 *
 * 구간 길이는 24자다. 멀쩡한 글에서 24자가 글자 그대로 세 번 겹치는 일은 드물다 —
 * 스킬 이름("오공 R 회전격")은 열 자 안쪽이고 머리말은 두 번뿐이다. 되풀이하는
 * 글은 한 바퀴가 30~60자라 세 바퀴째에서 잡힌다.
 */

export const LOOP_SPAN = 24;
export const LOOP_REPEATS = 3;

export interface LoopGuard {
  /** 새 조각을 받는다. 되풀이를 알아보면 참이다. */
  feed(chunk: string): boolean;
}

/** 공백을 접는다. 줄바꿈 하나 차이로 같은 말이 다른 말이 되지 않게. */
const fold = (text: string) => text.replace(/\s+/g, " ");

export function createLoopGuard(): LoopGuard {
  let flat = "";
  /** 구간 → 마지막으로 센 위치와 횟수 */
  const seen = new Map<string, { at: number; count: number }>();
  let scanned = 0;
  let tripped = false;
  return {
    feed(chunk) {
      if (tripped) return true;
      // 접은 글에 이어 붙인다. 조각 경계에서 공백이 겹치면 한 칸으로 줄인다.
      flat = fold(flat + chunk);
      for (let end = Math.max(scanned, LOOP_SPAN); end <= flat.length; end += 1) {
        const start = end - LOOP_SPAN;
        const span = flat.slice(start, end);
        if (!span.trim()) continue;
        const entry = seen.get(span);
        if (!entry) {
          seen.set(span, { at: start, count: 1 });
          continue;
        }
        // 겹치는 위치는 한 번으로 친다. "ㅋㅋㅋㅋ" 같은 한 글자 되풀이가 곧장 걸리지 않게.
        if (start - entry.at < LOOP_SPAN) continue;
        entry.at = start;
        entry.count += 1;
        if (entry.count >= LOOP_REPEATS) {
          tripped = true;
          scanned = end;
          return true;
        }
      }
      scanned = flat.length + 1;
      return false;
    },
  };
}

/**
 * 끊은 글에서 되풀이된 꼬리를 걷어낸다.
 *
 * 세 번 되풀이된 구간이 **두 번째로** 나온 자리 앞에서 자르고, 거기서 가장 가까운 문장 끝으로
 * 물러난다. 되풀이는 대개 한 문장 안에서 시작하므로 그 문장은 통째로 버린다 —
 * "…라는 점과, 오공이 1레벨 기준" 처럼 끝나지 않은 문장을 화면에 남기지 않는다.
 * 앞에 문장 끝이 없으면 두 번째 자리에서 그냥 자른다.
 */
export function trimLoop(text: string): string {
  const found = findRepeat(text);
  if (found === undefined) return text;
  const head = text.slice(0, found);
  const ends = [...head.matchAll(/[.!?。！？](?=\s|$)|\n\n/g)];
  const last = ends[ends.length - 1];
  const cut = last ? (last.index ?? 0) + last[0].length : found;
  return text.slice(0, cut).trimEnd();
}

/** 세 번 나온 24자 구간의 두 번째 위치. 원문 좌표로 돌려준다. */
function findRepeat(text: string): number | undefined {
  // 원문 좌표를 지키려고 공백을 접지 않고, 비교할 때만 접는다.
  const positions: number[] = [];
  let folded = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = /\s/.test(text[i]) ? " " : text[i];
    if (ch === " " && folded.endsWith(" ")) continue;
    folded += ch;
    positions.push(i);
  }
  const seen = new Map<string, number[]>();
  for (let end = LOOP_SPAN; end <= folded.length; end += 1) {
    const start = end - LOOP_SPAN;
    const span = folded.slice(start, end);
    if (!span.trim()) continue;
    const at = seen.get(span) ?? [];
    if (at.length && start - at[at.length - 1] < LOOP_SPAN) continue;
    at.push(start);
    seen.set(span, at);
    // 세 번 나온 구간이 되풀이의 증거다. 두 번만 나온 말은 강조일 수 있어 기준으로 삼지 않는다.
    if (at.length >= LOOP_REPEATS) return positions[at[1]];
  }
  return undefined;
}
