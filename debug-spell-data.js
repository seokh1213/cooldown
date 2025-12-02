/**
 * Community Dragon API에서 오공 Q 스킬 데이터 구조 확인
 * Node.js로 실행: node debug-spell-data.js
 */

const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function debugSpellData() {
  try {
    console.log('Community Dragon API에서 오공 데이터 가져오는 중...');
    const data = await fetchJSON('https://raw.communitydragon.org/latest/game/data/characters/monkeyking/monkeyking.bin.json');
    
    // Q 스킬 관련 키 찾기
    const qKeys = Object.keys(data).filter(k => k.includes('DoubleAttack') || k.includes('MonkeyKingQ'));
    console.log('\n=== Q 스킬 관련 키들 ===');
    qKeys.forEach(key => console.log(key));
    
    // 메인 Q 스킬 데이터 확인
    const mainQKey = 'Characters/MonkeyKing/Spells/MonkeyKingDoubleAttackAbility/MonkeyKingDoubleAttack';
    if (data[mainQKey]) {
      console.log('\n=== 메인 Q 스킬 데이터 구조 ===');
      const qData = data[mainQKey];
      console.log('Top level keys:', Object.keys(qData));
      
      if (qData.mSpell) {
        const mSpell = qData.mSpell;
        console.log('\n=== mSpell 키들 ===');
        console.log(Object.keys(mSpell).slice(0, 30));
        
        // DataValues 확인
        if (mSpell.DataValues) {
          console.log('\n=== DataValues ===');
          console.log('Type:', typeof mSpell.DataValues);
          if (typeof mSpell.DataValues === 'object' && !Array.isArray(mSpell.DataValues)) {
            const dvKeys = Object.keys(mSpell.DataValues);
            console.log('DataValues keys:', dvKeys.slice(0, 20));
            dvKeys.slice(0, 5).forEach(key => {
              const val = mSpell.DataValues[key];
              console.log(`${key}: ${typeof val} = ${JSON.stringify(val).substring(0, 100)}`);
            });
          }
        }
        
        // mSpellCalculations 확인
        if (mSpell.mSpellCalculations) {
          console.log('\n=== mSpellCalculations ===');
          const calcKeys = Object.keys(mSpell.mSpellCalculations);
          console.log('Keys:', calcKeys.slice(0, 20));
          calcKeys.slice(0, 5).forEach(key => {
            const val = mSpell.mSpellCalculations[key];
            console.log(`${key}: ${typeof val}`);
            if (typeof val === 'object' && val !== null) {
              console.log(`  Sub-keys: ${Object.keys(val).slice(0, 5).join(', ')}`);
            }
          });
        }
        
        // cooldownTime 확인
        if (mSpell.cooldownTime) {
          console.log('\n=== cooldownTime ===');
          console.log(mSpell.cooldownTime);
        }
      }
    }
    
    // 다른 관련 스킬 데이터도 확인
    console.log('\n=== 다른 관련 스킬 데이터 확인 ===');
    qKeys.slice(0, 3).forEach(key => {
      const spellData = data[key];
      if (spellData?.mSpell) {
        console.log(`\n${key}:`);
        const mSpell = spellData.mSpell;
        if (mSpell.DataValues) {
          console.log('  DataValues keys:', Object.keys(mSpell.DataValues).slice(0, 10));
        }
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugSpellData();


