import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isSpellTicks } from "../../../src/lib/knowledge/abilityTicksValidation";
import type { TickFile } from "./attach";

interface Source {
  title: string; url: string; revision?: number; status: string; hash: string | null;
  fields: Array<{ key: string; text: string }>;
}
interface Collection { patch: string; fetchedAt: string; records: Array<{ id: string; sources: Source[] }> }
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function signals(source: Source) {
  return source.fields.filter(field => /\btick|periodic|every (?:[\d./]+|second)|per second|each second|\b(?:pulses|waves|volleys)\b/i.test(field.text))
    .map(field => ({ source: source.url, field: field.key, hash: sha(field.text),
      intervals: [...new Set([...field.text.matchAll(/(?:every|each)\s+([\d./]+|second)\b/gi)].map(match => match[1]))],
      markers: [...new Set([...field.text.matchAll(/\bticks?\b|periodic|per second|each second|waves|volleys/gi)].map(match => match[0].toLowerCase()))] }));
}

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run llm:ticks:record -- <collected-sources.json>");
const collected: Collection = JSON.parse(readFileSync(input, "utf8"));
const file: TickFile = JSON.parse(readFileSync("knowledge/ability-ticks.json", "utf8"));
if (file.patch !== collected.patch) throw new Error("Collection and review patch differ");
const ids = new Set(collected.records.map(record => record.id));
if (ids.size !== Object.keys(file.abilities).length || Object.keys(file.abilities).some(id => !ids.has(id))) throw new Error("Review coverage differs");
const records = collected.records.map(record => {
  const entry = file.abilities[record.id];
  if (!isSpellTicks(entry)) throw new Error(`Invalid review: ${record.id}`);
  if (entry.sources.some(url => !record.sources.some(source => source.url === url && source.status === "fetched"))) throw new Error(`Missing source: ${record.id}`);
  return { id: record.id, status: entry.status, tooltipHash: entry.tooltipHash,
    sources: record.sources.map(source => ({ title: source.title, url: source.url, status: source.status, hash: source.hash,
      ...(source.revision ? { revision: source.revision, permalink: `${source.url}?oldid=${source.revision}` } : {}) })),
    reviewSignals: record.sources.filter(source => source.status === "fetched").flatMap(signals) };
});
const summary = Object.fromEntries(["known", "unknown", "not_documented"].map(status => [status, records.filter(record => record.status === status).length]));
const out = `research/ability-ticks/${collected.patch}`;
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/audit.json`, JSON.stringify({ patch: collected.patch, checkedAt: collected.fetchedAt,
  champions: new Set(records.map(record => record.id.split(":")[0])).size, abilities: records.length,
  templates: new Set(records.flatMap(record => record.sources.map(source => source.title))).size, summary, records }, null, 2) + "\n");
console.log(JSON.stringify({ out: `${out}/audit.json`, ...summary }));
