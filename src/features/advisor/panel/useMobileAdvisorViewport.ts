/** 모바일 서랍은 보이는 화면에 맞추고, 뒤 페이지의 위치는 닫을 때까지 고정한다. */
import { useLayoutEffect, type RefObject } from "react";

export function useMobileAdvisorViewport(mobile: boolean, drawerRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const drawer = drawerRef.current;
    if (!mobile || !drawer) return;
    const body = document.body;
    const html = document.documentElement;
    const scroll = { left: window.scrollX, top: window.scrollY };
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left,
      width: body.style.width, overflow: body.style.overflow };
    const overscroll = html.style.overscrollBehaviorY;
    Object.assign(body.style, { position: "fixed", top: `${-scroll.top}px`, left: `${-scroll.left}px`, width: "100%", overflow: "hidden" });
    html.style.overscrollBehaviorY = "none";

    const viewport = window.visualViewport;
    const resize = () => {
      drawer.style.setProperty("--advisor-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      drawer.style.setProperty("--advisor-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("resize", resize);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      drawer.style.removeProperty("--advisor-viewport-height");
      drawer.style.removeProperty("--advisor-viewport-top");
      Object.assign(body.style, previous);
      html.style.overscrollBehaviorY = overscroll;
      window.scrollTo({ ...scroll, behavior: "instant" });
    };
  }, [mobile, drawerRef]);
}
