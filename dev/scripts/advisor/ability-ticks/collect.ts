import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchChampionSkillNames, queryPages } from "../lib/fandom";
import { wikiFields } from "./wikiFields";
import type { ChampionCard } from "../../../../src/domain/knowledge/facts";

const root = process.cwd();
const { patchVersion: patch } = JSON.parse(await readFile(path.join(root, "public/data/version.json"), "utf8"));
const { cards }: { cards: ChampionCard[] } = JSON.parse(await readFile(path.join(root, `public/data/${patch}/llm/champion-cards-en_US.json`), "utf8"));
const names = await fetchChampionSkillNames();
const previous: { abilities: Record<string, { sources: string[] }> } =
  JSON.parse(await readFile(path.join(root, "dev/data/knowledge/ability-ticks.json"), "utf8"));
const wanted = cards.flatMap(card => card.spells.map(spell => {
  const entry = names.get(card.id);
  const skills = entry?.skills[spell.slot === "P" ? "I" : spell.slot] ?? [];
  const id = `${card.id}:${spell.slot}`;
  const references = (previous.abilities[id]?.sources ?? []).filter(url => url.startsWith("https://wiki.leagueoflegends.com/en-us/"))
    .map(url => decodeURIComponent(new URL(url).pathname.slice("/en-us/".length)).replaceAll("_", " "));
  return { id, text: spell.text,
    titles: [...new Set([...skills.map(name => `Template:Data ${entry!.wikiName}/${name}`), ...references])] };
}));
const titles = [...new Set(wanted.flatMap(item => item.titles))];
const pages = new Map<string, string>();
const revisions = new Map<string, number>();
for (let start = 0; start < titles.length; start += 50) {
  for (const [title, text] of await queryPages(titles.slice(start, start + 50), revisions)) pages.set(title, text);
  console.log(`Wiki templates ${Math.min(start + 50, titles.length)}/${titles.length}`);
}
// Resolve chained and URL-encoded aliases, retaining the requested source URL.
for (let depth = 0; depth < 5; depth += 1) {
  const redirects = new Map([...pages].flatMap(([title, text]) => {
    const target = /^#REDIRECT\s*\[\[([^\]|#]+).*?]]/i.exec(text.trim())?.[1];
    return target ? [[title, decodeURIComponent(target).replaceAll("_", " ").trim()] as const] : [];
  }));
  if (!redirects.size) break;
  const resolvedRevisions = new Map<string, number>();
  const resolved = await queryPages([...new Set(redirects.values())], resolvedRevisions);
  let changed = false;
  for (const [title, target] of redirects) {
    const raw = resolved.get(target);
    if (raw && pages.get(title) !== raw) {
      pages.set(title, raw); changed = true;
      if (resolvedRevisions.has(target)) revisions.set(title, resolvedRevisions.get(target)!);
    }
  }
  if (!changed) break;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const records = wanted.map(item => ({
  id: item.id, tooltipHash: hash(item.text), tooltip: item.text,
  sources: item.titles.map(title => {
    const raw = pages.get(title);
    return { title, url: `https://wiki.leagueoflegends.com/en-us/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
      revision: revisions.get(title),
      status: raw && !/^#REDIRECT/i.test(raw) ? "fetched" : "missing", hash: raw ? hash(raw) : null,
      fields: raw ? wikiFields(raw) : [], raw,
    };
  }),
}));
const out = process.argv[2] ?? `/tmp/cooldown-tick-sources-${patch}.json`;
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ patch, fetchedAt: new Date().toISOString(), records }, null, 2));
console.log(JSON.stringify({ out, abilities: records.length, templates: titles.length,
  missingAbilities: records.filter(record => !record.sources.some(source => source.status === "fetched")).map(record => record.id),
  missingAliases: records.flatMap(record => record.sources.filter(source => source.status !== "fetched").map(source => source.title)) }));
