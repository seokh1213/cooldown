import { useMemo } from "react";
import DOMPurify, { type Config } from "dompurify";
import { renderStatIconTokens } from "@/lib/spellTooltipParser/statIcons";

const GAME_HTML_POLICY: Config = {
  ALLOWED_TAGS: [
    "br",
    "p",
    "span",
    "strong",
    "b",
    "em",
    "i",
    "ul",
    "ol",
    "li",
    // 스킬 설명 안의 스탯 아이콘
    "img",
  ],
  ALLOWED_ATTR: ["class", "src", "alt", "decoding"],
  /*
   * 이미지 출처를 **우리 자리**로만 제한한다. 자료가 오염돼도 임의의 주소로 요청이
   * 나가지 않는다.
   *
   * 예전에는 CommunityDragon 주소만 허용했다. 스탯 글리프를 우리 자리로 옮기면서
   * 주소가 `/<바탕>/img/stat/...` 가 되었는데, 이 규칙을 같이 안 고쳤더니 DOMPurify
   * 가 `src` 를 통째로 지워 툴팁의 계수 항 아이콘이 빈 칸으로 나갔다.
   */
  ALLOWED_URI_REGEXP: /^[^:]*\/img\/stat\//,
};

interface SafeHtmlProps {
  html: string;
  className?: string;
}

export function sanitizeGameHtml(html: string): string {
  // 정적 데이터에는 `[[si:scalead]]` 같은 짧은 자리 표시로 저장돼 있다
  return DOMPurify.sanitize(renderStatIconTokens(html), GAME_HTML_POLICY);
}

function useSafeHtml(html: string): { __html: string } {
  return useMemo(() => ({ __html: sanitizeGameHtml(html) }), [html]);
}

export function SafeBlockHtml({ html, className }: SafeHtmlProps) {
  return <div className={className} dangerouslySetInnerHTML={useSafeHtml(html)} />;
}

export function SafeInlineHtml({ html, className }: SafeHtmlProps) {
  return <span className={className} dangerouslySetInnerHTML={useSafeHtml(html)} />;
}
