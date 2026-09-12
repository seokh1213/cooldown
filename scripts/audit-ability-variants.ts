import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import { decodeChampionIndex, decodeChampionDetail } from "../src/data/contracts/championDataDecoder";

// Read-only source inventory. Extra spells are candidates, not automatically distinct player abilities.
const release = decodeDataManifest(JSON.parse(await readFile("public/data/version.json", "utf8")));
const directory = path.join("public/data", release.patchVersion, "champions", "ko_KR");
const roster = decodeChampionIndex(JSON.parse(await readFile(path.join(directory, "index.json"), "utf8")));
const results: unknown[] = [];
for (let offset = 0; offset < roster.champions.length; offset += 8) {
  const batch = await Promise.all(roster.champions.slice(offset, offset + 8).map(async ({ id, name }) => {
    const detail = decodeChampionDetail(JSON.parse(await readFile(path.join(directory, id + ".json"), "utf8")));
    const url = `https://raw.communitydragon.org/${release.sources.cdragon}/game/data/characters/${id.toLowerCase()}/${id.toLowerCase()}.bin.json`;
    let response = await fetch(url);
    if (!response.ok) response = await fetch(url);
    if (!response.ok) return { id, name, error: response.status, source: url };
    const source = await response.json() as Record<string, { mScriptName?: string; mSpell?: { mImgIconName?: string[]; mClientData?: { mTooltipData?: { mLocKeys?: Record<string, string> } } } }>;
    const primary = new Set(Object.values(detail.champion.abilities).map((ability) => ability.id.toLowerCase()));
    const extras = Object.entries(source).flatMap(([key, value]) => {
      const spell = value.mSpell;
      const loc = spell?.mClientData?.mTooltipData?.mLocKeys;
      const script = value.mScriptName ?? key.split("/").pop() ?? key;
      if (!loc?.keyTooltip || primary.has(script.toLowerCase())) return [];
      return [{ id: script, key: loc.keyTooltip, icons: spell?.mImgIconName ?? [] }];
    });
    const conditions = Object.entries(detail.champion.abilities).flatMap(([slot, ability]) => {
      const text = (ability.bodyHtml || ability.summary).replace(/<[^>]+>/g, " ");
      const hits = [...text.matchAll(/.{0,25}(?:진화|강화|위험 상태|최대 야성|분노.{0,8}(?:50|강화)|필멸자의 의지|만트라|각성|초월 상태|용 형상|총공세|재사용 시|재시전|다시 사용|변신|형태|진정한 모습|메가 나르|원소의 힘|흡수|장막|환생).{0,85}/g)].map((match) => match[0].trim());
      return hits.length ? [{ slot, hits }] : [];
    });
    return { id, name, source: url, extras, conditions };
  }));
  results.push(...batch);
}
console.log(JSON.stringify({ patchVersion: release.patchVersion, sources: release.sources, inspected: results.length, champions: results }, null, 2));
