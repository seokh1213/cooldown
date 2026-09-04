import type { ChampionSpell } from "../src/types";
import { parseSpellTooltip } from "../src/lib/spellTooltipParser/parser";
import type {
  CommunityDragonSpellData,
  TooltipLocale,
} from "../src/lib/spellTooltipParser/types";
import {
  DATA_LOCALES,
  expandStringReferences,
  lookupString,
  toParserTemplate,
  type DataLocale,
  type StringTable,
} from "./data-pipeline/localization";

export const PASSIVE_TOOLTIP_LOCALES = DATA_LOCALES;

export type PassiveTooltipLocale = DataLocale;

export interface PassiveLocKeys {
  keyName?: string;
  keySummary?: string;
  keyTooltip?: string;
}

export interface ExtractedPassiveSpell {
  id: string;
  path: string;
  locKeys: PassiveLocKeys;
  spellData: CommunityDragonSpellData & {
    mClientData?: Record<string, unknown>;
  };
}

export interface LocalizedPassiveTooltip {
  name?: string;
  summary?: string;
  tooltip?: string;
}

interface CommunityDragonDataValue {
  name?: string;
  values?: (number | string)[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findChampionRoot(
  data: Record<string, unknown>,
  championId: string
): Record<string, unknown> | undefined {
  const expectedPath = `characters/${championId.toLowerCase()}/characterrecords/root`;
  const rootEntry = Object.entries(data).find(
    ([key]) => key.toLowerCase() === expectedPath
  );
  return isRecord(rootEntry?.[1]) ? rootEntry[1] : undefined;
}

function extractDataValues(
  mSpell: Record<string, unknown>
): Record<string, number[]> | undefined {
  const result: Record<string, number[]> = {};
  if (!Array.isArray(mSpell.DataValues)) return undefined;

  for (const dataValue of mSpell.DataValues as CommunityDragonDataValue[]) {
    if (!dataValue.name || !Array.isArray(dataValue.values)) continue;
    const values = dataValue.values.map(Number);
    if (values.every(Number.isFinite)) result[dataValue.name] = values;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractLocKeys(mSpell: Record<string, unknown>): PassiveLocKeys {
  const clientData = isRecord(mSpell.mClientData) ? mSpell.mClientData : undefined;
  const tooltipData = isRecord(clientData?.mTooltipData)
    ? clientData.mTooltipData
    : undefined;
  const locKeys = isRecord(tooltipData?.mLocKeys)
    ? tooltipData.mLocKeys
    : undefined;

  return {
    keyName: typeof locKeys?.keyName === "string" ? locKeys.keyName : undefined,
    keySummary:
      typeof locKeys?.keySummary === "string" ? locKeys.keySummary : undefined,
    keyTooltip:
      typeof locKeys?.keyTooltip === "string" ? locKeys.keyTooltip : undefined,
  };
}

export function extractPassiveSpell(
  data: Record<string, unknown>,
  championId: string
): ExtractedPassiveSpell | null {
  const root = findChampionRoot(data, championId);
  const passivePath = root?.mCharacterPassiveSpell;
  if (typeof passivePath !== "string" || !passivePath) return null;

  const spellObject = data[passivePath];
  if (!isRecord(spellObject) || !isRecord(spellObject.mSpell)) return null;

  const mSpell = spellObject.mSpell;
  const spellData: ExtractedPassiveSpell["spellData"] = {};
  const dataValues = extractDataValues(mSpell);
  if (dataValues) spellData.DataValues = dataValues;
  if (isRecord(mSpell.mSpellCalculations)) {
    spellData.mSpellCalculations =
      mSpell.mSpellCalculations as CommunityDragonSpellData["mSpellCalculations"];
  }
  const locKeys = extractLocKeys(mSpell);
  if (Object.values(locKeys).some(Boolean)) {
    spellData.mClientData = { mTooltipData: { mLocKeys: locKeys } };
  }

  const id =
    typeof spellObject.mScriptName === "string" && spellObject.mScriptName
      ? spellObject.mScriptName
      : passivePath.split("/").pop() ?? "P";

  return {
    id,
    path: passivePath,
    locKeys,
    spellData,
  };
}

function renderTemplate(
  template: string | undefined,
  passive: ExtractedPassiveSpell,
  locale: TooltipLocale,
  stringTable: StringTable,
): string | undefined {
  if (!template) return undefined;
  const spell: ChampionSpell = {
    id: passive.id,
    maxrank: 1,
    cooldown: [],
  };
  const dynamic = /\{\{\s*([A-Za-z0-9_]*)@([^@{}]+)@([A-Za-z0-9_]*)\s*}}/g;
  const resolvedTemplate = template.replace(
    dynamic,
    (token, prefix: string, variable: string, suffix: string) => {
      const dataValue = Object.entries(passive.spellData.DataValues ?? {}).find(
        ([key]) => key.toLowerCase() === variable.toLowerCase(),
      )?.[1]?.[0];
      const variant = Number.isFinite(dataValue)
        ? String(dataValue)
        : passive.id === "KaynPassive" && /^f\d+$/i.test(variable)
          ? "0"
          : null;
      return variant === null
        ? token
        : lookupString(stringTable, `${prefix}${variant}${suffix}`) ?? token;
    },
  );
  const rendered = parseSpellTooltip(
    toParserTemplate(expandStringReferences(resolvedTemplate, stringTable)),
    spell,
    passive.spellData,
    locale
  ).trim();
  return rendered || undefined;
}

export function localizePassiveTooltip(
  passive: ExtractedPassiveSpell,
  stringTable: StringTable,
  locale: PassiveTooltipLocale
): LocalizedPassiveTooltip {
  const primary = renderTemplate(
    lookupString(stringTable, passive.locKeys.keyTooltip),
    passive,
    locale,
    stringTable,
  );
  const buffTooltip = lookupString(
    stringTable,
    `game_buff_tooltip_${passive.id}`,
  );
  const alternate = renderTemplate(buffTooltip, passive, locale, stringTable);
  return {
    name: lookupString(stringTable, passive.locKeys.keyName),
    summary: lookupString(stringTable, passive.locKeys.keySummary),
    tooltip: primary && !primary.includes("?") ? primary : alternate ?? primary,
  };
}
