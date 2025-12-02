// Re-export from new modular structure
// This file maintains backward compatibility while the code is organized into separate modules
export {
  parseSpellTooltip,
  parseSpellDescription,
} from "./spellTooltipParser/parser";
export { formatLeveltipStats } from "./spellTooltipParser/leveltipFormatter";
export { convertXmlTagsToHtml } from "./spellTooltipParser/xmlTagConverter";
export {
  formatNumber,
  formatLevelValues,
  sanitizeHtml,
} from "./spellTooltipParser/formatters";

// 내부 모듈에서 변수 치환 유틸과 타입도 재export해서
// "@/lib/spellTooltipParser" 경로에서 직접 사용할 수 있도록 유지
export {
  replaceVariables,
  replaceVariable,
} from "./spellTooltipParser/variableReplacer";
export type {
  CommunityDragonSpellData,
  ParseResult,
  Value,
} from "./spellTooltipParser/types";
