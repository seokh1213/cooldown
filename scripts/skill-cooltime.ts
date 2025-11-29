import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

interface SpellData {
  id: string;
  name: string;
  maxrank: number;
  cooldown: (number | string)[];
}

function loadDataDragonSpells(championId: string): SpellData[] | null {
  const filePath = path.join(DATA_DIR, `datadragon-${championId}-spells.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return null;
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return data.spells || null;
}

function loadCommunityDragonSpells(championId: string): Record<string, Record<string, (number | string)[]>> | null {
  const filePath = path.join(DATA_DIR, `communitydragon-${championId.toLowerCase()}-spells.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return null;
  }
  
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function testAmmoCooldown() {
  const championId = process.argv[2] || 'Gangplank';
  const spellIndex = process.argv[3] ? parseInt(process.argv[3]) : 2; // E 스킬 기본값
  
  console.log(`\n=== Testing Ammo Cooldown Display ===`);
  console.log(`Champion: ${championId}`);
  console.log(`Spell Index: ${spellIndex}\n`);
  
  // Data Dragon 데이터 로드
  const spells = loadDataDragonSpells(championId);
  if (!spells || spells.length === 0) {
    console.error('No spells found');
    return;
  }
  
  if (spellIndex >= spells.length) {
    console.error(`Spell index ${spellIndex} out of range (max: ${spells.length - 1})`);
    return;
  }
  
  const spellData = spells[spellIndex];
  console.log(`[Spell Info]`);
  console.log(`ID: ${spellData.id}`);
  console.log(`Name: ${spellData.name}`);
  console.log(`Max Rank: ${spellData.maxrank}`);
  console.log(`Cooldown Array: [${spellData.cooldown.join(', ')}]`);
  
  // Community Dragon 데이터 로드
  const cdData = loadCommunityDragonSpells(championId);
  const cdSpellData = cdData ? cdData[spellIndex.toString()] || {} : {};
  
  console.log(`\n[Community Dragon Data]`);
  const ammoRechargeTime = cdSpellData["mAmmoRechargeTime"];
  if (ammoRechargeTime && Array.isArray(ammoRechargeTime)) {
    console.log(`mAmmoRechargeTime: [${ammoRechargeTime.join(', ')}]`);
  } else {
    console.log(`mAmmoRechargeTime: NOT FOUND`);
  }
  
  console.log(`\n=== Cooldown Display Simulation ===\n`);
  
  // UI에서 사용하는 로직 시뮬레이션
  const maxRank = spellData.maxrank;
  for (let i = 0; i < maxRank; i++) {
    const level = i + 1;
    const cooldownValue = spellData.cooldown[i];
    
    // ammo 스킬인지 확인: cooldown이 0이고 mAmmoRechargeTime이 있으면 ammo 스킬
    const isAmmoSkill = cooldownValue === 0 && ammoRechargeTime && Array.isArray(ammoRechargeTime) && ammoRechargeTime.length > i + 1;
    
    let displayValue: string;
    if (isAmmoSkill) {
      const ammoValue = ammoRechargeTime[i + 1];
      displayValue = ammoValue !== undefined ? `${ammoValue}s` : "-";
      console.log(`레벨 ${level}: ${displayValue} (Ammo Recharge Time)`);
    } else {
      displayValue = cooldownValue !== undefined ? `${cooldownValue}s` : "-";
      console.log(`레벨 ${level}: ${displayValue} (Cooldown)`);
    }
  }
  
  console.log(`\n=== Summary ===`);
  const isAmmoSkill = spellData.cooldown[0] === 0 && ammoRechargeTime && Array.isArray(ammoRechargeTime);
  console.log(`Is Ammo Skill: ${isAmmoSkill ? 'YES' : 'NO'}`);
  if (isAmmoSkill) {
    console.log(`Ammo Recharge Times: ${ammoRechargeTime.slice(1, maxRank + 1).join('s / ')}s`);
  } else {
    console.log(`Cooldowns: ${spellData.cooldown.slice(0, maxRank).join('s / ')}s`);
  }
  
  console.log(`\n=== End ===\n`);
}

testAmmoCooldown();

