import * as fs from "node:fs";
import * as path from "node:path";
import type { Champion } from "../../src/types";
import type { CommunityDragonSpellData } from "../../src/lib/spellTooltipParser/types";
import type { NormalizedChampion } from "../../src/types/combatNormalized";
import type {
  DataLocale,
  StaticDataSources,
} from "../../src/data/contracts/staticData";
import {
  buildChampionDetailV2,
  buildChampionIndexV2,
} from "./champion-data-v2";

interface ChampionSourceFile {
  champion: Champion;
}

interface SpellSourceFile {
  spellData: Record<string, CommunityDragonSpellData>;
}

export interface ChampionV2WriterOptions {
  versionDir: string;
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
  championIds: string[];
  normalizedChampions: NormalizedChampion[];
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
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
    const championFile = readJson<ChampionSourceFile>(
      path.join(
        options.versionDir,
        "champions",
        `${championId}-${options.locale}.json`
      )
    );
    const spellFile = readJson<SpellSourceFile>(
      path.join(options.versionDir, "spells", `${championId}.json`)
    );
    const detail = buildChampionDetailV2({
      patchVersion: options.patchVersion,
      locale: options.locale,
      sources: options.sources,
      champion: championFile.champion,
      normalized,
      spellData: spellFile.spellData,
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
