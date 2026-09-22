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
  type ChampionRolesById,
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
    JSON.stringify(buildChampionIndexV2(details, readChampionRoles(options.versionDir, options.locale)), null, 2),
    "utf-8"
  );
  return details.length;
}

/**
 * 라이엇이 매긴 역할군을 읽는다. 없으면 빈 표를 돌려준다.
 *
 * 클라이언트가 보여 주는 여섯 갈래다. 로케일마다 파일이 있지만 값은 영문 열쇠라
 * 어느 것을 읽어도 같다 — 없을 때를 대비해 한국어 파일로 떨어진다.
 */
function readChampionRoles(versionDir: string, locale: string): ChampionRolesById {
  const candidates = [
    path.join(versionDir, "llm", `champion-riot-meta-${locale}.json`),
    path.join(versionDir, "llm", "champion-riot-meta-ko_KR.json"),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) return {};
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    champions?: Array<{ id?: string; roles?: string[] }>;
  };
  const table: ChampionRolesById = {};
  for (const entry of parsed.champions ?? []) {
    if (entry.id && entry.roles?.length) table[entry.id] = entry.roles;
  }
  return table;
}
