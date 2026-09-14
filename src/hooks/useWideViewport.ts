/**
 * 도우미 드로어가 자료 패널까지 펼칠 만큼 화면이 넓은가.
 *
 * 1280px 이상이면 드로어를 860px 로 열어 왼쪽에 자료(카드), 오른쪽에 대화를 나란히 둔다.
 * 그보다 좁으면 560px 드로어 하나에 대화만 두고, 카드는 칩을 누를 때 덮어 뜬다.
 */
import { useEffect, useState } from "react";

export const WIDE_VIEWPORT_MIN = 1280;

/** 도우미 드로어 폭. 카드가 표 문법으로 들어가려면 이만큼은 필요하다. */
export const ADVISOR_DRAWER_WIDTH = 560;
/** 넓은 화면에서는 왼쪽에 자료 패널(300px)을 붙여 연다. */
export const ADVISOR_DRAWER_WIDE_WIDTH = 860;
export const ADVISOR_REFERENCE_WIDTH = ADVISOR_DRAWER_WIDE_WIDTH - ADVISOR_DRAWER_WIDTH;

export function advisorDrawerWidth(wide: boolean): number {
  return wide ? ADVISOR_DRAWER_WIDE_WIDTH : ADVISOR_DRAWER_WIDTH;
}

export function useWideViewport(min = WIDE_VIEWPORT_MIN): boolean {
  const [wide, setWide] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= min));

  useEffect(() => {
    const check = () => setWide(window.innerWidth >= min);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [min]);

  return wide;
}
