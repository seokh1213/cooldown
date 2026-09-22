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
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import { RUNE_TREE_META } from "../src/data/mappers/runeMapper";

/** 화면에서 가장 크게 쓰는 자리가 40px 이다. 2배 화면을 덮고도 남는 값. */
const CHAMPION_SIZE = 96;
/** 아이템은 원본이 64px 다. 표시 자리는 32px 안팎이라 64px 를 유지한다. */
const ITEM_SIZE = 64;
/**
 * 룬 아이콘은 원본이 가장 무겁다. 25장에 854KB 로 한 장에 34KB 다.
 *
 * 룬 화면에서 가장 크게 쓰는 자리도 40px 대라 64px 면 넉넉하다. 게다가 이 아이콘만
 * 외부 호스트(`ddragon.leagueoflegends.com`)를 직접 보고 있어서 서비스워커가
 * 맡지도 못했다. 우리 자리로 가져오면 그 문제도 같이 풀린다.
 */
const RUNE_SIZE = 64;
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

  /*
   * 룬 아이콘 경로는 자료 안에 `perk-images/Styles/.../X.png` 꼴로 박혀 있다.
   * 로케일마다 같은 그림이라 하나만 읽어 모으고, 폴더 구조를 그대로 옮긴다.
   * 화면이 `runeIconUrl(iconPath)` 로 부르므로 경로가 어긋나면 안 된다.
   */
  const runesFile = path.join(directory, release.patchVersion, "runes-normalized-ko_KR.json");
  const runePaths = [...new Set([
    ...new Set([...(await readFile(runesFile, "utf8")).matchAll(/"iconPath"\s*:\s*"([^"]+)"/g)].map((match) => match[1])),
  ]
    .concat(Object.values(RUNE_TREE_META).map((tree) => tree.icon))
    .filter((iconPath) => iconPath.endsWith(".png")))]
    /*
     * 이름 차례로 세운다.
     *
     * 시트 칸 자리를 화면이 스스로 계산하려면 양쪽이 같은 차례를 써야 한다.
     * 자료에 실린 차례는 룬과 파편이 서로 다른 자리에서 오므로 화면이 그대로
     * 되살리기 어렵다. 이름으로 세우면 어느 쪽에서 세든 같다.
     */
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  /*
   * 두 꼴이 섞여 온다. 룬은 상대 경로, 스탯 파편만 `/lol-game-data/assets/v1/...`
   * 절대 경로다. Data Dragon 은 뒤엣것의 접두사를 뺀 자리에 파일을 둔다. 화면 쪽
   * `runeIconKey` 와 같은 규칙이어야 하고, 어긋나면 시험이 잡는다.
   */
  const runeKey = (iconPath: string) =>
    iconPath.replace(/^\/lol-game-data\/assets\/v1\//, "").replace(/^\//, "").replace(/\.png$/, "");

  /*
   * 지난 판본은 지운다. 남겨 두면 패치마다 저장소가 불어난다.
   *
   * `runes` 는 예외다. 룬 자료에는 판본이 안 들어 있어 부르는 쪽이 값을 모르고,
   * Data Dragon 도 룬 아이콘만은 판본 없는 주소로 준다. 그래서 판본 밖에 두고
   * 패치마다 덮어쓴다.
   */
  const imgRoot = path.join(process.cwd(), "public/img");
  const runeOut = path.join(imgRoot, "runes");
  for (const entry of await readdir(imgRoot).catch(() => [])) {
    if (entry !== ddragon && entry !== "runes") await rm(path.join(imgRoot, entry), { recursive: true, force: true });
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
    ...runePaths.map((iconPath) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/img/${runeKey(iconPath)}.png`,
      file: path.join(runeOut, `${runeKey(iconPath)}.webp`),
      size: RUNE_SIZE,
    })),
  ];
  // 룬은 폴더가 깊다. 미리 만들어 두지 않으면 쓰기가 실패한다.
  for (const iconPath of runePaths) {
    await mkdir(path.dirname(path.join(runeOut, runeKey(iconPath))), { recursive: true });
  }

  const { bytesIn, bytesOut, missing } = await run(jobs);

  /*
   * 낱장을 한 장으로 합친다.
   *
   * 목록 화면은 아이콘을 한꺼번에 그린다. 챔피언 173건, 아이템은 눈에 보이는
   * 것만 해도 212건이 줄줄이 날아가고 그동안 자리맡이 보인다. 한 장으로 합치면
   * 요청이 1건이 되고 화면이 한 번에 채워진다.
   *
   * 바이트도 조금 준다. 비슷한 그림이 모여 있어 압축이 더 먹는다.
   *   챔피언 424KB → 373KB (12%)   아이템 1,524KB → 1,243KB (18%)
   *
   * 낱장도 그대로 남긴다. 상세 화면처럼 한 장만 쓰는 자리는 합친 것을 받을 까닭이
   * 없다. 목록만 합친 것을 본다.
   */
  const sheets = [
    await buildSheet("champion", championIds, CHAMPION_SIZE, out, QUALITY),
    // 룬은 판본 밖 자리에 모인다. 칸 이름도 경로를 눕힌 꼴이라 따로 넘긴다.
    await buildSheet("rune", runePaths.map(runeKey), RUNE_SIZE, runeOut, QUALITY, imgRoot),
    /*
     * 아이템 시트만 압축을 더 건다.
     *
     * 868칸이라 한 장이 크다. 품질을 82 에서 70 으로 내리면 1,243KB 가 1,042KB 가
     * 된다. 더 내려도 55 에서 901KB 로 얻는 것이 줄고, 32px 로 그리는 그림이라
     * 70 아래부터는 눈에 띈다.
     */
    await buildSheet("item", items.map((item) => item.id), ITEM_SIZE, out, 70),
  ];
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  console.log(`썸네일 ${jobs.length}장 (챔피언 ${championIds.length} · 아이템 ${items.length} · 룬 ${runePaths.length})`);
  console.log(`  원본 ${mb(bytesIn)} → ${mb(bytesOut)} (${Math.round((1 - bytesOut / bytesIn) * 100)}% 절감)`);
  console.log(`  ${out}`);
  for (const sheet of sheets) {
    console.log(`  스프라이트 ${sheet.kind}: ${sheet.count}장 · ${sheet.cols}×${sheet.rows} · ${(sheet.bytes / 1024).toFixed(0)}KB`);
  }
  if (missing.length > 0) {
    console.log(`\n  못 받은 것 ${missing.length}장`);
    for (const line of missing.slice(0, 10)) console.log(`    ${line}`);
  }
}

generateThumbnails().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

interface SheetInfo {
  kind: string;
  count: number;
  cols: number;
  rows: number;
  bytes: number;
}

/**
 * 낱장을 격자로 붙여 한 장으로 만든다.
 *
 * 차례는 **자료에 있는 순서 그대로**이고, 옆에 이름 목록을 담은 작은 JSON 을 함께
 * 남긴다. 순서를 양쪽에서 따로 계산하게 두면 하나만 어긋나도 그림이 통째로 밀리는데,
 * 목록을 같이 주면 그럴 일이 없다.
 */
async function buildSheet(
  kind: string,
  ids: string[],
  size: number,
  out: string,
  quality: number,
  /** 시트를 둘 자리. 안 주면 낱장이 있는 자리에 함께 둔다. */
  sheetDir = out,
): Promise<SheetInfo> {
  // 룬은 낱장이 `runes/` 바로 아래에 있고 나머지는 `<kind>/` 아래에 있다.
  const cell = (id: string) => (kind === "rune" ? path.join(out, `${id}.webp`) : path.join(out, kind, `${id}.webp`));
  const present = ids.filter((id) => existsSync(cell(id)));
  const cols = Math.ceil(Math.sqrt(present.length));
  const rows = Math.ceil(present.length / cols);
  const composite = await Promise.all(
    present.map(async (id, index) => ({
      input: await readFile(cell(id)),
      left: (index % cols) * size,
      top: Math.floor(index / cols) * size,
    })),
  );
  const sheet = await sharp({
    create: { width: cols * size, height: rows * size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composite)
    .webp({ quality })
    .toBuffer();
  await writeFile(path.join(sheetDir, `${kind}s.webp`), sheet);
  await writeFile(path.join(sheetDir, `${kind}s.json`), `${JSON.stringify({ size, cols, rows, ids: present })}\n`);
  return { kind, count: present.length, cols, rows, bytes: sheet.length };
}
