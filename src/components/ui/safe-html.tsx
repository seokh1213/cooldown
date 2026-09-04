import { useMemo } from "react";
import DOMPurify, { type Config } from "dompurify";

const GAME_HTML_POLICY: Config = {
  ALLOWED_TAGS: ["br", "p", "span", "strong", "b", "em", "i", "ul", "ol", "li"],
  ALLOWED_ATTR: ["class"],
};

interface SafeHtmlProps {
  html: string;
  className?: string;
}

export function sanitizeGameHtml(html: string): string {
  return DOMPurify.sanitize(html, GAME_HTML_POLICY);
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
