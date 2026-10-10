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
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decodeDataManifest } from "../../../../src/domain/game/contracts/dataManifest";
import { loadThumbnailCatalog, createThumbnailJobs, runeKey } from "../thumbnailCatalog";
import { buildSheet, buildAbilityStrips, readStamps, writeStamps, writeSheetIndex, writeAssetVersion } from "../thumbnailArtifacts";
import { CHAMPION_SIZE, ITEM_SIZE, RUNE_SIZE, SUMMONER_SIZE, QUALITY, runThumbnailJobs } from "../thumbnailImages";
import { publishThumbnails } from "../thumbnailPublication";

export async function generateThumbnails(repositoryRoot = process.cwd()): Promise<void> {
  const directory = path.join(repositoryRoot, "public/data");
  const release = decodeDataManifest(JSON.parse(await readFile(path.join(directory, "version.json"), "utf8")));
  const catalog = await loadThumbnailCatalog(directory, release.patchVersion, release.sources.cdragon);
  if (!catalog.championIds.length || !catalog.items.length || !catalog.summonerIcons.length) {
    throw new Error("Cannot generate thumbnail sheets from empty catalogs");
  }
  await publishThumbnails(repositoryRoot, release.sources.ddragon, async ({ out, generatedDirectory }) => {
    await generateThumbnailAssets({ catalog, out, generatedDirectory, ddragon: release.sources.ddragon });
  });
}

async function generateThumbnailAssets(options: {
  catalog: Awaited<ReturnType<typeof loadThumbnailCatalog>>;
  out: string;
  generatedDirectory: string;
  ddragon: string;
}): Promise<void> {
  const { catalog, out, generatedDirectory, ddragon } = options;
  const { championIds, items, runePaths, summonerIcons, abilityIcons, passiveIcons, statIcons, abilityStrips, formIcons } = catalog;
  const runeOut = path.join(out, "runes");
  const jobs = await createThumbnailJobs(catalog, out, ddragon);
  const { bytesIn, bytesOut, missing, reused } = await runThumbnailJobs(jobs);
  if (missing.length) throw new Error(`Thumbnail generation failed for ${missing.length} images: ${missing.slice(0, 10).join("; ")}`);
  const stamps = await readStamps(out);

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
    await buildSheet("champion", championIds, CHAMPION_SIZE, out, QUALITY, stamps),
    await buildSheet("summoner", summonerIcons, SUMMONER_SIZE, out, QUALITY, stamps),
    // 룬은 낱장이 `runes/` 아래 모이고 시트는 그 위에 둔다. 칸 이름은 경로를 눕힌 꼴이다.
    await buildSheet("rune", runePaths.map(runeKey), RUNE_SIZE, runeOut, QUALITY, stamps, out),
    /*
     * 아이템 시트만 압축을 더 건다.
     *
     * 868칸이라 한 장이 크다. 품질을 82 에서 70 으로 내리면 1,243KB 가 1,042KB 가
     * 된다. 더 내려도 55 에서 901KB 로 얻는 것이 줄고, 32px 로 그리는 그림이라
     * 70 아래부터는 눈에 띈다.
     */
    await buildSheet("item", items.map((item) => item.id), ITEM_SIZE, out, 70, stamps),
  ];
  const strips = await buildAbilityStrips(abilityStrips, out, stamps);
  await writeStamps(out, stamps);
  await writeSheetIndex(sheets, generatedDirectory);
  await writeAssetVersion(ddragon, generatedDirectory);
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  console.log(`썸네일 ${jobs.length}장 (챔피언 ${championIds.length} · 아이템 ${items.length} · 룬 ${runePaths.length} · 소환사 주문 ${summonerIcons.length} · 스킬 ${abilityIcons.size} · 패시브 ${passiveIcons.size} · 변신 ${formIcons.size} · 스탯 글리프 ${statIcons.size})`);
  if (reused > 0) console.log(`  이미 있는 ${reused}장은 다시 받지 않음 (--force 로 모두 새로 만든다)`);
  if (bytesIn > 0) console.log(`  원본 ${mb(bytesIn)} → ${mb(bytesOut)} (${Math.round((1 - bytesOut / bytesIn) * 100)}% 절감)`);
  console.log(`  ${out}`);
  for (const sheet of sheets) {
    const saved = Math.round((1 - sheet.avifBytes / sheet.bytes) * 100);
    console.log(
      `  스프라이트 ${sheet.kind}: ${sheet.count}장 · ${sheet.cols}×${sheet.rows} · ${(sheet.bytes / 1024).toFixed(0)}KB` +
        ` · avif ${(sheet.avifBytes / 1024).toFixed(0)}KB (${saved}% 절감)`,
    );
  }
  console.log(`  스킬 띠: 챔피언 ${strips.count}명 · 총 ${(strips.bytes / 1024).toFixed(0)}KB (avif ${(strips.avifBytes / 1024).toFixed(0)}KB)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateThumbnails().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
