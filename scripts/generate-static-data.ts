import * as fs from 'fs';
import * as path from 'path';

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CHAMP_LIST_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion.json`;
const CHAMP_INFO_URL = (VERSION: string, LANG: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion/${NAME}.json`;
const RUNES_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/runesReforged.json`;
const ITEMS_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/item.json`;
const COMMUNITY_DRAGON_URL = (basePath: string, championId: string) =>
  `https://raw.communitydragon.org/${basePath}/game/data/characters/${championId}/${championId}.bin.json`;
const COMMUNITY_DRAGON_ITEMS_URL = (basePath: string, lang: string) => {
  const locale = lang === "ko_KR" ? "ko_kr" : "default";
  return `https://raw.communitydragon.org/${basePath}/plugins/rcp-be-lol-game-data/global/${locale}/v1/items.json`;
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

    for (const lang of LANGUAGES) {
      console.log(`📋 Fetching champion list for ${lang}...`);
      const champListData = await fetchJson(CHAMP_LIST_URL(version, lang));

      const champions = Object.values(champListData.data || {}).sort(
        (a: any, b: any) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      );

      const championList = {
        version,
        lang,
        champions,
      };

      await saveToFile(
        championList,
        path.join(versionDir, `champions-${lang}.json`)
      );
      console.log(`✅ Fetched ${champions.length} champions for ${lang}`);

      console.log(`📜 Fetching runes for ${lang}...`);
      const runesData = await fetchJson(RUNES_URL(version, lang));
      await saveToFile(
        runesData,
        path.join(versionDir, `runes-${lang}.json`)
      );
      console.log(`✅ Saved runes for ${lang}`);

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

      await saveToFile(
        combinedItemsData,
        path.join(versionDir, `items-${lang}.json`)
      );
      console.log(`✅ Saved items for ${lang}\n`);
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

