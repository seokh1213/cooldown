import * as fs from "fs";
import * as path from "path";
import type {
  ChampionBaseStats,
  ChampionSpellSlot,
  LevelScaledScalar,
  NormalizedChampion,
  NormalizedChampionDataFile,
  NormalizedItem,
  NormalizedItemDataFile,
  NormalizedRune,
  NormalizedRuneDataFile,
  NormalizedSpell,
  NormalizedStatShard,
  NormalizedSummonerSpell,
  NormalizedSummonerDataFile,
} from "../src/types/combatNormalized";
import type {
  FormulaPart,
  StatContribution,
} from "../src/types/combatStats";
import { StatKey } from "../src/types/combatStats";
import { parseItemDescription } from "../src/lib/spellTooltipParser/index";

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CHAMP_LIST_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion.json`;
const CHAMP_INFO_URL = (VERSION: string, LANG: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion/${NAME}.json`;
const RUNES_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/runesReforged.json`;
const ITEMS_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/item.json`;
const SUMMONER_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/summoner.json`;
const COMMUNITY_DRAGON_URL = (basePath: string, championId: string) =>
  `https://raw.communitydragon.org/${basePath}/game/data/characters/${championId}/${championId}.bin.json`;
const COMMUNITY_DRAGON_ITEMS_URL = (basePath: string, lang: string) => {
  const locale = lang === "ko_KR" ? "ko_kr" : "default";
  return `https://raw.communitydragon.org/${basePath}/plugins/rcp-be-lol-game-data/global/${locale}/v1/items.json`;
};
const COMMUNITY_DRAGON_PERKSTYLES_URL = (basePath: string, lang: string) => {
  const locale = lang === "ko_KR" ? "ko_kr" : "default";
  return `https://raw.communitydragon.org/${basePath}/plugins/rcp-be-lol-game-data/global/${locale}/v1/perkstyles.json`;
};
const COMMUNITY_DRAGON_PERKS_URL = (basePath: string, lang: string) => {
  const locale = lang === "ko_KR" ? "ko_kr" : "default";
  return `https://raw.communitydragon.org/${basePath}/plugins/rcp-be-lol-game-data/global/${locale}/v1/perks.json`;
};

const LANGUAGES = ["ko_KR", "en_US"] as const;
const DATA_DIR = path.join(process.cwd(), "public", "data");

// Community Dragon 챔피언 ID 변환
function convertChampionIdToCommunityDragon(championId: string): string {
  return championId.toLowerCase();
}

/**
 * DDragon 버전(예: 15.24.1)을 CommunityDragon 디렉토리 버전(예: 15.24)으로 변환
 */
function toCommunityDragonVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return version;
}

/**
 * DDragon 버전 목록을 기반으로 CDragon에서 시도할 버전 후보를 생성
 * 예: [15.24.1, 15.23.1] -> ["15.24", "15.23", "latest"]
 */
function getCommunityDragonVersionCandidates(ddragonVersions: string[]): string[] {
  const candidates: string[] = [];

  if (ddragonVersions.length > 0) {
    const current = toCommunityDragonVersion(ddragonVersions[0]);
    if (!candidates.includes(current)) {
      candidates.push(current);
    }
  }

  if (ddragonVersions.length > 1) {
    const previous = toCommunityDragonVersion(ddragonVersions[1]);
    if (!candidates.includes(previous)) {
      candidates.push(previous);
    }
  }

  if (!candidates.includes("latest")) {
    candidates.push("latest");
  }

  return candidates;
}

type NormalizationOverrides = {
  champions?: Record<string, Record<string, Partial<NormalizedChampion>>>;
  items?: Record<string, Record<string, Partial<NormalizedItem>>>;
  runes?: Record<string, Record<string, Partial<NormalizedRune>>>;
  statShards?: Record<string, Record<string, Partial<NormalizedStatShard>>>;
};

const NORMALIZATION_OVERRIDES_PATH = path.join(
  process.cwd(),
  "scripts",
  "normalization-overrides.json"
);

let cachedOverrides: NormalizationOverrides | null | undefined;

function getNormalizationOverrides(): NormalizationOverrides | null {
  if (cachedOverrides !== undefined) {
    return cachedOverrides;
  }

  if (!fs.existsSync(NORMALIZATION_OVERRIDES_PATH)) {
    cachedOverrides = null;
    return cachedOverrides;
  }

  try {
    const raw = fs.readFileSync(NORMALIZATION_OVERRIDES_PATH, "utf-8");
    cachedOverrides = JSON.parse(raw) as NormalizationOverrides;
  } catch (e) {
    console.warn(
      "[Overrides] Failed to read normalization-overrides.json:",
      e
    );
    cachedOverrides = null;
  }

  return cachedOverrides;
}

function createLevelScaledScalar(
  stats: Record<string, number | undefined>,
  baseKey: string,
  perLevelKey: string
): LevelScaledScalar {
  const base = stats[baseKey] ?? 0;
  const perLevel = stats[perLevelKey] ?? 0;
  return {
    base,
    perLevel,
  };
}

function buildChampionBaseStats(stats: Record<string, number | undefined>): ChampionBaseStats {
  return {
    health: createLevelScaledScalar(stats, 'hp', 'hpperlevel'),
    healthRegen: createLevelScaledScalar(stats, 'hpregen', 'hpregenperlevel'),
    mana: stats.mp !== undefined || stats.mpperlevel !== undefined
      ? createLevelScaledScalar(stats, 'mp', 'mpperlevel')
      : undefined,
    manaRegen: stats.mpregen !== undefined || stats.mpregenperlevel !== undefined
      ? createLevelScaledScalar(stats, 'mpregen', 'mpregenperlevel')
      : undefined,
    // energy 계열 챔피언은 Data Dragon 에 별도 필드가 없을 수 있으므로 우선 비워둔다.
    energy: undefined,
    energyRegen: undefined,
    attackDamage: createLevelScaledScalar(stats, 'attackdamage', 'attackdamageperlevel'),
    attackSpeed: createLevelScaledScalar(stats, 'attackspeed', 'attackspeedperlevel'),
    armor: createLevelScaledScalar(stats, 'armor', 'armorperlevel'),
    magicResist: createLevelScaledScalar(stats, 'spellblock', 'spellblockperlevel'),
    moveSpeed: { base: stats.movespeed ?? 0, perLevel: 0 },
    attackRange: { base: stats.attackrange ?? 0, perLevel: 0 },
  };
}

function buildBaseStatContributions(baseStats: ChampionBaseStats): StatContribution[] {
  const result: StatContribution[] = [];

  const push = (stat: StatKey, scalar: LevelScaledScalar | undefined) => {
    if (!scalar) return;
    // perLevel 정보가 함께 있으므로 valueType 은 perLevel 로 두고 value 에 perLevel 을 기록한다.
    result.push({
      stat,
      value: scalar.perLevel,
      valueType: 'perLevel',
      source: 'base',
      scope: 'champion-base',
    });
  };

  push(StatKey.MAX_HEALTH, baseStats.health);
  push(StatKey.HEALTH_REGEN, baseStats.healthRegen);
  push(StatKey.MAX_MANA, baseStats.mana);
  push(StatKey.MANA_REGEN, baseStats.manaRegen);
  push(StatKey.ATTACK_DAMAGE, baseStats.attackDamage);
  push(StatKey.ATTACK_SPEED, baseStats.attackSpeed);
  push(StatKey.ARMOR, baseStats.armor);
  push(StatKey.MAGIC_RESIST, baseStats.magicResist);

  return result;
}

type ItemStatMapping = {
  stat: StatKey;
  valueType: "flat" | "percent";
};

const ITEM_STAT_KEY_MAP: Record<string, ItemStatMapping> = {
  FlatHPPoolMod: { stat: StatKey.MAX_HEALTH, valueType: "flat" },
  FlatMPPoolMod: { stat: StatKey.MAX_MANA, valueType: "flat" },
  FlatPhysicalDamageMod: { stat: StatKey.ATTACK_DAMAGE, valueType: "flat" },
  FlatMagicDamageMod: { stat: StatKey.ABILITY_POWER, valueType: "flat" },
  FlatArmorMod: { stat: StatKey.ARMOR, valueType: "flat" },
  FlatSpellBlockMod: { stat: StatKey.MAGIC_RESIST, valueType: "flat" },
  FlatMovementSpeedMod: { stat: StatKey.MOVE_SPEED, valueType: "flat" },
  PercentMovementSpeedMod: { stat: StatKey.MOVE_SPEED, valueType: "percent" },
  PercentAttackSpeedMod: { stat: StatKey.ATTACK_SPEED, valueType: "percent" },
  PercentLifeStealMod: { stat: StatKey.LIFE_STEAL, valueType: "percent" },
  PercentCritChanceMod: { stat: StatKey.CRIT_CHANCE, valueType: "percent" },
  AbilityHaste: { stat: StatKey.ABILITY_HASTE, valueType: "flat" },
};

function mapItemStatsToContributions(
  stats: Record<string, number | undefined>
): StatContribution[] {
  const contributions: StatContribution[] = [];

  for (const [rawKey, rawValue] of Object.entries(stats)) {
    const value = typeof rawValue === "number" ? rawValue : 0;
    if (!value) continue;

    const mapping = ITEM_STAT_KEY_MAP[rawKey];
    if (!mapping) continue;

    contributions.push({
      stat: mapping.stat,
      value,
      valueType: mapping.valueType,
      source: "item",
      scope: "item-passive",
    });
  }

  return contributions;
}

function inferStatShardContributionsFromText(
  text: string
): StatContribution[] {
  const cleaned = text
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const results: StatContribution[] = [];

  const push = (
    stat: StatKey,
    value: number,
    valueType: "flat" | "percent"
  ) => {
    results.push({
      stat,
      value,
      valueType,
      source: "rune",
      scope: "rune",
    });
  };

  // Adaptive Force: "+9 Adaptive Force"
  {
    const m = cleaned.match(/([+\-]?\d+(\.\d+)?)\s*Adaptive Force/i);
    if (m) {
      push(StatKey.ADAPTIVE_FORCE, parseFloat(m[1]), "flat");
      return results;
    }
  }

  // Attack Speed: "+10% Attack Speed"
  {
    const m = cleaned.match(/([+\-]?\d+(\.\d+)?)\s*%?\s*Attack Speed/i);
    if (m) {
      push(StatKey.ATTACK_SPEED, parseFloat(m[1]), "percent");
      return results;
    }
  }

  // Ability Haste: "+8 Ability Haste"
  {
    const m = cleaned.match(/([+\-]?\d+(\.\d+)?)\s*Ability Haste/i);
    if (m) {
      push(StatKey.ABILITY_HASTE, parseFloat(m[1]), "flat");
      return results;
    }
  }

  // Move Speed: "+2.5% Move Speed"
  {
    const m = cleaned.match(/([+\-]?\d+(\.\d+)?)\s*%?\s*Move Speed/i);
    if (m) {
      push(StatKey.MOVE_SPEED, parseFloat(m[1]), "percent");
      return results;
    }
  }

  // Health (flat): "+65 Health"
  {
    const m = cleaned.match(/([+\-]?\d+(\.\d+)?)\s*Health(?!.*based on level)/i);
    if (m) {
      push(StatKey.MAX_HEALTH, parseFloat(m[1]), "flat");
      return results;
    }
  }

  // Tenacity and Slow Resist: "+15% Tenacity and Slow Resist"
  {
    const m = cleaned.match(
      /([+\-]?\d+(\.\d+)?)\s*%?\s*Tenacity and Slow Resist/i
    );
    if (m) {
      const v = parseFloat(m[1]);
      push(StatKey.TENACITY, v, "percent");
      push(StatKey.SLOW_RESIST, v, "percent");
      return results;
    }
  }

  // Health scaling shard: "+10-180 Health (based on level)" – approximate using mid-value
  if (/Health.*based on level/i.test(cleaned)) {
    const rangeMatch = cleaned.match(/([0-9]+)\s*-\s*([0-9]+)/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      const mid = (min + max) / 2;
      push(StatKey.MAX_HEALTH, mid, "flat");
      return results;
    }
  }

  return results;
}

function buildSpellScalingFromCDragon(
  spellIndex: number,
  spellDataMap: Record<string, any> | null
): { parts: FormulaPart[] } {
  if (!spellDataMap) {
    return { parts: [] };
  }

  const key = String(spellIndex);
  const spell = spellDataMap[key];
  if (!spell || !spell.mSpellCalculations) {
    return { parts: [] };
  }

  const calculations = spell.mSpellCalculations as Record<string, any>;
  const calcKeys = Object.keys(calculations);
  if (calcKeys.length === 0) {
    return { parts: [] };
  }

  const priority = [
    'TotalDamage',
    'BaseDamage',
    'QMissileDamage',
    'TotalMaxHealthDamage',
    'HealingCalc',
    'TotalHeal',
    'TotalShield',
  ];

  let chosenKey: string | null = null;
  for (const name of priority) {
    if (name in calculations) {
      chosenKey = name;
      break;
    }
  }

  if (!chosenKey) {
    chosenKey = calcKeys[0];
  }

  const rawRef = `${key}:${chosenKey}`;

  const parts: FormulaPart[] = [
    {
      stat: null,
      coefficient: 1,
      op: 'add',
      rawRef,
    },
  ];

  return { parts };
}

function buildNormalizedSpell(
  slot: ChampionSpellSlot,
  ddSpell: any | null,
  passive: any | null,
  spellIndex: number,
  spellDataMap: Record<string, any> | null
): NormalizedSpell {
  const isPassive = slot === 'P';

  const name =
    (isPassive ? passive?.name ?? '' : ddSpell?.name ?? '') || '';

  const tooltip =
    (isPassive ? passive?.description ?? '' : ddSpell?.tooltip ?? '') || '';

  const cooldowns = Array.isArray(ddSpell?.cooldown)
    ? ddSpell.cooldown.filter((v: any) => typeof v === 'number')
    : undefined;
  const costs = Array.isArray(ddSpell?.cost)
    ? ddSpell.cost.filter((v: any) => typeof v === 'number')
    : undefined;

  const scalingFromCd = buildSpellScalingFromCDragon(spellIndex, spellDataMap);

  const scalingId =
    slot === 'Q' || slot === 'W' || slot === 'E' || slot === 'R'
      ? 'damage'
      : 'passive';

  const scalings =
    scalingFromCd.parts.length > 0
      ? [
          {
            id: scalingId,
            labelEn: isPassive
              ? 'Passive'
              : `${slot} Scaling`,
            labelKo: isPassive ? '패시브' : `${slot} 계수`,
            parts: scalingFromCd.parts,
          },
        ]
      : [];

  return {
    slot,
    key: ddSpell?.id ?? (isPassive ? `${slot}` : `${slot}`),
    name,
    tooltip,
    cooldowns,
    costs,
    scalings,
  };
}

function buildNormalizedChampion(
  lang: string,
  championId: string,
  championDataPath: string,
  cdragonSpellPath: string
): NormalizedChampion | null {
  if (!fs.existsSync(championDataPath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(championDataPath, 'utf-8')) as {
    champion?: any;
  };
  const champion = raw.champion;
  if (!champion) return null;

  const stats = champion.stats || {};
  const baseStats = buildChampionBaseStats(stats);
  const baseStatContributions = buildBaseStatContributions(baseStats);

  let spellDataMap: Record<string, any> | null = null;
  if (fs.existsSync(cdragonSpellPath)) {
    const cdRaw = JSON.parse(fs.readFileSync(cdragonSpellPath, 'utf-8')) as {
      spellData?: Record<string, any>;
    };
    spellDataMap = cdRaw.spellData || null;
  }

  const ddSpells: any[] = Array.isArray(champion.spells)
    ? champion.spells
    : [];
  const passive = champion.passive ?? null;

  const spells: Record<ChampionSpellSlot, NormalizedSpell> = {
    P: buildNormalizedSpell('P', null, passive, -1, spellDataMap),
    Q: buildNormalizedSpell('Q', ddSpells[0] ?? null, null, 0, spellDataMap),
    W: buildNormalizedSpell('W', ddSpells[1] ?? null, null, 1, spellDataMap),
    E: buildNormalizedSpell('E', ddSpells[2] ?? null, null, 2, spellDataMap),
    R: buildNormalizedSpell('R', ddSpells[3] ?? null, null, 3, spellDataMap),
  };

  const name = champion.name ?? championId;

  const iconPath = champion.image?.full
    ? `/lol/img/champion/${champion.image.full}`
    : undefined;

  let normalized: NormalizedChampion = {
    id: championId,
    type: 'champion',
    name,
    iconPath,
    baseStats,
    baseStatContributions,
    spells,
  };

  const overrides = getNormalizationOverrides();
  const championOverrides =
    overrides?.champions?.[lang]?.[championId];
  if (championOverrides) {
    normalized = {
      ...normalized,
      ...championOverrides,
    };
  }

  return normalized;
}

async function buildAndSaveNormalizedItems(
  versionDir: string,
  version: string,
  itemsDataByLang: Record<string, any>
): Promise<void> {
  for (const lang of LANGUAGES) {
    const raw = itemsDataByLang[lang];
    if (!raw || typeof raw !== "object") continue;
    const data = (raw as { data?: Record<string, any> }).data || {};

    const items: NormalizedItem[] = [];

    // 아이템의 태그를 수집하되, 하위 아이템(재귀적) 중에 "Boots" 태그가 있다면
    // 상위 아이템에도 "Boots" 태그를 전파한다. (다른 태그는 전파하지 않음)
    const getTagsWithBootsPropagation = (itemId: string, currentPath: Set<string>): string[] => {
      if (currentPath.has(itemId)) return [];
      
      const targetItem = data[itemId];
      if (!targetItem) return [];

      const myTags = [
        ...(Array.isArray(targetItem.tags) ? targetItem.tags : []),
        ...(Array.isArray(targetItem.cdragon?.categories) ? targetItem.cdragon.categories : []),
      ];

      // 이미 내 태그에 Boots가 있다면 더 확인할 필요 없음 (하지만 재귀적으로 다른 로직이 필요할 수도 있으니 유지 가능)
      // 여기서는 "하위에서 Boots가 발견되면 나에게도 추가"하는 로직이 핵심.
      
      let hasBootsInDescendants = false;

      if (Array.isArray(targetItem.from)) {
        const nextPath = new Set(currentPath);
        nextPath.add(itemId);

        for (const subId of targetItem.from) {
          const childTags = getTagsWithBootsPropagation(String(subId), nextPath);
          if (childTags.includes("Boots")) {
            hasBootsInDescendants = true;
            // Boots는 하나만 있어도 전파되므로, 성능상 break 가능하지만
            // 완전한 탐색이 필요 없다면 break.
            // 여기서는 단순히 포함 여부만 중요하므로 break.
            break;
          }
        }
      }

      if (hasBootsInDescendants && !myTags.includes("Boots")) {
        myTags.push("Boots");
      }

      return myTags;
    };

    for (const [id, item] of Object.entries<any>(data)) {
      const gold = item.gold || {};
      
      const rawTags = getTagsWithBootsPropagation(id, new Set());
      const tags = Array.from(
        new Set(
          rawTags
            .map((t) => (typeof t === "string" ? t.trim() : ""))
            .filter((t) => t.length > 0)
        )
      );

      const name = item.name ?? id;

      // description 파싱 (XML 처리, 변수 치환 실패 시 ? 표시, 경고문구 추가)
      const description = parseItemDescription(
        item.description ?? item.cdragon?.description,
        lang as "ko_KR" | "en_US"
      );

      const statsRecord: Record<string, number | undefined> =
        item.stats || {};
      const stats = mapItemStatsToContributions(statsRecord);

      // 상점/맵 메타데이터 정규화
      const purchasable: boolean | undefined =
        typeof gold.purchasable === "boolean" ? gold.purchasable : undefined;

      // DDragon / CDragon 에서 온 inStore / displayInItemSets 를 단일 boolean 으로 정규화
      const inStore: boolean | undefined =
        typeof item.inStore === "boolean"
          ? (item.inStore as boolean)
          : typeof item.cdragon?.inStore === "boolean"
          ? (item.cdragon.inStore as boolean)
          : undefined;

      const displayInItemSets: boolean | undefined =
        typeof item.displayInItemSets === "boolean"
          ? (item.displayInItemSets as boolean)
          : typeof item.cdragon?.displayInItemSets === "boolean"
          ? (item.cdragon.displayInItemSets as boolean)
          : undefined;

      const mapsRecord: Record<string, boolean> | undefined =
        item.maps && typeof item.maps === "object" ? (item.maps as any) : undefined;
      const availableOnMap11: boolean | undefined =
        mapsRecord && typeof mapsRecord["11"] === "boolean"
          ? (mapsRecord["11"] as boolean)
          : undefined;

      let normalized: NormalizedItem = {
        id,
        type: "item",
        name,
        description,
        iconPath: item.cdragon?.iconPath,
        price: typeof gold.base === "number" ? gold.base : 0,
        priceTotal: typeof gold.total === "number" ? gold.total : 0,
        tags,
        buildsFrom: Array.isArray(item.from) ? item.from : [],
        buildsInto: Array.isArray(item.into) ? item.into : [],
        requiredChampion:
          item.cdragon?.requiredChampion ?? item.requiredChampion,
        requiredAlly: item.cdragon?.requiredAlly ?? item.requiredAlly,
        stats,
        effects: [],
        purchasable,
        inStore,
        displayInItemSets,
        ...(availableOnMap11 !== undefined ? { availableOnMap11 } : {}),
      };

      const overrides = getNormalizationOverrides();
      const itemOverrides = overrides?.items?.[lang]?.[id];
      if (itemOverrides) {
        normalized = {
          ...normalized,
          ...itemOverrides,
        };
      }

      items.push(normalized);
    }

    const file: NormalizedItemDataFile = {
      version,
      lang,
      items,
    };

    await saveToFile(
      file,
      path.join(versionDir, `items-normalized-${lang}.json`)
    );
    console.log(
      `✅ Saved normalized item data for ${lang} (${items.length} items)`
    );
  }
}

async function buildAndSaveNormalizedSummoners(
  versionDir: string,
  version: string,
  summonerDataByLang: Record<string, any>
): Promise<void> {
  for (const lang of LANGUAGES) {
    const raw = summonerDataByLang[lang];
    if (!raw || typeof raw !== "object") continue;

    const data = (raw as { data?: Record<string, any> }).data || {};
    const spells: NormalizedSummonerSpell[] = [];

    for (const [id, spell] of Object.entries<any>(data)) {
      const name =
        typeof spell.name === "string" ? (spell.name as string) : id;
      const tooltip =
        (typeof spell.tooltip === "string" && spell.tooltip) ||
        (typeof spell.description === "string" && spell.description) ||
        "";
      const cooldown: number[] = Array.isArray(spell.cooldown)
        ? (spell.cooldown as number[])
        : [];
      const iconPath: string =
        (spell.image && typeof spell.image.full === "string"
          ? spell.image.full
          : "") || "";
      const modes: string[] = Array.isArray(spell.modes)
        ? (spell.modes as string[])
        : [];

      const normalized: NormalizedSummonerSpell = {
        id,
        key: typeof spell.key === "string" ? spell.key : id,
        name,
        tooltip,
        cooldown,
        iconPath,
        modes,
      };

      spells.push(normalized);
    }

    const file: NormalizedSummonerDataFile = {
      version,
      lang,
      spells,
    };

    await saveToFile(
      file,
      path.join(versionDir, `summoner-normalized-${lang}.json`)
    );
    console.log(
      `✅ Saved normalized summoner spell data for ${lang} (${spells.length} spells)`
    );
  }
}

async function buildAndSaveNormalizedRunesAndStatShards(
  versionDir: string,
  version: string,
  runesDataByLang: Record<string, any>,
  runeStatmodsDataByLang: Record<string, RuneStatShardStaticData | null>
): Promise<void> {
  // 먼저 en_US 스탯 조각에서 id → StatContribution 매핑을 만든다.
  const shardStatById = new Map<number, StatContribution[]>();
  const shardEn = runeStatmodsDataByLang["en_US"];
  if (shardEn && shardEn.groups) {
    for (const group of shardEn.groups) {
      const rows = group.rows || [];
      for (const row of rows) {
        const perks = row.perks || [];
        for (const perk of perks) {
          const text = perk.longDesc || perk.shortDesc || "";
          const contributions = inferStatShardContributionsFromText(text);
          shardStatById.set(perk.id, contributions);
        }
      }
    }
  }

  for (const lang of LANGUAGES) {
    const rawRunes = runesDataByLang[lang];
    const rawShard = runeStatmodsDataByLang[lang];

    const runes: NormalizedRune[] = [];
    const statShards: NormalizedStatShard[] = [];

    if (rawRunes) {
      const trees: any[] = Array.isArray(rawRunes) ? rawRunes : (rawRunes as any[]);

      for (const tree of trees) {
        const pathId: number = tree.id;
        const slots: any[] = Array.isArray(tree.slots) ? tree.slots : [];

        slots.forEach((slot, slotIndex) => {
          const runesInSlot: any[] = Array.isArray(slot.runes) ? slot.runes : [];
          for (const rune of runesInSlot) {
            const name = rune.name ?? String(rune.id);
            const desc =
              (typeof rune.longDesc === "string" && rune.longDesc) ||
              (typeof rune.shortDesc === "string" && rune.shortDesc) ||
              "";

            let normalized: NormalizedRune = {
              id: String(rune.id),
              type: "rune",
              name,
              iconPath: rune.icon,
              pathId,
              slotIndex,
              stats: [],
              effects: [],
              tooltip: desc,
            };

            const overrides = getNormalizationOverrides();
            const runeOverrides =
              overrides?.runes?.[lang]?.[normalized.id];
            if (runeOverrides) {
              normalized = {
                ...normalized,
                ...runeOverrides,
              };
            }

            runes.push(normalized);
          }
        });
      }
    }

    if (rawShard && rawShard.groups) {
      const groups = rawShard.groups || [];
      for (const group of groups) {
        const rows = group.rows || [];
        rows.forEach((row, rowIndex) => {
          const perks = row.perks || [];
          perks.forEach((perk, columnIndex) => {
            const name = perk.name ?? String(perk.id);

            const sharedStats =
              shardStatById.get(perk.id)?.map((c) => ({ ...c })) || [];

            let shard: NormalizedStatShard = {
              id: String(perk.id),
              type: "statShard",
              name,
              iconPath: perk.iconPath,
              rowIndex,
              columnIndex,
              stats: sharedStats,
            };

            const overrides = getNormalizationOverrides();
            const shardOverrides =
              overrides?.statShards?.[lang]?.[shard.id];
            if (shardOverrides) {
              shard = {
                ...shard,
                ...shardOverrides,
              };
            }

            statShards.push(shard);
          });
        });
      }
    }

    const file: NormalizedRuneDataFile = {
      version,
      lang,
      runes,
      statShards,
    };

    await saveToFile(
      file,
      path.join(versionDir, `runes-normalized-${lang}.json`)
    );
    console.log(
      `✅ Saved normalized rune data for ${lang} (${runes.length} runes, ${statShards.length} stat shards)`
    );
  }
}

// 실제 챔피언 경로 찾기
function findActualChampionPath(
  data: Record<string, unknown>,
  championId: string
): string | null {
  const lowerChampionId = championId.toLowerCase();
  const path = `Characters/${championId}/CharacterRecords/Root`;

  if (path in data) {
    return path.split('/').slice(0, 2).join('/');
  }

  const matchingKeys = Object.keys(data).filter(key => {
    const keyLower = key.toLowerCase();
    return keyLower.includes(`characters/${lowerChampionId}/`) || 
           keyLower.includes(`characters/${championId.toLowerCase()}/`);
  });
  
  if (matchingKeys.length > 0) {
    const firstKey = matchingKeys[0];
    const match = firstKey.match(/Characters\/([^/]+)/i);
    if (match && match[1]) {
      return `Characters/${match[1]}`;
    }
  }
  
  return null;
}

// 스킬 순서 매핑 추출
function extractSpellOrderMapping(
  data: Record<string, unknown>,
  championId: string
): { spellOrder: string[]; actualChampionPath: string | null } {
  const actualChampionPath = findActualChampionPath(data, championId);
  
  if (!actualChampionPath) {
    return { spellOrder: [], actualChampionPath: null };
  }
  
  const rootPath = `${actualChampionPath}/CharacterRecords/Root`;
  const root = data[rootPath] as Record<string, unknown> | undefined;
  
  if (root && root.spells && Array.isArray(root.spells)) {
    const spellPaths = root.spells as string[];
    return { spellOrder: spellPaths, actualChampionPath };
  }
  
  return { spellOrder: [], actualChampionPath };
}

// Community Dragon 스킬 데이터 추출
function extractSpellData(data: Record<string, unknown>, championId: string): Record<string, Record<string, any>> {
  const cdChampionId = convertChampionIdToCommunityDragon(championId);
  const { spellOrder, actualChampionPath } = extractSpellOrderMapping(data, cdChampionId);
  
  const spellDataMap: Record<string, Record<string, any>> = {};
  
  // 스킬 순서에 따라 데이터 추출
  for (let i = 0; i < spellOrder.length; i++) {
    const spellPath = spellOrder[i];
    if (!spellPath) continue;
    
    const spellObj = data[spellPath] as Record<string, unknown> | undefined;
    
    if (!spellObj) {
      continue;
    }
    
    if (spellObj && spellObj.mSpell) {
      const mSpell = spellObj.mSpell as Record<string, unknown>;
      const spellData: Record<string, any> = {};
      
      // 1. DataValues 파싱
      if (mSpell.DataValues && Array.isArray(mSpell.DataValues)) {
        const dataValues: Record<string, (number | string)[]> = {};
        for (const dv of mSpell.DataValues as Array<{ mName?: string; mValues?: (number | string)[] }>) {
          if (dv.mName && dv.mValues && Array.isArray(dv.mValues)) {
            dataValues[dv.mName] = dv.mValues;
          }
        }
        
        // mAmmoRechargeTime도 추가 (ammo 스킬용)
        if (mSpell.mAmmoRechargeTime && Array.isArray(mSpell.mAmmoRechargeTime)) {
          dataValues["mAmmoRechargeTime"] = mSpell.mAmmoRechargeTime as (number | string)[];
        }
        
        if (Object.keys(dataValues).length > 0) {
          spellData.DataValues = dataValues;
        }
      }
      
      // 2. mSpellCalculations 파싱
      if (mSpell.mSpellCalculations && typeof mSpell.mSpellCalculations === 'object' && mSpell.mSpellCalculations !== null) {
        spellData.mSpellCalculations = mSpell.mSpellCalculations;
      }
      
      // 3. mClientData 파싱
      if (spellObj.mClientData && typeof spellObj.mClientData === 'object' && spellObj.mClientData !== null) {
        spellData.mClientData = spellObj.mClientData;
      }
      
      if (Object.keys(spellData).length > 0) {
        spellDataMap[i.toString()] = spellData;
        const spellName = spellPath.split("/").pop() || "";
        if (spellName) {
          spellDataMap[spellName] = spellData;
        }
      }
    }
  }
  
  // 추가로 모든 AbilityObject를 순회하며 누락된 스킬 찾기
  const championPathForSearch = actualChampionPath || `Characters/${cdChampionId}`;
  for (const key in data) {
    const keyLower = key.toLowerCase();
    const searchPathLower = championPathForSearch.toLowerCase();
    if (keyLower.includes(`${searchPathLower}/spells/`) && keyLower.includes("ability")) {
      const abilityObj = data[key] as Record<string, unknown> | undefined;
      if (abilityObj && abilityObj.mRootSpell) {
        const rootSpellPath = abilityObj.mRootSpell as string;
        const spellObj = data[rootSpellPath] as Record<string, unknown> | undefined;
        
        if (spellObj && spellObj.mSpell) {
          const mSpell = spellObj.mSpell as Record<string, unknown>;
          const spellName = rootSpellPath.split("/").pop() || "";
          
          // 이미 추가된 스킬이 아니면 추가
          if (!spellDataMap[spellName]) {
            const spellData: Record<string, any> = {};
            
            // 1. DataValues 파싱
            if (mSpell.DataValues && Array.isArray(mSpell.DataValues)) {
              const dataValues: Record<string, (number | string)[]> = {};
              for (const dv of mSpell.DataValues as Array<{ mName?: string; mValues?: (number | string)[] }>) {
                if (dv.mName && dv.mValues && Array.isArray(dv.mValues)) {
                  dataValues[dv.mName] = dv.mValues;
                }
              }
              
              // mAmmoRechargeTime도 추가 (ammo 스킬용)
              if (mSpell.mAmmoRechargeTime && Array.isArray(mSpell.mAmmoRechargeTime)) {
                dataValues["mAmmoRechargeTime"] = mSpell.mAmmoRechargeTime as (number | string)[];
              }
              
              if (Object.keys(dataValues).length > 0) {
                spellData.DataValues = dataValues;
              }
            }
            
            // 2. mSpellCalculations 파싱
            if (mSpell.mSpellCalculations && typeof mSpell.mSpellCalculations === 'object' && mSpell.mSpellCalculations !== null) {
              spellData.mSpellCalculations = mSpell.mSpellCalculations;
            }
            
            // 3. mClientData 파싱
            if (spellObj.mClientData && typeof spellObj.mClientData === 'object' && spellObj.mClientData !== null) {
              spellData.mClientData = spellObj.mClientData;
            }
            
            if (Object.keys(spellData).length > 0) {
              spellDataMap[spellName] = spellData;
            }
          }
        }
      }
    }
  }
  
  return spellDataMap;
}

async function fetchJson(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching: ${url}${i > 0 ? ` (retry ${i})` : ''}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      if (i === retries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

async function saveToFile(data: any, filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Saved: ${filePath}`);
}

/**
 * CDragon에서 챔피언 스펠 데이터를 가져올 때,
 * DDragon 기준 버전 목록을 이용해 다음 순서로 시도:
 * 1) 현재 패치 버전 (예: 15.24)
 * 2) 직전 패치 버전 (예: 15.23)
 * 3) latest
 */
async function fetchCommunityDragonDataWithFallback(
  cdChampionId: string,
  versionCandidates: string[]
): Promise<{ data: Record<string, unknown> | null; cdragonVersion: string | null }> {
  for (const basePath of versionCandidates) {
    const url = COMMUNITY_DRAGON_URL(basePath, cdChampionId);
    try {
      console.log(`Fetching CDragon: ${url}`);
      const response = await fetch(url);

      if (response.status === 404) {
        console.warn(`[CD] ${cdChampionId} not found at ${basePath} (404), trying next candidate...`);
        continue;
      }

      if (!response.ok) {
        console.warn(
          `[CD] Failed to fetch ${cdChampionId} at ${basePath}. status=${response.status}. Trying next candidate...`
        );
        continue;
      }

      const json = (await response.json()) as Record<string, unknown>;
      return { data: json, cdragonVersion: basePath };
    } catch (error) {
      console.warn(
        `[CD] Error while fetching ${cdChampionId} at ${basePath}:`,
        error
      );
      // 네트워크 오류 등도 다음 후보로 계속 시도
      continue;
    }
  }

  console.error(`[CD] All CommunityDragon candidates failed for ${cdChampionId}`);
  return { data: null, cdragonVersion: null };
}

interface CommunityDragonItem {
  id: number;
  name: string;
  description: string;
  active?: boolean;
  inStore?: boolean;
  from?: number[];
  to?: number[];
  categories?: string[];
  maxStacks?: number;
  requiredChampion?: string;
  requiredAlly?: string;
  requiredBuffCurrencyName?: string;
  requiredBuffCurrencyCost?: number;
  specialRecipe?: number;
  isEnchantment?: boolean;
  price?: number;
  priceTotal?: number;
  displayInItemSets?: boolean;
  iconPath?: string;
}

async function fetchCommunityDragonItemsWithFallback(
  lang: string,
  versionCandidates: string[]
): Promise<{ items: CommunityDragonItem[] | null; cdragonVersion: string | null }> {
  const resultsLocale = lang === "ko_KR" ? "ko_KR" : "default";

  for (const basePath of versionCandidates) {
    const url = COMMUNITY_DRAGON_ITEMS_URL(basePath, lang);
    try {
      console.log(`Fetching CDragon items (${resultsLocale}): ${url}`);
      const response = await fetch(url);

      if (response.status === 404) {
        console.warn(
          `[CD][Items] Not found for ${resultsLocale} at ${basePath} (404), trying next candidate...`
        );
        continue;
      }

      if (!response.ok) {
        console.warn(
          `[CD][Items] Failed to fetch ${resultsLocale} at ${basePath}. status=${response.status}. Trying next candidate...`
        );
        continue;
      }

      const json = (await response.json()) as unknown;
      if (!Array.isArray(json)) {
        console.warn(
          `[CD][Items] Unexpected response format for ${resultsLocale} at ${basePath}`
        );
        continue;
      }

      return { items: json as CommunityDragonItem[], cdragonVersion: basePath };
    } catch (error) {
      console.warn(
        `[CD][Items] Error while fetching items for ${resultsLocale} at ${basePath}:`,
        error
      );
      // 네트워크 오류 등도 다음 후보로 계속 시도
      continue;
    }
  }

  console.error(
    `[CD][Items] All CommunityDragon item candidates failed for ${resultsLocale}`
  );
  return { items: null, cdragonVersion: null };
}

interface RuneStatShard {
  id: number;
  name: string;
  iconPath: string;
  shortDesc: string;
  longDesc: string;
}

interface RuneStatShardRow {
  label: string;
  perks: RuneStatShard[];
}

interface RuneStatShardGroup {
  styleId: number;
  styleName: string;
  rows: RuneStatShardRow[];
}

interface RuneStatShardStaticData {
  version: string;
  lang: string;
  cdragonVersion: string | null;
  groups: RuneStatShardGroup[];
}

async function fetchRuneStatShardsWithFallback(
  lang: string,
  versionCandidates: string[],
  ddragonVersion: string
): Promise<RuneStatShardStaticData | null> {
  const resultsLocale = lang === "ko_KR" ? "ko_KR" : "default";

  for (const basePath of versionCandidates) {
    const perkstylesUrl = COMMUNITY_DRAGON_PERKSTYLES_URL(basePath, lang);
    const perksUrl = COMMUNITY_DRAGON_PERKS_URL(basePath, lang);

    try {
      console.log(
        `Fetching CDragon rune stat shards (${resultsLocale}): ${perkstylesUrl} & perks.json`
      );

      const [stylesRes, perksRes] = await Promise.all([
        fetch(perkstylesUrl),
        fetch(perksUrl),
      ]);

      if (stylesRes.status === 404 || perksRes.status === 404) {
        console.warn(
          `[CD][Runes] Stat shard data not found for ${resultsLocale} at ${basePath} (404), trying next candidate...`
        );
        continue;
      }

      if (!stylesRes.ok || !perksRes.ok) {
        console.warn(
          `[CD][Runes] Failed to fetch stat shard data for ${resultsLocale} at ${basePath}. status=${stylesRes.status}/${perksRes.status}. Trying next candidate...`
        );
        continue;
      }

      const stylesJson = (await stylesRes.json()) as any;
      const perksJson = (await perksRes.json()) as any;

      const styles: any[] | null = Array.isArray(stylesJson)
        ? stylesJson
        : stylesJson && Array.isArray(stylesJson.styles)
        ? (stylesJson.styles as any[])
        : null;

      if (!styles || !Array.isArray(perksJson)) {
        console.warn(
          `[CD][Runes] Unexpected stat shard response format for ${resultsLocale} at ${basePath}`
        );
        continue;
      }

      const perkMap = new Map<number, any>();
      for (const perk of perksJson) {
        if (!perk || typeof perk.id !== "number") continue;
        perkMap.set(perk.id, perk);
      }

      // kStatMod는 보통 슬롯의 type으로 설정되어 있으므로,
      // 1) style.type === "kStatMod" 이거나
      // 2) slots 중 하나라도 slot.type === "kStatMod" 인 스타일만 추출
      const kStatModStyles = styles.filter((style) => {
        if (!style) return false;
        if (style.type === "kStatMod") return true;
        const slots = Array.isArray(style.slots) ? style.slots : [];
        return slots.some((slot: any) => slot && slot.type === "kStatMod");
      });

      if (kStatModStyles.length === 0) {
        console.warn(
          `[CD][Runes] No kStatMod styles found for ${resultsLocale} at ${basePath}`
        );
        continue;
      }

      const groups: RuneStatShardGroup[] = [];

      for (const style of kStatModStyles) {
        const styleId: number = style.id;
        const styleName: string = style.name || "";
        const slots: any[] = Array.isArray(style.slots) ? style.slots : [];

        const rows: RuneStatShardRow[] = [];

        // kStatMod 슬롯만 선택
        const statModSlots = slots.filter(
          (slot) => slot && slot.type === "kStatMod"
        );

        for (const slot of statModSlots) {
          const label: string =
            slot.name ||
            slot.label ||
            slot.localizedName ||
            slot.slotLabel ||
            "";
          const perkIds: number[] = Array.isArray(slot.perks)
            ? slot.perks
            : [];

          const perks: RuneStatShard[] = [];
          for (const perkId of perkIds) {
            const perk = perkMap.get(perkId);
            if (!perk) continue;

            perks.push({
              id: perk.id,
              name: perk.name,
              iconPath: perk.iconPath,
              shortDesc: perk.shortDesc,
              longDesc: perk.longDesc,
            });
          }

          if (perks.length > 0) {
            rows.push({
              label,
              perks,
            });
          }
        }

        if (rows.length > 0) {
          groups.push({
            styleId,
            styleName,
            rows,
          });
        }
      }

      if (groups.length === 0) {
        console.warn(
          `[CD][Runes] No stat shard groups constructed for ${resultsLocale} at ${basePath}`
        );
        continue;
      }

      return {
        version: ddragonVersion,
        lang,
        cdragonVersion: basePath,
        groups,
      };
    } catch (error) {
      console.warn(
        `[CD][Runes] Error while fetching stat shard data for ${resultsLocale} at ${basePath}:`,
        error
      );
      continue;
    }
  }

  console.error(
    `[CD][Runes] All CommunityDragon stat shard candidates failed for ${resultsLocale}`
  );
  return null;
}

async function main() {
  console.log('🚀 Starting static data generation...\n');

  try {
    console.log('📦 Fetching version information...');
    const versions: string[] = await fetchJson(VERSION_URL);
    const version = versions[0];
    console.log(`✅ Latest DDragon version: ${version}`);

    const cdVersionCandidates = getCommunityDragonVersionCandidates(versions);
    console.log(`✅ CommunityDragon version candidates: ${cdVersionCandidates.join(', ')}\n`);

    console.log('🗑️  Cleaning up old version directories...');
    if (fs.existsSync(DATA_DIR)) {
      const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== version) {
          const oldVersionDir = path.join(DATA_DIR, entry.name);
          console.log(`   Removing old version: ${entry.name}`);
          fs.rmSync(oldVersionDir, { recursive: true, force: true });
        }
      }
    }

    const versionDir = path.join(DATA_DIR, version);
    const championsDir = path.join(versionDir, 'champions');
    const spellsDir = path.join(versionDir, 'spells');

    // 이번 정적 빌드에서 실제로 사용된 CDragon 버전을 추적한다.
    // - 기본값은 "현재 패치" 후보 (예: 15.24)
    // - 한 명이라도 폴백(15.23, latest 등)을 사용하면, 그 폴백 버전을 version.json에 반영한다.
    let usedFallbackCdragonVersion: string | null = null;

    const runesDataByLang: Record<string, any> = {};
    const runeStatmodsDataByLang: Record<string, RuneStatShardStaticData | null> = {};
    const itemsDataByLang: Record<string, any> = {};
    const summonerDataByLang: Record<string, any> = {};

    for (const lang of LANGUAGES) {
      console.log(`📋 Fetching champion list for ${lang}...`);
      const champListData = await fetchJson(CHAMP_LIST_URL(version, lang));

      const champions = Object.values(champListData.data || {}).sort(
        (a: any, b: any) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      );

      console.log(`✅ Fetched ${champions.length} champions for ${lang}`);

      console.log(`📜 Fetching runes for ${lang}...`);
      const runesData = await fetchJson(RUNES_URL(version, lang));
      runesDataByLang[lang] = runesData;
      console.log(`✅ Fetched runes for ${lang}`);

      console.log(`✨ Fetching rune stat shards (secondary runes) for ${lang}...`);
      try {
        const statShardData = await fetchRuneStatShardsWithFallback(
          lang,
          cdVersionCandidates,
          version
        );

        if (statShardData && statShardData.groups.length > 0) {
          // 폴백 버전 사용 여부 기록
          if (
            statShardData.cdragonVersion &&
            cdVersionCandidates.length > 0 &&
            statShardData.cdragonVersion !== cdVersionCandidates[0]
          ) {
            if (!usedFallbackCdragonVersion) {
              usedFallbackCdragonVersion = statShardData.cdragonVersion;
            }
          }
          runeStatmodsDataByLang[lang] = statShardData;
          console.log(`✅ Generated rune stat shards for ${lang}`);
        } else {
          console.warn(
            `[CD][Runes] No stat shard data generated for ${lang}`
          );
        }
      } catch (error) {
        console.warn(
          `[CD][Runes] Failed to generate rune stat shards for ${lang}:`,
          error
        );
      }

      console.log(`🧱 Fetching items for ${lang}...`);
      const itemsData = await fetchJson(ITEMS_URL(version, lang));

      let combinedItemsData: any = itemsData;

      try {
        const { items: cdItems, cdragonVersion: itemsCdragonVersion } =
          await fetchCommunityDragonItemsWithFallback(lang, cdVersionCandidates);

        if (
          itemsCdragonVersion &&
          cdVersionCandidates.length > 0 &&
          itemsCdragonVersion !== cdVersionCandidates[0]
        ) {
          // 첫 번째로 발견된 폴백 버전을 채택 (예: 15.23)
          if (!usedFallbackCdragonVersion) {
            usedFallbackCdragonVersion = itemsCdragonVersion;
          }
        }

        if (
          cdItems &&
          Array.isArray(cdItems) &&
          combinedItemsData &&
          typeof combinedItemsData === "object" &&
          (combinedItemsData as any).data &&
          typeof (combinedItemsData as any).data === "object"
        ) {
          const cdItemMap = new Map<string, CommunityDragonItem>();
          for (const cdItem of cdItems) {
            if (!cdItem || typeof cdItem.id !== "number") continue;
            const key = String(cdItem.id);
            if (!cdItemMap.has(key)) {
              cdItemMap.set(key, cdItem);
            }
          }

          const originalData = (combinedItemsData as any).data as Record<
            string,
            Record<string, unknown>
          >;
          const mergedData: typeof originalData = { ...originalData };

          for (const [id, item] of Object.entries(mergedData)) {
            const cdItem = cdItemMap.get(id);
            if (!cdItem) continue;

            const existing = item as Record<string, unknown>;

            const cdragonPayload = {
              id: cdItem.id,
              name: cdItem.name,
              description: cdItem.description,
              active: cdItem.active,
              inStore: cdItem.inStore,
              from: cdItem.from,
              to: cdItem.to,
              categories: cdItem.categories,
              maxStacks: cdItem.maxStacks,
              requiredChampion: cdItem.requiredChampion,
              requiredAlly: cdItem.requiredAlly,
              requiredBuffCurrencyName: cdItem.requiredBuffCurrencyName,
              requiredBuffCurrencyCost: cdItem.requiredBuffCurrencyCost,
              specialRecipe: cdItem.specialRecipe,
              isEnchantment: cdItem.isEnchantment,
              price: cdItem.price,
              priceTotal: cdItem.priceTotal,
              displayInItemSets: cdItem.displayInItemSets,
              iconPath: cdItem.iconPath,
            };

            (existing as any).cdragon = cdragonPayload;

            // CDragon의 inStore 정보가 있으면 우선 사용
            if (typeof cdItem.inStore === "boolean") {
              (existing as any).inStore = cdItem.inStore;
            }
          }

          combinedItemsData = {
            ...(combinedItemsData as any),
            data: mergedData,
          };
        }
      } catch (error) {
        console.warn(
          `[CD][Items] Failed to merge CommunityDragon items for ${lang}:`,
          error
        );
      }
      itemsDataByLang[lang] = combinedItemsData;
      console.log(`✅ Fetched & merged items for ${lang}\n`);

      console.log(`📘 Fetching summoner spells for ${lang}...`);
      try {
        const summonerData = await fetchJson(SUMMONER_URL(version, lang));
        summonerDataByLang[lang] = summonerData;
        console.log(`✅ Fetched summoner spells for ${lang}\n`);
      } catch (error) {
        console.warn(
          `❌ Failed to fetch/save summoner spells for ${lang}:`,
          error
        );
      }
    }

    const koChampListData = await fetchJson(CHAMP_LIST_URL(version, 'ko_KR'));
    const championIds = Object.keys(koChampListData.data || {});
    console.log(`📚 Processing ${championIds.length} champions...\n`);

    const BATCH_SIZE = 10;
    for (let i = 0; i < championIds.length; i += BATCH_SIZE) {
      const batch = championIds.slice(i, i + BATCH_SIZE);
      console.log(`📥 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(championIds.length / BATCH_SIZE)} (${batch.length} champions)...`);
      
      const championPromises = batch.flatMap(championId =>
        LANGUAGES.map(async (lang) => {
          try {
            const champData = await fetchJson(CHAMP_INFO_URL(version, lang, championId));
            const champion = champData.data?.[championId];
            if (champion) {
              const championInfo = {
                version,
                lang,
                champion,
              };
              await saveToFile(championInfo, path.join(championsDir, `${championId}-${lang}.json`));
              return { championId, lang, success: true };
            }
            return { championId, lang, success: false };
          } catch (error) {
            console.error(`❌ Failed to fetch ${championId} (${lang}):`, error);
            return { championId, lang, success: false };
          }
        })
      );

      const results = await Promise.all(championPromises);
      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Processed batch: ${successCount}/${results.length} successful\n`);
    }
    console.log('⚡ Fetching Community Dragon spell data...');
    const BATCH_SIZE_CD = 5;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < championIds.length; i += BATCH_SIZE_CD) {
      const batch = championIds.slice(i, i + BATCH_SIZE_CD);
      console.log(`📥 Processing CD batch ${Math.floor(i / BATCH_SIZE_CD) + 1}/${Math.ceil(championIds.length / BATCH_SIZE_CD)} (${batch.length} champions)...`);
      
      const spellPromises = batch.map(async (championId) => {
        try {
          const cdChampionId = convertChampionIdToCommunityDragon(championId);
          const { data: cdData, cdragonVersion } =
            await fetchCommunityDragonDataWithFallback(
              cdChampionId,
              cdVersionCandidates
            );

          if (!cdData) {
            console.log(`❌ Failed to fetch any CommunityDragon data for ${championId}`);
            failCount++;
            return { championId, success: false };
          }

          // 폴백 버전 사용 여부 기록
          if (
            cdragonVersion &&
            cdVersionCandidates.length > 0 &&
            cdragonVersion !== cdVersionCandidates[0]
          ) {
            // 첫 번째로 발견된 폴백 버전을 채택 (예: 15.23)
            if (!usedFallbackCdragonVersion) {
              usedFallbackCdragonVersion = cdragonVersion;
            }
          }

          const spellData = extractSpellData(cdData, championId);
          
          if (Object.keys(spellData).length > 0) {
            const spellInfo = {
              // DDragon 기준 버전 (정적 데이터 디렉터리 버전)
              version,
              ddragonVersion: version,
              // 실제로 사용한 CDragon 버전 (예: "15.23" 또는 "latest")
              cdragonVersion,
              championId,
              spellData,
            };
            await saveToFile(spellInfo, path.join(spellsDir, `${championId}.json`));
            successCount++;
            return { championId, success: true };
          } else {
            console.log(`⚠️  No spell data found for ${championId}`);
            failCount++;
            return { championId, success: false };
          }
        } catch (error) {
          console.error(`❌ Failed to fetch CD data for ${championId}:`, error);
          failCount++;
          return { championId, success: false };
        }
      });

      await Promise.all(spellPromises);
    }

    console.log(`\n✅ Community Dragon data: ${successCount} successful, ${failCount} failed\n`);

    console.log("🧩 Building normalized champion data...");
    for (const lang of LANGUAGES) {
      const normalizedChampions: NormalizedChampion[] = [];

      for (const championId of championIds) {
        const championDataPath = path.join(
          championsDir,
          `${championId}-${lang}.json`
        );
        const cdragonSpellPath = path.join(spellsDir, `${championId}.json`);

        const normalized = buildNormalizedChampion(
          lang,
          championId,
          championDataPath,
          cdragonSpellPath
        );

        if (normalized) {
          normalizedChampions.push(normalized);
        }
      }

      const normalizedFile: NormalizedChampionDataFile = {
        version,
        lang,
        champions: normalizedChampions,
      };

      await saveToFile(
        normalizedFile,
        path.join(
          versionDir,
          `champions-normalized-${lang}.json`
        )
      );
      console.log(
        `✅ Saved normalized champion data for ${lang} (${normalizedChampions.length} champions)`
      );
    }

    console.log("🧩 Building normalized item and rune data...");
    await buildAndSaveNormalizedItems(versionDir, version, itemsDataByLang);
    await buildAndSaveNormalizedRunesAndStatShards(
      versionDir,
      version,
      runesDataByLang,
      runeStatmodsDataByLang
    );
    console.log("🧩 Building normalized summoner spell data...");
    await buildAndSaveNormalizedSummoners(
      versionDir,
      version,
      summonerDataByLang
    );

    // 최종적으로 version.json 에 반영할 CDragon 버전 결정
    const finalCdragonVersion =
      usedFallbackCdragonVersion ??
      cdVersionCandidates[0] ??
      toCommunityDragonVersion(version);

    const versionInfo = {
      // 기존 필드(하위 호환)
      version,
      // 명시적인 필드 이름들
      ddragonVersion: version,
      // 이번 정적 빌드에서 "실제로" 사용된 CDragon 기준 버전
      cdragonVersion: finalCdragonVersion,
    };
    await saveToFile(versionInfo, path.join(DATA_DIR, "version.json"));

    console.log(`\n🎉 Static data generation completed!`);
    console.log(`📁 Data saved to: ${versionDir}`);
    console.log(`📊 DDragon Version: ${version}`);
    console.log(`🌐 Languages: ${LANGUAGES.join(", ")}`);
    console.log(`👥 Champions: ${championIds.length}`);
    console.log(`🐉 CommunityDragon Version (effective): ${finalCdragonVersion}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

