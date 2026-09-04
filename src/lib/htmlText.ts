const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&gt;": ">",
  "&lt;": "<",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
};

/** Riot의 제한된 HTML 설명을 한 줄짜리 일반 텍스트로 만든다. */
export function htmlToPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>|<\/p>|<\/li>/gi, " ")
    .replace(/<[^>]*>/g, "")
    // 스탯 아이콘 자리 표시 (spellTooltipParser/statIcons.ts) 는 평문에서 뺀다
    .replace(/\[\[si:[a-z]+]]/g, "")
    .replace(/&(amp|gt|lt|nbsp|quot|#39);/g, (entity) =>
      HTML_ENTITIES[entity] ?? entity,
    )
    .replace(/\s+/g, " ")
    .trim();
}
