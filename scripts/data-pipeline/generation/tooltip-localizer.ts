import type { Champion } from "../../../src/types";
import type {
  ExtractedActiveSpellData,
} from "../cdragon-active-spells";
import { localizeActiveTooltip } from "../active-tooltip-data";
import {
  requireMapValue,
  type ChampionsByLocale,
} from "../champion-source";
import type { DataLocale, StringTable } from "../localization";
import type { CommunityDragonSpellData } from "../../../src/lib/spellTooltipParser/types";
import { fetchJson } from "../io/json";
import {
  localizePassiveTooltip,
  PASSIVE_TOOLTIP_LOCALES,
  type ExtractedPassiveSpell,
  type LocalizedPassiveTooltip,
  type PassiveTooltipLocale,
} from "../../passive-tooltip-data";

const stringTableCache = new Map<string, Promise<StringTable>>();

function stringTableUrl(
  cdragonVersion: string,
  locale: PassiveTooltipLocale,
): string {
  return `https://raw.communitydragon.org/${cdragonVersion}/game/${locale.toLowerCase()}/data/menu/en_us/lol.stringtable.json`;
}

function fetchStringTable(
  cdragonVersion: string,
  locale: PassiveTooltipLocale,
): Promise<StringTable> {
  const key = `${cdragonVersion}:${locale}`;
  const cached = stringTableCache.get(key);
  if (cached) return cached;
  const request = fetchJson<StringTable>(
    stringTableUrl(cdragonVersion, locale),
  );
  stringTableCache.set(key, request);
  return request;
}

function applyActiveTooltip(
  champion: Champion,
  activeSpells: readonly ExtractedActiveSpellData[],
  stringTable: StringTable,
  locale: DataLocale,
  siblings: Record<string, CommunityDragonSpellData>,
): void {
  champion.spells?.forEach((spell, index) => {
    const source = activeSpells[index];
    if (!source) return;
    const localized = localizeActiveTooltip(
      spell,
      source,
      stringTable,
      locale,
      siblings,
    );
    if (!localized.tooltip) return;
    spell.summary = localized.summary ?? spell.description;
    spell.tooltip = localized.tooltip;
    spell.tooltipSource = "communitydragon";
    spell.tooltipDiagnostics = localized.unresolvedTokens.length > 0
      ? { unresolvedTokens: localized.unresolvedTokens }
      : undefined;
    if (localized.name) spell.name = localized.name;
  });
}

export async function localizeActiveTooltips(
  championsByLocale: ChampionsByLocale,
  championId: string,
  cdragonVersion: string,
  activeSpells: readonly ExtractedActiveSpellData[],
  /** `{{ spell.<이름>:<변수> }}` 참조용 형제 스킬 맵 */
  siblings: Record<string, CommunityDragonSpellData>,
): Promise<void> {
  await Promise.all(
    PASSIVE_TOOLTIP_LOCALES.map(async (locale) => {
      const champion = requireMapValue(
        requireMapValue(championsByLocale, locale, "champion locale"),
        championId,
        `${locale} champion`,
      );
      try {
        applyActiveTooltip(
          champion,
          activeSpells,
          await fetchStringTable(cdragonVersion, locale),
          locale,
          siblings,
        );
      } catch (error) {
        console.warn(
          `[CD][Active] Failed to localize ${championId}/${locale}; preserving DDragon tooltip`,
          error,
        );
      }
    }),
  );
}

async function buildLocalizedPassives(
  cdragonVersion: string,
  passive: ExtractedPassiveSpell,
): Promise<Record<PassiveTooltipLocale, LocalizedPassiveTooltip>> {
  const entries = await Promise.all(
    PASSIVE_TOOLTIP_LOCALES.map(async (locale) => {
      try {
        const table = await fetchStringTable(cdragonVersion, locale);
        return [locale, localizePassiveTooltip(passive, table, locale)] as const;
      } catch (error) {
        console.warn(
          `[CD][Passive] Failed to localize ${passive.id}/${locale}; preserving DDragon summary`,
          error,
        );
        return [locale, {}] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<
    PassiveTooltipLocale,
    LocalizedPassiveTooltip
  >;
}

export async function localizePassiveTooltips(
  championsByLocale: ChampionsByLocale,
  championId: string,
  cdragonVersion: string,
  passive: ExtractedPassiveSpell | null,
): Promise<void> {
  if (!passive) return;
  const localizedByLocale = await buildLocalizedPassives(
    cdragonVersion,
    passive,
  );
  for (const locale of PASSIVE_TOOLTIP_LOCALES) {
    const localized = localizedByLocale[locale];
    if (!localized.tooltip) continue;
    const champion = requireMapValue(
      requireMapValue(championsByLocale, locale, "champion locale"),
      championId,
      `${locale} champion`,
    );
    const ddragonPassive = champion.passive;
    if (!ddragonPassive) continue;
    ddragonPassive.summary = ddragonPassive.description;
    ddragonPassive.description = localized.tooltip;
    ddragonPassive.spellId = passive.id;
    ddragonPassive.tooltipSource = "communitydragon";
    if (localized.name) ddragonPassive.name = localized.name;
  }
}
