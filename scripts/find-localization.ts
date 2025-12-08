import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Community Dragon에서 로컬라이제이션 파일을 찾는 스크립트
 */
async function findLocalizationFiles() {
  console.log('=== Searching for Localization Files ===\n');
  
  const baseUrl = 'https://raw.communitydragon.org/latest';
  const possiblePaths = [
    '/game/data/menu/locale/ko_kr.json',
    '/game/data/menu/locale/ko_KR.json',
    '/game/data/localizedstrings/ko_kr.json',
    '/game/data/localizedstrings/ko_KR.json',
    '/game/ko_kr/data/localizedstrings.json',
    '/game/data/ko_kr/localizedstrings.json',
    '/plugins/rcp-be-lol-game-data/global/ko_kr/translations.json',
    '/plugins/rcp-be-lol-game-data/global/ko_KR/translations.json',
    '/game/assets/localizedstrings/ko_kr.json',
    '/game/assets/localizedstrings/ko_KR.json',
  ];
  
  console.log('Trying possible localization file paths...\n');
  
  for (const locPath of possiblePaths) {
    const url = `${baseUrl}${locPath}`;
    console.log(`Trying: ${url}`);
    
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Found! ${url}`);
        console.log(`Type: ${typeof data}`);
        console.log(`Keys: ${typeof data === 'object' ? Object.keys(data).slice(0, 10).join(', ') : 'N/A'}`);
        
        // Spell_GangplankQWrapper_Tooltip 키 찾기
        if (typeof data === 'object' && data !== null) {
          const searchKey = (obj: any, key: string, path: string = ''): string[] => {
            const results: string[] = [];
            if (typeof obj !== 'object' || obj === null) return results;
            
            for (const k in obj) {
              const currentPath = path ? `${path}.${k}` : k;
              if (k.includes(key) || (typeof obj[k] === 'string' && obj[k].includes(key))) {
                results.push(currentPath);
              }
              if (typeof obj[k] === 'object') {
                results.push(...searchKey(obj[k], key, currentPath));
              }
            }
            return results;
          };
          
          const matches = searchKey(data, 'Spell_GangplankQWrapper_Tooltip');
          if (matches.length > 0) {
            console.log(`\nFound matching keys:`);
            matches.forEach(m => console.log(`  ${m}`));
            
            // 실제 값 확인
            matches.slice(0, 3).forEach(match => {
              const keys = match.split('.');
              let value = data;
              for (const k of keys) {
                value = value?.[k];
              }
              if (value && typeof value === 'string') {
                console.log(`  Value: "${value.substring(0, 100)}..."`);
              }
            });
          }
        }
        
        // 파일 저장
        const filename = `localization-${locPath.split('/').pop() || 'unknown'}.json`;
        const filePath = path.join(DATA_DIR, filename);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`\nSaved to: ${filePath}\n`);
        return;
      } else {
        console.log(`  ❌ ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
  }
  
  console.log('\n❌ No localization files found in common paths.');
  console.log('\nNote: Community Dragon may not provide localization files directly.');
  console.log('Tooltip text is usually stored in game client files or Data Dragon API.');
}

findLocalizationFiles();




