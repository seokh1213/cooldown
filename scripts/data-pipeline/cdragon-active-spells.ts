import type {
  CommunityDragonSpellData,
  SpellCalculation,
} from "../../src/lib/spellTooltipParser/types";

export interface ActiveSpellLocKeys {
  keyName?: string;
  keySummary?: string;
  keyTooltip?: string;
  keyTooltipExtendedBelowLine?: string;
}

export interface ActiveSpellSourceData {
  path: string;
  cooldowns?: number[];
  costs?: number[];
  locKeys: ActiveSpellLocKeys;
}

export interface ExtractedActiveSpellData extends CommunityDragonSpellData {
  source: ActiveSpellSourceData;
}

export interface ActiveSpellExtraction {
  ordered: ExtractedActiveSpellData[];
  aliases: Record<string, ExtractedActiveSpellData>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numericArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.map(Number);
  return numbers.length > 0 && numbers.every(Number.isFinite)
    ? numbers
    : undefined;
}

function extractDataValues(
  spell: Record<string, unknown>
): Record<string, number[]> | undefined {
  if (!Array.isArray(spell.DataValues)) return undefined;
  const values: Record<string, number[]> = {};
  for (const entry of spell.DataValues) {
    if (!isRecord(entry) || typeof entry.name !== "string") continue;
    const numbers = numericArray(entry.values);
    if (numbers) values[entry.name] = numbers;
  }
  const ammoRecharge = numericArray(spell.mAmmoRechargeTime);
  if (ammoRecharge) values.mAmmoRechargeTime = ammoRecharge;
  return Object.keys(values).length > 0 ? values : undefined;
}

/**
 * CDragon 툴팁의 `@EffectNAmount@` 가 참조하는 값.
 *
 * DDragon 의 effectBurn 과 단위가 다르다. 예를 들어 카이사 E 공격 속도는
 * BIN 이 0.4 인데 DDragon 은 40 으로 준다. CDragon 템플릿은 `*100` 을
 * 붙여 쓰므로 DDragon 값을 먹이면 4000% 가 되어 버린다.
 *
 * DDragon 과 같은 모양(0번은 비우고 1번부터 랭크별 문자열)으로 맞춘다.
 */
function extractEffectBurn(
  spell: Record<string, unknown>
): (string | null)[] | undefined {
  if (!Array.isArray(spell.mEffectAmount)) return undefined;

  const burn: (string | null)[] = [null];
  let hasValue = false;
  for (const entry of spell.mEffectAmount) {
    const numbers = isRecord(entry) ? numericArray(entry.value) : undefined;
    if (!numbers || numbers.length <= 1) {
      burn.push(null);
      continue;
    }
    // 0번 항목은 랭크 0 자리라 DDragon 문자열에도 들어가지 않는다
    burn.push(numbers.slice(1).join("/"));
    hasValue = true;
  }
  return hasValue ? burn : undefined;
}

function extractLocKeys(spell: Record<string, unknown>): ActiveSpellLocKeys {
  const clientData = isRecord(spell.mClientData) ? spell.mClientData : undefined;
  const tooltipData = isRecord(clientData?.mTooltipData)
    ? clientData.mTooltipData
    : undefined;
  const raw = isRecord(tooltipData?.mLocKeys) ? tooltipData.mLocKeys : undefined;
  const read = (key: keyof ActiveSpellLocKeys): string | undefined =>
    typeof raw?.[key] === "string" ? raw[key] : undefined;
  return {
    keyName: read("keyName"),
    keySummary: read("keySummary"),
    keyTooltip: read("keyTooltip"),
    keyTooltipExtendedBelowLine: read("keyTooltipExtendedBelowLine"),
  };
}

function extractSpell(
  data: Record<string, unknown>,
  path: string
): ExtractedActiveSpellData | null {
  const object = data[path];
  if (!isRecord(object) || !isRecord(object.mSpell)) return null;
  const spell = object.mSpell;
  const result: ExtractedActiveSpellData = {
    source: {
      path,
      cooldowns: numericArray(spell.cooldownTime),
      costs: numericArray(spell.mana),
      locKeys: extractLocKeys(spell),
    },
    preferredSimulationCalculationKeys: [],
    simulationCalculationDamageTypes: {},
  };
  const dataValues = extractDataValues(spell);
  if (dataValues) result.DataValues = dataValues;
  const effectBurn = extractEffectBurn(spell);
  if (effectBurn) result.effectBurn = effectBurn;
  if (isRecord(spell.mSpellCalculations)) {
    result.mSpellCalculations = spell.mSpellCalculations as Record<
      string,
      SpellCalculation
    >;
  }
  return result;
}

function findChampionRootPath(
  data: Record<string, unknown>,
  championId: string
): string | null {
  const expected = `characters/${championId.toLowerCase()}/characterrecords/root`;
  return Object.keys(data).find((key) => key.toLowerCase() === expected) ?? null;
}

export function extractActiveSpells(
  data: Record<string, unknown>,
  championId: string
): ActiveSpellExtraction {
  const rootPath = findChampionRootPath(data, championId);
  const root = rootPath ? data[rootPath] : undefined;
  const spellPaths = isRecord(root) && Array.isArray(root.spells)
    ? root.spells.filter((path): path is string => typeof path === "string")
    : [];
  const ordered = spellPaths
    .map((path) => extractSpell(data, path))
    .filter((spell): spell is ExtractedActiveSpellData => spell !== null);
  const aliases: Record<string, ExtractedActiveSpellData> = {};

  ordered.forEach((spell, index) => {
    aliases[String(index)] = spell;
    const id = spell.source.path.split("/").pop();
    if (id) aliases[id] = spell;
  });

  const championPrefix = rootPath?.split("/").slice(0, 2).join("/").toLowerCase();
  if (!championPrefix) return { ordered, aliases };
  for (const [path, value] of Object.entries(data)) {
    if (!path.toLowerCase().startsWith(`${championPrefix}/spells/`)) continue;
    if (!isRecord(value) || typeof value.mRootSpell !== "string") continue;
    const id = value.mRootSpell.split("/").pop();
    if (!id || aliases[id]) continue;
    const spell = extractSpell(data, value.mRootSpell);
    if (spell) aliases[id] = spell;
  }

  return { ordered, aliases };
}
