import { useCallback, useEffect, useRef, useState } from "react";

/** 흘려 보이는 도중 짝이 안 맞은 굵은 글씨 표시를 뗀다. 반쯤 나온 "**" 가 "*" 로 잠깐 보였다. */
function unfinishedMarkup(text: string): string {
  let out = text.replace(/\*$/, (star) => (text.endsWith("**") ? star : ""));
  if ((out.match(/\*\*/g) ?? []).length % 2 === 1) out = out.slice(0, out.lastIndexOf("**"));
  return out;
}

export function useRevealText(write: (id: number, content: string) => void) {
  /** 흘려 보이는 중인 코드 답. 멈추면 끝까지 한 번에 보인다. */
  const revealRef = useRef<{ id: number; full: string; timer: number } | null>(null);
  const [revealing, setRevealing] = useState(false);

  /** 흘려 보이던 답을 끝까지 한 번에 보인다. */
  const finishReveal = useCallback(() => {
    const current = revealRef.current;
    if (!current) return;
    window.clearInterval(current.timer);
    revealRef.current = null;
    setRevealing(false);
    write(current.id, current.full);
  }, [write]);

  /**
   * 코드가 쓴 답을 모델이 쓰듯 조금씩 보인다.
   *
   * 다 된 글이 한 번에 뜨면 앞의 기다림과 이어져 "멈췄다가 빡 뜬다" 로 읽혔다. 길이와 상관없이 2초 안에 끝나게
   * 한 번에 내보낼 글자 수를 정한다(짧으면 두 글자씩).
   */
  const reveal = useCallback((id: number, full: string) => {
    finishReveal();
    if (!full) return;
    const step = Math.max(2, Math.ceil(full.length / 90));
    const startedAt = performance.now();
    let shown = 0;
    const timer = window.setInterval(() => {
      // 느린 프레임에서도 2초 표시 시간을 타이머 호출 횟수로 늘리지 않는다.
      const elapsedSteps = Math.floor((performance.now() - startedAt) / 20);
      shown = Math.min(full.length, Math.max(shown + step, elapsedSteps * step));
      // 이모지 같은 두 칸 글자를 반으로 자르지 않는다
      if (shown < full.length && /[\uD800-\uDBFF]/.test(full[shown - 1])) shown += 1;
      const text = shown >= full.length ? full : unfinishedMarkup(full.slice(0, shown));
      write(id, text);
      if (shown >= full.length) {
        window.clearInterval(timer);
        revealRef.current = null;
        setRevealing(false);
      }
    }, 20);
    revealRef.current = { id, full, timer };
    setRevealing(true);
  }, [finishReveal, write]);

  useEffect(() => () => window.clearInterval(revealRef.current?.timer), []);

  return { reveal, finishReveal, revealing };
}
