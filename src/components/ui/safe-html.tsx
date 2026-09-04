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
  ALLOWED_ATTR: ["class", "src", "alt"],
  // 이미지 출처를 CommunityDragon 으로만 제한한다.
  // 데이터가 오염돼도 임의의 주소로 요청이 나가지 않는다.
  ALLOWED_URI_REGEXP: /^https:\/\/raw\.communitydragon\.org\//,
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
