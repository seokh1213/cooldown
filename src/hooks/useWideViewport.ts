/**
 * 도우미 드로어의 폭을 화면 폭으로 정한다.
 *
 * 1280px 이상이면 왼쭉에 자료 패널을 붙여 연다. 자료 패널은 카드(표·노트)가 들어가야 하므로
 * 화면이 넉넉하면 더 넓게(1440px 이상 400px, 그 아래 320px) 준다. 그보다 좁으면 560px 드로어에
 * 대화만 두고, 카드는 칩을 누를 때 덮어 뜬다.
 */
import { useEffect, useState } from "react";

export const WIDE_VIEWPORT_MIN = 1280;

/** 드로어 폭(대화만). 카드가 대화 안에 들어올 때(좁은 화면의 카드 화면) 표 문법에 이만큼은 필요하다. */
export const ADVISOR_DRAWER_WIDTH = 560;
/**
 * 자료 패널을 펼쳤을 때의 대화 열 폭. 카드가 자료 패널로 나갔으니 대화는 글만 흐른다.
 * 560 을 그대로 두면 1280px 화면에서 드로어가 880px 을 먹어 뒤 표가 보이지 않았다.
 */
export const ADVISOR_CHAT_WIDTH_WITH_REFERENCE = 480;

export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));

  useEffect(() => {
    const check = () => setWidth(window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return width;
}

export function useWideViewport(min = WIDE_VIEWPORT_MIN): boolean {
  return useViewportWidth() >= min;
}

/** 자료 패널 폭. 화면이 넓을수록 카드에 자리를 더 준다. */
export function referencePanelWidth(viewportWidth: number): number {
  return viewportWidth >= 1440 ? 400 : 320;
}

/** 드로어 전체 폭. 자료 패널이 펼쳐져 있으면 그만큼 더 넓다. */
export function advisorDrawerWidth(viewportWidth: number, referenceOpen: boolean): number {
  const wide = viewportWidth >= WIDE_VIEWPORT_MIN;
  return wide && referenceOpen ? ADVISOR_CHAT_WIDTH_WITH_REFERENCE + referencePanelWidth(viewportWidth) : ADVISOR_DRAWER_WIDTH;
}
