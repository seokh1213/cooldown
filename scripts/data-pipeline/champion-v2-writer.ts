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
  type WikiClassById,
} from "./champion-data-v2";
import type { ChampionById, SpellDataByChampion } from "./champion-source";
import { buildChampionProfile } from "./champion-profile";

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
  const profileDir = path.join(options.versionDir, "champion-profiles", options.locale);
  fs.mkdirSync(profileDir, { recursive: true });

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
    const profile = buildChampionProfile({
      schemaVersion: 2, patchVersion: options.patchVersion, sources: options.sources,
      locale: options.locale, champion,
    });
    fs.writeFileSync(path.join(profileDir, `${championId}.json`), JSON.stringify(profile, null, 2), "utf8");
    fs.writeFileSync(
      path.join(outputDir, `${championId}.json`),
      JSON.stringify(detail, null, 2),
      "utf-8"
    );
    return detail;
  });

  fs.writeFileSync(
    path.join(outputDir, "index.json"),
    JSON.stringify(buildChampionIndexV2(details, readWikiClasses(options.versionDir)), null, 2),
    "utf-8"
  );
  return details.length;
}

/**
 * 위키가 매긴 하위 직군을 읽는다. 없으면 빈 표를 돌려준다.
 *
 * `npm run llm:fetch-wiki` 가 만드는 파일이다. 아직 안 받았거나 새 패치라 비어
 * 있어도 목록 생성은 멈추지 않는다. 그 대신 몇 명이 빠졌는지 시험이 지켜본다.
 */
function readWikiClasses(versionDir: string): WikiClassById {
  const file = path.join(versionDir, "llm", "champion-wiki-meta.json");
  if (!fs.existsSync(file)) return {};
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    champions?: Array<{ id?: string; subclasses?: string[]; positions?: string[] }>;
  };
  const table: WikiClassById = {};
  for (const entry of parsed.champions ?? []) {
    if (!entry.id) continue;
    table[entry.id] = { subclasses: entry.subclasses, positions: entry.positions };
  }
  return table;
}
