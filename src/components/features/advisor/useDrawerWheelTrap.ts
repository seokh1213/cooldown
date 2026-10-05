import { useEffect, useRef } from "react";

function canScroll(drawer: HTMLElement, target: EventTarget | null, delta: number): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== drawer) {
    const room = node.scrollHeight - node.clientHeight;
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && room > 0) {
      if (delta < 0 ? node.scrollTop > 0 : node.scrollTop < room - 1) return true;
    }
    node = node.parentElement;
  }
  return false;
}

/*
 * 서랍 위에서 굴린 휠과 터치가 뒤 페이지를 움직이지 않게 한다.
 *
 * `overscroll-behavior: contain` 만으로는 안 된다. 대화가 짧아 스크롤할 것이 없으면
 * 그 칸은 스크롤할 자리가 없는 것으로 쳐서 브라우저가 휠을 그대로 조상에게 넘긴다.
 * 대화 위에서 굴렸더니 뒤의 백과사전 목록이 500px 내려갔다. 바깥 테두리에 걸어 봐도
 * 같았다 — `overflow-hidden` 이라도 넘칠 내용이 없으면 마찬가지다.
 *
 * 그래서 휠을 직접 본다. 손이 놓인 자리에서 위로 올라가며 **그 방향으로 실제로 더
 * 움직일 수 있는 칸**을 찾고, 없으면 기본 동작을 막는다. 있으면 건드리지 않는다 —
 * 대화가 길 때의 스크롤은 그대로 돌아야 한다.
 *
 * React 의 `onWheel` 로는 못 한다. 루트에 passive 로 붙어서 `preventDefault` 가
 * 무시된다. 그래서 직접 `{ passive: false }` 로 단다.
 */
export function useDrawerWheelTrap() {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0 || canScroll(drawer, event.target, event.deltaY)) return;
      event.preventDefault();
    };
    let lastY: number | undefined;
    const onTouchStart = (event: TouchEvent) => { lastY = event.touches.length === 1 ? event.touches[0].clientY : undefined; };
    const onTouchMove = (event: TouchEvent) => {
      if (lastY === undefined || event.touches.length !== 1) return;
      const delta = lastY - event.touches[0].clientY;
      lastY = event.touches[0].clientY;
      if (delta && !canScroll(drawer, event.target, delta) && event.cancelable) event.preventDefault();
    };
    drawer.addEventListener("wheel", onWheel, { passive: false });
    drawer.addEventListener("touchstart", onTouchStart, { passive: true });
    drawer.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      drawer.removeEventListener("wheel", onWheel);
      drawer.removeEventListener("touchstart", onTouchStart);
      drawer.removeEventListener("touchmove", onTouchMove);
    };
  }, []);
  return drawerRef;
}
