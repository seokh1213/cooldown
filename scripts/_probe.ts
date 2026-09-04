import { fetchCDragonChampion } from "./data-pipeline/sources/cdragon-champion";
import { extractActiveSpells } from "./data-pipeline/cdragon-active-spells";
import { extractPassiveSpell } from "./passive-tooltip-data";
import { fetchJson } from "./data-pipeline/io/json";

const champions = await fetchJson<{ data: Record<string, unknown> }>(
  "https://ddragon.leagueoflegends.com/cdn/16.17.1/data/en_US/champion.json",
);
const ids = Object.keys(champions.data);

interface Hit {
  champion: string;
  where: string;
  formula: number;
  type: string;
}
const hits: Hit[] = [];

function walk(node: unknown, champion: string, where: string): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, champion, where);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;
  const type = record.__type;
  if (
    typeof type === "string" &&
    type.startsWith("StatBy") &&
    record.mStat == null &&
    typeof record.mStatFormula === "number"
  ) {
    hits.push({ champion, where, formula: record.mStatFormula, type });
  }
  for (const value of Object.values(record)) walk(value, champion, where);
}

for (const id of ids) {
  let source: Record<string, unknown>;
  try {
    source = await fetchCDragonChampion(id, "16.17");
  } catch {
    continue;
  }
  const active = extractActiveSpells(source, id.toLowerCase());
  for (const [alias, spell] of Object.entries(active.aliases)) {
    if (/^\d+$/.test(alias)) continue;
    walk(spell.mSpellCalculations, id, alias);
  }
  const passive = extractPassiveSpell(source, id);
  if (passive) walk(passive.spellData.mSpellCalculations, id, passive.id);
}

console.log(`mStat 없이 mStatFormula 만 있는 파트: ${hits.length}건`);
const seen = new Set<string>();
for (const hit of hits) {
  const key = `${hit.champion}/${hit.where}/${hit.formula}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  ${hit.champion} ${hit.where}  mStatFormula=${hit.formula}  ${hit.type}`);
}
