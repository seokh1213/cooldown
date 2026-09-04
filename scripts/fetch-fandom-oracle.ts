/**
 * LoL Fandom 오라클 데이터를 research/.oracle-cache/fandom 에 받아 둔다.
 * 이미 받은 챔피언은 건너뛰므로 중단 후 다시 돌려도 이어서 받는다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchChampionAbilities,
  fetchChampionSkillNames,
} from "./oracle/fandom";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const { patchVersion } = JSON.parse(
  await fs.readFile(path.join(projectRoot, "public/data/version.json"), "utf8"),
) as { patchVersion: string };

const cacheDir = path.join(projectRoot, "research/.oracle-cache/fandom");
await fs.mkdir(cacheDir, { recursive: true });

const championDir = path.join(
  projectRoot,
  "public/data",
  patchVersion,
  "champions/en_US",
);
const ours = (await fs.readdir(championDir))
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))
  .sort();

console.log(`대상 챔피언 ${ours.length}종, 스킬 이름표 수집 중…`);
const skillNames = await fetchChampionSkillNames();
console.log(`Fandom 챔피언 ${skillNames.size}종 확인`);

let saved = 0;
let skipped = 0;
const missing: string[] = [];

for (const championId of ours) {
  const target = path.join(cacheDir, `${championId}.json`);
  try {
    await fs.access(target);
    skipped += 1;
    continue;
  } catch {
    // 아직 없으면 받는다
  }

  const entry = skillNames.get(championId);
  if (!entry) {
    missing.push(championId);
    continue;
  }

  const abilities = await fetchChampionAbilities(entry.wikiName, entry.skills);
  if (abilities.length === 0) {
    missing.push(`${championId}(문서 없음)`);
    continue;
  }
  await fs.writeFile(
    target,
    `${JSON.stringify({ championId, abilities }, null, 2)}\n`,
    "utf8",
  );
  saved += 1;
  if (saved % 20 === 0) console.log(`  ${saved}종 저장`);
}

console.log(`저장 ${saved}, 건너뜀 ${skipped}, 이름 불일치 ${missing.length}`);
if (missing.length > 0) console.log(`  ${missing.join(", ")}`);
