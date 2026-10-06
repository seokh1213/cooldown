import type { AbilityFormDiagnostics, Champion, ChampionSpell } from "../../src/types";
import type { AbilityForm, AbilitySlot } from "../../src/data/contracts/championData";
import type { ExtractedActiveSpellData } from "./cdragon-active-spells";
import type { CommunityDragonSpellData } from "../../src/lib/spellTooltipParser/types";
import { localizeActiveTooltip } from "./active-tooltip-data";
import { expandStringReferences, lookupString, toParserTemplate, type DataLocale, type StringTable } from "./localization";
import { parseSpellTooltipWithDiagnostics } from "../../src/lib/spellTooltipParser/parser";
import { getAbilityResourceName } from "../../src/lib/spellTooltipParser/valueUtils";

type FormDefinition = {
  labels: Record<DataLocale, [string, string]>;
  alternate: Partial<Record<AbilitySlot, string>>;
  alternateCooldownValue?: Partial<Record<AbilitySlot, string>>;
  sharedAlternateCast?: AbilitySlot[];
  includeResourceHeader?: boolean;
};

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
  RekSai: {
    labels: { ko_KR: ["돌출", "매복"], en_US: ["Unburrowed", "Burrowed"], zh_CN: ["未潜地", "潜地"] },
    alternate: { Q: "RekSaiQBurrowed", W: "RekSaiWBurrowed", E: "RekSaiEBurrowed" },
    alternateCooldownValue: { Q: "BurrowedCooldown" },
    includeResourceHeader: true,
  },
  Rell: {
    labels: { ko_KR: ["탑승", "보행"], en_US: ["Mounted", "Dismounted"], zh_CN: ["骑乘", "步行"] },
    alternate: { W: "RellW_MountUp" },
    sharedAlternateCast: ["W"],
    includeResourceHeader: true,
  },
  Kled: {
    labels: { ko_KR: ["탑승", "미탑승"], en_US: ["Mounted", "Dismounted"], zh_CN: ["骑乘", "非骑乘"] },
    alternate: { Q: "KledRiderQ" },
    includeResourceHeader: true,
  },
};

const KLED_MOUNTED_ONLY: Record<DataLocale, string> = {
  ko_KR: "스칼에 탑승한 상태에서만 사용할 수 있습니다.",
  en_US: "Only usable while mounted on Skaarl.",
  zh_CN: "仅在骑乘斯嘎尔时可用。",
};

export function withAbilityUsageCondition(championId: string, slot: AbilitySlot, bodyHtml: string, locale: DataLocale): string {
  if (championId !== "Kled" || (slot !== "E" && slot !== "R") || !bodyHtml) return bodyHtml;
  // Riot's original reveal marks E/R "Mounted Only"; CDragon omits that cast condition.
  // https://web.archive.org/web/20160801083653id_/http://na.leagueoflegends.com/en/page/champion-reveal-kled-cantankerous-cavalier
  const condition = parseSpellTooltipWithDiagnostics(`<rules>${KLED_MOUNTED_ONLY[locale]}</rules>`, undefined, undefined, locale).html;
  return bodyHtml.includes(condition) ? bodyHtml : `${bodyHtml}<br /><br />${condition}`;
}

function rankedCooldowns(source: ExtractedActiveSpellData, maxRank: number, fallback: number[] = []): number[] {
  // BIN cooldown arrays start at rank 0; absent values use the default-form DDragon data only.
  return source.source.cooldowns?.slice(1, maxRank + 1).map((value) => Number(value.toFixed(3))) ?? fallback;
}

function formResourceHeader(
  spell: ChampionSpell, primaryId: string, source: ExtractedActiveSpellData,
  table: StringTable, locale: DataLocale, siblings: Record<string, CommunityDragonSpellData>,
) {
  const template = lookupString(table, `GeneratedTip_Spell_${spell.id}_TooltipSimple`)
    ?? lookupString(table, `GeneratedTip_Spell_${primaryId}_TooltipSimple`);
  const cost = template?.match(/<subtitleRight>(.*?)<\/subtitleRight>/i)?.[1]
    ?.replace(/@AbilityResourceName@/gi, getAbilityResourceName(spell, locale));
  let recharge = spell.id === "KledRiderQ" ? template?.match(/<titleRight>(.*?)<\/titleRight>/i)?.[1] : undefined;
  // The runtime ammo field starts at 20; the spell script's RechargeTime holds the learned-rank values.
  recharge = recharge?.replace(/@TOOLTIPAmmoRecharge@/gi, "@RechargeTime@").replace(/%i:cooldown%/g, "");
  return parseSpellTooltipWithDiagnostics(
    toParserTemplate(expandStringReferences([cost, recharge].filter(Boolean).join("<br />"), table)),
    spell, { ...source, siblings }, locale,
  );
}

export function buildAbilityForms(input: {
  champion: Champion; spell: ChampionSpell; slot: AbilitySlot; locale: DataLocale;
  table: StringTable; aliases: Record<string, ExtractedActiveSpellData>; cdragonVersion: string;
  /** 폼 툴팁 진단을 받는다. 공개 자료에 싣지 않는 값 누락까지 담긴다 */
  reportDiagnostics?: (diagnostics: AbilityFormDiagnostics) => void;
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
    const sharedCast = index === 1 && definition.sharedAlternateCast?.includes(slot);
    const cooldownValue = index === 1 ? definition.alternateCooldownValue?.[slot] : undefined;
    const cooldownSource = cooldownValue
      ? { ...source, source: { ...source.source, cooldowns: aliases[spell.id]?.DataValues?.[cooldownValue] } }
      : source;
    const cooldown = rankedCooldowns(cooldownSource, spell.maxrank, index === 0 || sharedCast ? (spell.cooldown ?? []).map(Number).filter(Number.isFinite) : []);
    const costs = source.source.costs?.slice(1, spell.maxrank + 1) ?? (index === 0 || sharedCast ? spell.cost : []);
    const formSpell: ChampionSpell = {
      ...spell, forms: undefined, id, maxrank, cooldown,
      // Do not feed the other form's costs, effects or leveltips into the parser.
      cost: costs, costBurn: costs?.join("/"), effectBurn: source.effectBurn,
      leveltip: undefined,
    };
    const localized = localizeActiveTooltip(formSpell, source, table, locale, siblings);
    if (!localized.tooltip) throw new Error(`Missing ${id} form tooltip for ${locale}`);
    const header = definition.includeResourceHeader ? formResourceHeader(formSpell, spell.id, source, table, locale, siblings) : undefined;
    const unresolvedTokens = [...new Set([...localized.unresolvedTokens, ...header?.unresolvedTokens ?? []])].sort();
    input.reportDiagnostics?.({
      form: key, spellId: id,
      unresolvedTokens, droppedCalculations: [...localized.droppedCalculations, ...header?.droppedCalculations ?? []],
    });
    // Alternate tooltips often reuse the primary form's localization name.
    const names = (spell.name ?? id).split(/\s*\/\s*/);
    return {
      key, label: definition.labels[locale][index], id,
      name: names.length === 2 ? names[index] : localized.name ?? names[0],
      iconPath: source.source.iconPath, iconVersion: input.cdragonVersion,
      bodyHtml: [header?.html, localized.tooltip].filter(Boolean).join("<br /><br />"),
      levelValues: localized.levelValues.length > 0 ? localized.levelValues : undefined,
      cooldownSeconds: champion.id === "Gnar" && slot === "W" && key === "A" ? [] : cooldown,
      tooltipRankSource, diagnostics: { unresolvedTokens },
    };
  });
}
