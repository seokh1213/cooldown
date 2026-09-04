/**
 * 라이엇 공식 챔피언 분류 메타데이터 수집
 *
 * 지금까지 챔피언의 역할과 계수 성향을 스킬 툴팁에서 추정했는데, 라이엇이 직접 붙인 분류가
 * CommunityDragon 에 있다. 추정보다 이 데이터가 정확하다.
 *
 *   roles            : ["fighter","tank"] — 순서 있는 역할 태그
 *   championTagInfo  : 주/부 특성 ("내구성", "결투가", "전투 개시", "폭발적 피해" …)
 *   tacticalInfo     : damageType(kPhysical/kMagic/kMixed), attackType(melee/ranged), difficulty
 *   playstyleInfo    : damage, durability, crowdControl, mobility, utility (0~3)
 *
 * 예: 나서스는 스킬 계수만 보면 AP 로 읽히지만(Q 중첩 피해에 계수가 없음)
 *     라이엇 데이터는 kPhysical + durability 3 + 주 특성 "내구성" 이라고 알려준다.
 *
 * 출력: public/data/<patch>/llm/champion-riot-meta-<locale>.json
 * 사용: npm run llm:fetch-meta
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT, type LlmLocale } from "./lib/data";

const CDRAGON_LOCALE: Record<LlmLocale, string> = {
  ko_KR: "ko_kr",
  en_US: "default",
};

export interface RiotChampionMeta {
  id: string;
  key: number;
  name: string;
  /** 순서 있는 역할 태그 (첫 번째가 주 역할) */
  roles: string[];
  tagPrimary?: string;
  tagSecondary?: string;
  /** kPhysical | kMagic | kMixed | kTrue */
  damageType?: string;
  /** melee | ranged */
  attackType?: string;
  difficulty?: number;
  playstyle?: {
    damage: number;
    durability: number;
    crowdControl: number;
    mobility: number;
    utility: number;
  };
}

export interface RiotMetaFile {
  schemaVersion: 1;
  patch: string;
  locale: LlmLocale;
  source: string;
  fetchedAt: string;
  champions: RiotChampionMeta[];
}

interface CdragonChampion {
  id: number;
  alias: string;
  name: string;
  roles?: string[];
  championTagInfo?: { championTagPrimary?: string; championTagSecondary?: string };
  tacticalInfo?: { damageType?: string; attackType?: string; difficulty?: number };
  playstyleInfo?: RiotChampionMeta["playstyle"];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

async function main() {
  const argv = process.argv.slice(2);
  const langArg = argv.indexOf("--lang");
  const lang = (langArg >= 0 ? argv[langArg + 1] : "ko_KR") as LlmLocale;
  const data = loadStaticData(lang);
  // CDragon 버전은 version.json 의 sources.cdragon 을 따른다 (게임 패치와 표기가 다르다)
  const versionFile = JSON.parse(
    fs.readFileSync(path.join(PUBLIC_DATA_ROOT, "version.json"), "utf8"),
  ) as { sources?: { cdragon?: string } };
  const cdVersion = argv.includes("--cdragon")
    ? argv[argv.indexOf("--cdragon") + 1]
    : (versionFile.sources?.cdragon ?? "latest");
  const locale = CDRAGON_LOCALE[lang];
  const base = `https://raw.communitydragon.org/${cdVersion}/plugins/rcp-be-lol-game-data/global/${locale}/v1/champions`;

  console.log(`패치 ${data.patch} / CDragon ${cdVersion} / 로케일 ${locale}`);
  console.log(`대상 챔피언 ${data.champions.length}종`);

  const champions: RiotChampionMeta[] = [];
  const failures: string[] = [];
  let done = 0;
  // 순차 요청 (CDragon 은 캐시 서버라 병렬로 몰아붙이지 않는다)
  for (const champ of data.champions) {
    try {
      const raw = await fetchJson<CdragonChampion>(`${base}/${champ.key}.json`);
      champions.push({
        id: champ.id,
        key: Number(champ.key),
        name: raw.name ?? champ.name,
        roles: raw.roles ?? [],
        tagPrimary: raw.championTagInfo?.championTagPrimary,
        tagSecondary: raw.championTagInfo?.championTagSecondary,
        damageType: raw.tacticalInfo?.damageType,
        attackType: raw.tacticalInfo?.attackType,
        difficulty: raw.tacticalInfo?.difficulty,
        playstyle: raw.playstyleInfo,
      });
    } catch (err) {
      failures.push(`${champ.id}(${champ.key}): ${err instanceof Error ? err.message : err}`);
    }
    done += 1;
    if (done % 40 === 0) console.log(`  ${done}/${data.champions.length}`);
  }

  const outDir = path.join(PUBLIC_DATA_ROOT, data.patch, "llm");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `champion-riot-meta-${lang}.json`);
  const file: RiotMetaFile = {
    schemaVersion: 1,
    patch: data.patch,
    locale: lang,
    source: `${base}/<championKey>.json`,
    fetchedAt: new Date().toISOString(),
    champions: champions.sort((a, b) => a.id.localeCompare(b.id)),
  };
  fs.writeFileSync(outFile, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`\n생성: ${path.relative(process.cwd(), outFile)} (${champions.length}종)`);

  // 수집 결과 요약
  const damageTypes = new Map<string, number>();
  const attackTypes = new Map<string, number>();
  const tags = new Map<string, number>();
  for (const c of champions) {
    damageTypes.set(c.damageType ?? "미상", (damageTypes.get(c.damageType ?? "미상") ?? 0) + 1);
    attackTypes.set(c.attackType ?? "미상", (attackTypes.get(c.attackType ?? "미상") ?? 0) + 1);
    if (c.tagPrimary) tags.set(c.tagPrimary, (tags.get(c.tagPrimary) ?? 0) + 1);
  }
  console.log(`피해 유형: ${[...damageTypes].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`공격 유형: ${[...attackTypes].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(
    `주 특성: ${[...tags].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`,
  );
  if (failures.length) {
    console.log(`\n실패 ${failures.length}건:`);
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
