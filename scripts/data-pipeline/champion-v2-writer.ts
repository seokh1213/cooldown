import * as fs from "node:fs";
import * as path from "node:path";
import type { NormalizedChampion } from "../../src/types/combatNormalized";
import type {
  DataLocale,
  StaticDataSources,
} from "../../src/data/contracts/staticData";
import {
  buildChampionDetailV2,
  buildChampionIndexV2,
} from "./champion-data-v2";
import type { ChampionById, SpellDataByChampion } from "./champion-source";

export interface ChampionV2WriterOptions {
  versionDir: string;
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
  championIds: string[];
  normalizedChampions: NormalizedChampion[];
  championsById: ChampionById;
  spellDataByChampion: SpellDataByChampion;
}

export function writeChampionV2Dataset(
  options: ChampionV2WriterOptions
): number {
  const normalizedById = new Map(
    options.normalizedChampions.map((champion) => [champion.id, champion])
  );
  const outputDir = path.join(options.versionDir, "champions", options.locale);
  fs.mkdirSync(outputDir, { recursive: true });

  const details = options.championIds.map((championId) => {
    const normalized = normalizedById.get(championId);
    if (!normalized) throw new Error(`Missing normalized champion: ${championId}`);
    const champion = options.championsById.get(championId);
    if (!champion) throw new Error(`Missing champion: ${championId}`);
    const spellData = options.spellDataByChampion.get(championId);
    if (!spellData) throw new Error(`Missing spell data: ${championId}`);
    const detail = buildChampionDetailV2({
      patchVersion: options.patchVersion,
      locale: options.locale,
      sources: options.sources,
      champion,
      normalized,
      spellData,
    });
    fs.writeFileSync(
      path.join(outputDir, `${championId}.json`),
      JSON.stringify(detail, null, 2),
      "utf-8"
    );
    return detail;
  });

  fs.writeFileSync(
    path.join(outputDir, "index.json"),
    JSON.stringify(buildChampionIndexV2(details), null, 2),
    "utf-8"
  );
  return details.length;
}
