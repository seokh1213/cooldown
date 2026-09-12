/**
 * 일반 플레이 지식을 LoL Wiki 에서 받아 둔다.
 *
 * 질문 30개로 경로를 재 보니 **37%가 자료 없이 나갔다.** 전부 같은 부류였다.
 * 와드 위치, 미니언 웨이브 관리, 부쉬 시야, 포탑 다이브, 정글 동선 —
 * 챔피언도 아이템도 룬도 아닌 일반 플레이 지식이다. 근거가 없으니 모델이 지어냈다.
 *
 * 도구를 쥐여 줘도 소용없었다. 도구는 있는 자료를 꺼내 올 뿐 없는 지식을 만들지 못한다.
 * 그래서 자료를 들여온다.
 *
 * 룬 규칙과 같은 파이프라인이다. 다만 게임플레이 문서에는 `== Notes ==` 절이 없고
 * 본문 전체가 절로 나뉘어 있어, 쓸 만한 절의 목록 항목을 뽑는다.
 *
 * 사용: npm run llm:fetch-gameplay [-- --limit 3]
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { RuleNotes } from "./lib/rules";

const API = "https://leagueoflegends.fandom.com/api.php";
const USER_AGENT = "cooldown-knowledge/1.0 (gameplay reference)";

/**
 * 받아 올 문서.
 *
 * 분류(`Category:Gameplay elements`) 전체는 130건이고 번역 분량이 수천 문장이라
 * **실제로 답하지 못한 질문이 가리키는 문서만** 고른다. 이름은 위키 문서 제목 그대로다.
 *
 * 기본 공격(296개)과 군중 제어(155개)는 뺐다. 분량의 절반을 차지하는데 라인전·시야·정글
 * 질문과 닿지 않는 세부 규칙이고, 군중 제어는 스킬 효과 태그가 이미 덮는다.
 */
const PAGES: Array<{ page: string; name: string }> = [
  { page: "Minion (League of Legends)", name: "미니언" },
  { page: "Ward", name: "와드" },
  { page: "Brush", name: "덤불" },
  { page: "Turret", name: "포탑" },
  { page: "Vision score", name: "시야 점수" },
  { page: "Recall", name: "귀환" },
];

/**
 * 받아 봤지만 뺀 문서.
 *   정글링·골드 수급  걸러 낸 뒤 2건씩만 남아 값이 없다
 *   경험치            공유 공식이 "0.62/0.95*100%" 처럼 템플릿이 풀리지 않는다
 *   사망              남은 것이 과거 스킬 이야기(Trivia)뿐이다
 *   기본 공격·군중 제어  분량의 절반인데 라인전·시야 질문과 닿지 않는다
 */

/** 읽을 값이 없는 절. 잡동사니를 걷어야 번역 분량이 줄고 답도 깔끔해진다. */
const SKIP_SECTIONS =
  /^(trivia|media|patch history|references|bugs|gallery|skins|ward skins|see also|champions?)$/i;

interface GameplayNote {
  /** 이 항목이 어느 절에서 왔는지. 답에 맥락을 붙일 때 쓴다. */
  section: string;
  en: string;
}

export interface GameplayDoc {
  name: string;
  page: string;
  notes: GameplayNote[];
  notesKo?: string[];
}

/** 위키 마크업을 사람이 읽는 문장으로 만든다. rules 쪽과 같은 규칙을 쓴다. */
function stripMarkup(value: string): string {
  let text = value;
  // 템플릿은 안쪽부터 푼다. {{tip|dash|돌진}} 처럼 표시용 낱말이 마지막 인자에 온다.
  for (let pass = 0; pass < 6; pass += 1) {
    const next = text.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => {
      const parts = String(inner).split("|").map((p) => p.trim());
      const head = parts[0].toLowerCase();
      if (/^(ui|icon|tt|as|sti|pp|fd|g|math)$/.test(head)) return parts[parts.length - 1] ?? "";
      if (/^(ai|ci|sbc|tip|item|rune)$/.test(head)) return parts[parts.length - 1] ?? "";
      return parts.filter((p) => !/^[a-z_]+\s*=/.test(p)).slice(1).join(" ") || parts[0];
    });
    if (next === text) break;
    text = next;
  }
  return text
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^>]*\/>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 그대로 내보내면 안 되는 줄.
 *
 * 위키 템플릿에서 값이 빠지면 "health, health, health, and 1000" 처럼 같은 낱말만 남는다.
 * 챔피언 스킬 나열("Rappel Elise recast")은 일반 지식이 아니라 목록이라 뺀다.
 */
function isBroken(text: string): boolean {
  if (text.length < 30) return true;
  if (/\{\{|\}\}|\|\s*$/.test(text)) return true;
  if (/\b(is|are|equals|amounts to)\s*\.$/i.test(text)) return true;
  // 같은 낱말이 세 번 이상 반복되면 값이 빠진 자리다
  const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  if ([...counts.values()].some((n) => n >= 4)) return true;
  // 템플릿 인자가 그대로 새어 나온 줄 ("type=current health")
  if (/\w+\s*=/.test(text)) return true;
  // 값이 빠진 자리 ("Below health, they regenerate…", "between hp and hp")
  if (/\b(below|above|between)\s+(health|hp|mana|armor|ad|ap)\b/i.test(text)) return true;
  // 문장이 아니라 이름 나열인 줄
  return !/[.!?]$/.test(text.trim());
}

async function fetchPages(titles: string[]): Promise<Map<string, string>> {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("titles", titles.join("|"));
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Fandom API ${res.status}`);
  const payload = (await res.json()) as {
    query?: {
      pages?: Array<{ title: string; missing?: boolean; revisions?: Array<{ slots: { main: { content?: string } } }> }>;
      normalized?: Array<{ from: string; to: string }>;
    };
  };
  const back = new Map((payload.query?.normalized ?? []).map((n) => [n.to, n.from]));
  const found = new Map<string, string>();
  for (const page of payload.query?.pages ?? []) {
    const content = page.revisions?.[0]?.slots?.main?.content;
    if (page.missing || !content) continue;
    found.set(back.get(page.title) ?? page.title, content);
  }
  return found;
}

function extractNotes(wikitext: string): GameplayNote[] {
  const notes: GameplayNote[] = [];
  // 같은 문장이 여러 절에 반복되는 문서가 있다.
  const seen = new Set<string>();
  let section = "";
  let skipping = false;
  for (const raw of wikitext.split("\n")) {
    const heading = /^(==+)\s*(.+?)\s*==+\s*$/.exec(raw.trim());
    if (heading) {
      const title = stripMarkup(heading[2]);
      // 상위 절이 잡동사니면 그 아래 하위 절도 함께 건너뛴다.
      // 잡동사니는 상위 절이든 하위 절이든 건너뛴다.
      if (SKIP_SECTIONS.test(title)) { skipping = true; continue; }
      if (heading[1].length === 2) skipping = false;
      if (!skipping) section = title;
      continue;
    }
    if (skipping) continue;
    const bullet = /^(\*+)\s*(.+)$/.exec(raw.trim());
    if (!bullet) continue;
    const text = stripMarkup(bullet[2]);
    if (isBroken(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    notes.push({ section, en: text });
  }
  return notes;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : undefined;
  const scoped = limit ? PAGES.slice(0, limit) : PAGES;

  const pages = await fetchPages(scoped.map((p) => p.page));
  const docs: GameplayDoc[] = [];
  let total = 0;
  for (const target of scoped) {
    const wikitext = pages.get(target.page);
    if (!wikitext) {
      console.log(`  ${target.name} (${target.page}) — 문서 없음`);
      continue;
    }
    const notes = extractNotes(wikitext);
    docs.push({ name: target.name, page: target.page, notes });
    total += notes.length;
    console.log(`  ${target.name.padEnd(10)} ${String(notes.length).padStart(4)}개`);
  }

  // 룬 규칙과 같은 파일에 합친다. 색인·번역·답변 경로를 그대로 쓴다.
  const patch = resolvePatchVersion();
  const file = path.join(PUBLIC_DATA_ROOT, patch, "llm", "rule-notes.json");
  const existing = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf8")) as { rules: RuleNotes[] } & Record<string, unknown>)
    : { schemaVersion: 1, patch, source: "https://leagueoflegends.fandom.com/", license: "CC BY-SA 3.0", rules: [] };

  const kept = existing.rules.filter((r) => r.subject !== "gameplay");
  const added: RuleNotes[] = docs
    .filter((doc) => doc.notes.length > 0)
    .map((doc) => ({
      name: doc.name,
      page: doc.page,
      subject: "gameplay" as const,
      // 절 이름을 앞에 붙여 두면 어느 맥락의 규칙인지 읽는 사람이 안다.
      notes: doc.notes.map((n) => (n.section ? `[${n.section}] ${n.en}` : n.en)),
    }));

  const merged = { ...existing, patch, fetchedAt: new Date().toISOString(), rules: [...kept, ...added] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), "utf8");
  console.log(
    `\n합침: ${path.relative(process.cwd(), file)} ` +
      `(기존 ${kept.length}종 + 플레이 ${added.length}종, 새 항목 ${total}개)`,
  );
}

main();
