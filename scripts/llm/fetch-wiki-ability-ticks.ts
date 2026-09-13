/**
 * 지속 피해의 틱 주기를 위키에서 받아 둔다
 *
 * 라이엇 툴팁은 **지속 시간만** 적는다. "5초에 걸쳐 피해" 라고만 하고 그 5초 동안
 * 몇 번에 나눠 들어가는지는 말하지 않는다. 그런데 실제로 중요한 건 그쪽이다.
 *   다리우스 과다출혈  5초 / 1.25초마다 → 4틱
 *   브라이어 진홍빛 저주 5초 / 0.5초마다 → 10틱
 * 같은 5초인데 틱 수가 두 배 넘게 차이 난다. 방어력 갱신, 실드 타이밍, 점화 견제,
 * 처형 계산이 전부 여기서 갈린다.
 *
 * 위키 능력 데이터에는 이 값이 일정한 꼴로 적혀 있다.
 *   `dealing {{as|magic damage}} every {{fd|0.25}} seconds over 4 seconds`
 * 그래서 표를 손으로 적지 않고 긁는다.
 *
 * 사용:
 *   npm run llm:fetch-wiki-ticks
 *   npm run llm:fetch-wiki-ticks -- --report   # 받지 않고 무엇이 잡히는지만 본다
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

const API = "https://leagueoflegends.fandom.com/api.php";
const USER_AGENT = "cooldown-knowledge/1.0 (ability tick survey)";
/** 한 번에 받을 문서 수. MediaWiki 가 익명 요청에 허용하는 상한이다. */
const BATCH = 50;

export interface AbilityTick {
  championId: string;
  championName: string;
  slot: string;
  abilityName: string;
  /** 몇 초마다 들어가는지 */
  intervalSeconds: number;
  /** 몇 초 동안 지속되는지. 토글기처럼 끝이 없으면 없다. */
  durationSeconds?: number;
  /** 지속과 주기가 다 있을 때만 센다. */
  ticks?: number;
  /** 근거가 된 위키 문장. 틀린 값을 발견했을 때 대조할 수 있어야 한다. */
  source: string;
}

interface ChampionFile {
  champion?: {
    id: string;
    name: string;
    abilities?: Record<string, { name?: string } | undefined>;
  };
}

async function callApi(params: Record<string, string>): Promise<unknown> {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ ...params, format: "json" })) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url.pathname}: HTTP ${res.status}`);
  return res.json();
}

/** 위키에 있는 능력 데이터 문서를 모두 센다. 넘겨주는 이름은 `Data <챔피언>/<스킬>` 꼴이다. */
async function listAbilityPages(): Promise<string[]> {
  const titles: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 40; page += 1) {
    const json = (await callApi({
      action: "query",
      list: "allpages",
      apnamespace: "10",
      apprefix: "Data ",
      // 리다이렉트(`Data Darius/I` → `Data Darius/Hemorrhage`)는 본문이 없다.
      apfilterredir: "nonredirects",
      aplimit: "500",
      ...(cursor ? { apcontinue: cursor } : {}),
    })) as { query: { allpages: Array<{ title: string }> }; continue?: { apcontinue: string } };
    titles.push(...json.query.allpages.map((entry) => entry.title));
    cursor = json.continue?.apcontinue;
    if (!cursor) break;
  }
  return titles.filter((title) => title.includes("/"));
}

async function fetchContents(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let index = 0; index < titles.length; index += BATCH) {
    const json = (await callApi({
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      titles: titles.slice(index, index + BATCH).join("|"),
    })) as {
      query: {
        pages: Record<string, { title: string; revisions?: Array<{ slots: { main: { "*": string } } }> }>;
      };
    };
    for (const page of Object.values(json.query.pages)) {
      const text = page.revisions?.[0]?.slots?.main?.["*"];
      if (text) out.set(page.title, text);
    }
    process.stderr.write(`  ${Math.min(index + BATCH, titles.length)}/${titles.length}\r`);
  }
  process.stderr.write("\n");
  return out;
}

/**
 * 피해를 가리키는 말.
 *
 * `every N seconds` 앞쪽에 이것이 있어야 피해 틱으로 본다. 없으면 다른 이야기다.
 * 실제로 걸러진 것들: 문도 패시브의 체력 재생(5초마다), 바드 종 생성(50초마다),
 * 애쉬 집중 스택 소멸(1초마다), 신지드 독구름의 지속 갱신(0.5초마다).
 */
const DAMAGE_CUE = /\b(damage|dealt|dealing|deals|inflicts?|takes?|burn(?:s|ing)?)\b/i;
const EVERY = /every\s+(?:\{\{fd\|)?([0-9.]+)\}?\}?\s+seconds?/gi;
const OVER = /over\s+(?:\{\{fd\|)?([0-9.]+)\}?\}?\s+seconds?/i;
/** 피해 표현이 이보다 멀리 있으면 같은 이야기로 보지 않는다. */
const CUE_WINDOW = 160;

/**
 * 주기 바로 앞에 이것이 있으면 피해 틱이 아니다.
 *
 * 넓은 창으로 피해를 찾다 보니 같은 문장 안의 다른 이야기가 딸려 왔다. 실제로 걸린 것들:
 *   애니비아 R  `refreshes every 0.25 seconds`        둔화 갱신
 *   브라이어 E  `heal herself every 0.25 seconds`     회복
 *   신지드 Q    `resets the duration every 0.5 seconds` 구름 지속 갱신
 *   신드라 P    `more than once every 8 seconds`      발동 제한
 * 전부 주기 바로 앞에 단서가 있어 좁은 창으로 걸러진다.
 */
const NOT_DAMAGE = /\b(refresh(?:es|ing)?|resets?|heals?|healing|restores?|regenerat\w*|gains?|grants?|once|stacks?)\b[^.]{0,30}$/i;
/**
 * `for every N seconds` 는 "N초마다" 가 아니라 "N초당" 이다.
 *
 * 크산테 W 가 `0.5 + 0.1 for every 0.05 seconds channeling` 으로 걸렸다.
 * 채널링 길이에 비례하는 계산식이지 피해가 나뉘어 들어가는 주기가 아니다.
 */
const PER_UNIT = /\bfor\s+$/i;
/** 부정 단서를 볼 창. 넓히면 정상 문장의 앞 절까지 걸려 멀쩡한 값이 빠진다. */
const DENY_WINDOW = 60;

/**
 * 위키가 "over the duration" 이라고만 쓰고 숫자를 다른 칸에 둔 경우를 메운다.
 *
 * 다리우스 과다출혈과 브라이어 진홍빛 저주가 그렇다. 틱 문장에는 숫자가 없고
 * 첫 설명 칸에 `for 5 seconds` 로 적혀 있다.
 */
const FOR_SECONDS = /for\s+(?:\{\{fd\|)?([0-9.]+)\}?\}?\s+seconds?/i;

/** 틀과 표식을 걷어 사람이 읽을 문장으로 만든다. 근거로 남길 것이라 뜻이 통해야 한다. */
function flatten(wikitext: string): string {
  return wikitext
    .replace(/\{\{(?:as|sti|tip|ai|ais|ci|cis|ii|ri|tt)\|([^{}|]*?)(?:\|[^{}]*?)?\}\}/g, "$1")
    .replace(/\{\{fd\|([^{}|]*?)\}\}/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 설명 칸 하나에서 피해 틱을 뽑는다.
 *
 * `notes` 와 `blurb` 는 보지 않는다. 요약과 잡기록이라 다른 주기가 섞여 있다.
 */
function extractTicks(wikitext: string): Array<{ interval: number; duration?: number; source: string }> {
  const found: Array<{ interval: number; duration?: number; source: string }> = [];
  const seen = new Set<number>();
  const params = wikitext.split(/\n(?=\|)/);
  const describing = params.filter((param) =>
    /^\|\s*description\d*\s*=/i.test(param),
  );

  for (const param of params) {
    const key = /^\|\s*([a-z0-9 ]+?)\s*=/i.exec(param)?.[1] ?? "";
    if (!/^description\d*$/i.test(key.trim())) continue;

    EVERY.lastIndex = 0;
    for (let match = EVERY.exec(param); match; match = EVERY.exec(param)) {
      const interval = Number(match[1]);
      if (!Number.isFinite(interval) || interval <= 0 || seen.has(interval)) continue;

      const before = param.slice(Math.max(0, match.index - CUE_WINDOW), match.index);
      if (!DAMAGE_CUE.test(before)) continue;
      const deny = param.slice(Math.max(0, match.index - DENY_WINDOW), match.index);
      if (NOT_DAMAGE.test(deny) || PER_UNIT.test(deny)) continue;

      // 지속은 주기 바로 뒤에 붙거나("every 0.25 seconds over 4 seconds"),
      // 같은 칸의 총합 표기 쪽에 있다("over 4 seconds. | ... every 0.25 seconds").
      const after = param.slice(match.index, match.index + CUE_WINDOW);
      let duration = Number(OVER.exec(after)?.[1] ?? OVER.exec(param)?.[1] ?? NaN);
      // 숫자 대신 "over the duration" 이라고만 쓴 경우 다른 칸의 `for N seconds` 를 쓴다.
      // 이 말은 틱 표기 쪽이 아니라 총합 표기 쪽에 있을 때가 있어 칸 전체를 본다
      // (다리우스는 양쪽에, 브라이어는 총합 쪽에만 있다).
      if (!Number.isFinite(duration) && /over the duration/i.test(param)) {
        for (const other of describing) {
          const stated = Number(FOR_SECONDS.exec(other)?.[1] ?? NaN);
          if (Number.isFinite(stated)) {
            duration = stated;
            break;
          }
        }
      }

      seen.add(interval);
      found.push({
        interval,
        duration: Number.isFinite(duration) ? duration : undefined,
        source: flatten(param.slice(Math.max(0, match.index - CUE_WINDOW), match.index + CUE_WINDOW)),
      });
    }
  }
  return found;
}

/** 현재 패치에 실제로 있는 스킬만 남기려고 영문 이름으로 표를 만든다. */
function loadCurrentAbilities(patch: string): Map<string, { championId: string; championName: string; slot: string }> {
  const dir = path.join(PUBLIC_DATA_ROOT, patch, "champions", "en_US");
  const index = new Map<string, { championId: string; championName: string; slot: string }>();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as ChampionFile;
    const champion = data.champion;
    if (!champion?.abilities) continue;
    for (const [slot, ability] of Object.entries(champion.abilities)) {
      if (!ability?.name) continue;
      index.set(`${champion.name}/${ability.name}`.toLowerCase(), {
        championId: champion.id,
        championName: champion.name,
        slot,
      });
    }
  }
  return index;
}

async function main(): Promise<void> {
  const reportOnly = process.argv.includes("--report");
  const patch = resolvePatchVersion();
  const abilities = loadCurrentAbilities(patch);
  console.log(`패치 ${patch} · 현재 스킬 ${abilities.size}개`);

  const titles = await listAbilityPages();
  console.log(`위키 능력 문서 ${titles.length}건, 본문 받는 중…`);
  const contents = await fetchContents(titles);

  const ticks: AbilityTick[] = [];
  let matched = 0;
  for (const [title, wikitext] of contents) {
    const key = title.replace(/^Template:Data /, "").toLowerCase();
    const owner = abilities.get(key);
    // 구버전 스킬 문서가 함께 잡힌다(아트록스 피의 샘 등). 현재 스킬만 남긴다.
    if (!owner) continue;
    matched += 1;
    for (const found of extractTicks(wikitext)) {
      ticks.push({
        championId: owner.championId,
        championName: owner.championName,
        slot: owner.slot,
        abilityName: title.replace(/^Template:Data [^/]+\//, ""),
        intervalSeconds: found.interval,
        durationSeconds: found.duration,
        ticks: found.duration ? Math.round(found.duration / found.interval) : undefined,
        source: found.source,
      });
    }
  }

  ticks.sort((a, b) => a.championName.localeCompare(b.championName) || a.slot.localeCompare(b.slot));
  console.log(`현재 스킬과 이어진 문서 ${matched}건 · 피해 틱 ${ticks.length}건\n`);

  for (const tick of ticks) {
    const span = tick.durationSeconds ? `${tick.durationSeconds}초 / ${tick.ticks}틱` : "지속형";
    console.log(
      `  ${`${tick.championName} ${tick.slot}`.padEnd(24)} ${tick.abilityName.padEnd(26)} ${tick.intervalSeconds}초마다 · ${span}`,
    );
  }

  if (reportOnly) return;

  const outPath = path.join(PUBLIC_DATA_ROOT, patch, "llm", "ability-ticks.json");
  fs.writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        patch,
        source: "https://leagueoflegends.fandom.com/",
        license: "CC BY-SA 3.0",
        ticks,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\n${path.relative(process.cwd(), outPath)} 에 ${ticks.length}건 기록`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
