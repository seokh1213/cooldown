import type { ChampionSpell } from "../../src/types";
import { parseSpellTooltipWithDiagnostics } from "../../src/lib/spellTooltipParser/parser";
import type { TooltipLocale } from "../../src/lib/spellTooltipParser/types";
import type { ExtractedActiveSpellData } from "./cdragon-active-spells";
import {
  expandStringReferences,
  lookupString,
  toParserTemplate,
  type DataLocale,
  type StringTable,
} from "./localization";

export interface LocalizedActiveTooltip {
  name?: string;
  summary?: string;
  tooltip?: string;
  unresolvedTokens: string[];
}

interface RenderedFragment {
  html?: string;
  unresolvedTokens: string[];
}

function render(
  template: string | undefined,
  spell: ChampionSpell,
  source: ExtractedActiveSpellData,
  stringTable: StringTable,
  locale: TooltipLocale
): RenderedFragment {
  if (!template) return { unresolvedTokens: [] };
  const effectiveSpell: ChampionSpell = {
    ...spell,
    cooldown: source.source.cooldowns ?? spell.cooldown,
    cost: source.source.costs ?? spell.cost,
  };
  const rendered = parseSpellTooltipWithDiagnostics(
    toParserTemplate(expandStringReferences(template, stringTable)),
    effectiveSpell,
    source,
    locale
  );
  const html = rendered.html.trim();
  return {
    html: html || undefined,
    unresolvedTokens: rendered.unresolvedTokens,
  };
}

export function localizeActiveTooltip(
  spell: ChampionSpell,
  source: ExtractedActiveSpellData,
  stringTable: StringTable,
  locale: DataLocale
): LocalizedActiveTooltip {
  const { locKeys } = source.source;
  const tooltip = render(
    lookupString(stringTable, locKeys.keyTooltip),
    spell,
    source,
    stringTable,
    locale
  );
  const extended = render(
    lookupString(stringTable, locKeys.keyTooltipExtendedBelowLine),
    spell,
    source,
    stringTable,
    locale
  );
  return {
    name: lookupString(stringTable, locKeys.keyName),
    summary: lookupString(stringTable, locKeys.keySummary),
    tooltip:
      [tooltip.html, extended.html].filter(Boolean).join("<br /><br />") ||
      undefined,
    unresolvedTokens: [
      ...new Set([...tooltip.unresolvedTokens, ...extended.unresolvedTokens]),
    ].sort(),
  };
}
