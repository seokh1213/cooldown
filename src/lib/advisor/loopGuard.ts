/**
 * 생성 중 반복 차단
 *
 * 워커가 조각마다 `feed` 를 부르고 참이 나오면 생성을 멈춘다. 평가 하네스도 같은
 * 함수를 쓴다 — 재는 도구와 실제 장치가 달라서 "고리 5건" 이 부풀었던 적이 있다.
 */

export interface LoopGuard {
  /** 새 조각을 받는다. 되풀이를 알아보면 참이다. */
  feed(chunk: string): boolean;
}

/**
 * 같은 문장이 세 번 나오면 고장난 것으로 본다. 두 번은 강조하느라 그럴 수
 * 있지만 세 번은 아니다. 문장 단위라서 멀쩡한 글을 자를 위험이 낮다.
 */
export function createLoopGuard(): LoopGuard {
  let text = "";
  const said = new Map<string, number>();
  const looping = (whole: string): boolean => {
    const parts = whole.split(/(?<=다\.)\s+/);
    // 마지막 조각은 아직 쓰는 중이라 세지 않는다
    for (const part of parts.slice(0, -1)) {
      const key = part.trim();
      if (key.length < 12) continue;
      const seen = (said.get(key) ?? 0) + 1;
      said.set(key, seen);
      if (seen >= 3) return true;
    }
    return false;
  };
  return {
    feed(chunk) {
      text += chunk;
      if (!chunk.includes("다.")) return false;
      said.clear();
      return looping(text);
    },
  };
}

/** 끊은 글에서 되풀이된 꼬리를 걷어낸다. 지금은 손대지 않는다. */
export function trimLoop(text: string): string {
  return text;
}
