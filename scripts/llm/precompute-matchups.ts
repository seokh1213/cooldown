/**
 * 상성 답을 큰 모델로 미리 써 둔다 — 앱은 조회만 한다
 *
 * 앱(0.8B·모델 없음)의 상성 답은 검증된 노트를 코드가 이어 붙인 것이다. 사실은 맞지만 노트 문장을
 * 옮긴 글이라 이 상대에 맞춘 말이 적고 흐름이 끊긴다. 큰 모델은 그 재료로 이 상대에 맞춘 글을 쓸 수
 * 있지만 브라우저에서 못 돈다. 그래서 빌드할 때 미리 쓴다.
 *
 *   재료   도출 문장 + 두 챔피언의 노트(조건·고리 적용된 것) + 두 챔피언 스킬(슬롯·이름·효과)
 *   생성   Codex 가 주제별로 2~4문장(JSON). 재료에 없는 사실은 쓰지 말라고 한다.
 *   검증   문장마다 재료에 맞대(Bespoke-MiniCheck, 로컬) 근거 없는 문장은 버린다.
 *   출력   public/data/<patch>/llm/matchups/<내 챔피언>.json  { patch, pairs: { 상대 id: 칸들 } }
 *
 * 같은 포지션끼리만 쓴다(7,416쌍). 없는 쌍은 앱이 지금처럼 조립한다.
 *
 *   npx tsx scripts/llm/precompute-matchups.ts --pairs Jax:Fiora,MonkeyKing:Rumble --out <dir>
 *   npx tsx scripts/llm/precompute-matchups.ts --all --concurrency 6
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { ChampionCard } from "./lib/facts";
import { matchupNotes, type AdvisorData } from "../../src/lib/advisor/context";
import { josa } from "./lib/text";
import { translateTag } from "../../src/lib/advisor/promptLocale";
import { buildCompareAnswer } from "../../src/lib/advisor/answer";
import { groundCommentary } from "../../src/lib/advisor/grounding";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const CODEX_MODEL = arg("model") ?? "gpt-6-sol";
const CONCURRENCY = Number(arg("concurrency") ?? 4);
const CHECK_MODEL = "bespoke-minicheck:7b-q5_1";
const OLLAMA = process.env.OLLAMA_HOST?.startsWith("http") ? process.env.OLLAMA_HOST : "http://127.0.0.1:11434";

export const SECTION_KEYS = ["watch", "build", "fight", "laning", "combo", "escape", "phase", "teamfight"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type PrecomputedPair = Partial<Record<SectionKey, string>>;

const patch = resolvePatchVersion();
const read = <T>(file: string) => JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, file), "utf8")) as T;
const cards = read<{ cards: ChampionCard[] }>("llm/champion-cards-ko_KR.json").cards;
const data = {
  cards,
  items: read<{ items: unknown[] }>("items-normalized-ko_KR.json").items,
  cardById: new Map(cards.map((card) => [card.id, card])),
  playbooks: new Map(Object.entries(read<{ playbooks: Record<string, unknown> }>("llm/advisor-knowledge.json").playbooks)),
} as unknown as AdvisorData;

const CATEGORY: Record<string, string> = {
  combo: "콤보", laning: "라인전", teamfight: "한타", phase: "운영", "situational-item": "아이템", "escape-window": "진입 타이밍", skill: "스킬",
};

/** 재료. 모델이 쓸 수 있는 사실은 이것뿐이고, 검증도 이것에 맞댄다. */
export function material(me: ChampionCard, enemy: ChampionCard): string {
  const notes = matchupNotes(data, me, enemy, "ko_KR");
  const plan = notes.plan!;
  const spells = (card: ChampionCard) =>
    card.spells.map((spell) => `- ${card.name} ${spell.slot} ${spell.name}${spell.effects.length ? `: ${spell.effects.map((t) => translateTag(t, "ko_KR")).join(", ")}` : ""}`);
  return [
    "[스킬]",
    ...spells(me),
    ...spells(enemy),
    "[두 챔피언을 견준 사실]",
    ...plan.claims.map((claim) => `- ${claim.text}`),
    `[${me.name} 노트 — ${me.name}을(를) 할 때]`,
    ...plan.mine.map((entry) => `- (${CATEGORY[entry.category] ?? entry.category}) ${entry.text}`),
    `[${enemy.name} 노트 — ${enemy.name}을(를) 상대할 때]`,
    ...plan.enemy.map((entry) => `- (${CATEGORY[entry.category] ?? entry.category}) ${entry.text}`),
  ].join("\n");
}

function prompt(me: ChampionCard, enemy: ChampionCard): string {
  return [
    `리그 오브 레전드 상성 코치다. 사용자는 ${josa(me.name, "로/으로")} ${josa(enemy.name, "을/를")} 상대한다. 아래 자료만으로 답을 쓴다.`,
    "",
    material(me, enemy),
    "",
    "[할 일] JSON 객체 하나만 출력한다. 키와 뜻:",
    `- watch: ${enemy.name}에게서 조심할 것 — 어느 스킬이 왜 위험하고 언제 피하는지`,
    `- build: ${josa(me.name, "이/가")} 무엇을 먼저 사고 어떤 저항을 올릴지`,
    `- fight: ${josa(me.name, "이/가")} 언제 어떻게 싸울지(딜 교환·진입)`,
    "- laning: 라인전 운영",
    "- combo: 이 상대에게 넣는 콤보와 순서",
    "- escape: 언제 들어가는지(상대 이동기·군중 제어가 빠진 창)",
    "- phase: 초반·중반·후반 누가 강한지와 운영",
    "- teamfight: 한타에서 할 일",
    "규칙:",
    "- 값마다 2~4문장, 한국어 합니다체. 목록·제목·인사말 없이 문장만.",
    "- 자료에 있는 사실만 쓴다. 자료에 없는 스킬 효과·아이템·수치·쿨타임을 만들지 않는다. 모르면 그 키를 빈 문자열로 둔다.",
    "- 스킬은 '챔피언 슬롯 이름' 꼴로 부른다(예: 럼블 E 전기 작살). 슬롯을 틀리지 않는다.",
    `- 두 노트를 이어서 이 상대에 맞춘 말로 쓴다: ${enemy.name}의 스킬을 ${me.name}의 어느 스킬로 어떻게 받는지, 언제가 기회인지.`,
    `- 누가 누구 스킬인지 헷갈리지 않는다. ${me.name}이 사용자다.`,
  ].join("\n");
}

function codex(text: string): Promise<string> {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-mu-"));
    const out = path.join(dir, "out.txt");
    const child = spawn("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-m", CODEX_MODEL, "-C", dir, "-o", out, "-"], { cwd: dir });
    child.stdin.end(text);
    child.on("close", () => {
      const result = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
      fs.rmSync(dir, { recursive: true, force: true });
      resolve(result);
    });
  });
}

export async function supported(document: string, claim: string): Promise<boolean> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: CHECK_MODEL, messages: [{ role: "user", content: `Document: ${document}\nClaim: ${claim}` }], stream: false, options: { temperature: 0 } }),
  });
  return /^yes/i.test(((await res.json()) as { message: { content: string } }).message.content.trim());
}

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/**
 * 문장과 겹치는 재료 줄만 골라 근거 문서로 쓴다.
 *
 * 재료 전체(노트 수십 줄)를 문서로 주면 검증 모델이 한국어 긴 글에서 근거를 못 찾아 맞는 문장까지
 * 버렸다(잭스·피오라 18문장 중 7개, 그중 "피오라 W 응수는 잭스 E 반격의 기절을 막고 …" 처럼 두 노트를
 * 이은 것). 두 글자 조각이 가장 많이 겹치는 줄 몇 개와 스킬 줄만 준다.
 */
export function relevantLines(doc: string, sentence: string, k = 6): string {
  const grams = (text: string) => {
    const t = text.replace(/\s+/g, "");
    return new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)));
  };
  const want = grams(sentence);
  const lines = doc.split("\n").filter((line) => line.startsWith("- "));
  const scored = lines.map((line) => {
    const g = grams(line);
    let hit = 0;
    for (const x of want) if (g.has(x)) hit += 1;
    return { line, score: hit / Math.sqrt(g.size + 1) };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.line).join("\n");
}

export interface PairResult {
  pair: PrecomputedPair;
  kept: number;
  dropped: string[];
  seconds: number;
}

export async function precomputePair(me: ChampionCard, enemy: ChampionCard): Promise<PairResult | undefined> {
  const started = Date.now();
  const raw = await codex(prompt(me, enemy));
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  /*
   * 검증은 코드 규칙으로 한다(groundCommentary: 스킬 이름과 슬롯이 그 챔피언 것인지, 두 챔피언을
   * 뒤바꿔 부르지 않았는지). 로컬 검증 모델(MiniCheck)로 문장마다 재료에 맞대 봤더니 한국어에서 두
   * 노트를 이은 문장을 거의 다 버렸다 — 잭스·피오라·오공·럼블 45문장 중 21개, 대부분 맞는 문장
   * (잭스 진입 콤보 순서 같은 노트 그대로의 문장까지). `supported` 는 남겨 두되 쓰지 않는다.
   */
  const answer = buildCompareAnswer([me, enemy], "상성", undefined, { matchup: true, notes: matchupNotes(data, me, enemy, "ko_KR"), lang: "ko_KR" });
  const pair: PrecomputedPair = {};
  const dropped: string[] = [];
  let kept = 0;
  for (const key of SECTION_KEYS) {
    const value = typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "";
    if (!value) continue;
    const grounded = groundCommentary(value, answer, "ko_KR");
    for (const d of grounded.dropped) dropped.push(`${key}: ${typeof d === "string" ? d : JSON.stringify(d)}`);
    const n = sentences(grounded.text).length;
    kept += n;
    if (n) pair[key] = grounded.text;
  }
  return { pair, kept, dropped, seconds: (Date.now() - started) / 1000 };
}

async function main() {
  const outDir = arg("out") ?? path.join(PUBLIC_DATA_ROOT, patch, "llm", "matchups");
  const positions = new Map(cards.map((card) => [card.id, new Set(card.wiki?.positions ?? [])]));
  const list: Array<[string, string]> = process.argv.includes("--all")
    ? cards.flatMap((a) => cards.filter((b) => b.id !== a.id && [...positions.get(a.id)!].some((p) => positions.get(b.id)!.has(p))).map((b) => [a.id, b.id] as [string, string]))
    : (arg("pairs") ?? "").split(",").filter(Boolean).map((p) => p.split(":") as [string, string]);
  fs.mkdirSync(outDir, { recursive: true });
  const byMe = new Map<string, { patch: string; pairs: Record<string, PrecomputedPair> }>();
  const fileOf = (me: string) => path.join(outDir, `${me}.json`);
  const load = (me: string) => {
    if (!byMe.has(me)) byMe.set(me, fs.existsSync(fileOf(me)) ? JSON.parse(fs.readFileSync(fileOf(me), "utf8")) : { patch, pairs: {} });
    return byMe.get(me)!;
  };
  // 이미 쓴 쌍은 건너뛴다(다시 돌려도 이어 쓴다)
  const todo = list.filter(([a, b]) => !load(a).pairs[b]);
  const log: Array<{ me: string; enemy: string; kept: number; dropped: string[]; seconds: number }> = [];
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < todo.length) {
        const [a, b] = todo[next++];
        const result = await precomputePair(data.cardById.get(a)!, data.cardById.get(b)!).catch(() => undefined);
        done += 1;
        if (!result) continue;
        const file = load(a);
        file.pairs[b] = result.pair;
        fs.writeFileSync(fileOf(a), JSON.stringify(file));
        log.push({ me: a, enemy: b, kept: result.kept, dropped: result.dropped, seconds: result.seconds });
        if (done % 10 === 0) console.log(`${done}/${todo.length}`);
      }
    }),
  );
  const logFile = arg("log");
  if (logFile) fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
  const drops = log.reduce((n, r) => n + r.dropped.length, 0);
  const keeps = log.reduce((n, r) => n + r.kept, 0);
  console.log(`쌍 ${log.length}/${todo.length} · 문장 ${keeps} 남김 · ${drops} 버림 · 평균 ${Math.round(log.reduce((n, r) => n + r.seconds, 0) / Math.max(1, log.length))}초`);
}

if (process.argv[1]?.endsWith("precompute-matchups.ts")) void main();
