import * as fs from 'fs';
import * as path from 'path';
import { parseSpellTooltip } from '../src/lib/spellTooltipParser';
import { ChampionSpell } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');

interface SpellData {
  id: string;
  name: string;
  description?: string;
  tooltip?: string;
  maxrank: number;
  cooldown: (number | string)[];
  cooldownBurn?: string;
  cost: (number | string)[];
  costBurn?: string;
  range: (number | string)[];
  rangeBurn?: string;
  effectBurn?: (string | null)[];
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

function testTooltipParsing() {
  const championId = process.argv[2] || 'Gangplank';
  const spellIndex = process.argv[3] ? parseInt(process.argv[3]) : 0;
  
  console.log(`\n=== Testing Tooltip Parser ===`);
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
  console.log(`\n[Spell Info]`);
  console.log(`ID: ${spellData.id}`);
  console.log(`Name: ${spellData.name}`);
  console.log(`Max Rank: ${spellData.maxrank}`);
  console.log(`\n[Original Tooltip]`);
  console.log(`"${spellData.tooltip}"`);
  console.log(`\n[Original Description]`);
  console.log(`"${spellData.description}"`);
  console.log(`\n[EffectBurn Array]`);
  console.log(JSON.stringify(spellData.effectBurn, null, 2));
  
  // Community Dragon 데이터 로드
  const cdData = loadCommunityDragonSpells(championId);
  const cdSpellData = cdData ? cdData[spellIndex.toString()] || {} : {};
  
  console.log(`\n[Community Dragon Data]`);
  console.log(`Keys: ${Object.keys(cdSpellData).join(', ')}`);
  if (Object.keys(cdSpellData).length > 0) {
    Object.entries(cdSpellData).forEach(([key, values]) => {
      if (key !== '_tooltipData') {
        console.log(`  ${key}: [${(values as (number | string)[]).slice(0, 7).join(', ')}]`);
      }
    });
  }
  
  // ChampionSpell 형식으로 변환
  const spell: ChampionSpell = {
    id: spellData.id,
    name: spellData.name,
    maxrank: spellData.maxrank,
    cooldown: spellData.cooldown,
    description: spellData.description,
    tooltip: spellData.tooltip,
  };
  
  // spell 객체에 추가 필드 추가 (타입 확장)
  const spellWithExtras = spell as ChampionSpell & {
    cooldownBurn?: string;
    cost?: (number | string)[];
    costBurn?: string;
    range?: (number | string)[];
    rangeBurn?: string;
    effectBurn?: (string | null)[];
  };
  
  spellWithExtras.cooldownBurn = spellData.cooldownBurn;
  spellWithExtras.cost = spellData.cost;
  spellWithExtras.costBurn = spellData.costBurn;
  spellWithExtras.range = spellData.range;
  spellWithExtras.rangeBurn = spellData.rangeBurn;
  spellWithExtras.effectBurn = spellData.effectBurn;
  
  console.log(`\n=== Parsing Results ===\n`);
  
  // Description 파싱
  if (spellData.description) {
    console.log(`[Description]`);
    const parsedDesc = parseSpellTooltip(
      spellData.description,
      spellWithExtras,
      1,
      true,
      cdSpellData
    );
    console.log(`Result: "${parsedDesc}"`);
    console.log(`HTML: ${parsedDesc}`);
  }
  
  // Tooltip 파싱
  if (spellData.tooltip) {
    console.log(`\n[Tooltip]`);
    const parsedTooltip = parseSpellTooltip(
      spellData.tooltip,
      spellWithExtras,
      1,
      true,
      cdSpellData
    );
    console.log(`Result: "${parsedTooltip}"`);
    console.log(`HTML: ${parsedTooltip}`);
    console.log(`Length: ${parsedTooltip.length}`);
    
    // 레벨별로도 테스트
    console.log(`\n[Tooltip by Level]`);
    for (let level = 1; level <= spellData.maxrank; level++) {
      const parsed = parseSpellTooltip(
        spellData.tooltip,
        spellWithExtras,
        level,
        false,
        cdSpellData
      );
      console.log(`Level ${level}: "${parsed}"`);
    }
  }
  
  // 실제 UI에서 사용하는 방식 시뮬레이션
  console.log(`\n=== UI Simulation ===`);
  console.log(`[As rendered in UI]`);
  const uiDescription = spellData.description 
    ? parseSpellTooltip(spellData.description, spellWithExtras, 1, true, cdSpellData)
    : '';
  const uiTooltip = spellData.tooltip
    ? parseSpellTooltip(spellData.tooltip, spellWithExtras, 1, true, cdSpellData)
    : '';
  
  console.log(`Description: "${uiDescription}"`);
  console.log(`Tooltip: "${uiTooltip}"`);
  console.log(`Combined: "${uiDescription}${uiTooltip}"`);
  
  // effectBurn 값이 어디서 오는지 확인
  console.log(`\n[EffectBurn Values]`);
  if (spellData.effectBurn) {
    spellData.effectBurn.forEach((val, idx) => {
      if (val && val !== "0" && val !== null) {
        console.log(`  effectBurn[${idx}]: "${val}"`);
      }
    });
  }
  
  console.log(`\n=== End ===\n`);
}

testTooltipParsing();

