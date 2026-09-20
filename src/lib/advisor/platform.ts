/**
 * 어느 운영체제에서 보고 있는가
 *
 * WebGPU 를 지원하는 브라우저 목록이 운영체제마다 다르다. Safari 는 맥에만 있고,
 * Edge 를 굳이 권할 자리는 윈도우다. 없는 브라우저를 권하면 안내가 아니라 소음이다.
 *
 * `navigator.userAgentData.platform` 이 있으면 그것을 쓴다. 문자열 파싱보다 정확하고
 * 크롬 계열이 준다. 없으면(사파리·파이어폭스) userAgent 를 본다.
 */
export type Platform = "mac" | "windows" | "linux" | "other";

interface UserAgentDataLike {
  platform?: string;
}

export function detectPlatform(): Platform {
  const nav = navigator as Navigator & { userAgentData?: UserAgentDataLike };
  const hinted = nav.userAgentData?.platform;
  const source = (hinted || navigator.userAgent || "").toLowerCase();
  if (source.includes("mac")) return "mac";
  if (source.includes("win")) return "windows";
  if (source.includes("linux") || source.includes("android")) return "linux";
  return "other";
}
