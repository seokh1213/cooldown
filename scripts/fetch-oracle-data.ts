/**
 * 전수 대조용 오라클 데이터 수집
 *
 * - lol.ps: 공개 basic-info API. 챔피언별 완성 문장(Kr/Us/Cn)을 준다.
 * - poro.gg: 스킬 툴팁이 클라이언트 렌더라 headless Chrome 으로 DOM 을 받아
 *            Nuxt 페이로드에서 spells 배열을 추출한다.
 *
 * 결과는 research/.oracle-cache/{lolps,porogg}/{championId}.json 으로 저장한다.
 * 이미 받은 파일은 건너뛰므로 중단 후 재실행해도 이어서 받는다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { patchVersion: version } = JSON.parse(
  await fs.readFile(path.join(projectRoot, "public/data/version.json"), "utf8")
) as { patchVersion: string };
const dataRoot = path.join(projectRoot, "public/data", version);

const cacheRoot = path.join(projectRoot, "research/.oracle-cache");
const lolpsDir = path.join(cacheRoot, "lolps");
const poroDir = path.join(cacheRoot, "porogg");
await fs.mkdir(lolpsDir, { recursive: true });
await fs.mkdir(poroDir, { recursive: true });

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

interface ChampionRef {
  id: string;
  key: string;
  alias: string;
}

const champions: ChampionRef[] = [];
for (const file of (await fs.readdir(path.join(dataRoot, "spells")))
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const id = file.replace(/\.json$/, "");
  try {
    const cf = JSON.parse(
      await fs.readFile(path.join(dataRoot, "champions", `${id}-ko_KR.json`), "utf8")
    ) as { champion: { key: string; name: string } };
    champions.push({ id, key: cf.champion.key, alias: id.toLowerCase() });
  } catch {
    // 챔피언 파일이 없으면 대조 대상에서 제외
  }
}
console.log(`대상 챔피언: ${champions.length}`);

const target = process.argv[2] ?? "all"; // lolps | porogg | all

async function fetchLolps(): Promise<void> {
  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const champ of champions) {
    const out = path.join(lolpsDir, `${champ.id}.json`);
    try {
      await fs.access(out);
      skipped += 1;
      continue;
    } catch {
      // 캐시 없음 → 내려받는다
    }

    try {
      const res = await fetch(`https://lol.ps/api/champ/${champ.key}/basic-info.json`);
      if (!res.ok) {
        failed += 1;
        console.log(`  lol.ps ${champ.id}: HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { data?: unknown };
      await fs.writeFile(out, JSON.stringify(body.data ?? body));
      done += 1;
    } catch (e) {
      failed += 1;
      console.log(`  lol.ps ${champ.id}: ${(e as Error).message}`);
    }

    await new Promise((r) => setTimeout(r, 120));
    if ((done + skipped) % 25 === 0) {
      console.log(`  lol.ps 진행 ${done + skipped}/${champions.length}`);
    }
  }

  console.log(`lol.ps 완료: 신규 ${done}, 캐시 ${skipped}, 실패 ${failed}`);
}

/** Nuxt 페이로드에서 spells 배열의 tooltip 문자열만 뽑는다 */
function extractPoroSpells(dom: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  const re = /id:"([A-Za-z0-9_]+)",name:"((?:[^"\\]|\\.)*)",imageUrl:"[^"]*",tooltip:"((?:[^"\\]|\\.)*)"/g;

  for (const m of dom.matchAll(re)) {
    const [, id, , tooltip] = m;
    result[id] = tooltip
      .replace(/\\n/g, "\n")
      .replace(/\\u003C/g, "<")
      .replace(/\\u003E/g, ">")
      .replace(/\\u002F/g, "/")
      .replace(/\\"/g, '"');
  }

  return Object.keys(result).length > 0 ? result : null;
}

/** headless Chrome 한 번 띄워 DOM 을 받는다 */
async function dumpDom(alias: string, index: number): Promise<string> {
  const { stdout } = await execFileAsync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      `--user-data-dir=/tmp/poro-chrome-${index % 8}`,
      "--virtual-time-budget=8000",
      "--dump-dom",
      `https://poro.gg/champions/${alias}`,
    ],
    { maxBuffer: 64 * 1024 * 1024, timeout: 90_000 }
  );
  return stdout;
}

async function fetchPorogg(): Promise<void> {
  const pending: ChampionRef[] = [];
  let skipped = 0;

  for (const champ of champions) {
    try {
      await fs.access(path.join(poroDir, `${champ.id}.json`));
      skipped += 1;
    } catch {
      pending.push(champ);
    }
  }

  console.log(`poro.gg 대상: ${pending.length}개 (캐시 ${skipped})`);

  let done = 0;
  let failed = 0;
  let cursor = 0;
  const CONCURRENCY = 6;

  async function worker(slot: number): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= pending.length) return;
      const champ = pending[index];

      let lastError = "";
      // 렌더 타이밍 문제로 비는 경우가 있어 한 번 더 시도한다
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const dom = await dumpDom(champ.alias, slot);
          const spells = extractPoroSpells(dom);
          if (spells) {
            await fs.writeFile(
              path.join(poroDir, `${champ.id}.json`),
              JSON.stringify(spells)
            );
            done += 1;
            lastError = "";
            break;
          }
          lastError = "spells 추출 실패";
        } catch (e) {
          lastError = (e as Error).message.slice(0, 60);
        }
      }

      if (lastError) {
        failed += 1;
        console.log(`  poro.gg ${champ.id}: ${lastError}`);
      }
      if ((done + failed) % 20 === 0) {
        console.log(`  poro.gg 진행 ${done + failed}/${pending.length}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, slot) => worker(slot))
  );

  console.log(`poro.gg 완료: 신규 ${done}, 캐시 ${skipped}, 실패 ${failed}`);
}

if (target === "lolps" || target === "all") await fetchLolps();
if (target === "porogg" || target === "all") await fetchPorogg();
