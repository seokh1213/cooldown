import { readFile } from "node:fs/promises";
import path from "node:path";
import { DATA_LOCALES } from "../src/data/contracts/staticData";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import { decodeChampionIndex } from "../src/data/contracts/championDataDecoder";
import type { Champion } from "../src/types";
import { fetchJson, writeJson } from "./data-pipeline/io/json";
import { buildChampionProfile } from "./data-pipeline/champion-profile";

async function generateProfiles() {
  const release = decodeDataManifest(JSON.parse(await readFile("public/data/version.json", "utf8")));
  const directory = path.join("public/data", release.patchVersion);
  for (const locale of DATA_LOCALES) {
    const index = decodeChampionIndex(JSON.parse(await readFile(path.join(directory, "champions", locale, "index.json"), "utf8")));
    for (let offset = 0; offset < index.champions.length; offset += 8) {
      const profiles = await Promise.all(index.champions.slice(offset, offset + 8).map(async ({ id }) => {
        const response = await fetchJson<{ data: Record<string, Champion> }>(
          `https://ddragon.leagueoflegends.com/cdn/${release.sources.ddragon}/data/${locale}/champion/${id}.json`,
        );
        if (response.data[id]?.id !== id) throw new Error(`Missing champion profile: ${id}`);
        return buildChampionProfile({ ...release, schemaVersion: 2, locale, champion: response.data[id] });
      }));
      for (const profile of profiles) {
        await writeJson(profile, path.join(directory, "champion-profiles", locale, profile.champion.id + ".json"));
      }
    }
    console.log(`Generated ${index.champions.length} ${locale} champion profiles`);
  }
}

generateProfiles().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
