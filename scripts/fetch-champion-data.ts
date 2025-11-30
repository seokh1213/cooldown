import * as fs from 'fs';
import * as path from 'path';

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CHAMP_INFO_URL = (VERSION: string, LANG: string, NAME: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/${LANG}/champion/${NAME}.json`;
const COMMUNITY_DRAGON_URL = (championId: string) =>
  `https://raw.communitydragon.org/latest/game/data/characters/${championId}/${championId}.bin.json`;

const DATA_DIR = path.join(process.cwd(), 'data');

// data 폴더가 없으면 생성
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function fetchJson(url: string): Promise<any> {
  console.log(`Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

async function saveToFile(data: any, filename: string) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Saved: ${filePath}`);
}

async function main() {
  const championId = process.argv[2] || 'Gangplank';
  const lang = process.argv[3] || 'ko_KR';
  
  console.log(`Fetching data for: ${championId}`);
  console.log(`Language: ${lang}`);
  console.log(`Data directory: ${DATA_DIR}\n`);

  try {
    // 1. 버전 가져오기
    const versions = await fetchJson(VERSION_URL);
    const version = versions[0];
    console.log(`Latest version: ${version}\n`);

    // 2. Data Dragon 챔피언 정보 가져오기
    const ddUrl = CHAMP_INFO_URL(version, lang, championId);
    const ddData = await fetchJson(ddUrl);
    await saveToFile(ddData, `datadragon-${championId}-${lang}.json`);
    
    // 스킬 정보만 추출해서 별도로 저장
    if (ddData.data && ddData.data[championId]) {
      const champion = ddData.data[championId];
      const spellData = {
        id: champion.id,
        name: champion.name,
        spells: champion.spells?.map((spell: any) => ({
          id: spell.id,
          name: spell.name,
          description: spell.description,
          tooltip: spell.tooltip,
          maxrank: spell.maxrank,
          cooldown: spell.cooldown,
          cooldownBurn: spell.cooldownBurn,
          cost: spell.cost,
          costBurn: spell.costBurn,
          range: spell.range,
          rangeBurn: spell.rangeBurn,
          effectBurn: spell.effectBurn,
        })) || [],
        passive: champion.passive ? {
          name: champion.passive.name,
          description: champion.passive.description,
        } : null,
      };
      await saveToFile(spellData, `datadragon-${championId}-spells.json`);
      console.log(`\nSpell tooltips:`);
      spellData.spells.forEach((spell: any, index: number) => {
        console.log(`\n[${index}] ${spell.name} (${spell.id})`);
        console.log(`Description: ${spell.description?.substring(0, 100)}...`);
        console.log(`Tooltip: ${spell.tooltip?.substring(0, 200)}...`);
      });
    }

    // 3. Community Dragon 데이터 가져오기
    const cdChampionId = championId.toLowerCase();
    const cdUrl = COMMUNITY_DRAGON_URL(cdChampionId);
    try {
      const cdData = await fetchJson(cdUrl);
      await saveToFile(cdData, `communitydragon-${cdChampionId}.json`);
      
      // 스킬 데이터만 추출
      const spellDataMap: Record<string, any> = {};
      
      // CharacterRecords/Root 찾기 (대소문자 구분)
      const possibleRootPaths = [
        `Characters/${cdChampionId}/CharacterRecords/Root`,
        `Characters/${championId}/CharacterRecords/Root`,
        `Characters/Gangplank/CharacterRecords/Root`, // 갱플랭크 특수 케이스
      ];
      
      let rootPath: string | null = null;
      let root: any = null;
      
      for (const path of possibleRootPaths) {
        if (cdData[path]) {
          rootPath = path;
          root = cdData[path];
          console.log(`Found root at: ${path}`);
          break;
        }
      }
      
      if (root && root.spells && Array.isArray(root.spells)) {
        const spells = root.spells as string[];
        console.log(`\nFound ${spells.length} spells in Community Dragon`);
        
        spells.forEach((spellPath: string, index: number) => {
          const spellObj = cdData[spellPath] as any;
          const spellData: Record<string, any> = {};
          
          // 1. DataValues 파싱
          if (spellObj?.mSpell?.DataValues) {
            const dataValues: Record<string, any> = {};
            spellObj.mSpell.DataValues.forEach((dv: any) => {
              if (dv.mName && dv.mValues) {
                dataValues[dv.mName] = dv.mValues;
              }
            });
            
            // mAmmoRechargeTime도 추가 (ammo 스킬용)
            if (spellObj.mSpell.mAmmoRechargeTime && Array.isArray(spellObj.mSpell.mAmmoRechargeTime)) {
              dataValues["mAmmoRechargeTime"] = spellObj.mSpell.mAmmoRechargeTime;
            }
            
            if (Object.keys(dataValues).length > 0) {
              spellData.DataValues = dataValues;
            }
          }
          
          // 2. mSpellCalculations 파싱
          if (spellObj?.mSpell?.mSpellCalculations) {
            spellData.mSpellCalculations = spellObj.mSpell.mSpellCalculations;
          }
          
          // 3. mClientData 파싱
          if (spellObj?.mClientData) {
            spellData.mClientData = spellObj.mClientData;
          }
          
          if (Object.keys(spellData).length > 0) {
            spellDataMap[index.toString()] = spellData;
            const dataValuesCount = spellData.DataValues ? Object.keys(spellData.DataValues).length : 0;
            const calculationsCount = spellData.mSpellCalculations ? Object.keys(spellData.mSpellCalculations).length : 0;
            const hasClientData = !!spellData.mClientData;
            console.log(`Spell ${index}: ${dataValuesCount} data values, ${calculationsCount} calculations, clientData: ${hasClientData}`);
          }
        });
        
        if (Object.keys(spellDataMap).length > 0) {
          await saveToFile(spellDataMap, `communitydragon-${cdChampionId}-spells.json`);
        } else {
          console.log('No spell data found to save');
        }
      } else {
        console.log('Could not find spells array in root');
        // 대체 방법: 직접 경로로 찾기
        const spellPaths = Object.keys(cdData).filter(key => 
          key.toLowerCase().includes(`characters/${cdChampionId}/spells`) && 
          !key.includes('Ability')
        );
        console.log(`Found ${spellPaths.length} spell paths:`, spellPaths.slice(0, 5));
      }
    } catch (error) {
      console.error(`Failed to fetch Community Dragon data: ${error}`);
    }

    console.log(`\n✅ All data saved to ${DATA_DIR}/`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

