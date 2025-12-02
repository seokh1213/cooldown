import * as fs from 'fs';
import * as path from 'path';

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CHAMP_LIST_URL = (VERSION: string, LANG: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion.json`;
const CHAMP_INFO_URL = (VERSION: string, LANG: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion/${NAME}.json`;
const COMMUNITY_DRAGON_URL = (championId: string) =>
  `https://raw.communitydragon.org/latest/game/data/characters/${championId}/${championId}.bin.json`;

const LANGUAGES = ['ko_KR', 'en_US'] as const;
const DATA_DIR = path.join(process.cwd(), 'public', 'data');

// Community Dragon 챔피언 ID 변환
function convertChampionIdToCommunityDragon(championId: string): string {
  return championId.toLowerCase();
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

async function main() {
  console.log('🚀 Starting static data generation...\n');

  try {
    // 1. 버전 가져오기
    console.log('📦 Fetching version information...');
    const versions = await fetchJson(VERSION_URL);
    const version = versions[0];
    console.log(`✅ Latest version: ${version}\n`);

    // 버전별 디렉토리 생성
    const versionDir = path.join(DATA_DIR, version);
    const championsDir = path.join(versionDir, 'champions');
    const spellsDir = path.join(versionDir, 'spells');

    // 2. 버전 정보 저장
    const versionInfo = {
      version,
    };
    await saveToFile(versionInfo, path.join(versionDir, 'version.json'));

    // 3. 각 언어별 챔피언 리스트 가져오기
    for (const lang of LANGUAGES) {
      console.log(`📋 Fetching champion list for ${lang}...`);
      const champListData = await fetchJson(CHAMP_LIST_URL(version, lang));
      
      const champions = Object.values(champListData.data || {})
        .sort((a: any, b: any) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

      const championList = {
        version,
        lang,
        champions,
      };
      
      await saveToFile(championList, path.join(versionDir, `champions-${lang}.json`));
      console.log(`✅ Fetched ${champions.length} champions for ${lang}\n`);
    }

    // 4. 모든 챔피언 ID 수집 (한국어 기준)
    const koChampListData = await fetchJson(CHAMP_LIST_URL(version, 'ko_KR'));
    const championIds = Object.keys(koChampListData.data || {});
    console.log(`📚 Processing ${championIds.length} champions...\n`);

    // 5. 챔피언 상세 정보 가져오기 (병렬 처리, 배치로 나눠서 처리)
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

    // 6. Community Dragon 스킬 데이터 가져오기 (병렬 처리)
    console.log('⚡ Fetching Community Dragon spell data...');
    const BATCH_SIZE_CD = 5; // Community Dragon은 더 느릴 수 있으므로 작은 배치
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < championIds.length; i += BATCH_SIZE_CD) {
      const batch = championIds.slice(i, i + BATCH_SIZE_CD);
      console.log(`📥 Processing CD batch ${Math.floor(i / BATCH_SIZE_CD) + 1}/${Math.ceil(championIds.length / BATCH_SIZE_CD)} (${batch.length} champions)...`);
      
      const spellPromises = batch.map(async (championId) => {
        try {
          const cdChampionId = convertChampionIdToCommunityDragon(championId);
          const cdData = await fetchJson(COMMUNITY_DRAGON_URL(cdChampionId));
          const spellData = extractSpellData(cdData, championId);
          
          if (Object.keys(spellData).length > 0) {
            const spellInfo = {
              version,
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

    console.log(`\n🎉 Static data generation completed!`);
    console.log(`📁 Data saved to: ${versionDir}`);
    console.log(`📊 Version: ${version}`);
    console.log(`🌐 Languages: ${LANGUAGES.join(', ')}`);
    console.log(`👥 Champions: ${championIds.length}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

