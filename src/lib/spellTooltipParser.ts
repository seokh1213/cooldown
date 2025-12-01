// Re-export from new modular structure
// This file maintains backward compatibility while the code is organized into separate modules
export {
  parseSpellTooltip,
  parseSpellDescription,
} from "./spellTooltipParser/parser";
export { formatLeveltipStats } from "./spellTooltipParser/leveltipFormatter";
export { convertXmlTagsToHtml } from "./spellTooltipParser/xmlTagConverter";
export { formatNumber, formatLevelValues, sanitizeHtml } from "./spellTooltipParser/formatters";
