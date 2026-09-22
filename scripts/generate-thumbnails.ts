/**
 * 목록에 쓸 가벼운 썸네일을 미리 만든다
 *
 * 챔피언 아이콘은 Data Dragon 에서 128px PNG 로 온다. 한 장에 27KB 라 173명이면
 * 4.5MB 다. 그런데 화면에서 가장 크게 쓰는 자리가 40px 이다. 2배 화면까지 쳐도
 * 80px 이면 되는데 128px 원본을 통째로 받고 있었다.
 *
 * 96px WebP 로 줄이면 한 장에 2.3KB, 173명이면 389KB 다. 92% 가 사라진다.
 * 아이템 아이콘도 64px PNG 6.5KB 짜리가 868개라 같은 처리를 한다.
 *
 * 리엇 자산을 줄여 다시 배포하는 것이라 약관을 확인했다. Legal Jibber Jabber 는
 * 비상업 팬 프로젝트에 "use, display and create derivative works based upon
 * Riot's IP" 를 허용한다. 크기를 줄인 사본이 여기 해당한다. 조건은 셋이고 모두
 * 지키고 있다 — 비상업, 로고·상표 미사용, 고지 문구(LegalFooter).
 *
 * 내려받은 것을 그대로 두지 않고 **자료에 있는 챔피언·아이템만** 만든다. 목록이
 * 곧 만들 대상이라 빠지는 것이 생길 수 없고, 시험이 그 짝을 확인한다.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";

/** 화면에서 가장 크게 쓰는 자리가 40px 이다. 2배 화면을 덮고도 남는 값. */
const CHAMPION_SIZE = 96;
/** 아이템은 원본이 64px 다. 표시 자리는 32px 안팎이라 64px 를 유지한다. */
const ITEM_SIZE = 64;
const QUALITY = 82;

/** 같은 파일을 여러 번 받지 않도록 한 번에 여덟 개씩만 받는다. */
const CONCURRENCY = 8;

interface Job {
  url: string;
  file: string;
  size: number;
}

async function fetchImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function run(jobs: Job[]): Promise<{ bytesIn: number; bytesOut: number; missing: string[] }> {
  const missing: string[] = [];
  let bytesIn = 0;
  let bytesOut = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= jobs.length) return;
      const job = jobs[index];
      try {
        const source = await fetchImage(job.url);
        const thumb = await sharp(source).resize(job.size, job.size, { fit: "cover" }).webp({ quality: QUALITY }).toBuffer();
        await writeFile(job.file, thumb);
        bytesIn += source.length;
        bytesOut += thumb.length;
      } catch (error) {
        // 한 장이 없다고 전체를 멈추지 않는다. 빠진 것은 끝에 모아 보이고, 그 짝은
        // 시험이 따로 확인한다.
        missing.push(`${path.basename(job.file)} ← ${(error as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return { bytesIn, bytesOut, missing };
}

async function generateThumbnails() {
  const directory = path.join(process.cwd(), "public/data");
  const release = decodeDataManifest(JSON.parse(await readFile(path.join(directory, "version.json"), "utf8")));
  const { ddragon } = release.sources;
  /*
   * Data Dragon 판본으로 자리를 나눈다.
   *
   * 화면 코드는 `championIconUrl(ddragonVersion, id)` 꼴로 부른다. 패치 번호로
   * 나누면 부르는 자리마다 값을 하나 더 넘겨야 하는데, 열다섯 군데가 넘는다.
   * 자산은 어차피 Data Dragon 판본에 매인 것이므로 그 값으로 나눈다.
   */
  const out = path.join(process.cwd(), "public/img", ddragon);

  const championDir = path.join(directory, release.patchVersion, "champions", "ko_KR");
  // `index.json` 은 목록 파일이지 챔피언이 아니다. 이것까지 받으러 가면 403 이 난다.
  const championIds = (await readdir(championDir))
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.replace(/\.json$/, ""));

  const itemsFile = path.join(directory, release.patchVersion, "items-normalized-ko_KR.json");
  const items = (JSON.parse(await readFile(itemsFile, "utf8")) as { items: Array<{ id: string }> }).items;

  // 지난 판본은 지운다. 남겨 두면 패치마다 저장소가 불어난다.
  const imgRoot = path.join(process.cwd(), "public/img");
  for (const entry of await readdir(imgRoot).catch(() => [])) {
    if (entry !== ddragon) await rm(path.join(imgRoot, entry), { recursive: true, force: true });
  }
  await mkdir(path.join(out, "champion"), { recursive: true });
  await mkdir(path.join(out, "item"), { recursive: true });

  const jobs: Job[] = [
    ...championIds.map((id) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/${ddragon}/img/champion/${id}.png`,
      file: path.join(out, "champion", `${id}.webp`),
      size: CHAMPION_SIZE,
    })),
    ...items.map((item) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/${ddragon}/img/item/${item.id}.png`,
      file: path.join(out, "item", `${item.id}.webp`),
      size: ITEM_SIZE,
    })),
  ];

  const { bytesIn, bytesOut, missing } = await run(jobs);
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  console.log(`썸네일 ${jobs.length}장 (챔피언 ${championIds.length} · 아이템 ${items.length})`);
  console.log(`  원본 ${mb(bytesIn)} → ${mb(bytesOut)} (${Math.round((1 - bytesOut / bytesIn) * 100)}% 절감)`);
  console.log(`  ${out}`);
  if (missing.length > 0) {
    console.log(`\n  못 받은 것 ${missing.length}장`);
    for (const line of missing.slice(0, 10)) console.log(`    ${line}`);
  }
}

generateThumbnails().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
