import type { Champion, ChampionSpell } from "../../src/types";
import type { AbilityForm, AbilitySlot } from "../../src/data/contracts/championData";
import type { ExtractedActiveSpellData } from "./cdragon-active-spells";
import type { CommunityDragonSpellData } from "../../src/lib/spellTooltipParser/types";
import { localizeActiveTooltip } from "./active-tooltip-data";
import type { DataLocale, StringTable } from "./localization";

type FormDefinition = { labels: Record<DataLocale, [string, string]>; alternate: Partial<Record<AbilitySlot, string>> };

export const ABILITY_FORM_DEFINITIONS: Record<string, FormDefinition> = {
  Jayce: {
    labels: { ko_KR: ["해머", "캐논"], en_US: ["Hammer", "Cannon"], zh_CN: ["战锤", "加农炮"] },
    alternate: { Q: "JayceShockBlast", W: "JayceHyperCharge", E: "JayceAccelerationGate", R: "JayceStanceGtH" },
  },
  Nidalee: {
    labels: { ko_KR: ["인간", "쿠거"], en_US: ["Human", "Cougar"], zh_CN: ["人类", "美洲狮"] },
    alternate: { Q: "Takedown", W: "Pounce", E: "Swipe" },
  },
  Elise: {
    labels: { ko_KR: ["인간", "거미"], en_US: ["Human", "Spider"], zh_CN: ["人类", "蜘蛛"] },
    alternate: { Q: "EliseSpiderQCast", W: "EliseSpiderW", E: "EliseSpiderE", R: "EliseRSpider" },
  },
  Gnar: {
    labels: { ko_KR: ["미니", "메가"], en_US: ["Mini", "Mega"], zh_CN: ["小型", "巨型"] },
    alternate: { Q: "GnarBigQ", W: "GnarBigW", E: "GnarBigE" },
  },
};

function rankedCooldowns(source: ExtractedActiveSpellData, maxRank: number, fallback: number[] = []): number[] {
  // BIN cooldown arrays start at rank 0; absent values use the default-form DDragon data only.
  return source.source.cooldowns?.slice(1, maxRank + 1).map((value) => Number(value.toFixed(3))) ?? fallback;
}

export function buildAbilityForms(input: {
  champion: Champion; spell: ChampionSpell; slot: AbilitySlot; locale: DataLocale;
  table: StringTable; aliases: Record<string, ExtractedActiveSpellData>; cdragonVersion: string;
}): AbilityForm[] | undefined {
  const { champion, spell, slot, locale, table, aliases } = input;
  const definition = ABILITY_FORM_DEFINITIONS[champion.id];
  const alternateId = definition?.alternate[slot];
  if (!alternateId) return undefined;
  const siblings: Record<string, CommunityDragonSpellData> = {};
  for (const [id, source] of Object.entries(aliases)) siblings[id.toLowerCase()] = source;
  return [spell.id, alternateId].map((id, index) => {
    const source = aliases[id];
    if (!source?.source.iconPath) throw new Error(`Missing ${champion.id} ${slot} form source: ${id}`);
    const key = index === 0 ? "A" : "B";
    const tooltipRankSource = champion.id === "Nidalee" && key === "B" ? "R" : slot;
    const maxrank = tooltipRankSource === "R" ? champion.spells?.[3]?.maxrank ?? spell.maxrank : spell.maxrank;
    const cooldown = rankedCooldowns(source, spell.maxrank, index === 0 ? (spell.cooldown ?? []).map(Number).filter(Number.isFinite) : []);
    const formSpell: ChampionSpell = {
      ...spell, forms: undefined, id, maxrank, cooldown,
      // Do not feed the other form's costs, effects or leveltips into the parser.
      cost: index === 0 ? spell.cost : [], effectBurn: source.effectBurn,
      leveltip: undefined,
    };
    const localized = localizeActiveTooltip(formSpell, source, table, locale, siblings);
    if (!localized.tooltip) throw new Error(`Missing ${id} form tooltip for ${locale}`);
    // Alternate tooltips often reuse the primary form's localization name.
    const names = (spell.name ?? id).split(/\s*\/\s*/);
    return {
      key, label: definition.labels[locale][index], id,
      name: names.length === 2 ? names[index] : localized.name ?? names[0],
      iconPath: source.source.iconPath, iconVersion: input.cdragonVersion, bodyHtml: localized.tooltip,
      cooldownSeconds: champion.id === "Gnar" && slot === "W" && key === "A" ? [] : cooldown,
      tooltipRankSource, diagnostics: { unresolvedTokens: localized.unresolvedTokens },
    };
  });
}
