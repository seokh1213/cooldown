/**
 * LoL Wiki(Fandom) 챔피언 분류 수집
 *
 * 라이엇 데이터(roles, damageType, playstyleInfo)는 큰 분류만 알려준다.
 * 커뮤니티 위키는 그보다 세분화된 **하위 클래스**와 **포지션**을 관리한다.
 *
 *   herotype / alttype        : 주 클래스 / 부 클래스 (Fighter, Tank, Mage, Marksman, Slayer, Controller, Specialist)
 *   role                      : 하위 클래스 (Juggernaut, Diver, Skirmisher, Assassin, Vanguard, Warden,
 *                               Battlemage, Burst, Artillery, Enchanter, Catcher, Marksman, Specialist)
 *   client_positions          : 클라이언트 기준 포지션 (Top, Jungle, Middle, Bottom, Support)
 *   external_positions        : 커뮤니티 통계 기준 포지션
 *   rangetype                 : Melee / Ranged
 *
 * 예: 나서스는 herotype=Fighter, alttype=Tank, role=Juggernaut, 포지션=Top 이다.
 *     "브루저 또는 탱커" 라는 실제 인식과 정확히 맞는다.
 *
 * 출처: League of Legends Wiki (Fandom) Module:ChampionData/data — CC BY-SA 라이선스
 * 출력: public/data/<patch>/llm/champion-wiki-meta.json
 * 사용: npm run llm:fetch-wiki
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT } from "./lib/data";

const MODULE_URL =
  "https://leagueoflegends.fandom.com/api.php?action=parse&page=Module:ChampionData/data&prop=wikitext&format=json&formatversion=2";

export interface WikiChampionMeta {
  /** ddragon id (apiname) */
  id: string;
  key?: number;
  /** 주 클래스 */
  heroType?: string;
  /** 부 클래스 */
  altType?: string;
  /** 하위 클래스 (Juggernaut, Skirmisher …) */
  subclasses: string[];
  rangeType?: string;
  resource?: string;
  difficulty?: number;
  /** 클라이언트 기준 포지션 */
  positions: string[];
  /** 커뮤니티 통계 기준 포지션 */
  externalPositions: string[];
}

export interface WikiMetaFile {
  schemaVersion: 1;
  patch: string;
  source: string;
  license: string;
  fetchedAt: string;
  champions: WikiChampionMeta[];
}

function stringField(body: string, name: string): string | undefined {
  const re = new RegExp(`\\["${name}"\\]\\s*=\\s*"([^"]*)"`);
  return body.match(re)?.[1];
}

function numberField(body: string, name: string): number | undefined {
  const re = new RegExp(`\\["${name}"\\]\\s*=\\s*(-?[\\d.]+)`);
  const raw = body.match(re)?.[1];
  return raw === undefined ? undefined : Number(raw);
}

function arrayField(body: string, name: string): string[] {
  const re = new RegExp(`\\["${name}"\\]\\s*=\\s*\\{([^}]*)\\}`);
  const inner = body.match(re)?.[1];
  if (!inner) return [];
  return Array.from(inner.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

/** Lua 테이블에서 챔피언 블록을 추출한다 (중괄호 깊이를 세어 자른다) */
export function splitChampionBlocks(wikitext: string): Array<{ name: string; body: string }> {
  const blocks: Array<{ name: string; body: string }> = [];
  const headerRe = /\["([^"]+)"\]\s*=\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(wikitext))) {
    const start = match.index + match[0].length;
    // 최상위 챔피언 블록만 취한다 (들여쓰기 두 칸 헤더)
    const lineStart = wikitext.lastIndexOf("\n", match.index) + 1;
    const indent = match.index - lineStart;
    if (indent > 2) continue;
    let depth = 1;
    let i = start;
    while (i < wikitext.length && depth > 0) {
      const ch = wikitext[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      i += 1;
    }
    blocks.push({ name: match[1], body: wikitext.slice(start, i - 1) });
    headerRe.lastIndex = i;
  }
  return blocks;
}

async function main() {
  const data = loadStaticData("ko_KR");
  console.log(`패치 ${data.patch} / 대상 ${data.champions.length}종`);
  console.log("LoL Wiki(Fandom) Module:ChampionData/data 수집…");

  const res = await fetch(MODULE_URL, {
    headers: { "User-Agent": "cooldown-llm-advisor/1.0 (research)" },
  });
  if (!res.ok) throw new Error(`위키 응답 오류 ${res.status}`);
  const parsed = (await res.json()) as { parse?: { wikitext?: string } };
  const wikitext = parsed.parse?.wikitext;
  if (!wikitext) throw new Error("wikitext 부재");
  console.log(`  원문 ${wikitext.length}자`);

  const blocks = splitChampionBlocks(wikitext);
  console.log(`  블록 ${blocks.length}개`);

  const byId = new Map<string, WikiChampionMeta>();
  for (const { name, body } of blocks) {
    const apiname = stringField(body, "apiname") ?? name.replace(/[^A-Za-z]/g, "");
    if (!apiname) continue;
    byId.set(apiname, {
      id: apiname,
      key: numberField(body, "id"),
      heroType: stringField(body, "herotype"),
      altType: stringField(body, "alttype"),
      subclasses: arrayField(body, "role"),
      rangeType: stringField(body, "rangetype"),
      resource: stringField(body, "resource"),
      difficulty: numberField(body, "difficulty"),
      positions: arrayField(body, "client_positions"),
      externalPositions: arrayField(body, "external_positions"),
    });
  }

  // 우리 데이터에 있는 챔피언만 남긴다
  const champions: WikiChampionMeta[] = [];
  const missing: string[] = [];
  for (const champ of data.champions) {
    const meta = byId.get(champ.id);
    if (meta) champions.push(meta);
    else missing.push(champ.id);
  }

  const outDir = path.join(PUBLIC_DATA_ROOT, data.patch, "llm");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "champion-wiki-meta.json");
  const file: WikiMetaFile = {
    schemaVersion: 1,
    patch: data.patch,
    source: "League of Legends Wiki (Fandom), Module:ChampionData/data",
    license: "CC BY-SA 3.0",
    fetchedAt: new Date().toISOString(),
    champions: champions.sort((a, b) => a.id.localeCompare(b.id)),
  };
  fs.writeFileSync(outFile, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`생성: ${path.relative(process.cwd(), outFile)} (${champions.length}종)`);

  const subclasses = new Map<string, number>();
  const positions = new Map<string, number>();
  const classPairs = new Map<string, number>();
  for (const c of champions) {
    for (const s of c.subclasses) subclasses.set(s, (subclasses.get(s) ?? 0) + 1);
    for (const p of c.positions) positions.set(p, (positions.get(p) ?? 0) + 1);
    const pair = `${c.heroType ?? "?"}/${c.altType ?? "-"}`;
    classPairs.set(pair, (classPairs.get(pair) ?? 0) + 1);
  }
  const fmt = (m: Map<string, number>) =>
    [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`\n하위 클래스: ${fmt(subclasses)}`);
  console.log(`포지션: ${fmt(positions)}`);
  console.log(`주/부 클래스: ${fmt(classPairs)}`);
  if (missing.length) console.log(`\n위키에서 못 찾은 챔피언 ${missing.length}종: ${missing.join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
