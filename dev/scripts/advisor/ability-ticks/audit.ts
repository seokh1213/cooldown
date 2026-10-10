import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { ChampionCard } from "../../../../src/domain/knowledge/facts";
import { isSpellTicks } from "../../../../src/domain/knowledge/abilityTicksValidation";
import { tooltipHash, type TickFile } from "./attach";

export function auditAbilityTicks(file: TickFile, patch: string, locales: ChampionCard[][]): string[] {
  const errors: string[] = [];
  if (file.schemaVersion !== 1 || file.patch !== patch || !Number.isFinite(Date.parse(file.checkedAt))) errors.push("tick file version/date mismatch");
  const korean = new Map<string, ChampionCard["spells"][number]>(locales[0].flatMap(card => card.spells.map(spell => [`${card.id}:${spell.slot}`, spell] as const)));
  for (const id of Object.keys(file.abilities)) if (!korean.has(id)) errors.push(`${id}: orphaned entry`);
  for (const [id, spell] of korean) {
    const entry = file.abilities[id];
    if (!entry || !isSpellTicks(entry)) { errors.push(`${id}: invalid or missing ticks`); continue; }
    if (entry.tooltipHash !== tooltipHash(spell.text)) errors.push(`${id}: tooltip changed; review required`);
    if (!entry.sources.length) errors.push(`${id}: no audit source`);
    if (entry.status === "unknown" && !entry.note) errors.push(`${id}: missing uncertainty reason`);
    const { tooltipHash: _hash, ...expected } = entry;
    for (const cards of locales) {
      const localized = cards.find(card => card.id === id.split(":")[0])?.spells.find(item => item.slot === spell.slot);
      if (!localized || JSON.stringify(localized.ticks) !== JSON.stringify(expected)) errors.push(`${id}: generated locale differs`);
      for (const form of localized?.forms ?? []) {
        const effects = expected.effects.filter(effect => effect.forms?.includes(form.key));
        const status = expected.status === "known" && !effects.length ? "not_documented" : expected.status;
        if (JSON.stringify(form.ticks) !== JSON.stringify({ ...expected, effects, status })) errors.push(`${id}/${form.key}: form differs`);
      }
    }
  }
  return errors;
}

function main() {
  const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
  const { patchVersion: patch } = read("public/data/version.json");
  const file: TickFile = read("dev/data/knowledge/ability-ticks.json");
  const locales = ["ko_KR", "en_US", "zh_CN"].map(lang => read(`public/data/${patch}/llm/champion-cards-${lang}.json`).cards);
  const errors = auditAbilityTicks(file, patch, locales);
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; return; }
  const entries = Object.values(file.abilities);
  console.log(JSON.stringify({ patch, champions: locales[0].length, abilities: entries.length,
    known: entries.filter(entry => entry.status === "known").length,
    unknown: entries.filter(entry => entry.status === "unknown").length,
    notDocumented: entries.filter(entry => entry.status === "not_documented").length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
