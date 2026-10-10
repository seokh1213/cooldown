import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/** 화면에서 가장 크게 쓰는 자리가 40px 이다. 2배 화면을 덮고도 남는 값. */
export const CHAMPION_SIZE = 96;
/** 아이템은 원본이 64px 다. 표시 자리는 32px 안팎이라 64px 를 유지한다. */
export const ITEM_SIZE = 64;
/** 소환사 주문 아이콘. 백과에서 40px 로 쓴다. */
export const SUMMONER_SIZE = 64;
/** 챔피언 스킬·패시브 아이콘. VS 표에서 32px, 상세에서 40px 로 쓴다. */
export const ABILITY_SIZE = 64;
/**
 * 룬 아이콘은 원본이 가장 무겁다. 25장에 854KB 로 한 장에 34KB 다.
 *
 * 룬 화면에서 가장 크게 쓰는 자리도 40px 대라 64px 면 넉넉하다. 게다가 이 아이콘만
 * 외부 호스트(`ddragon.leagueoflegends.com`)를 직접 보고 있어서 서비스워커가
 * 맡지도 못했다. 우리 자리로 가져오면 그 문제도 같이 풀린다.
 */
export const RUNE_SIZE = 64;
/** 스탯 글리프는 글자 높이로 그린다(`h-[1em]`). 원본이 32px 고 그대로 둔다. */
export const STAT_ICON_SIZE = 32;
export const QUALITY = 82;
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
export const AVIF_QUALITY = 50;
// 8 까지 올리면 5% 더 줄지만 CI 시간이 세 배가 된다. 4 가 그 사이다.
export const AVIF_EFFORT = 4;

/**
 * 이미 만든 것은 다시 만들지 않는다. `--force` 를 주면 모두 새로 만든다.
 *
 * 그림 자리에는 판본이 들어가고(`public/img/<판본>/`) 판본이 바뀌면 폴더를 통째로 지운다.
 * 그러니 같은 판본 안에서 이미 있는 낱장은 원본이 같다. 예전에는 자료가 그대로인 push 마다
 * 낱장을 모두 다시 받고 시트를 다시 인코딩해 CI 에서 90초 남짓을 썼다.
 * 크기·품질을 바꿨을 때는 `npm run generate-thumbnails -- --force` 로 다시 만든다.
 */
export const FORCE = process.argv.includes("--force");

/** 같은 파일을 여러 번 받지 않도록 한 번에 여덟 개씩만 받는다. */
const CONCURRENCY = 8;

export interface Job {
  url: string;
  file: string;
  size: number;
}

async function fetchImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function runThumbnailJobs(jobs: Job[]): Promise<{ bytesIn: number; bytesOut: number; missing: string[]; reused: number }> {
  const missing: string[] = [];
  let bytesIn = 0;
  let bytesOut = 0;
  let reused = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= jobs.length) return;
      const job = jobs[index];
      if (!FORCE && existsSync(job.file)) {
        reused += 1;
        continue;
      }
      try {
        const source = await fetchImage(job.url);
        const thumb = await sharp(source).resize(job.size, job.size, { fit: "cover" }).webp({ quality: QUALITY }).toBuffer();
        await writeFile(job.file, thumb);
        bytesIn += source.length;
        bytesOut += thumb.length;
      } catch (error) {
        // Collect every failed image before rejecting the staged release.
        missing.push(`${path.basename(job.file)} ← ${(error as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return { bytesIn, bytesOut, missing, reused };
}
