/**
 * LoL Wiki(Fandom) 챔피언 팁 수집
 *
 * 정적 데이터에서 사라진 공식 팁(allytips/enemytips)이 위키 Strategy 문서에 남아 있고,
 * 스킬별 운용 노트(Playstyle)는 그보다 상세하다.
 *
 *   == Tips ==      ;Playing As / ;Playing Against / ;Playing with
 *   == Playstyle == 스킬 슬롯별 운용 노트
 *
 * 주의: 같은 문서의 "Recommended Items" 는 오래된 내용(닌자의 신발, 뒤틀린 숲)이라 수집하지 않는다.
 * 팁도 최신 패치 기준이 아닐 수 있어 프롬프트에서 지식 카드보다 낮은 우선순위로 쓴다.
 *
 * 스킬 이름은 영문이므로 en_US 챔피언 데이터로 한국어 이름에 대응시킨다.
 *
 * 출처: League of Legends Wiki (Fandom) <Champion>/Strategy — CC BY-SA
 * 출력: public/data/<patch>/llm/champion-wiki-tips.json
 * 사용: npm run llm:fetch-wiki-tips [-- --limit 5]
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT } from "./lib/data";
import { stripWikiMarkup } from "./lib/luaTable";

export interface WikiChampionTips {
  id: string;
  /** 이 챔피언을 플레이할 때 */
  playingAs: string[];
  /** 이 챔피언을 상대할 때 */
  playingAgainst: string[];
  /** 스킬 슬롯별 운용 노트 */
  playstyle: Array<{ slot: string; name: string; notes: string[] }>;
}

export interface WikiTipsFile {
  schemaVersion: 1;
  patch: string;
  source: string;
  license: string;
  note: string;
  fetchedAt: string;
  champions: WikiChampionTips[];
}

const API = "https://leagueoflegends.fandom.com/api.php";

async function fetchWikitext(page: string): Promise<string | undefined> {
  const url = `${API}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2`;
  const res = await fetch(url, { headers: { "User-Agent": "cooldown-llm-advisor/1.0 (research)" } });
  if (!res.ok) return undefined;
  const parsed = (await res.json()) as { parse?: { wikitext?: string }; error?: unknown };
  return parsed.parse?.wikitext;
}

/** `== 제목 ==` 구간을 잘라낸다 */
function section(wikitext: string, heading: string): string | undefined {
  const re = new RegExp(`^==\\s*${heading}\\s*==\\s*$`, "m");
  const match = re.exec(wikitext);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const next = /^==[^=]/m.exec(wikitext.slice(start));
  return next ? wikitext.slice(start, start + next.index) : wikitext.slice(start);
}

/** `;소제목` 아래의 `*` 목록을 모은다 */
function bulletsUnder(sectionText: string, labelPattern: RegExp): string[] {
  const lines = sectionText.split("\n");
  const out: string[] = [];
  let active = false;
  for (const line of lines) {
    if (line.startsWith(";")) {
      active = labelPattern.test(line);
      continue;
    }
    if (!active) continue;
    if (line.startsWith("*")) {
      const text = line.replace(/^\*+\s*/, "").trim();
      if (text) out.push(text);
    }
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const limitArg = argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(argv[limitArg + 1]) : undefined;

  const data = loadStaticData("ko_KR");
  const english = loadStaticData("en_US");
  // 영문 스킬 이름 → 한국어 이름
  const abilityNameMap = new Map<string, string>();
  for (const champ of english.champions) {
    const ko = data.champions.find((c) => c.id === champ.id);
    if (!ko) continue;
    for (const slot of ["P", "Q", "W", "E", "R"] as const) {
      const en = champ.abilities?.[slot]?.name;
      const kr = ko.abilities?.[slot]?.name;
      if (en && kr) abilityNameMap.set(en, kr);
    }
  }
  const rename = (englishName: string) => abilityNameMap.get(englishName) ?? englishName;

  const targets = limit ? data.champions.slice(0, limit) : data.champions;
  console.log(`패치 ${data.patch} / 대상 ${targets.length}종 / 스킬 이름 대응 ${abilityNameMap.size}건`);

  const champions: WikiChampionTips[] = [];
  const empty: string[] = [];
  let done = 0;
  for (const champ of targets) {
    const wikitext = await fetchWikitext(`${champ.id}/Strategy`);
    done += 1;
    if (done % 30 === 0) console.log(`  ${done}/${targets.length}`);
    if (!wikitext) {
      empty.push(champ.id);
      continue;
    }

    const tipsSection = section(wikitext, "Tips") ?? "";
    const playingAs = bulletsUnder(tipsSection, /Playing As/i).map((t) => stripWikiMarkup(t, rename));
    const playingAgainst = bulletsUnder(tipsSection, /Playing Against/i).map((t) =>
      stripWikiMarkup(t, rename),
    );

    // Playstyle: `;{{ai|스킬|챔피언|size=32}} [Q]` 다음의 `*` 목록
    const playstyleSection = section(wikitext, "Playstyle") ?? "";
    const playstyle: WikiChampionTips["playstyle"] = [];
    let current: WikiChampionTips["playstyle"][number] | undefined;
    for (const line of playstyleSection.split("\n")) {
      if (line.startsWith(";")) {
        const slot = line.match(/\[(Innate|Q|W|E|R)\]/)?.[1];
        const abilityEn = line.match(/\{\{ai\|([^|}]+)/)?.[1];
        current = {
          slot: slot === "Innate" ? "P" : (slot ?? "?"),
          name: abilityEn ? rename(abilityEn.trim()) : "",
          notes: [],
        };
        playstyle.push(current);
        continue;
      }
      if (current && line.startsWith("*")) {
        const text = stripWikiMarkup(line.replace(/^\*+\s*/, ""), rename);
        if (text) current.notes.push(text);
      }
    }

    const filtered = playstyle.filter((p) => p.notes.length > 0);
    if (playingAs.length === 0 && playingAgainst.length === 0 && filtered.length === 0) {
      empty.push(champ.id);
      continue;
    }
    champions.push({ id: champ.id, playingAs, playingAgainst, playstyle: filtered });
  }

  const outDir = path.join(PUBLIC_DATA_ROOT, data.patch, "llm");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "champion-wiki-tips.json");
  const file: WikiTipsFile = {
    schemaVersion: 1,
    patch: data.patch,
    source: "League of Legends Wiki (Fandom), <Champion>/Strategy",
    license: "CC BY-SA 3.0",
    note: "최신 패치 기준이 아닐 수 있다. 프롬프트에서는 knowledge/ 지식 카드보다 낮은 우선순위로 쓴다.",
    fetchedAt: new Date().toISOString(),
    champions: champions.sort((a, b) => a.id.localeCompare(b.id)),
  };
  fs.writeFileSync(outFile, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  const asCount = champions.reduce((n, c) => n + c.playingAs.length, 0);
  const againstCount = champions.reduce((n, c) => n + c.playingAgainst.length, 0);
  const playstyleCount = champions.reduce(
    (n, c) => n + c.playstyle.reduce((m, p) => m + p.notes.length, 0),
    0,
  );
  console.log(`\n생성: ${path.relative(process.cwd(), outFile)} (${champions.length}종)`);
  console.log(`플레이 팁 ${asCount}개 / 상대 팁 ${againstCount}개 / 스킬 운용 노트 ${playstyleCount}개`);
  if (empty.length) console.log(`팁 부재 ${empty.length}종: ${empty.slice(0, 15).join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
