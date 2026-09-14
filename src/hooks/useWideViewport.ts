/**
 * 도우미 드로어의 폭을 화면 폭으로 정한다.
 *
 * 1180px 이상이면 왼쪽에 자료 패널을 붙여 연다(B1). 자료 패널은 카드(표·노트)가 들어가야 하므로
 * 화면이 넉넉하면 더 넓게(1440px 이상 400px, 그 아래 320px) 준다.
 *
 * 경계를 1180 에 둔 이유는 태블릿 가로다. iPad 10세대·Air 11"(1180), Pro 11"(1194),
 * Pro 13"(1366), Galaxy Tab(~1280) 이 모두 들어온다. 1194 에서 페이지가 330px 남아 쿨타임 표
 * 다섯 열이 아직 보인다. 그 아래(구형 iPad 1080 등)에서는 160px 밖에 안 남아 표가 무너지므로
 * 560px 드로어에 대화만 두고, 카드는 대화 자리에 덮어 띄운다(B2·B2b).
 */
import { useEffect, useState } from "react";

export const WIDE_VIEWPORT_MIN = 1180;

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

/** 자료 패널 기본 폭. 화면이 넓을수록 카드에 자리를 더 준다. 사용자가 끌어 바꾸면 그 값이 이긴다. */
export function referencePanelWidth(viewportWidth: number): number {
  return viewportWidth >= 1440 ? 400 : 320;
}

/**
 * 자료 패널을 끌어 줄일 수 있는 한계. 이보다 더 줄이려 하면 패널을 닫는다.
 * 260px 은 비교 표의 두 열과 노트 한 줄이 아직 읽히는 폭이다.
 */
export const REFERENCE_MIN_WIDTH = 260;
/** 끌어 늘릴 수 있는 한계. 자료가 대화를 삼키지 않도록 묶어 둔다. */
export const REFERENCE_MAX_WIDTH = 560;
/** 뒤 페이지에 최소한 남겨 둘 폭. 이만큼은 남아야 표가 표 구실을 한다. */
const PAGE_MIN_WIDTH = 160;
/** 왼쪽 사이드바 레일 */
const SIDEBAR_WIDTH = 64;

/** 끌어 놓은 폭을 화면에 맞게 가둔다. 화면이 좁으면 최대치도 따라 줄어든다. */
export function clampReferenceWidth(width: number, viewportWidth: number): number {
  const room = viewportWidth - ADVISOR_CHAT_WIDTH_WITH_REFERENCE - SIDEBAR_WIDTH - PAGE_MIN_WIDTH;
  const max = Math.max(REFERENCE_MIN_WIDTH, Math.min(REFERENCE_MAX_WIDTH, room));
  return Math.round(Math.min(max, Math.max(REFERENCE_MIN_WIDTH, width)));
}

/** 드로어 전체 폭. 자료 패널이 펼쳐져 있으면 그 폭만큼 더 넓다. */
export function advisorDrawerWidth(viewportWidth: number, referenceOpen: boolean, referenceWidth?: number): number {
  const wide = viewportWidth >= WIDE_VIEWPORT_MIN;
  if (!wide || !referenceOpen) return ADVISOR_DRAWER_WIDTH;
  const panel = clampReferenceWidth(referenceWidth ?? referencePanelWidth(viewportWidth), viewportWidth);
  return ADVISOR_CHAT_WIDTH_WITH_REFERENCE + panel;
}
