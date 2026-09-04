import type {
  AbilityRankValue,
  AbilitySlot,
  AbilityV2,
  ChampionDetailV2,
  ChampionIndexV2,
} from "../../src/data/contracts/championData";
import type {
  DataLocale,
  StaticDataSources,
} from "../../src/data/contracts/staticData";
import { replaceVariable } from "../../src/lib/spellTooltipParser/variableReplacer";
import type { CommunityDragonSpellData } from "../../src/lib/spellTooltipParser/types";
import { getAbilityResourceName } from "../../src/lib/spellTooltipParser/valueUtils";
import type { Champion, ChampionPassive, ChampionSpell } from "../../src/types";
import type { NormalizedChampion } from "../../src/types/combatNormalized";
import { compileAbilitySimulation } from "./ability-simulation";

export interface ChampionDataV2Input {
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
  champion: Champion;
  normalized: NormalizedChampion;
  spellData: Record<string, CommunityDragonSpellData>;
}

function numericValues(values: (number | string)[] | undefined): number[] {
  if (!values) return [];
  return values.map(Number).filter(Number.isFinite);
}

function isPercentLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return label.includes("%") || lower.includes("percent") || lower.includes("둔화");
}

function buildRankValues(
  spell: ChampionSpell,
  source: CommunityDragonSpellData | undefined,
  locale: DataLocale
): AbilityRankValue[] {
  const leveltip = spell.leveltip;
  if (!leveltip) return [];

  const values: AbilityRankValue[] = [];
  const length = Math.min(leveltip.label.length, leveltip.effect.length);
  for (let index = 0; index < length; index += 1) {
    const match = leveltip.effect[index].match(/\{\{\s*([^}]+)\s*}}/);
    if (!match) continue;
    const rendered = replaceVariable(match[1].trim(), spell, source, locale);
    if (!rendered) continue;

    const label = leveltip.label[index].replace(
      "@AbilityResourceName@",
      getAbilityResourceName(spell, locale)
    );
    const displayValues = isPercentLabel(label) && !rendered.includes("%")
      ? rendered.split("/").map((value) => `${value}%`).join("/")
      : rendered;
    values.push({ label, values: displayValues });
  }
  return values;
}

function buildPassive(
  passive: ChampionPassive | undefined,
  normalized: NormalizedChampion
): AbilityV2 {
  return {
    slot: "P",
    id: passive?.spellId ?? "P",
    name: passive?.name ?? normalized.spells.P.name,
    maxRank: 0,
    summary: passive?.summary ?? "",
    bodyHtml: passive?.description ?? normalized.spells.P.tooltip,
    iconFile: passive?.image.full ?? "",
    cooldownSeconds: [],
    range: [],
    rankValues: [],
    scalings: normalized.spells.P.scalings,
    simulation: { status: "unavailable", unsupportedPartTypes: [] },
    conditions: [],
    source: passive?.tooltipSource ?? "ddragon",
    diagnostics: { unresolvedTokens: [] },
  };
}

function buildActiveAbility(
  slot: Exclude<AbilitySlot, "P">,
  spell: ChampionSpell,
  normalized: NormalizedChampion,
  source: CommunityDragonSpellData | undefined,
  locale: DataLocale
): AbilityV2 {
  const costs = numericValues(spell.cost);
  const rechargeSeconds = source?.DataValues?.mAmmoRechargeTime?.slice(
    1,
    spell.maxrank + 1
  );
  return {
    slot,
    id: spell.id,
    name: spell.name ?? normalized.spells[slot].name,
    maxRank: spell.maxrank,
    summary: spell.summary ?? spell.description ?? "",
    bodyHtml: spell.tooltip ?? "",
    iconFile: spell.image?.full ?? `${spell.id}.png`,
    cooldownSeconds: numericValues(spell.cooldown),
    rechargeSeconds:
      rechargeSeconds && rechargeSeconds.length > 0
        ? rechargeSeconds
        : undefined,
    maxCharges:
      spell.maxammo && Number(spell.maxammo) > 0
        ? Number(spell.maxammo)
        : undefined,
    cost: costs.some((value) => value !== 0)
      ? { values: costs, resource: getAbilityResourceName(spell, locale) }
      : undefined,
    range: numericValues(spell.range),
    rankValues: buildRankValues(spell, source, locale),
    scalings: normalized.spells[slot].scalings,
    simulation: compileAbilitySimulation(source, spell.maxrank),
    conditions: [],
    source: spell.tooltipSource ?? "ddragon",
    diagnostics: {
      unresolvedTokens: spell.tooltipDiagnostics?.unresolvedTokens ?? [],
    },
  };
}

export function buildChampionDetailV2(
  input: ChampionDataV2Input
): ChampionDetailV2 {
  const { champion, normalized, spellData } = input;
  const spells = champion.spells ?? [];
  const activeSlots = ["Q", "W", "E", "R"] as const;
  const activeAbilities = Object.fromEntries(
    activeSlots.map((slot, index) => {
      const spell = spells[index];
      if (!spell) throw new Error(`${champion.id} is missing ${slot}`);
      const source = spellData[spell.id] ?? spellData[String(index)];
      return [
        slot,
        buildActiveAbility(slot, spell, normalized, source, input.locale),
      ];
    })
  ) as Record<Exclude<AbilitySlot, "P">, AbilityV2>;

  return {
    schemaVersion: 2,
    patchVersion: input.patchVersion,
    locale: input.locale,
    sources: input.sources,
    champion: {
      id: champion.id,
      key: champion.key,
      name: champion.name,
      title: champion.title,
      tags: champion.tags ?? [],
      baseStats: normalized.baseStats,
      baseStatContributions: normalized.baseStatContributions,
      abilities: {
        P: buildPassive(champion.passive, normalized),
        ...activeAbilities,
      },
    },
  };
}

export function buildChampionIndexV2(
  details: ChampionDetailV2[]
): ChampionIndexV2 {
  const first = details[0];
  if (!first) throw new Error("Cannot build an empty champion index");
  return {
    schemaVersion: 2,
    patchVersion: first.patchVersion,
    locale: first.locale,
    sources: first.sources,
    champions: details
      .map(({ champion }) => ({
        id: champion.id,
        key: champion.key,
        name: champion.name,
        title: champion.title,
        iconFile: `${champion.id}.png`,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}
