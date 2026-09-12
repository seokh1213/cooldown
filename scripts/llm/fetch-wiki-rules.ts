/**
 * 룬·소환사 주문의 판정 규칙 수집
 *
 * **툴팁은 요약문이지 규칙 명세가 아니다.**
 * 정복자 한국어 툴팁은 "기본 공격 또는 스킬로" 라고만 적혀 있는데, 실제로는 소환사 주문과
 * 아이템 액티브도 중첩을 준다. 점화가 정복자 2중첩을 주는 것이 그래서다.
 * 이 차이 때문에 실제로 틀린 답을 냈다.
 *
 * 사실 카드는 툴팁에서 만들어지므로 이 공백을 메울 수 없다. 위키의 Notes 섹션에는
 * 발동 조건, 예외, 상호작용이 문장으로 적혀 있어 그것을 규칙 계층으로 따로 담는다.
 *
 * 출처: League of Legends Wiki <Rune>/<Summoner spell> == Notes == — CC BY-SA
 * 출력: public/data/<patch>/llm/rule-notes.json
 * 사용: npm run llm:fetch-rules [-- --limit 5]
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT } from "./lib/data";
import { stripWikiMarkup } from "./lib/luaTable";

const WIKI_API = "https://wiki.leagueoflegends.com/en-us/api.php";
const UA = "cooldown-rules/1.0 (+https://github.com/seokh1213/cooldown)";

export type RuleSubject = "rune" | "summoner";

export interface RuleNotes {
  /** 게임 내 한국어 이름 */
  name: string;
  /** 위키 문서 제목 (영문) */
  page: string;
  subject: RuleSubject;
  /** Notes 섹션의 문장들 */
  notes: string[];
}

export interface RuleNotesFile {
  schemaVersion: 1;
  patch: string;
  source: string;
  license: string;
  fetchedAt: string;
  rules: RuleNotes[];
}

async function fetchWikitext(page: string): Promise<string | undefined> {
  const url =
    `${WIKI_API}?action=parse&page=${encodeURIComponent(page)}` +
    "&prop=wikitext&format=json&formatversion=2";
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) return undefined;
  const body = (await res.json()) as { parse?: { wikitext?: string }; error?: unknown };
  return body.parse?.wikitext;
}

/**
 * 문장으로 서지 못하는 줄을 걸러낸다.
 *
 * 규칙 문장은 모델을 거치지 않고 화면에 그대로 나간다. 값이 빠져 뜻이 끊긴 줄은
 * 옮겨 적을 가치가 없고, 옮겨 놓으면 읽는 사람이 오히려 헷갈린다.
 *
 * - "The available summoner spells to pick from are:" 처럼 표를 소개하고 끝나는 줄.
 *   표 자체는 위키 문법이라 여기까지 오지 않는다.
 * - "goes from at 0 stacks (% attack speed) to at 10 stacks" 처럼 수치가 빠져
 *   비교가 성립하지 않는 줄.
 */
function isBrokenNote(text: string): boolean {
  // 값이 있어야 할 자리가 비었다
  if (/\(\s*[%+]/.test(text)) return true;
  // "goes from at 0 stacks" 처럼 비교 대상이 사라졌다.
  // at 뒤의 경계를 확인해야 한다. 없으면 "from attack resets" 가 걸린다.
  if (/\b(?:from|to|by|worth|equal to|of)\s+(?:at\b|\(|\)|$)/.test(text)) return true;
  // "his flat bonus movement speed will be, and Celerity will grant him bonus movement speed"
  // 처럼 서술어 뒤의 값이 통째로 사라진 경우
  // "is" 나 "are" 까지 넣으면 "removed when the stun is." 같은 멀쩡한 문장이 걸린다.
  if (/\b(?:will be|equals|amounts to)\s*[,.]/.test(text)) return true;
  return false;
}

/**
 * 이름 있는 인자가 본문으로 새어 나온 것을 지운다.
 *
 * 템플릿이 여러 줄에 걸쳐 있으면 닫는 `}}` 가 다른 줄에 있어 짝이 맞지 않는다.
 * 그러면 `|affectedEffects=Flash|pagename=Flash` 가 문장 뒤에 그대로 붙는다.
 */
function dropNamedParameters(text: string): string {
  return text
    .replace(/\|\s*[a-zA-Z_][\w]*\s*=[^|]*/g, "")
    .replace(/\b[a-zA-Z_][\w]*\s*=\s*(true|false|\d+|old|new)\b/g, "")
    // 라벨이 붙은 하위 항목에서 라벨만 사라지면 ": 본문" 이 남는다
    .replace(/^\s*[:：]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `== Notes ==` 다음 문단의 목록 항목을 뽑는다.
 *
 * 하위 항목(`**`)은 앞 항목의 예시라 함께 붙여야 뜻이 통한다.
 * "정복자 중첩은 시전 인스턴스당 한 번만" 다음에 오는 케일 예시가 그렇다.
 */
function extractNotes(wikitext: string): string[] {
  const start = wikitext.search(/^==+\s*Notes\s*==+/im);
  if (start < 0) return [];
  const body = wikitext.slice(start);
  const end = body.slice(3).search(/^==[^=]/m);
  const section = end >= 0 ? body.slice(0, end + 3) : body;

  // 하위 항목은 앞 항목에 딸린 것이라 따로 모은다. 앞 항목을 버릴 때 같이 버려야 한다.
  // 그러지 않으면 "재생의 바람은 잃은 체력에 비례해 회복한다 (0으로 감소된 피해) (보호막에 들어간 피해)"
  // 처럼 다른 문장의 예외가 엉뚱한 문장에 붙는다.
  const drafts: Array<{ head: string; children: string[]; broken: boolean }> = [];
  for (const raw of section.split("\n")) {
    const line = raw.trim();
    const match = /^(\*+)\s*(.+)$/.exec(line);
    if (!match) continue;
    const depth = match[1].length;
    const text = dropNamedParameters(stripWikiMarkup(match[2]));
    if (text.length < 8) continue;
    if (depth === 1) drafts.push({ head: text, children: [], broken: isBrokenNote(text) });
    // 하위 항목도 값이 빠지면 못 읽는다. 그 항목만 버리고 나머지는 살린다.
    else if (drafts.length && !isBrokenNote(text)) drafts[drafts.length - 1].children.push(text);
  }

  return drafts
    // 콜론으로 끝나는 줄은 하위 항목을 소개하는 말이다. 하위 항목이 표라서 여기까지
    // 오지 못했다면 남는 것이 없으므로 버린다.
    .filter((d) => !d.broken && !(/[:：]$/.test(d.head) && d.children.length === 0))
    .map((d) => [d.head, ...d.children.map((c) => `(${c})`)].join(" "));
}

/** 위키 문서 제목은 영문이라 데이터의 영문 이름으로 찾는다 */
function pageTitle(englishName: string): string {
  return englishName.replace(/\s+/g, " ").trim();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : undefined;

  const ko = loadStaticData("ko_KR");
  const en = loadStaticData("en_US");

  // 한국어 이름 → 영문 이름. 위키는 영문 제목만 받는다.
  const runeEnglish = new Map(en.runes.runes.map((r) => [r.id, r.name]));
  const summonerEnglish = new Map(en.summoners.spells.map((s) => [s.id, s.name]));

  const targets: Array<{ name: string; page: string; subject: RuleSubject }> = [
    ...ko.runes.runes
      .filter((r) => runeEnglish.has(r.id))
      .map((r) => ({
        name: r.name,
        page: pageTitle(runeEnglish.get(r.id)!),
        subject: "rune" as const,
      })),
    ...ko.summoners.spells
      .filter((s) => summonerEnglish.has(s.id))
      .map((s) => ({
        name: s.name,
        page: pageTitle(summonerEnglish.get(s.id)!),
        subject: "summoner" as const,
      })),
  ];
  // 소환사 주문은 지도마다 별도 항목으로 들어 있어 같은 이름이 여러 번 나온다.
  // 위키 문서는 하나뿐이므로 한 번만 받는다.
  const unique = new Map<string, (typeof targets)[number]>();
  for (const t of targets) if (!unique.has(t.page)) unique.set(t.page, t);
  const deduped = [...unique.values()];
  const scoped = limit ? deduped.slice(0, limit) : deduped;

  console.log(`룬 ${ko.runes.runes.length}종, 소환사 주문 ${ko.summoners.spells.length}종 중 ${scoped.length}건 조회\n`);

  const rules: RuleNotes[] = [];
  let done = 0;
  for (const target of scoped) {
    done += 1;
    try {
      const wikitext = await fetchWikitext(target.page);
      if (!wikitext) continue;
      const notes = extractNotes(wikitext);
      if (!notes.length) continue;
      rules.push({ ...target, notes });
      console.log(`  ${target.name} (${target.page}) — 규칙 ${notes.length}건`);
    } catch (error) {
      console.log(`  ! ${target.name}: ${(error as Error).message}`);
    }
    // 위키에 부담을 주지 않는다
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (done % 25 === 0) console.log(`  … ${done}/${scoped.length}`);
  }

  const file: RuleNotesFile = {
    schemaVersion: 1,
    patch: ko.patch,
    source: "https://wiki.leagueoflegends.com",
    license: "CC BY-SA",
    fetchedAt: new Date().toISOString(),
    rules,
  };
  const out = path.join(PUBLIC_DATA_ROOT, ko.patch, "llm", "rule-notes.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(file, null, 2), "utf8");

  const total = rules.reduce((n, r) => n + r.notes.length, 0);
  console.log(
    `\n생성: ${path.relative(process.cwd(), out)} (${rules.length}종, 규칙 ${total}건, ` +
      `${(fs.statSync(out).size / 1024).toFixed(0)} KB)`,
  );
}

main().catch((error: unknown) => {
  console.error("수집 실패", error);
  process.exit(1);
});
