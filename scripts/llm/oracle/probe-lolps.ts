/**
 * lol.ps API 표면 탐색
 *
 * 통계 오라클을 만들기 전에 어떤 엔드포인트가 살아 있고 무엇을 돌려주는지 확인한다.
 * 응답은 research/.oracle-cache/probe/ 에 저장해 두고, 상태와 최상위 키만 출력한다.
 *
 * 사용:
 *   npm run oracle:probe                 # 기본 후보 목록 탐색
 *   npm run oracle:probe -- --champ 266  # 특정 챔피언으로 탐색 (기본 아트록스)
 *   npm run oracle:probe -- --url "https://lol.ps/api/..."   # 단일 URL 확인
 */
import * as fs from "fs";
import * as path from "path";

const CACHE_ROOT = path.resolve(process.cwd(), "research", ".oracle-cache", "probe");
const UA = "cooldown-oracle-probe/1.0";

interface ProbeResult {
  url: string;
  status: number;
  contentType?: string;
  bytes: number;
  topKeys?: string[];
  dataKeys?: string[];
  arrayLength?: number;
  sample?: string;
  error?: string;
}

function candidateUrls(championId: number, lane: number): string[] {
  const c = championId;
  return [
    // 챔피언 단위
    `https://lol.ps/api/champ/${c}/basic-info.json`,
    `https://lol.ps/api/champ/${c}/summary.json`,
    `https://lol.ps/api/champ/${c}/build.json`,
    `https://lol.ps/api/champ/${c}/builds.json`,
    `https://lol.ps/api/champ/${c}/skill.json`,
    `https://lol.ps/api/champ/${c}/skills.json`,
    `https://lol.ps/api/champ/${c}/skill-order.json`,
    `https://lol.ps/api/champ/${c}/rune.json`,
    `https://lol.ps/api/champ/${c}/runes.json`,
    `https://lol.ps/api/champ/${c}/item.json`,
    `https://lol.ps/api/champ/${c}/items.json`,
    `https://lol.ps/api/champ/${c}/counter.json`,
    `https://lol.ps/api/champ/${c}/counters.json`,
    `https://lol.ps/api/champ/${c}/matchup.json`,
    `https://lol.ps/api/champ/${c}/spell.json`,
    `https://lol.ps/api/champ/${c}/stat.json`,
    `https://lol.ps/api/champ/${c}/statistics.json`,
    // 쿼리 파라미터를 붙인 형태 (라인/티어/큐)
    `https://lol.ps/api/champ/${c}/build.json?lane=${lane}`,
    `https://lol.ps/api/champ/${c}/summary.json?lane=${lane}`,
    `https://lol.ps/api/champ/${c}/statistics.json?lane=${lane}`,
    // 전역 통계
    "https://lol.ps/api/statistics/tierlist.json",
    "https://lol.ps/api/statistics/champions.json",
    "https://lol.ps/api/statistics/tier.json",
    "https://lol.ps/api/tierlist.json",
    "https://lol.ps/api/champions.json",
    "https://lol.ps/api/version.json",
    "https://lol.ps/api/patch.json",
    "https://lol.ps/api/meta.json",
  ];
}

async function probe(url: string): Promise<ProbeResult> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    const text = await res.text();
    const result: ProbeResult = {
      url,
      status: res.status,
      contentType: res.headers.get("content-type") ?? undefined,
      bytes: text.length,
    };
    if (res.ok && text.trim().startsWith("{")) {
      const json = JSON.parse(text) as Record<string, unknown>;
      result.topKeys = Object.keys(json).slice(0, 12);
      const data = json.data;
      if (Array.isArray(data)) {
        result.arrayLength = data.length;
        result.dataKeys = data.length > 0 ? Object.keys(data[0] as object).slice(0, 20) : [];
      } else if (data && typeof data === "object") {
        result.dataKeys = Object.keys(data as object).slice(0, 20);
      }
      result.sample = JSON.stringify(json).slice(0, 400);
      const file = path.join(CACHE_ROOT, `${encodeURIComponent(url).slice(-120)}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text, "utf8");
    } else if (res.ok && text.trim().startsWith("[")) {
      const json = JSON.parse(text) as unknown[];
      result.arrayLength = json.length;
      result.dataKeys = json.length > 0 ? Object.keys(json[0] as object).slice(0, 20) : [];
      result.sample = JSON.stringify(json).slice(0, 400);
    }
    return result;
  } catch (err) {
    return { url, status: 0, bytes: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const single = get("--url");
  const championId = Number(get("--champ") ?? 266);
  const lane = Number(get("--lane") ?? 0);

  const urls = single ? [single] : candidateUrls(championId, lane);
  console.log(`탐색 대상 ${urls.length}건 (championId ${championId})\n`);

  const alive: ProbeResult[] = [];
  for (const url of urls) {
    const result = await probe(url);
    const mark = result.status === 200 ? "OK " : result.status === 0 ? "ERR" : String(result.status);
    console.log(`${mark} ${String(result.bytes).padStart(8)}B  ${url.replace("https://lol.ps/api/", "")}`);
    if (result.status === 200 && result.bytes > 2) {
      alive.push(result);
      if (result.topKeys) console.log(`      top: ${result.topKeys.join(", ")}`);
      if (result.arrayLength !== undefined) console.log(`      배열 길이: ${result.arrayLength}`);
      if (result.dataKeys?.length) console.log(`      data: ${result.dataKeys.join(", ")}`);
    }
    // 과도한 요청을 피한다
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n살아 있는 엔드포인트 ${alive.length}건. 응답 원본은 research/.oracle-cache/probe/ 에 저장했다.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
