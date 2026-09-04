import type { ChampionSpell } from "../../src/types";
import { parseSpellTooltipWithDiagnostics } from "../../src/lib/spellTooltipParser/parser";
import type {
  CommunityDragonSpellData,
  TooltipLocale,
} from "../../src/lib/spellTooltipParser/types";
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
  locale: TooltipLocale,
  siblings?: Record<string, CommunityDragonSpellData>
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
    siblings ? { ...source, siblings } : source,
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
  locale: DataLocale,
  /**
   * 같은 챔피언의 다른 스킬 데이터 (스킬 이름 소문자 → 데이터).
   * `{{ spell.zyrap:plantdamage }}` 처럼 패시브·서브 스킬 값을 참조하는
   * 툴팁이 있어 형제 맵이 필요하다.
   */
  siblings?: Record<string, CommunityDragonSpellData>
): LocalizedActiveTooltip {
  const { locKeys } = source.source;
  const tooltip = render(
    lookupString(stringTable, locKeys.keyTooltip),
    spell,
    source,
    stringTable,
    locale,
    siblings
  );
  const extended = render(
    lookupString(stringTable, locKeys.keyTooltipExtendedBelowLine),
    spell,
    source,
    stringTable,
    locale,
    siblings
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
