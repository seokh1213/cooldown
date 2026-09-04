import { fetchCDragonChampion } from "./data-pipeline/sources/cdragon-champion";
import { extractActiveSpells } from "./data-pipeline/cdragon-active-spells";

const champion = process.argv[2];
const slot = Number(process.argv[3]);
const filter = process.argv[4];

const source = await fetchCDragonChampion(champion, "16.17");
const data = extractActiveSpells(source, champion.toLowerCase()).ordered[slot];

console.log("DataValues:");
for (const [name, values] of Object.entries(data.DataValues ?? {})) {
  console.log(`  ${name}: ${JSON.stringify(values.slice(0, 6))}`);
}
console.log("\nmSpellCalculations:");
for (const [name, calc] of Object.entries(data.mSpellCalculations ?? {})) {
  if (filter && !name.toLowerCase().includes(filter.toLowerCase())) continue;
  console.log(`  ${name}: ${JSON.stringify(calc)}`);
}
