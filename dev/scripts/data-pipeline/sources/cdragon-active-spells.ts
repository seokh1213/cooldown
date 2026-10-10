import type { SpellCalculation } from "../../../../src/domain/game/tooltip/calculations/contracts";
import type { CommunityDragonSpellData } from "../../../../src/domain/game/tooltip/contracts";

export interface ActiveSpellLocKeys {
  keyName?: string;
  keySummary?: string;
  keyTooltip?: string;
  keyTooltipExtendedBelowLine?: string;
}

export interface ActiveSpellSourceData {
  path: string;
  iconPath?: string;
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
  return isRecord(object) ? extractSpellObject(object, path) : null;
}

function extractSpellObject(
  object: Record<string, unknown>,
  path: string
): ExtractedActiveSpellData | null {
  if (!isRecord(object.mSpell)) return null;
  const spell = object.mSpell;
  const result: ExtractedActiveSpellData = {
    source: {
      path,
      iconPath: Array.isArray(spell.mImgIconName) && typeof spell.mImgIconName[0] === "string"
        ? spell.mImgIconName[0].toLowerCase().replace(/\.dds$/, ".png") : undefined,
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

/** SpellLevelUpInfo 목록이 없는 챔피언의 1랭크 레벨 (Q·W·E·R 순서). 게임 기본값이다. */
const DEFAULT_FIRST_RANK_LEVELS = [1, 1, 1, 6];

function isSpellLevelUpInfoList(value: unknown): value is { List: Record<string, unknown>[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.List) &&
    value.List.length > 0 &&
    value.List.every((entry) => isRecord(entry) && entry.__type === "SpellLevelUpInfo")
  );
}

/**
 * 기본 스킬(슬롯 순서)의 1랭크를 배울 수 있는 챔피언 레벨.
 *
 * 배움 조건이 게임 기본값과 다른 챔피언만 루트에 SpellLevelUpInfo 목록을 싣는다.
 * 원소마다 mRequirements 가 랭크별 조건이고 첫 칸이 1랭크 조건이다.
 * CharacterLevelRequirement 가 없거나 mLevel 이 비어 있으면 1레벨부터다.
 *   엘리스 R  첫 칸이 비어 있다 → 시작부터 1랭크 (1)
 *   아지르 Q  mLevel 2 → 2
 * 목록을 담은 필드 이름이 해시({1abb82c0})로 남아 있어 이름 대신 원소의 __type 으로 찾는다.
 */
function firstRankLevels(root: Record<string, unknown>, count: number): number[] {
  const list = Object.values(root).find(isSpellLevelUpInfoList)?.List;
  return Array.from({ length: count }, (_, index) => {
    const info = list?.[index];
    if (!info) return DEFAULT_FIRST_RANK_LEVELS[index] ?? 1;
    const firstRank = Array.isArray(info.mRequirements) ? info.mRequirements[0] : undefined;
    const requirements =
      isRecord(firstRank) && Array.isArray(firstRank.mRequirements) ? firstRank.mRequirements : [];
    const level = requirements.find(
      (requirement) => isRecord(requirement) && requirement.__type === "CharacterLevelRequirement",
    )?.mLevel;
    return typeof level === "number" && level > 1 ? level : 1;
  });
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
  const levels = firstRankLevels(isRecord(root) ? root : {}, spellPaths.length);
  const ordered = spellPaths
    .map((path, index) => {
      const spell = extractSpell(data, path);
      if (spell) spell.firstRankLevel = levels[index];
      return spell;
    })
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

  registerScriptNameAliases(data, aliases);

  return { ordered, aliases };
}

/**
 * 경로가 해시로 남은 스킬을 mScriptName 으로 찾을 수 있게 한다.
 *
 * 아펠리오스 무기별 Q(ApheliosCalibrumQ 등)는 경로가 `{9501e989}` 같은
 * 해시라 경로 마지막 조각으로는 이름을 붙일 수 없다. 노드 안에는
 * mScriptName 이 그대로 남아 있으므로 그것을 alias 로 쓴다.
 */
function registerScriptNameAliases(
  data: Record<string, unknown>,
  aliases: Record<string, ExtractedActiveSpellData>
): void {
  for (const [path, value] of Object.entries(data)) {
    if (!isRecord(value) || !isRecord(value.mSpell)) continue;
    const name =
      typeof value.mScriptName === "string"
        ? value.mScriptName
        : typeof value.ObjectName === "string"
          ? value.ObjectName
          : undefined;
    if (!name || aliases[name]) continue;
    const spell = extractSpellObject(value, path);
    if (spell) aliases[name] = spell;
  }
}
