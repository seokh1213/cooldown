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
import { FORMULA_GROUPS } from "../src/data/gameFormulas";
import { STAT_DEFINITIONS } from "../src/types/combatStats";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import { RUNE_TREE_META } from "../src/data/mappers/runeMapper";

/** 화면에서 가장 크게 쓰는 자리가 40px 이다. 2배 화면을 덮고도 남는 값. */
const CHAMPION_SIZE = 96;
/** 아이템은 원본이 64px 다. 표시 자리는 32px 안팎이라 64px 를 유지한다. */
const ITEM_SIZE = 64;
/** 소환사 주문 아이콘. 백과에서 40px 로 쓴다. */
const SUMMONER_SIZE = 64;
/** 챔피언 스킬·패시브 아이콘. VS 표에서 32px, 상세에서 40px 로 쓴다. */
const ABILITY_SIZE = 64;
/**
 * 룬 아이콘은 원본이 가장 무겁다. 25장에 854KB 로 한 장에 34KB 다.
 *
 * 룬 화면에서 가장 크게 쓰는 자리도 40px 대라 64px 면 넉넉하다. 게다가 이 아이콘만
 * 외부 호스트(`ddragon.leagueoflegends.com`)를 직접 보고 있어서 서비스워커가
 * 맡지도 못했다. 우리 자리로 가져오면 그 문제도 같이 풀린다.
 */
const RUNE_SIZE = 64;
/** 스탯 글리프는 글자 높이로 그린다(`h-[1em]`). 원본이 32px 고 그대로 둔다. */
const STAT_ICON_SIZE = 32;
const QUALITY = 82;
/*
 * 합친 장의 AVIF 사본.
 *
 * 시트는 우리가 내보내는 것 중 가장 무겁다(아이템 1,036KB). AVIF 로 다시 뽑으면
 * 챔피언 383KB→175KB, 아이템 1,036KB→646KB 로 줄어든다. 낱장은 한두 KB 라 얻을
 * 것이 없어 합친 장에만 만든다.
 *
 * 화면은 `image-set(... type("image/avif"))` 로 둘을 함께 걸고, 못 읽는 브라우저는
 * WebP 를 집는다. 그래서 WebP 를 지우지 않는다.
 */
const AVIF_QUALITY = 50;
// 8 까지 올리면 5% 더 줄지만 CI 시간이 세 배가 된다. 4 가 그 사이다.
const AVIF_EFFORT = 4;

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
  // 스탯 글리프도 판본 밖이다. 패치별 자료가 아니라 UI 글리프라 값이 바뀌지 않는다.
  const statOut = path.join(imgRoot, "stat");
  for (const entry of await readdir(imgRoot).catch(() => [])) {
    if (entry !== ddragon && entry !== "runes" && entry !== "stat") {
      await rm(path.join(imgRoot, entry), { recursive: true, force: true });
    }
  }
  await mkdir(statOut, { recursive: true });
  /*
   * 소환사 주문 아이콘.
   *
   * 백과 네 탭 중 이것만 아직 Data Dragon 을 직접 보고 있었다. 서른네 장이라
   * 시트로 붙이면 한 건이 된다. 파일 이름이 그대로 열쇠다("SummonerBarrier.png").
   */
  const summonerFile = path.join(directory, release.patchVersion, "summoner-normalized-ko_KR.json");
  const summonerIcons = [
    ...new Set(
      (JSON.parse(await readFile(summonerFile, "utf8")) as { spells: Array<{ iconPath?: string }> }).spells
        .map((spell) => (spell.iconPath ?? "").replace(/\.png$/, ""))
        .filter(Boolean),
    ),
  ].sort();

  /*
   * 챔피언 스킬·패시브 아이콘.
   *
   * 마지막까지 Data Dragon 을 직접 보던 것이다. 팔백예순다섯 장을 한 장에 붙이지는
   * 않는다 — VS 표는 한 번에 다섯에서 열 장만 쓰므로 안 볼 것까지 받게 된다.
   * 대신 **챔피언마다 다섯 칸짜리 띠**로 붙인다(`ability/<id>.webp`, 7KB). VS
   * 화면 진입이 낱장 열 건에서 띠 두 건이 되고 받는 양은 그대로다.
   *
   * 낱장도 남긴다. 툴팁과 시뮬레이션처럼 한두 장만 쓰는 자리는 띠를 받을 까닭이 없다.
   */
  const abilityIcons = new Set<string>();
  const passiveIcons = new Set<string>();
  /*
   * 스탯 글리프.
   *
   * 화면이 마지막까지 CommunityDragon 을 직접 보던 것이다. 툴팁의 "60% 공격력" 앞에
   * 붙는 검 모양이고, 이제 아이템 능력치 줄도 같은 것을 쓴다. 이름이 나오는 자리는
   * 셋이라 셋을 다 모은다 — 챔피언 자료에 박힌 자리 표시, 계산식 표, 스탯 정의.
   */
  const statIcons = new Set<string>();
  for (const group of FORMULA_GROUPS) for (const entry of group.entries) if (entry.icon) statIcons.add(entry.icon);
  for (const definition of Object.values(STAT_DEFINITIONS)) if (definition.icon) statIcons.add(definition.icon);

  /** 챔피언 → P·Q·W·E·R 차례의 아이콘 파일 이름. 띠의 칸 차례가 곧 이 차례다. */
  const abilityStrips = new Map<string, Array<string | undefined>>();
  /*
   * 변신 스킬 아이콘 스물일곱 장(엘리스·니달리·제이스·그웬).
   *
   * 여기만 마지막까지 Community Dragon 을 화면에서 직접 보고 있었다. 우리 자리로
   * 옮겨야 서비스워커가 맡고 판본이 바뀌어도 주소가 어긋나지 않는다.
   */
  const formIcons = new Map<string, { iconVersion: string; iconPath: string }>();
  for (const id of championIds) {
    const champion = (JSON.parse(await readFile(path.join(championDir, `${id}.json`), "utf8")) as {
      champion?: {
        abilities?: Record<string, { id?: string; iconFile?: string; forms?: Array<{ iconVersion: string; iconPath: string }> }>;
      };
    }).champion;
    for (const [slot, ability] of Object.entries(champion?.abilities ?? {})) {
      if (slot === "P") {
        if (ability?.iconFile) passiveIcons.add(ability.iconFile.replace(/\.png$/, ""));
      } else if (ability?.id) {
        abilityIcons.add(ability.id);
      }
    }
    for (const token of JSON.stringify(champion ?? {}).matchAll(/\[\[si:([a-z]+)]]/g)) statIcons.add(token[1]);
    for (const ability of Object.values(champion?.abilities ?? {})) {
      for (const form of ability?.forms ?? []) {
        if (form.iconVersion && form.iconPath) formIcons.set(formIconKey(form.iconPath), form);
      }
    }
    abilityStrips.set(
      id,
      ABILITY_SLOTS.map((slot) => {
        const ability = champion?.abilities?.[slot];
        if (!ability) return undefined;
        return slot === "P" ? ability.iconFile?.replace(/\.png$/, "") : ability.id;
      }),
    );
  }

  await mkdir(path.join(out, "ability"), { recursive: true });
  await mkdir(path.join(out, "form"), { recursive: true });
  await mkdir(path.join(out, "champion"), { recursive: true });
  await mkdir(path.join(out, "summoner"), { recursive: true });
  await mkdir(path.join(out, "spell"), { recursive: true });
  await mkdir(path.join(out, "passive"), { recursive: true });
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
    ...[...abilityIcons].map((name) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/${ddragon}/img/spell/${name}.png`,
      file: path.join(out, "spell", `${name}.webp`),
      size: ABILITY_SIZE,
    })),
    ...[...passiveIcons].map((name) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/${ddragon}/img/passive/${name}.png`,
      file: path.join(out, "passive", `${name}.webp`),
      size: ABILITY_SIZE,
    })),
    ...summonerIcons.map((name) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/${ddragon}/img/spell/${name}.png`,
      file: path.join(out, "summoner", `${name}.webp`),
      size: SUMMONER_SIZE,
    })),
    ...[...statIcons].sort().map((name) => ({
      url: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/fonts/texticons/lol/statsicon/${name}.png`,
      file: path.join(statOut, `${name}.webp`),
      size: STAT_ICON_SIZE,
    })),
    ...[...formIcons].map(([key, form]) => ({
      url: `https://raw.communitydragon.org/${form.iconVersion}/game/${form.iconPath}`,
      file: path.join(out, "form", `${key}.webp`),
      size: ABILITY_SIZE,
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
    await buildSheet("summoner", summonerIcons, SUMMONER_SIZE, out, QUALITY),
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
  const strips = await buildAbilityStrips(abilityStrips, out);
  await writeSheetIndex(sheets);
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  console.log(`썸네일 ${jobs.length}장 (챔피언 ${championIds.length} · 아이템 ${items.length} · 룬 ${runePaths.length} · 소환사 주문 ${summonerIcons.length} · 스킬 ${abilityIcons.size} · 패시브 ${passiveIcons.size} · 변신 ${formIcons.size} · 스탯 글리프 ${statIcons.size})`);
  console.log(`  원본 ${mb(bytesIn)} → ${mb(bytesOut)} (${Math.round((1 - bytesOut / bytesIn) * 100)}% 절감)`);
  console.log(`  ${out}`);
  for (const sheet of sheets) {
    const saved = Math.round((1 - sheet.avifBytes / sheet.bytes) * 100);
    console.log(
      `  스프라이트 ${sheet.kind}: ${sheet.count}장 · ${sheet.cols}×${sheet.rows} · ${(sheet.bytes / 1024).toFixed(0)}KB` +
        ` · avif ${(sheet.avifBytes / 1024).toFixed(0)}KB (${saved}% 절감)`,
    );
  }
  console.log(`  스킬 띠: 챔피언 ${strips.count}명 · 총 ${(strips.bytes / 1024).toFixed(0)}KB (avif ${(strips.avifBytes / 1024).toFixed(0)}KB)`);
  if (missing.length > 0) {
    console.log(`\n  못 받은 것 ${missing.length}장`);
    for (const line of missing.slice(0, 10)) console.log(`    ${line}`);
  }
}

generateThumbnails().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * 시트에 무엇이 몇째 칸에 있는지를 **묶음에 심는다.**
 *
 * 그동안 화면이 자기가 들고 있는 목록으로 자리를 셌다. 그 목록은 보여 줄 차례라
 * 시트와 맞을 까닭이 없었고 실제로 어긋나 있었다(가렌 자리에 아트록스). 이름순으로
 * 다시 세게 해서 그것은 고쳤지만, 목록을 **일부만** 넘기면 여전히 열 수가 달라져
 * 통째로 밀린다. 그리고 목록을 들고 있지 않은 자리(아이템 상세·고르개)는 시트를
 * 아예 쓸 수가 없었다.
 *
 * 그래서 차례를 화면에 맡기지 않고 여기서 적어 준다. 네 시트를 합쳐 13KB(gzip
 * 4KB)라 묶음에 넣을 만하고, 부르는 쪽은 id 만 대면 된다.
 *
 * 시트 옆의 `<kind>s.json` 은 그대로 남긴다. 그쪽은 시험이 짝을 맞춰 보는 자리다.
 */
async function writeSheetIndex(sheets: SheetInfo[]): Promise<void> {
  const body = sheets
    .map((sheet) => `  ${sheet.kind}: { cols: ${sheet.cols}, ids: ${JSON.stringify(sheet.ids)} },`)
    .join("\n");
  const file = [
    "/* 자동 생성 — `npm run generate-thumbnails`. 손으로 고치지 마십시오. */",
    "",
    "export interface SheetGrid {",
    "  cols: number;",
    "  /** 시트에 붙은 차례. 칸 번호가 곧 이 배열의 자리다. */",
    "  ids: string[];",
    "}",
    "",
    "export const SPRITE_SHEETS: Record<string, SheetGrid> = {",
    body,
    "};",
    "",
  ].join("\n");
  await writeFile(path.join(process.cwd(), "src/data/generated/spriteSheets.ts"), file);
}

/**
 * 변신 아이콘의 파일 이름. 경로를 눕혀 한 낱말로 만든다.
 *
 * 화면 쪽 `formIconKey` 와 같은 규칙이어야 하고, 어긋나면 시험이 잡는다.
 */
export const formIconKey = (iconPath: string) =>
  iconPath.replace(/^\//, "").replace(/\.png$/i, "").replace(/[^a-zA-Z0-9]+/g, "-");

/** 띠의 칸 차례. 화면도 이 차례로 자리를 센다. */
export const ABILITY_SLOTS = ["P", "Q", "W", "E", "R"] as const;

/**
 * 챔피언마다 스킬 다섯 개를 가로 한 줄로 붙인다.
 *
 * 칸 자리를 받아 오지 않는다. 차례가 P·Q·W·E·R 로 정해져 있으므로 화면은 슬롯
 * 글자만 알면 몇째 칸인지 안다. 빠진 스킬 자리는 빈 칸으로 둔다 — 자리가 밀리면
 * 다섯 개가 통째로 어긋나는데 눈으로는 "왜 이 아이콘이지" 싶을 뿐이라 못 알아본다.
 *
 * 띠가 없는 챔피언이 생기면 그 화면은 빈 칸이 된다. 그래서 `test-thumbnails` 가
 * 챔피언 수와 띠 수가 같은지 본다.
 */
async function buildAbilityStrips(
  strips: Map<string, Array<string | undefined>>,
  out: string,
): Promise<{ count: number; bytes: number; avifBytes: number }> {
  const cell = (name: string | undefined, slot: string) => {
    if (!name) return undefined;
    const file = path.join(out, slot === "P" ? "passive" : "spell", `${name}.webp`);
    return existsSync(file) ? file : undefined;
  };
  let bytes = 0;
  let avifBytes = 0;
  let count = 0;
  for (const [championId, names] of strips) {
    const composite = [];
    for (const [index, name] of names.entries()) {
      const file = cell(name, ABILITY_SLOTS[index]);
      if (!file) continue;
      composite.push({ input: await readFile(file), left: index * ABILITY_SIZE, top: 0 });
    }
    if (composite.length === 0) continue;
    const canvas = sharp({
      create: {
        width: ABILITY_SLOTS.length * ABILITY_SIZE,
        height: ABILITY_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite(composite);
    const strip = await canvas.webp({ quality: QUALITY }).toBuffer();
    const avif = await canvas.avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT }).toBuffer();
    await writeFile(path.join(out, "ability", `${championId}.webp`), strip);
    await writeFile(path.join(out, "ability", `${championId}.avif`), avif);
    bytes += strip.length;
    avifBytes += avif.length;
    count += 1;
  }
  return { count, bytes, avifBytes };
}

interface SheetInfo {
  kind: string;
  count: number;
  cols: number;
  rows: number;
  bytes: number;
  avifBytes: number;
  /** 시트에 실제로 붙은 차례. 묶음에 심을 값이다. */
  ids: string[];
}

/**
 * 낱장을 격자로 붙여 한 장으로 만든다.
 *
 * 차례는 **이름순**이다. 화면도 같은 비교로 다시 세운다(`useSpriteSheet`).
 *
 * 한때는 자료에 실린 차례를 그대로 썼다. 챔피언은 그것이 디렉터리를 읽은 차례라
 * 파일 시스템에 달려 있었고, 화면이 들고 있는 목록은 보여 줄 차례(즐겨찾기 먼저,
 * 그 나라 말 가나다순)였다. 둘이 맞을 까닭이 없었고 실제로 어긋나 있었다 — 가렌
 * 자리에 아트록스가 나왔다. 그림이 비는 것이 아니라 **다른 그림이** 나오므로
 * 아무도 고장으로 안 봤다.
 *
 * 이름순은 양쪽이 아무것도 주고받지 않고도 같아지는 유일한 차례다. 옆에 남기는
 * 목록 JSON 은 그 짝을 시험이 맞춰 보는 용도로만 쓴다.
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
  const present = [...new Set(ids)].sort().filter((id) => existsSync(cell(id)));
  const cols = Math.ceil(Math.sqrt(present.length));
  const rows = Math.ceil(present.length / cols);
  const composite = await Promise.all(
    present.map(async (id, index) => ({
      input: await readFile(cell(id)),
      left: (index % cols) * size,
      top: Math.floor(index / cols) * size,
    })),
  );
  const canvas = sharp({
    create: { width: cols * size, height: rows * size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composite);
  const sheet = await canvas.webp({ quality }).toBuffer();
  const avif = await canvas.avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT }).toBuffer();
  await writeFile(path.join(sheetDir, `${kind}s.webp`), sheet);
  await writeFile(path.join(sheetDir, `${kind}s.avif`), avif);
  await writeFile(path.join(sheetDir, `${kind}s.json`), `${JSON.stringify({ size, cols, rows, ids: present })}\n`);
  return { kind, count: present.length, cols, rows, bytes: sheet.length, avifBytes: avif.length, ids: present };
}
