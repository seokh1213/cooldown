/**
 * 전 챔피언 스킬 툴팁 수치 전수 대조 (Ability v2 계약)
 *
 * 배포되는 산출물(champions/{locale}/{id}.json 의 abilities)을 그대로 읽어
 * lol.ps / poro.gg 문장과 숫자를 대조한다.
 *
 * 두 사이트 모두 오류가 섞인 비교 오라클이라 절대 정답률로 읽으면 안 된다.
 * "어느 쪽에서도 확인되지 않는 숫자" 를 뽑아 사람이 볼 지점을 좁히는 용도다.
 * 미해석 토큰은 생성기가 남기는 diagnostics.unresolvedTokens 를 그대로 쓴다.
 *
 * 오라클 캐시는 scripts/fetch-oracle-data.ts 로 먼저 받아 둔다.
 * 사용: tsx scripts/audit-tooltip-numbers.ts [--json out.json]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { patchVersion } = JSON.parse(
  await fs.readFile(path.join(projectRoot, "public/data/version.json"), "utf8")
) as { patchVersion: string };
const dataRoot = path.join(projectRoot, "public/data", patchVersion);
const cacheRoot = path.join(projectRoot, "research/.oracle-cache");

const SLOTS = ["Q", "W", "E", "R"] as const;
type Slot = (typeof SLOTS)[number];

const LOLPS_KEYS: Record<Slot, string> = {
  Q: "qDescKr",
  W: "wDescKr",
  E: "eDescKr",
  R: "rDescKr",
};

interface AbilityV2 {
  id?: string;
  bodyHtml?: string;
  rankValues?: Array<{ label: string; values: string }>;
  diagnostics?: { unresolvedTokens?: string[] };
}

interface ChampionFileV2 {
  champion: { id: string; abilities: Record<string, AbilityV2> };
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ");
}

/** 오라클 문장 끝의 소모값·쿨다운 줄은 본문 대조 대상이 아니다 */
function oracleBody(text: string): string {
  return stripTags(text)
    .split(/\n|<br\s*\/?>/i)
    .filter((line) => !/^\s*(소모값|재사용 대기시간|비용|사거리|범위)\s*[:：]/.test(line))
    .join(" ");
}

/** 문장에 등장하는 숫자 집합. 0/1 은 우연 일치가 잦아 뺀다 */
function numbersOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of stripTags(text).matchAll(/\d+(?:\.\d+)?/g)) {
    if (m[0] === "0" || m[0] === "1") continue;
    out.add(m[0]);
  }
  return out;
}

interface Row {
  champion: string;
  slot: Slot;
  spellId: string;
  unresolvedTokens: string[];
  ourNumbers: number;
  notInLolps: string[];
  uncorroborated: string[];
  poroUnknown: number | null;
  poroNumbers: number | null;
}

const rows: Row[] = [];
let lolpsMissing = 0;
let poroMissing = 0;

const championFiles = (await fs.readdir(path.join(dataRoot, "champions/ko_KR")))
  .filter((f) => f.endsWith(".json"))
  .sort();

for (const file of championFiles) {
  const championId = file.replace(/\.json$/, "");
  const champ = JSON.parse(
    await fs.readFile(path.join(dataRoot, "champions/ko_KR", file), "utf8")
  ) as ChampionFileV2;

  let lolps: Record<string, string> | null = null;
  try {
    lolps = JSON.parse(
      await fs.readFile(path.join(cacheRoot, "lolps", `${championId}.json`), "utf8")
    ) as Record<string, string>;
  } catch {
    lolpsMissing += 1;
  }

  let poro: Record<string, string> | null = null;
  try {
    poro = JSON.parse(
      await fs.readFile(path.join(cacheRoot, "porogg", `${championId}.json`), "utf8")
    ) as Record<string, string>;
  } catch {
    poroMissing += 1;
  }

  for (const slot of SLOTS) {
    const ability = champ.champion?.abilities?.[slot];
    if (!ability) continue;

    // 본문과 랭크별 수치표를 합쳐야 사용자가 실제로 보는 숫자 전체가 된다
    const rankText = (ability.rankValues ?? [])
      .map((r) => `${r.label} ${r.values}`)
      .join(" ");
    const ours = numbersOf(`${ability.bodyHtml ?? ""} ${rankText}`);

    const oracleRaw = lolps?.[LOLPS_KEYS[slot]] ?? "";
    const theirs = oracleRaw ? numbersOf(oracleBody(oracleRaw)) : new Set<string>();

    const poroText = ability.id ? (poro?.[ability.id] ?? null) : null;
    const poroNums = poroText ? numbersOf(oracleBody(poroText)) : new Set<string>();

    rows.push({
      champion: championId,
      slot,
      spellId: ability.id ?? "",
      unresolvedTokens: ability.diagnostics?.unresolvedTokens ?? [],
      ourNumbers: ours.size,
      notInLolps: oracleRaw ? [...ours].filter((n) => !theirs.has(n)) : [],
      uncorroborated: [...ours].filter((n) => !theirs.has(n) && !poroNums.has(n)),
      poroUnknown: poroText == null ? null : (poroText.match(/\?/g) ?? []).length,
      poroNumbers: poroText == null ? null : poroNums.size,
    });
  }
}

const totalOurs = rows.reduce((a, r) => a + r.ourNumbers, 0);
const totalNotInLolps = rows.reduce((a, r) => a + r.notInLolps.length, 0);
const totalUncorroborated = rows.reduce((a, r) => a + r.uncorroborated.length, 0);
const totalUnresolved = rows.reduce((a, r) => a + r.unresolvedTokens.length, 0);
const poroRows = rows.filter((r) => r.poroUnknown != null);
const poroUnknownTotal = poroRows.reduce((a, r) => a + (r.poroUnknown ?? 0), 0);
const poroNumTotal = poroRows.reduce((a, r) => a + (r.poroNumbers ?? 0), 0);

const pct = (part: number, whole: number): string =>
  whole === 0 ? "-" : `${((part / whole) * 100).toFixed(1)}%`;

console.log(`=== 전수 대조 (패치 ${patchVersion}, Ability v2) ===`);
console.log(`스킬 ${rows.length}개 / 챔피언 ${championFiles.length}명`);
console.log(`오라클 캐시 없음 — lol.ps ${lolpsMissing}명, poro.gg ${poroMissing}명`);
console.log();
console.log(`[생성기 진단]`);
console.log(`  미해석 토큰: ${totalUnresolved}`);
console.log(
  `  미해석이 있는 스킬: ${rows.filter((r) => r.unresolvedTokens.length > 0).length}/${rows.length}`
);
console.log();
console.log(`[수치 대조]`);
console.log(`  우리 숫자(본문 + 랭크표): ${totalOurs}`);
console.log(`  lol.ps 문장에 없음: ${totalNotInLolps} (${pct(totalNotInLolps, totalOurs)})`);
console.log(`  poro.gg 가 '?' 로 비운 자리: ${poroUnknownTotal}`);
console.log(`  poro.gg 가 낸 숫자: ${poroNumTotal}`);
console.log();
console.log(`[3자 교차]`);
console.log(
  `  두 오라클 중 한 곳 이상에서 확인: ${totalOurs - totalUncorroborated}/${totalOurs} (${pct(totalOurs - totalUncorroborated, totalOurs)})`
);
console.log(`  어느 쪽에서도 확인 안 됨: ${totalUncorroborated}`);

console.log(`\n=== 교차 확인 안 된 숫자가 많은 스킬 상위 15 ===`);
for (const r of [...rows]
  .sort((a, b) => b.uncorroborated.length - a.uncorroborated.length)
  .slice(0, 15)) {
  if (r.uncorroborated.length === 0) break;
  console.log(`  ${r.champion} ${r.slot}: ${r.uncorroborated.slice(0, 8).join(", ")}`);
}

console.log(`\n=== 미해석 토큰 목록 ===`);
for (const r of rows) {
  if (r.unresolvedTokens.length === 0) continue;
  console.log(`  ${r.champion} ${r.slot}: ${r.unresolvedTokens.join(", ")}`);
}

const jsonIdx = process.argv.indexOf("--json");
if (jsonIdx >= 0 && process.argv[jsonIdx + 1]) {
  await fs.writeFile(process.argv[jsonIdx + 1], JSON.stringify(rows, null, 2));
  console.log(`\n상세 저장: ${process.argv[jsonIdx + 1]}`);
}
