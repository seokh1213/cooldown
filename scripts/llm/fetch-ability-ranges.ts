/**
 * 스킬 사거리 수집 (CommunityDragon 챔피언 BIN)
 *
 * "제드 궁 사거리" 에 카드가 툴팁 문장만 보이고 625 를 말하지 못했다(2026-09-30 브라우저 시험).
 * 챔피언 자료의 `range` 는 DDragon 값이라 그대로 쓰기 어렵다.
 *   - castRange 가 없는 스킬에 기본값 400 을 채운다(트린다미어 R·애쉬 Q·가렌 R 등 16.19 에서 29스킬).
 *   - 제한 없음 표기(25000·30000)와 자기 시전 표기(0·20)가 숫자로 섞여 있다.
 * BIN 을 직접 읽으면 "값이 없다" 를 가릴 수 있다. 고르는 규칙은 `extractAbilityCastRanges` 에 있다.
 *
 * 출력: public/data/<patch>/llm/ability-ranges.json — `"Zed:R"` → 625 (랭크마다 다르면 배열)
 * 사실 카드(`npm run llm:build`)가 이 파일을 읽어 SpellFact.range 를 채운다.
 *
 * 사용: npm run llm:fetch-ranges [-- --champ Zed,Ahri]
 */
import * as fs from "fs";
import * as path from "path";
import {
  extractAbilityCastRanges,
  fetchCDragonChampion,
  type AbilityCastRange,
} from "../data-pipeline/sources/cdragon-champion";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

export const RANGE_FILE = "ability-ranges.json";

export interface AbilityRangeFile {
  schemaVersion: 1;
  patch: string;
  cdragon: string;
  fetchedAt: string;
  /** "Zed:R" → 사거리. 사거리가 없는 스킬(자기 시전·전역)은 싣지 않는다. */
  abilities: Record<string, AbilityCastRange>;
}

interface ChampionFile {
  sources?: { cdragon?: string };
  champion: { id: string; abilities: Record<string, { maxRank?: number } | undefined> };
}

async function main() {
  const patch = resolvePatchVersion();
  const championDir = path.join(PUBLIC_DATA_ROOT, patch, "champions", "ko_KR");
  const champIdx = process.argv.indexOf("--champ");
  const only = champIdx >= 0 ? new Set(process.argv[champIdx + 1].split(",")) : undefined;
  const files = fs
    .readdirSync(championDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(championDir, file), "utf8")) as ChampionFile)
    // 목록 파일(index.json)은 챔피언이 아니다
    .filter((file) => file.champion && (!only || only.has(file.champion.id)));
  const cdragon = files[0]?.sources?.cdragon;
  if (!cdragon) throw new Error(`${championDir}: 챔피언 자료 또는 CDragon 버전 부재`);

  const abilities: Record<string, AbilityCastRange> = {};
  const failed: string[] = [];
  // 한꺼번에 170개를 받으면 CDragon 이 끊는다. 여덟 개씩.
  for (let i = 0; i < files.length; i += 8) {
    await Promise.all(
      files.slice(i, i + 8).map(async ({ champion }) => {
        try {
          const bin = await fetchCDragonChampion(champion.id, cdragon);
          const maxRanks = Object.fromEntries(
            (["Q", "W", "E", "R"] as const).map((slot) => [slot, champion.abilities[slot]?.maxRank]),
          );
          for (const [slot, range] of Object.entries(extractAbilityCastRanges(bin, maxRanks))) {
            abilities[`${champion.id}:${slot}`] = range;
          }
        } catch (error) {
          // 한 챔피언이 빠져도 나머지는 쓴다. 빠진 챔피언은 카드에 사거리가 없을 뿐이다.
          failed.push(`${champion.id}: ${(error as Error).message}`);
        }
      }),
    );
  }

  const sorted = Object.fromEntries(Object.entries(abilities).sort(([a], [b]) => a.localeCompare(b)));
  if (failed.length) console.warn(`받기 실패 ${failed.length}건:\n  ${failed.join("\n  ")}`);
  // 몇 챔피언만 보는 것은 확인용이다. 파일을 쓰면 나머지 챔피언이 지워진다.
  if (only) {
    console.log(JSON.stringify(sorted, null, 1));
    return;
  }
  const file: AbilityRangeFile = { schemaVersion: 1, patch, cdragon, fetchedAt: new Date().toISOString(), abilities: sorted };
  const outFile = path.join(PUBLIC_DATA_ROOT, patch, "llm", RANGE_FILE);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(file, null, 1)}\n`, "utf8");
  console.log(`생성: ${path.relative(process.cwd(), outFile)} (${files.length} 챔피언, 사거리 ${Object.keys(sorted).length}스킬)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
