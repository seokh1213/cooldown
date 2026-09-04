import * as fs from "fs";
import * as path from "path";
import type {
  NormalizedChampion,
  NormalizedChampionDataFile,
  NormalizedItemDataFile,
  NormalizedRune,
  NormalizedRuneDataFile,
  NormalizedStatShard,
  NormalizedSummonerDataFile,
} from "../src/types/combatNormalized";
import type { StatContribution } from "../src/types/combatStats";
import { StatKey } from "../src/types/combatStats";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";
import { resolveStaticDataRelease } from "../src/lib/staticDataRelease";
import {
  extractPassiveSpell,
  localizePassiveTooltip,
  PASSIVE_TOOLTIP_LOCALES,
  type LocalizedPassiveTooltip,
  type PassiveTooltipLocale,
  type ExtractedPassiveSpell,
} from "./passive-tooltip-data";
import { extractActiveSpells } from "./data-pipeline/cdragon-active-spells";
import type {
  ActiveSpellSourceData,
  ExtractedActiveSpellData,
} from "./data-pipeline/cdragon-active-spells";
import { validateGeneratedAbilities } from "./data-pipeline/ability-validation";
import {
  assertActiveTooltipReport,
  validateActiveTooltipFiles,
  type ActiveTooltipAllowlist,
} from "./data-pipeline/active-tooltip-validation";
import { localizeActiveTooltip } from "./data-pipeline/active-tooltip-data";
import type { DataLocale, StringTable } from "./data-pipeline/localization";
import type { StaticDataSources } from "../src/data/contracts/staticData";
import { writeChampionV2Dataset } from "./data-pipeline/champion-v2-writer";
import { pruneIntermediateData } from "./data-pipeline/prune-intermediate-data";
import { validateAbilitySimulations } from "./data-pipeline/ability-simulation-validation";
import { buildNormalizedChampion } from "./data-pipeline/normalization/champion";
import { getNormalizationOverrides } from "./data-pipeline/normalization/overrides";
import { normalizeItems } from "./data-pipeline/normalization/item";
import { normalizeSummonerSpells } from "./data-pipeline/normalization/summoner";

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
const toCommunityDragonLocale = (lang: string) => {
  if (lang === "ko_KR") return "ko_kr";
  if (lang === "zh_CN") return "zh_cn";
  return "default";
};
const COMMUNITY_DRAGON_ITEMS_URL = (basePath: string, lang: string) => {
  const locale = toCommunityDragonLocale(lang);
  return `https://raw.communitydragon.org/${basePath}/plugins/rcp-be-lol-game-data/global/${locale}/v1/items.json`;
};
const COMMUNITY_DRAGON_PERKSTYLES_URL = (basePath: string, lang: string) => {
  const locale = toCommunityDragonLocale(lang);
  return `https://raw.communitydragon.org/${basePath}/plugins/rcp-be-lol-game-data/global/${locale}/v1/perkstyles.json`;
};
const COMMUNITY_DRAGON_PERKS_URL = (basePath: string, lang: string) => {
  const locale = toCommunityDragonLocale(lang);
  return `https://raw.communitydragon.org/${basePath}/plugins/rcp-be-lol-game-data/global/${locale}/v1/perks.json`;
};
const COMMUNITY_DRAGON_STRINGTABLE_URL = (
  basePath: string,
  lang: PassiveTooltipLocale
) =>
  `https://raw.communitydragon.org/${basePath}/game/${lang.toLowerCase()}/data/menu/en_us/lol.stringtable.json`;

const LANGUAGES = PASSIVE_TOOLTIP_LOCALES;
const DATA_DIR = path.join(process.cwd(), "public", "data");

// Community Dragon 챔피언 ID 변환
function convertChampionIdToCommunityDragon(championId: string): string {
  return championId.toLowerCase();
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
    const m = cleaned.match(/([+-]?\d+(\.\d+)?)\s*Adaptive Force/i);
    if (m) {
      push(StatKey.ADAPTIVE_FORCE, parseFloat(m[1]), "flat");
      return results;
    }
  }

  // Attack Speed: "+10% Attack Speed"
  {
    const m = cleaned.match(/([+-]?\d+(\.\d+)?)\s*%?\s*Attack Speed/i);
    if (m) {
      push(StatKey.ATTACK_SPEED, parseFloat(m[1]), "percent");
      return results;
    }
  }

  // Ability Haste: "+8 Ability Haste"
  {
    const m = cleaned.match(/([+-]?\d+(\.\d+)?)\s*Ability Haste/i);
    if (m) {
      push(StatKey.ABILITY_HASTE, parseFloat(m[1]), "flat");
      return results;
    }
  }

  // Move Speed: "+2.5% Move Speed"
  {
    const m = cleaned.match(/([+-]?\d+(\.\d+)?)\s*%?\s*Move Speed/i);
    if (m) {
      push(StatKey.MOVE_SPEED, parseFloat(m[1]), "percent");
      return results;
    }
  }

  // Health (flat): "+65 Health"
  {
    const m = cleaned.match(/([+-]?\d+(\.\d+)?)\s*Health(?!.*based on level)/i);
    if (m) {
      push(StatKey.MAX_HEALTH, parseFloat(m[1]), "flat");
      return results;
    }
  }

  // Tenacity and Slow Resist: "+15% Tenacity and Slow Resist"
  {
    const m = cleaned.match(
      /([+-]?\d+(\.\d+)?)\s*%?\s*Tenacity and Slow Resist/i
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

async function buildAndSaveNormalizedItems(
  versionDir: string,
  patchVersion: string,
  sources: StaticDataSources,
  itemsDataByLang: Record<string, unknown>
): Promise<void> {
  for (const lang of LANGUAGES) {
    const raw = itemsDataByLang[lang];
    if (!raw || typeof raw !== "object") continue;
    const items = normalizeItems(lang, raw);

    const file: NormalizedItemDataFile = {
      schemaVersion: 2,
      patchVersion,
      locale: lang,
      sources,
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
  patchVersion: string,
  sources: StaticDataSources,
  summonerDataByLang: Record<string, unknown>
): Promise<void> {
  for (const lang of LANGUAGES) {
    const raw = summonerDataByLang[lang];
    if (!raw || typeof raw !== "object") continue;
    const spells = normalizeSummonerSpells(raw);

    const file: NormalizedSummonerDataFile = {
      schemaVersion: 2,
      patchVersion,
      locale: lang,
      sources,
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
  patchVersion: string,
  sources: StaticDataSources,
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
      schemaVersion: 2,
      patchVersion,
      locale: lang,
      sources,
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

const stringTableCache = new Map<string, Promise<StringTable>>();

function fetchStringTable(
  basePath: string,
  lang: PassiveTooltipLocale
): Promise<StringTable> {
  const cacheKey = `${basePath}:${lang}`;
  const cached = stringTableCache.get(cacheKey);
  if (cached) return cached;

  const request = fetchJson(
    COMMUNITY_DRAGON_STRINGTABLE_URL(basePath, lang)
  ) as Promise<StringTable>;
  stringTableCache.set(cacheKey, request);
  return request;
}

async function buildLocalizedPassiveTooltips(
  basePath: string,
  passive: ReturnType<typeof extractPassiveSpell>
): Promise<Record<PassiveTooltipLocale, LocalizedPassiveTooltip> | null> {
  if (!passive) return null;

  const entries = await Promise.all(
    PASSIVE_TOOLTIP_LOCALES.map(async (lang) => {
      try {
        const stringTable = await fetchStringTable(basePath, lang);
        return [lang, localizePassiveTooltip(passive, stringTable, lang)] as const;
      } catch (error) {
        console.warn(
          `[CD][Passive] Failed to localize ${passive.id} for ${lang}; preserving DDragon summary`,
          error
        );
        return [lang, {}] as const;
      }
    })
  );
  return Object.fromEntries(entries) as Record<
    PassiveTooltipLocale,
    LocalizedPassiveTooltip
  >;
}

async function applyLocalizedActiveTooltips(
  championsDir: string,
  championId: string,
  cdragonVersion: string,
  activeSpells: ExtractedActiveSpellData[]
): Promise<void> {
  await Promise.all(
    LANGUAGES.map(async (lang) => {
      const championFilePath = path.join(
        championsDir,
        `${championId}-${lang}.json`
      );
      if (!fs.existsSync(championFilePath)) return;

      try {
        const stringTable = await fetchStringTable(cdragonVersion, lang);
        const data = JSON.parse(fs.readFileSync(championFilePath, "utf-8"));
        const spells = data?.champion?.spells;
        if (!Array.isArray(spells)) return;

        spells.forEach((spell, index) => {
          const source = activeSpells[index];
          if (!source || !spell || typeof spell !== "object") return;
          const localized = localizeActiveTooltip(
            spell,
            source,
            stringTable,
            lang as DataLocale
          );
          if (!localized.tooltip) return;

          spell.summary = localized.summary ?? spell.description;
          spell.tooltip = localized.tooltip;
          spell.tooltipSource = "communitydragon";
          if (localized.unresolvedTokens.length > 0) {
            spell.tooltipDiagnostics = {
              unresolvedTokens: localized.unresolvedTokens,
            };
          }
          if (localized.name) spell.name = localized.name;
        });

        fs.writeFileSync(
          championFilePath,
          JSON.stringify(data, null, 2),
          "utf-8"
        );
      } catch (error) {
        console.warn(
          `[CD][Active] Failed to localize ${championId} for ${lang}; preserving DDragon tooltip`,
          error
        );
      }
    })
  );
}

function applyLocalizedPassiveTooltip(
  championFilePath: string,
  passiveId: string,
  localized: LocalizedPassiveTooltip
): void {
  if (!localized.tooltip || !fs.existsSync(championFilePath)) return;

  const data = JSON.parse(fs.readFileSync(championFilePath, "utf-8"));
  const passive = data?.champion?.passive;
  if (!passive || typeof passive !== "object") return;

  passive.summary = passive.description;
  passive.description = localized.tooltip;
  passive.spellId = passiveId;
  passive.tooltipSource = "communitydragon";
  if (localized.name) passive.name = localized.name;
  fs.writeFileSync(championFilePath, JSON.stringify(data, null, 2), "utf-8");
}

async function fetchCommunityDragonData(
  cdChampionId: string,
  cdragonVersion: string,
): Promise<Record<string, unknown>> {
  const url = COMMUNITY_DRAGON_URL(cdragonVersion, cdChampionId);
  console.log(`Fetching exact CDragon: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `[CD] ${cdChampionId} missing from ${cdragonVersion}: HTTP ${response.status}`,
    );
  }
  return (await response.json()) as Record<string, unknown>;
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

async function fetchCommunityDragonItems(
  lang: string,
  cdragonVersion: string,
): Promise<CommunityDragonItem[]> {
  const resultsLocale = toCommunityDragonLocale(lang);
  const url = COMMUNITY_DRAGON_ITEMS_URL(cdragonVersion, lang);
  console.log(`Fetching exact CDragon items (${resultsLocale}): ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `[CD][Items] ${resultsLocale} missing from ${cdragonVersion}: HTTP ${response.status}`,
    );
  }
  const json = (await response.json()) as unknown;
  if (!Array.isArray(json)) {
    throw new Error(`[CD][Items] Invalid ${resultsLocale} response format`);
  }
  return json as CommunityDragonItem[];
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

async function fetchRuneStatShards(
  lang: string,
  cdragonVersion: string,
  ddragonVersion: string
): Promise<RuneStatShardStaticData | null> {
  const resultsLocale = toCommunityDragonLocale(lang);

  for (const basePath of [cdragonVersion]) {
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
          `[CD][Runes] Stat shard data not found for ${resultsLocale} at exact ${basePath} (404)`
        );
        continue;
      }

      if (!stylesRes.ok || !perksRes.ok) {
        console.warn(
          `[CD][Runes] Failed to fetch stat shard data for ${resultsLocale} at exact ${basePath}. status=${stylesRes.status}/${perksRes.status}`
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
    `[CD][Runes] Exact CommunityDragon stat shards failed for ${resultsLocale}`
  );
  return null;
}

async function main() {
  console.log('🚀 Starting static data generation...\n');

  try {
    console.log('📦 Fetching version information...');
    const versions: string[] = await fetchJson(VERSION_URL);
    const release = resolveStaticDataRelease(versions[0]);
    const { patchVersion, sources: sourceVersions } = release;
    const { ddragon: ddragonVersion, cdragon: cdragonVersion } = sourceVersions;
    console.log(`✅ Latest DDragon version: ${ddragonVersion}`);
    console.log(`✅ Official patch version: ${patchVersion}`);
    console.log(`✅ Exact CommunityDragon version: ${cdragonVersion}\n`);

    console.log('🗑️  Cleaning up old version directories...');
    if (fs.existsSync(DATA_DIR)) {
      const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== patchVersion) {
          const oldVersionDir = path.join(DATA_DIR, entry.name);
          console.log(`   Removing old version: ${entry.name}`);
          fs.rmSync(oldVersionDir, { recursive: true, force: true });
        }
      }
    }

    const versionDir = path.join(DATA_DIR, patchVersion);
    const championsDir = path.join(versionDir, 'champions');
    const spellsDir = path.join(versionDir, 'spells');

    const abilitySourcesByChampion = new Map<string, ActiveSpellSourceData[]>();

    const runesDataByLang: Record<string, any> = {};
    const runeStatmodsDataByLang: Record<string, RuneStatShardStaticData | null> = {};
    const itemsDataByLang: Record<string, any> = {};
    const summonerDataByLang: Record<string, any> = {};

    for (const lang of LANGUAGES) {
      console.log(`📋 Fetching champion list for ${lang}...`);
      const champListData = await fetchJson(CHAMP_LIST_URL(ddragonVersion, lang));

      const champions = Object.values(champListData.data || {}).sort(
        (a: any, b: any) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      );

      console.log(`✅ Fetched ${champions.length} champions for ${lang}`);

      console.log(`📜 Fetching runes for ${lang}...`);
      const runesData = await fetchJson(RUNES_URL(ddragonVersion, lang));
      runesDataByLang[lang] = runesData;
      console.log(`✅ Fetched runes for ${lang}`);

      console.log(`✨ Fetching rune stat shards (secondary runes) for ${lang}...`);
      try {
        const statShardData = await fetchRuneStatShards(
          lang,
          cdragonVersion,
          ddragonVersion
        );

        if (statShardData && statShardData.groups.length > 0) {
          runeStatmodsDataByLang[lang] = statShardData;
          console.log(`✅ Generated rune stat shards for ${lang}`);
        } else {
          console.warn(
            `[CD][Runes] No stat shard data generated for ${lang}`
          );
        }
      } catch (error) {
        throw new Error(
          `[CD][Runes] Exact ${cdragonVersion} stat shards failed for ${lang}`,
          { cause: error },
        );
      }

      console.log(`🧱 Fetching items for ${lang}...`);
      const itemsData = await fetchJson(ITEMS_URL(ddragonVersion, lang));

      let combinedItemsData: any = itemsData;

      try {
        const cdItems = await fetchCommunityDragonItems(lang, cdragonVersion);

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
        throw new Error(
          `[CD][Items] Exact ${cdragonVersion} item merge failed for ${lang}`,
          { cause: error },
        );
      }
      itemsDataByLang[lang] = combinedItemsData;
      console.log(`✅ Fetched & merged items for ${lang}\n`);

      console.log(`📘 Fetching summoner spells for ${lang}...`);
      try {
        const summonerData = await fetchJson(SUMMONER_URL(ddragonVersion, lang));
        summonerDataByLang[lang] = summonerData;
        console.log(`✅ Fetched summoner spells for ${lang}\n`);
      } catch (error) {
        throw new Error(
          `Failed to fetch summoner spells for ${lang}`,
          { cause: error },
        );
      }
    }

    const koChampListData = await fetchJson(CHAMP_LIST_URL(ddragonVersion, 'ko_KR'));
    const championIds = Object.keys(koChampListData.data || {});
    console.log(`📚 Processing ${championIds.length} champions...\n`);

    const BATCH_SIZE = 10;
    for (let i = 0; i < championIds.length; i += BATCH_SIZE) {
      const batch = championIds.slice(i, i + BATCH_SIZE);
      console.log(`📥 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(championIds.length / BATCH_SIZE)} (${batch.length} champions)...`);
      
      const championPromises = batch.flatMap(championId =>
        LANGUAGES.map(async (lang) => {
          try {
            const champData = await fetchJson(CHAMP_INFO_URL(ddragonVersion, lang, championId));
            const champion = champData.data?.[championId];
            if (champion) {
              const championInfo = {
                patchVersion,
                sources: sourceVersions,
                locale: lang,
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
      if (successCount !== results.length) {
        const missing = results
          .filter((result) => !result.success)
          .map((result) => `${result.championId}:${result.lang}`)
          .join(", ");
        throw new Error(`Incomplete DDragon champion snapshot: ${missing}`);
      }
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
          const cdData = await fetchCommunityDragonData(
            cdChampionId,
            cdragonVersion,
          );

          const activeSpells = extractActiveSpells(cdData, cdChampionId);
          abilitySourcesByChampion.set(
            championId,
            activeSpells.ordered.map(({ source }) => source)
          );
          const spellData: Record<
            string,
            CommunityDragonSpellData | ExtractedPassiveSpell["spellData"]
          > = Object.fromEntries(
            Object.entries(activeSpells.aliases).map(([key, activeSpell]) => {
              const { source: _source, ...calculationData } = activeSpell;
              return [key, calculationData];
            })
          );
          const passive = extractPassiveSpell(cdData, championId);
          const localizedPassive = await buildLocalizedPassiveTooltips(
            cdragonVersion,
            passive,
          );

          await applyLocalizedActiveTooltips(
            championsDir,
            championId,
            cdragonVersion,
            activeSpells.ordered,
          );

          if (passive) {
            spellData.P = passive.spellData;
            spellData[passive.id] = passive.spellData;
          }

          if (passive && localizedPassive) {
            for (const lang of PASSIVE_TOOLTIP_LOCALES) {
              applyLocalizedPassiveTooltip(
                path.join(championsDir, `${championId}-${lang}.json`),
                passive.id,
                localizedPassive[lang]
              );
            }
          }
          
          if (Object.keys(spellData).length > 0) {
            const spellInfo = {
              patchVersion,
              sources: sourceVersions,
              championId,
              spellData,
              passive: passive
                ? {
                    id: passive.id,
                    path: passive.path,
                    locKeys: passive.locKeys,
                    localized: localizedPassive,
                  }
                : null,
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
    if (failCount > 0 || successCount !== championIds.length) {
      throw new Error(
        `Incomplete CDragon ${cdragonVersion} champion snapshot: ` +
          `${successCount}/${championIds.length} successful`,
      );
    }

    const activeTooltipAllowlist = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "scripts", "active-tooltip-allowlist.json"),
        "utf-8"
      )
    ) as ActiveTooltipAllowlist;
    const activeTooltipReport = validateActiveTooltipFiles(
      championsDir,
      patchVersion,
      LANGUAGES,
      activeTooltipAllowlist
    );
    await saveToFile(
      activeTooltipReport,
      path.join(versionDir, "active-tooltip-validation.json")
    );
    assertActiveTooltipReport(activeTooltipReport);
    console.log(
      `✅ Precomputed ${activeTooltipReport.totals.localized}/${activeTooltipReport.totals.abilities} ` +
        `localized Q/W/E/R tooltips (${activeTooltipReport.totals.withDiagnostics} with known diagnostics)`
    );

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
        schemaVersion: 2,
        patchVersion,
        locale: lang,
        sources: sourceVersions,
        champions: normalizedChampions,
      };

      await saveToFile(
        normalizedFile,
        path.join(
          versionDir,
          `champions-normalized-${lang}.json`
        )
      );
      const v2ChampionCount = writeChampionV2Dataset({
        versionDir,
        patchVersion,
        locale: lang,
        sources: sourceVersions,
        championIds,
        normalizedChampions,
      });
      console.log(
        `✅ Saved normalized and v2 champion data for ${lang} (${v2ChampionCount} champions)`
      );
    }

    console.log("🧩 Building normalized item and rune data...");
    await buildAndSaveNormalizedItems(
      versionDir,
      patchVersion,
      sourceVersions,
      itemsDataByLang
    );
    await buildAndSaveNormalizedRunesAndStatShards(
      versionDir,
      patchVersion,
      sourceVersions,
      runesDataByLang,
      runeStatmodsDataByLang
    );
    console.log("🧩 Building normalized summoner spell data...");
    await buildAndSaveNormalizedSummoners(
      versionDir,
      patchVersion,
      sourceVersions,
      summonerDataByLang
    );

    const abilityValidation = validateGeneratedAbilities({
      versionDir,
      patchVersion,
      ddragonVersion,
      cdragonVersion,
      allowlistPath: path.join(
        process.cwd(),
        "scripts",
        "ability-validation-allowlist.json"
      ),
      abilitySourcesByChampion,
    });
    await saveToFile(
      abilityValidation,
      path.join(versionDir, "ability-validation.json")
    );
    if (abilityValidation.summary.unexpectedIssues > 0) {
      const unexpected = abilityValidation.issues
        .filter((issue) => !issue.allowlisted)
        .map((issue) => issue.key)
        .join(", ");
      throw new Error(`Unexpected ability source mismatches: ${unexpected}`);
    }
    console.log(
      `✅ Validated ${abilityValidation.summary.abilities} Q/W/E/R abilities ` +
      `(${abilityValidation.summary.knownIssues} known source differences)`
    );

    const simulationValidation = validateAbilitySimulations(
      versionDir,
      patchVersion,
      sourceVersions
    );
    await saveToFile(
      simulationValidation,
      path.join(versionDir, "ability-simulation-validation.json")
    );
    console.log(
      `✅ Compiled ${simulationValidation.summary.complete}/` +
      `${simulationValidation.summary.abilities} safe ability simulations`
    );

    const prunedFileCount = pruneIntermediateData(
      versionDir,
      LANGUAGES
    );
    console.log(`✅ Removed ${prunedFileCount} intermediate source files`);

    const versionInfo = {
      schemaVersion: 2,
      patchVersion,
      sources: sourceVersions,
    };
    await saveToFile(versionInfo, path.join(DATA_DIR, "version.json"));

    console.log(`\n🎉 Static data generation completed!`);
    console.log(`📁 Data saved to: ${versionDir}`);
    console.log(`📊 DDragon Version: ${ddragonVersion}`);
    console.log(`🎮 Official Patch Version: ${patchVersion}`);
    console.log(`🌐 Languages: ${LANGUAGES.join(", ")}`);
    console.log(`👥 Champions: ${championIds.length}`);
    console.log(`🐉 CommunityDragon Version (exact): ${cdragonVersion}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
